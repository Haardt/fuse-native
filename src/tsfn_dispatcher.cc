#include "tsfn_dispatcher.h"

#include <algorithm>
#include <cstdio>
#include <exception>
#include <functional>
#include <utility>

namespace fuse_native {

namespace {
std::unique_ptr<TSFNDispatcher> global_dispatcher;
std::mutex global_dispatcher_mutex;
} // namespace

TSFNDispatcher::TSFNDispatcher(Napi::Env env, size_t max_queue_size, size_t worker_threads)
    : state_(DispatcherState::UNINITIALIZED),
      env_(env),
      max_queue_size_(max_queue_size),
      worker_threads_(worker_threads ? worker_threads : 1),
      tsfn_(),
      callback_queue_(ComparePriority),
      next_request_id_(1),
      workers_running_(false),
      accepting_(true),
      inflight_(0),
      priority_ordering_enabled_(true) {
  stats_ = DispatcherStats{};
  stats_.start_time = std::chrono::steady_clock::now();
}

TSFNDispatcher::~TSFNDispatcher() { Shutdown(1000); }

bool TSFNDispatcher::Initialize() {
  DispatcherState expected = DispatcherState::UNINITIALIZED;
  if (!state_.compare_exchange_strong(expected, DispatcherState::INITIALIZING)) {
    return false;
  }

  try {
    tsfn_ = Napi::ThreadSafeFunction::New(
        env_,
        Napi::Function::New(env_, [](const Napi::CallbackInfo& info) {
          return info.Env().Undefined();
        }),
        "TSFNDispatcher",
        0,
        1);
    workers_running_.store(true, std::memory_order_release);
    worker_threads_vec_.reserve(worker_threads_);
    for (size_t i = 0; i < worker_threads_; ++i) {
      worker_threads_vec_.emplace_back(&TSFNDispatcher::WorkerThreadMain, this);
    }

    accepting_.store(true, std::memory_order_release);
    state_.store(DispatcherState::RUNNING, std::memory_order_release);
    stats_ = DispatcherStats{};
    stats_.start_time = std::chrono::steady_clock::now();
    next_request_id_.store(1, std::memory_order_release);
    return true;
  } catch (const std::exception& ex) {
    fprintf(stderr, "TSFNDispatcher::Initialize failed: %s\n", ex.what());
  } catch (...) {
    fprintf(stderr, "TSFNDispatcher::Initialize failed: unknown error\n");
  }

  state_.store(DispatcherState::UNINITIALIZED, std::memory_order_release);
  if (tsfn_) {
    tsfn_.Release();
    tsfn_ = Napi::ThreadSafeFunction();
  }
  return false;
}

bool TSFNDispatcher::Shutdown(uint32_t /*timeout_ms*/) {
  std::unique_lock<std::mutex> lifecycle_lock(lifecycle_mutex_);

  DispatcherState current = state_.load(std::memory_order_acquire);
  if (current == DispatcherState::SHUTDOWN) { DrainWorkerThreads(); return true; }
  if (current == DispatcherState::UNINITIALIZED) {
    state_.store(DispatcherState::SHUTDOWN, std::memory_order_release);
    DrainWorkerThreads();
    return true;
  }

  state_.store(DispatcherState::SHUTTING_DOWN, std::memory_order_release);
  accepting_.store(false, std::memory_order_release);
  workers_running_.store(false, std::memory_order_release);
  queue_cv_.notify_all();

  { std::unique_lock<std::mutex> inflight_lock(inflight_mtx_);
    inflight_cv_.wait(inflight_lock, [&]{ return inflight_.load(std::memory_order_acquire) == 0; });
  }

  DrainWorkerThreads();

  { std::lock_guard<std::mutex> handlers_lock(handlers_mutex_);
    for (auto& entry : handlers_) { entry.second.Abort(); entry.second.Release(); }
    handlers_.clear();
  }

  if (tsfn_) {
    tsfn_.Abort();
    tsfn_.Release();
    tsfn_ = Napi::ThreadSafeFunction();
  }

  { std::lock_guard<std::mutex> queue_lock(queue_mutex_);
    while (!callback_queue_.empty()) callback_queue_.pop();
  }
  { std::lock_guard<std::mutex> pending_lock(pending_requests_mutex_);
    pending_requests_.clear();
  }

  state_.store(DispatcherState::SHUTDOWN, std::memory_order_release);
  fprintf(stderr, "TSFNDispatcher::Shutdown - finished\n");
  return true;
}

bool TSFNDispatcher::IsReady() const {
  return state_.load(std::memory_order_acquire) == DispatcherState::RUNNING &&
         workers_running_.load(std::memory_order_acquire);
}

bool TSFNDispatcher::RegisterHandler(const std::string& operation_name, Napi::Function callback) {
  if (state_.load(std::memory_order_acquire) != DispatcherState::RUNNING) {
    return false;
  }

  try {
    auto tsfn = Napi::ThreadSafeFunction::New(
        callback.Env(), callback, ("Handler_" + operation_name).c_str(), 0, 1);

    std::lock_guard<std::mutex> lock(handlers_mutex_);
    auto it = handlers_.find(operation_name);
    if (it != handlers_.end()) {
      it->second.Release();
      it->second = std::move(tsfn);
    } else {
      handlers_.emplace(operation_name, std::move(tsfn));
    }
    return true;
  } catch (const std::exception& ex) {
    fprintf(stderr, "RegisterHandler failed for %s: %s\n", operation_name.c_str(), ex.what());
  } catch (...) {
    fprintf(stderr, "RegisterHandler failed for %s: unknown error\n", operation_name.c_str());
  }
  return false;
}

bool TSFNDispatcher::UnregisterHandler(const std::string& operation_name) {
  std::lock_guard<std::mutex> lock(handlers_mutex_);
  auto it = handlers_.find(operation_name);
  if (it == handlers_.end()) {
    return false;
  }
  it->second.Release();
  handlers_.erase(it);
  return true;
}

uint64_t TSFNDispatcher::Dispatch(const std::string& operation_name,
                                  const std::vector<napi_value>& args,
                                  CallbackPriority priority,
                                  std::function<void(napi_value)> completion_callback) {
  if (state_.load(std::memory_order_acquire) != DispatcherState::RUNNING ||
      !accepting_.load(std::memory_order_acquire)) {
    return 0;
  }

  {
    std::lock_guard<std::mutex> lock(handlers_mutex_);
    if (handlers_.find(operation_name) == handlers_.end()) {
      return 0;
    }
  }

  const uint64_t request_id = next_request_id_.fetch_add(1, std::memory_order_acq_rel);
  auto context = std::make_unique<CallbackContext>(operation_name, request_id, priority);
  context->callback_fn = [args](Napi::Env env, Napi::Function js_callback) {
    std::vector<napi_value> local(args.begin(), args.end());
    js_callback.Call(local);
  };

  auto pending = std::make_shared<PendingCallback>(std::move(context), std::move(completion_callback));

  {
    std::lock_guard<std::mutex> lock(pending_requests_mutex_);
    pending_requests_.emplace(request_id, pending);
  }

  {
    std::lock_guard<std::mutex> lock(queue_mutex_);
    if (max_queue_size_ > 0 && callback_queue_.size() >= max_queue_size_) {
      std::lock_guard<std::mutex> pending_lock(pending_requests_mutex_);
      pending_requests_.erase(request_id);
      return 0;
    }
    callback_queue_.push(pending);
    std::lock_guard<std::mutex> stats_lock(stats_mutex_);
    stats_.queue_size = callback_queue_.size();
    stats_.max_queue_size = std::max(stats_.max_queue_size, stats_.queue_size);
  }

  inflight_.fetch_add(1, std::memory_order_acq_rel);
  queue_cv_.notify_one();
  return request_id;
}

uint64_t TSFNDispatcher::DispatchCustom(const std::string& operation_name,
                                        std::function<void(Napi::Env, Napi::Function)> callback_fn,
                                        CallbackPriority priority,
                                        std::function<void(int)> error_callback) {
  if (state_.load(std::memory_order_acquire) != DispatcherState::RUNNING ||
      !accepting_.load(std::memory_order_acquire)) {
    return 0;
  }

  const uint64_t request_id = next_request_id_.fetch_add(1, std::memory_order_acq_rel);
  auto context = std::make_unique<CallbackContext>(operation_name, request_id, priority);
  context->callback_fn = std::move(callback_fn);
  context->error_callback = std::move(error_callback);

  auto pending = std::make_shared<PendingCallback>(std::move(context));

  {
    std::lock_guard<std::mutex> lock(pending_requests_mutex_);
    pending_requests_.emplace(request_id, pending);
  }

  {
    std::lock_guard<std::mutex> lock(queue_mutex_);
    if (max_queue_size_ > 0 && callback_queue_.size() >= max_queue_size_) {
      std::lock_guard<std::mutex> pending_lock(pending_requests_mutex_);
      pending_requests_.erase(request_id);
      return 0;
    }
    callback_queue_.push(pending);
    std::lock_guard<std::mutex> stats_lock(stats_mutex_);
    stats_.queue_size = callback_queue_.size();
    stats_.max_queue_size = std::max(stats_.max_queue_size, stats_.queue_size);
  }

  inflight_.fetch_add(1, std::memory_order_acq_rel);
  queue_cv_.notify_one();
  return request_id;
}

bool TSFNDispatcher::WaitForCompletion(uint64_t request_id, uint32_t timeout_ms) {
  const auto timeout = std::chrono::milliseconds(timeout_ms);
  const auto start = std::chrono::steady_clock::now();

  while (std::chrono::steady_clock::now() - start < timeout) {
    {
      std::lock_guard<std::mutex> lock(pending_requests_mutex_);
      auto it = pending_requests_.find(request_id);
      if (it == pending_requests_.end() || it->second->completed.load(std::memory_order_acquire)) {
        return true;
      }
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }

  return false;
}

bool TSFNDispatcher::WaitForAllCompletion(uint32_t timeout_ms) {
  const auto timeout = std::chrono::milliseconds(timeout_ms);
  const auto start = std::chrono::steady_clock::now();

  while (std::chrono::steady_clock::now() - start < timeout) {
    {
      std::lock_guard<std::mutex> pending_lock(pending_requests_mutex_);
      std::lock_guard<std::mutex> queue_lock(queue_mutex_);
      if (pending_requests_.empty() && callback_queue_.empty()) {
        return true;
      }
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }

  return false;
}

size_t TSFNDispatcher::GetQueueSize() const {
  std::lock_guard<std::mutex> lock(queue_mutex_);
  return callback_queue_.size();
}

DispatcherStats TSFNDispatcher::GetStats() const {
  std::lock_guard<std::mutex> lock(stats_mutex_);
  return stats_;
}

void TSFNDispatcher::ResetStats() {
  std::lock_guard<std::mutex> lock(stats_mutex_);
  stats_ = DispatcherStats{};
  stats_.start_time = std::chrono::steady_clock::now();
}

void TSFNDispatcher::SetMaxQueueSize(size_t max_size) {
  max_queue_size_ = max_size;
}

void TSFNDispatcher::SetPriorityOrdering(bool enable) {
  priority_ordering_enabled_.store(enable, std::memory_order_release);
}

void TSFNDispatcher::WorkerThreadMain() {
  while (workers_running_.load(std::memory_order_acquire)) {
    std::shared_ptr<PendingCallback> callback;
    {
      std::unique_lock<std::mutex> lock(queue_mutex_);
      queue_cv_.wait(lock, [&] {
        return !callback_queue_.empty() || !workers_running_.load(std::memory_order_acquire);
      });
      if (!workers_running_.load(std::memory_order_acquire)) {
        break;
      }
      if (!callback_queue_.empty()) {
        callback = callback_queue_.top();
        callback_queue_.pop();
        std::lock_guard<std::mutex> stats_lock(stats_mutex_);
        stats_.queue_size = callback_queue_.size();
      }
    }

    if (callback) {
      ProcessCallback(callback);
    }
  }
}

void TSFNDispatcher::ProcessCallback(std::shared_ptr<PendingCallback> callback) {
  if (!callback || !callback->context) {
    fprintf(stderr, "ProcessCallback received invalid context\n");
    DecInflight();
    return;
  }

  if (state_.load(std::memory_order_acquire) != DispatcherState::RUNNING) {
    HandleCallbackError(callback->context->request_id, -1);
    DecInflight();
    return;
  }

  Napi::ThreadSafeFunction handler;
  {
    std::lock_guard<std::mutex> lock(handlers_mutex_);
    auto it = handlers_.find(callback->context->operation_name);
    if (it == handlers_.end()) {
      HandleCallbackError(callback->context->request_id, -38 /*ENOSYS*/);
      DecInflight();
      return;
    }
    handler = it->second;
  }

  struct CallbackData {
    std::shared_ptr<PendingCallback> pending;
    std::chrono::steady_clock::time_point dispatch_time;
    TSFNDispatcher* dispatcher;
  };

  auto* raw = new CallbackData{callback, std::chrono::steady_clock::now(), this};

  napi_status status = handler.NonBlockingCall(raw, [](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
    TSFNDispatcher* dispatcher = data->dispatcher;
    auto pending = data->pending;
    const auto dispatch_time = data->dispatch_time;
    delete data;

    if (!pending || !pending->context) {
      dispatcher->DecInflight();
      return;
    }

    bool ok = false;
    const uint64_t request_id = pending->context->request_id;

    try {
      if (pending->context->callback_fn) {
        pending->context->callback_fn(env, js_callback);
      }
      pending->completed.store(true, std::memory_order_release);
      pending->result = env.Undefined();
      if (pending->completion_callback) {
        pending->completion_callback(pending->result);
      }
      ok = true;
    } catch (...) {
      if (pending->context->error_callback) {
        pending->context->error_callback(-5 /*EIO*/);
      }
    }

    const auto end = std::chrono::steady_clock::now();
    const double latency_ms = std::chrono::duration_cast<std::chrono::microseconds>(end - dispatch_time).count() / 1000.0;
    dispatcher->UpdateStats(latency_ms, ok);

    {
      std::lock_guard<std::mutex> lock(dispatcher->pending_requests_mutex_);
      dispatcher->pending_requests_.erase(request_id);
    }

    dispatcher->DecInflight();
  });

  if (status != napi_ok) {
    delete raw;
    HandleCallbackError(callback->context->request_id, -5 /*EIO*/);
    DecInflight();
  }
}

void TSFNDispatcher::HandleCallbackError(uint64_t request_id, int /*error_code*/) {
  {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    stats_.total_errors++;
  }

  std::shared_ptr<PendingCallback> pending;
  {
    std::lock_guard<std::mutex> lock(pending_requests_mutex_);
    auto it = pending_requests_.find(request_id);
    if (it != pending_requests_.end()) {
      pending = it->second;
    }
  }

  if (pending) {
    pending->completed.store(true, std::memory_order_release);
    if (pending->context && pending->context->error_callback) {
      pending->context->error_callback(-5 /*EIO*/);
    }
  }
}

void TSFNDispatcher::UpdateStats(double latency_ms, bool success) {
  std::lock_guard<std::mutex> lock(stats_mutex_);
  stats_.total_dispatched++;
  if (success) {
    stats_.total_completed++;
    const double completed = static_cast<double>(stats_.total_completed);
    stats_.avg_latency_ms = ((stats_.avg_latency_ms * (completed - 1.0)) + latency_ms) / completed;
  }
}

bool TSFNDispatcher::ComparePriority(const std::shared_ptr<PendingCallback>& a,
                                     const std::shared_ptr<PendingCallback>& b) {
  if (!a || !a->context || !b || !b->context) {
    return false;
  }

  if (a->context->priority != b->context->priority) {
    return static_cast<int>(a->context->priority) > static_cast<int>(b->context->priority);
  }

  return a->context->timestamp > b->context->timestamp;
}

void TSFNDispatcher::DecInflight() {
  if (inflight_.fetch_sub(1, std::memory_order_acq_rel) == 1) {
    std::lock_guard<std::mutex> lock(inflight_mtx_);
    inflight_cv_.notify_all();
  }
}

void TSFNDispatcher::DrainWorkerThreads() {
  for (auto& thread : worker_threads_vec_) {
    if (!thread.joinable()) {
      continue;
    }

    if (thread.get_id() == std::this_thread::get_id()) {
      thread.detach();
      continue;
    }
    thread.join();
  }

  worker_threads_vec_.clear();
}

TSFNDispatcher* GetGlobalDispatcher() {
  std::lock_guard<std::mutex> lock(global_dispatcher_mutex);
  return global_dispatcher.get();
}

bool InitializeGlobalDispatcher(Napi::Env env, size_t max_queue_size, size_t worker_threads) {
  std::lock_guard<std::mutex> lock(global_dispatcher_mutex);
  if (global_dispatcher) {
    return false;
  }

  auto dispatcher = std::make_unique<TSFNDispatcher>(env, max_queue_size, worker_threads);
  if (!dispatcher->Initialize()) {
    return false;
  }
  global_dispatcher = std::move(dispatcher);
  return true;
}

bool ShutdownGlobalDispatcher(uint32_t timeout_ms) {
  std::unique_ptr<TSFNDispatcher> dispatcher;
  {
    std::lock_guard<std::mutex> lock(global_dispatcher_mutex);
    dispatcher = std::move(global_dispatcher);
  }

  if (!dispatcher) {
    return true;
  }

  return dispatcher->Shutdown(timeout_ms);
}

Napi::Value InitializeDispatcher(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  size_t max_queue_size = 1000;
  size_t worker_threads = 1;

  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();
    if (options.Has("maxQueueSize")) {
      max_queue_size = options.Get("maxQueueSize").As<Napi::Number>().Uint32Value();
    }
    if (options.Has("workerThreads")) {
      worker_threads = options.Get("workerThreads").As<Napi::Number>().Uint32Value();
    }
  }

  bool ok = InitializeGlobalDispatcher(env, max_queue_size, worker_threads);
  return Napi::Boolean::New(env, ok);
}

Napi::Value ShutdownDispatcher(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  uint32_t timeout_ms = 5000;

  if (info.Length() > 0 && info[0].IsNumber()) {
    timeout_ms = info[0].As<Napi::Number>().Uint32Value();
  }

  bool ok = ShutdownGlobalDispatcher(timeout_ms);
  return Napi::Boolean::New(env, ok);
}

Napi::Value GetDispatcherStats(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto dispatcher = GetGlobalDispatcher();
  if (!dispatcher) {
    return env.Undefined();
  }

  const auto stats = dispatcher->GetStats();
  Napi::Object out = Napi::Object::New(env);
  out.Set("totalDispatched", Napi::Number::New(env, static_cast<double>(stats.total_dispatched)));
  out.Set("totalCompleted", Napi::Number::New(env, static_cast<double>(stats.total_completed)));
  out.Set("totalErrors", Napi::Number::New(env, static_cast<double>(stats.total_errors)));
  out.Set("queueSize", Napi::Number::New(env, static_cast<double>(stats.queue_size)));
  out.Set("maxQueueSize", Napi::Number::New(env, static_cast<double>(stats.max_queue_size)));
  out.Set("avgLatencyMs", Napi::Number::New(env, stats.avg_latency_ms));
  auto uptime = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now() - stats.start_time);
  out.Set("uptimeMs", Napi::Number::New(env, static_cast<double>(uptime.count())));
  return out;
}

Napi::Value ResetDispatcherStats(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto dispatcher = GetGlobalDispatcher();
  if (!dispatcher) {
    return Napi::Boolean::New(env, false);
  }
  dispatcher->ResetStats();
  return Napi::Boolean::New(env, true);
}

Napi::Value SetDispatcherConfig(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() == 0 || !info[0].IsObject()) {
    return Napi::Boolean::New(env, false);
  }

  auto dispatcher = GetGlobalDispatcher();
  if (!dispatcher) {
    return Napi::Boolean::New(env, false);
  }

  Napi::Object options = info[0].As<Napi::Object>();
  if (options.Has("maxQueueSize")) {
    dispatcher->SetMaxQueueSize(options.Get("maxQueueSize").As<Napi::Number>().Uint32Value());
  }
  if (options.Has("priorityOrdering")) {
    dispatcher->SetPriorityOrdering(options.Get("priorityOrdering").As<Napi::Boolean>().Value());
  }

  return Napi::Boolean::New(env, true);
}

} // namespace fuse_native
