/**
 * @file tsfn_dispatcher.cc
 * @brief Thread-safe function dispatcher implementation for unified C→JS callback management
 * 
 * This file implements the TSFN (ThreadSafeFunction) dispatcher that provides
 * unified management of all C++→JavaScript callbacks in the FUSE native binding.
 * It ensures thread-safe execution, proper ordering, and resource management.
 */

#include "tsfn_dispatcher.h"
#include "napi_helpers.h"
#include <algorithm>
#include <sstream>

namespace fuse_native {

/**
 * Global dispatcher instance
 */
static std::unique_ptr<TSFNDispatcher> global_dispatcher_;
static std::mutex global_dispatcher_mutex_;

/**
 * TSFNDispatcher implementation
 */
TSFNDispatcher::TSFNDispatcher(Napi::Env env, size_t max_queue_size, size_t worker_threads)
    : state_(DispatcherState::UNINITIALIZED), env_(env), max_queue_size_(max_queue_size),
      worker_threads_(worker_threads), next_request_id_(1), workers_running_(false),
      priority_ordering_enabled_(true),
      callback_queue_(ComparePriority) {
    
    if (worker_threads == 0) {
        worker_threads_ = 1;
    }
}

TSFNDispatcher::~TSFNDispatcher() {
    if (state_ != DispatcherState::SHUTDOWN) {
        Shutdown(1000); // Force shutdown with 1 second timeout
    }
}

bool TSFNDispatcher::Initialize() {
    fprintf(stderr, "FUSE: TSFNDispatcher::Initialize - starting\n");
    DispatcherState expected = DispatcherState::UNINITIALIZED;
    if (!state_.compare_exchange_strong(expected, DispatcherState::INITIALIZING)) {
        fprintf(stderr, "FUSE: TSFNDispatcher::Initialize - already initialized or initializing\n");
        return false; // Already initialized or initializing
    }

    try {
        fprintf(stderr, "FUSE: TSFNDispatcher::Initialize - creating ThreadSafeFunction\n");
        // Create the main ThreadSafeFunction for dispatching callbacks
        tsfn_ = Napi::ThreadSafeFunction::New(
            env_,
            Napi::Function::New(env_, [](const Napi::CallbackInfo& info) {
                // This is a dummy function - actual callbacks are handled differently
                return info.Env().Undefined();
            }),
            "TSFNDispatcher",
            0, // Unlimited queue size
            1, // One thread will call this
            [this](Napi::Env env) {
                // Context finalize callback
                this->state_ = DispatcherState::SHUTDOWN;
            }
        );
        fprintf(stderr, "FUSE: TSFNDispatcher::Initialize - ThreadSafeFunction created\n");

        // Start worker threads
        fprintf(stderr, "FUSE: TSFNDispatcher::Initialize - starting worker threads\n");
        workers_running_ = true;
        worker_threads_vec_.reserve(worker_threads_);

        for (size_t i = 0; i < worker_threads_; ++i) {
            worker_threads_vec_.emplace_back(&TSFNDispatcher::WorkerThreadMain, this);
        }
        fprintf(stderr, "FUSE: TSFNDispatcher::Initialize - worker threads started\n");

        // Reset statistics
        stats_ = DispatcherStats();

        state_ = DispatcherState::RUNNING;
        fprintf(stderr, "FUSE: TSFNDispatcher::Initialize - state set to RUNNING\n");
        return true;

    } catch (const std::exception& e) {
        fprintf(stderr, "FUSE: TSFNDispatcher::Initialize - exception: %s\n", e.what());
        state_ = DispatcherState::UNINITIALIZED;
        return false;
    }
}

bool TSFNDispatcher::Shutdown(uint32_t timeout_ms) {
    DispatcherState expected = DispatcherState::RUNNING;
    if (!state_.compare_exchange_strong(expected, DispatcherState::SHUTTING_DOWN)) {
        if (state_ == DispatcherState::SHUTDOWN) {
            return true; // Already shut down
        }
        return false; // Not in a state to shutdown
    }
    
    auto start_time = std::chrono::steady_clock::now();
    auto timeout = std::chrono::milliseconds(timeout_ms);
    
    // Signal worker threads to stop
    workers_running_ = false;
    queue_cv_.notify_all();
    
    // Wait for worker threads to finish
    for (auto& thread : worker_threads_vec_) {
        if (thread.joinable()) {
            auto elapsed = std::chrono::steady_clock::now() - start_time;
            auto remaining = timeout - elapsed;
            
            if (remaining.count() > 0) {
                // Try to join with remaining timeout
                std::thread temp_thread([&thread]() { thread.join(); });
                temp_thread.detach();
            } else {
                // Timeout exceeded, detach thread
                thread.detach();
            }
        }
    }
    
    worker_threads_vec_.clear();
    
    // Clean up ThreadSafeFunction
    if (tsfn_) {
        tsfn_.Release();
    }
    
    // Clear handlers
    {
        std::lock_guard<std::mutex> lock(handlers_mutex_);
        for (auto& pair : handlers_) {
            pair.second.Release();
        }
        handlers_.clear();
    }
    
    // Clear pending requests
    {
        std::lock_guard<std::mutex> lock(pending_requests_mutex_);
        pending_requests_.clear();
    }
    
    // Clear callback queue
    {
        std::lock_guard<std::mutex> lock(queue_mutex_);
        while (!callback_queue_.empty()) {
            callback_queue_.pop();
        }
    }
    
    state_ = DispatcherState::SHUTDOWN;
    return true;
}

bool TSFNDispatcher::RegisterHandler(const std::string& operation_name, Napi::Function callback) {
    if (state_ != DispatcherState::RUNNING) {
        return false;
    }
    
    try {
        auto tsfn = Napi::ThreadSafeFunction::New(
            callback.Env(),
            callback,
            "Handler_" + operation_name,
            0, // Unlimited queue size
            1  // One thread will call this
        );
        
        std::lock_guard<std::mutex> lock(handlers_mutex_);
        
        // Release existing handler if present
        auto it = handlers_.find(operation_name);
        if (it != handlers_.end()) {
            it->second.Release();
        }
        
        handlers_[operation_name] = tsfn;
        return true;
        
    } catch (const std::exception& e) {
        return false;
    }
}

bool TSFNDispatcher::UnregisterHandler(const std::string& operation_name) {
    std::lock_guard<std::mutex> lock(handlers_mutex_);
    
    auto it = handlers_.find(operation_name);
    if (it != handlers_.end()) {
        it->second.Release();
        handlers_.erase(it);
        return true;
    }
    
    return false;
}

uint64_t TSFNDispatcher::Dispatch(const std::string& operation_name,
                                 const std::vector<napi_value>& args,
                                 CallbackPriority priority,
                                 std::function<void(napi_value)> completion_callback) {
    
    if (state_ != DispatcherState::RUNNING) {
        return 0;
    }
    
    // Check if we have a handler for this operation
    {
        std::lock_guard<std::mutex> lock(handlers_mutex_);
        if (handlers_.find(operation_name) == handlers_.end()) {
            return 0; // No handler registered
        }
    }
    
    // Create callback context
    uint64_t request_id = next_request_id_++;
    auto context = std::make_unique<CallbackContext>(operation_name, request_id, priority);
    
    // Create callback function that captures the arguments
    context->callback_fn = [operation_name, args](Napi::Env env, Napi::Function js_callback) {
        std::vector<napi_value> napi_args = args; // Copy args
        js_callback.Call(napi_args);
    };
    
    // Create pending callback
    auto pending = std::make_shared<PendingCallback>(std::move(context), completion_callback);
    
    // Add to pending requests
    {
        std::lock_guard<std::mutex> lock(pending_requests_mutex_);
        pending_requests_[request_id] = pending;
    }
    
    // Add to queue
    {
        std::lock_guard<std::mutex> lock(queue_mutex_);
        
        // Check queue size limits
        if (max_queue_size_ > 0 && callback_queue_.size() >= max_queue_size_) {
            // Remove the pending request
            std::lock_guard<std::mutex> pending_lock(pending_requests_mutex_);
            pending_requests_.erase(request_id);
            return 0; // Queue is full
        }
        
        callback_queue_.push(pending);
        {
            std::lock_guard<std::mutex> stats_lock(stats_mutex_);
            stats_.queue_size = callback_queue_.size();
            stats_.max_queue_size = std::max(stats_.max_queue_size, stats_.queue_size);
        }
    }
    
    queue_cv_.notify_one();
    return request_id;
}

uint64_t TSFNDispatcher::DispatchCustom(const std::string& operation_name,
                                       std::function<void(Napi::Env, Napi::Function)> callback_fn,
                                       CallbackPriority priority,
                                       std::function<void(int)> error_callback) {
    
    if (state_ != DispatcherState::RUNNING) {
        return 0;
    }
    
    // Create callback context
    uint64_t request_id = next_request_id_++;
    auto context = std::make_unique<CallbackContext>(operation_name, request_id, priority);
    context->callback_fn = callback_fn;
    context->error_callback = error_callback;
    
    // Create pending callback
    auto pending = std::make_shared<PendingCallback>(std::move(context));
    
    // Add to pending requests
    {
        std::lock_guard<std::mutex> lock(pending_requests_mutex_);
        pending_requests_[request_id] = pending;
    }
    
    // Add to queue
    {
        std::lock_guard<std::mutex> lock(queue_mutex_);
        
        if (max_queue_size_ > 0 && callback_queue_.size() >= max_queue_size_) {
            std::lock_guard<std::mutex> pending_lock(pending_requests_mutex_);
            pending_requests_.erase(request_id);
            return 0;
        }
        
        callback_queue_.push(pending);
        {
            std::lock_guard<std::mutex> stats_lock(stats_mutex_);
            stats_.queue_size = callback_queue_.size();
            stats_.max_queue_size = std::max(stats_.max_queue_size, stats_.queue_size);
        }
    }
    
    queue_cv_.notify_one();
    return request_id;
}

bool TSFNDispatcher::WaitForCompletion(uint64_t request_id, uint32_t timeout_ms) {
    auto start_time = std::chrono::steady_clock::now();
    auto timeout = std::chrono::milliseconds(timeout_ms);
    
    while (std::chrono::steady_clock::now() - start_time < timeout) {
        {
            std::lock_guard<std::mutex> lock(pending_requests_mutex_);
            auto it = pending_requests_.find(request_id);
            if (it == pending_requests_.end() || it->second->completed) {
                return true; // Completed or not found
            }
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    return false; // Timeout
}

bool TSFNDispatcher::WaitForAllCompletion(uint32_t timeout_ms) {
    auto start_time = std::chrono::steady_clock::now();
    auto timeout = std::chrono::milliseconds(timeout_ms);
    
    while (std::chrono::steady_clock::now() - start_time < timeout) {
        {
            std::lock_guard<std::mutex> pending_lock(pending_requests_mutex_);
            std::lock_guard<std::mutex> queue_lock(queue_mutex_);
            
            if (pending_requests_.empty() && callback_queue_.empty()) {
                return true;
            }
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    return false; // Timeout
}

bool TSFNDispatcher::IsReady() const {
    return state_ == DispatcherState::RUNNING && workers_running_;
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
    stats_ = DispatcherStats();
}

void TSFNDispatcher::SetMaxQueueSize(size_t max_size) {
    max_queue_size_ = max_size;
}

void TSFNDispatcher::SetPriorityOrdering(bool enable) {
    priority_ordering_enabled_ = enable;
}

void TSFNDispatcher::WorkerThreadMain() {
    while (workers_running_) {
        std::shared_ptr<PendingCallback> callback;
        
        // Get next callback from queue
        {
            std::unique_lock<std::mutex> lock(queue_mutex_);
            queue_cv_.wait(lock, [this]() {
                return !callback_queue_.empty() || !workers_running_;
            });
            
            if (!workers_running_) {
                break;
            }
            
            if (!callback_queue_.empty()) {
                callback = callback_queue_.top();
                callback_queue_.pop();
                {
                    std::lock_guard<std::mutex> stats_lock(stats_mutex_);
                    stats_.queue_size = callback_queue_.size();
                }
            }
        }
        
        if (callback) {
            ProcessCallback(callback);
        }
    }
}

void TSFNDispatcher::ProcessCallback(std::shared_ptr<PendingCallback> callback) {
    if (!callback || !callback->context) {
        fprintf(stderr, "FUSE: ProcessCallback - callback or context is null\n");
        return;
    }

    auto start_time = std::chrono::steady_clock::now();
    uint64_t request_id = callback->context->request_id;

    fprintf(stderr, "FUSE: ProcessCallback - processing request %llu for operation %s\n",
            request_id, callback->context->operation_name.c_str());

    try {
        // Get the handler for this operation
        Napi::ThreadSafeFunction handler;
        {
            std::lock_guard<std::mutex> lock(handlers_mutex_);
            auto it = handlers_.find(callback->context->operation_name);
            if (it == handlers_.end()) {
                HandleCallbackError(request_id, -ENOSYS);
                return;
            }
            handler = it->second;
        }
        
        // Execute the callback in the JavaScript thread
        auto callback_ptr = callback.get(); // Capture raw pointer for lambda
        auto status = handler.BlockingCall([callback_ptr, this](Napi::Env env, Napi::Function js_callback) {
            try {
                // Check if callback_ptr is still valid
                if (!callback_ptr || !callback_ptr->context) {
                    fprintf(stderr, "FUSE: ProcessCallback - callback_ptr or context became invalid\n");
                    return;
                }

                if (callback_ptr->context->callback_fn) {
                    callback_ptr->context->callback_fn(env, js_callback);
                }

                // Mark as completed
                callback_ptr->completed = true;
                callback_ptr->result = env.Undefined();

                // Call completion callback if provided
                if (callback_ptr->completion_callback) {
                    callback_ptr->completion_callback(callback_ptr->result);
                }

            } catch (const std::exception& e) {
                fprintf(stderr, "FUSE: ProcessCallback - exception in callback: %s\n", e.what());
                // Handle JavaScript exceptions
                if (callback_ptr && callback_ptr->context && callback_ptr->context->error_callback) {
                    callback_ptr->context->error_callback(-EIO);
                }
            }
        });
        
        if (status != napi_ok) {
            HandleCallbackError(request_id, -EIO);
        }
        
    } catch (const std::exception& e) {
        HandleCallbackError(request_id, -EIO);
    }
    
    // Calculate latency and update statistics
    auto end_time = std::chrono::steady_clock::now();
    auto latency = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time);
    double latency_ms = latency.count() / 1000.0;
    
    UpdateStats(latency_ms, callback->completed);
    
    // Remove from pending requests
    {
        std::lock_guard<std::mutex> lock(pending_requests_mutex_);
        pending_requests_.erase(request_id);
    }
}

void TSFNDispatcher::CompleteRequest(uint64_t request_id, napi_value result) {
    std::lock_guard<std::mutex> lock(pending_requests_mutex_);
    auto it = pending_requests_.find(request_id);
    if (it != pending_requests_.end()) {
        it->second->completed = true;
        it->second->result = result;
        
        if (it->second->completion_callback) {
            it->second->completion_callback(result);
        }
    }
}

void TSFNDispatcher::HandleCallbackError(uint64_t request_id, int error_code) {
    {
        std::lock_guard<std::mutex> lock(stats_mutex_);
        stats_.total_errors++;
    }
    
    std::lock_guard<std::mutex> lock(pending_requests_mutex_);
    auto it = pending_requests_.find(request_id);
    if (it != pending_requests_.end()) {
        if (it->second->context->error_callback) {
            it->second->context->error_callback(error_code);
        }
        it->second->completed = true;
    }
}

void TSFNDispatcher::UpdateStats(double latency_ms, bool success) {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    stats_.total_dispatched++;
    if (success) {
        stats_.total_completed++;
    }
    
    // Update rolling average latency
    double current_avg = stats_.avg_latency_ms;
    double total_completed = stats_.total_completed;
    if (total_completed > 0) {
        double new_avg = ((current_avg * (total_completed - 1)) + latency_ms) / total_completed;
        stats_.avg_latency_ms = new_avg;
    }
}

bool TSFNDispatcher::ComparePriority(const std::shared_ptr<PendingCallback>& a,
                                    const std::shared_ptr<PendingCallback>& b) {
    if (!a || !a->context || !b || !b->context) {
        return false;
    }
    
    // Higher priority (lower enum value) comes first
    if (a->context->priority != b->context->priority) {
        return static_cast<int>(a->context->priority) > static_cast<int>(b->context->priority);
    }
    
    // Same priority, use timestamp (older first)
    return a->context->timestamp > b->context->timestamp;
}

/**
 * Global dispatcher instance management
 */
TSFNDispatcher* GetGlobalDispatcher() {
    std::lock_guard<std::mutex> lock(global_dispatcher_mutex_);
    return global_dispatcher_.get();
}

bool InitializeGlobalDispatcher(Napi::Env env, size_t max_queue_size, size_t worker_threads) {
    std::lock_guard<std::mutex> lock(global_dispatcher_mutex_);

    if (global_dispatcher_) {
        fprintf(stderr, "FUSE: InitializeGlobalDispatcher - already initialized\n");
        return false; // Already initialized
    }

    fprintf(stderr, "FUSE: InitializeGlobalDispatcher - creating TSFNDispatcher\n");
    global_dispatcher_ = std::make_unique<TSFNDispatcher>(env, max_queue_size, worker_threads);
    bool success = global_dispatcher_->Initialize();
    fprintf(stderr, "FUSE: InitializeGlobalDispatcher - Initialize() returned %s\n", success ? "true" : "false");
    return success;
}

bool ShutdownGlobalDispatcher(uint32_t timeout_ms) {
    std::lock_guard<std::mutex> lock(global_dispatcher_mutex_);
    
    if (!global_dispatcher_) {
        return true; // Already shutdown or never initialized
    }
    
    bool success = global_dispatcher_->Shutdown(timeout_ms);
    global_dispatcher_.reset();
    return success;
}

/**
 * N-API exposed functions
 */
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
    
    bool success = InitializeGlobalDispatcher(env, max_queue_size, worker_threads);
    return Napi::Boolean::New(env, success);
}

Napi::Value ShutdownDispatcher(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    uint32_t timeout_ms = 5000;
    if (info.Length() > 0 && info[0].IsNumber()) {
        timeout_ms = info[0].As<Napi::Number>().Uint32Value();
    }
    
    bool success = ShutdownGlobalDispatcher(timeout_ms);
    return Napi::Boolean::New(env, success);
}

Napi::Value GetDispatcherStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    auto dispatcher = GetGlobalDispatcher();
    if (!dispatcher) {
        NapiHelpers::ThrowError(env, "Dispatcher not initialized");
        return env.Undefined();
    }
    
    auto stats = dispatcher->GetStats();
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("totalDispatched", Napi::Number::New(env, static_cast<double>(stats.total_dispatched)));
    result.Set("totalCompleted", Napi::Number::New(env, static_cast<double>(stats.total_completed)));
    result.Set("totalErrors", Napi::Number::New(env, static_cast<double>(stats.total_errors)));
    result.Set("queueSize", Napi::Number::New(env, static_cast<double>(stats.queue_size)));
    result.Set("maxQueueSize", Napi::Number::New(env, static_cast<double>(stats.max_queue_size)));
    result.Set("avgLatencyMs", Napi::Number::New(env, stats.avg_latency_ms));
    
    // Calculate uptime
    auto now = std::chrono::steady_clock::now();
    auto uptime = std::chrono::duration_cast<std::chrono::milliseconds>(now - stats.start_time);
    result.Set("uptimeMs", Napi::Number::New(env, static_cast<double>(uptime.count())));
    
    return result;
}

Napi::Value ResetDispatcherStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    auto dispatcher = GetGlobalDispatcher();
    if (!dispatcher) {
        NapiHelpers::ThrowError(env, "Dispatcher not initialized");
        return env.Undefined();
    }
    
    dispatcher->ResetStats();
    return Napi::Boolean::New(env, true);
}

Napi::Value SetDispatcherConfig(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsObject()) {
        NapiHelpers::ThrowTypeError(env, "Expected configuration object");
        return env.Undefined();
    }
    
    auto dispatcher = GetGlobalDispatcher();
    if (!dispatcher) {
        NapiHelpers::ThrowError(env, "Dispatcher not initialized");
        return env.Undefined();
    }
    
    Napi::Object config = info[0].As<Napi::Object>();
    
    if (config.Has("maxQueueSize")) {
        size_t max_size = config.Get("maxQueueSize").As<Napi::Number>().Uint32Value();
        dispatcher->SetMaxQueueSize(max_size);
    }
    
    if (config.Has("priorityOrdering")) {
        bool enable = config.Get("priorityOrdering").As<Napi::Boolean>().Value();
        dispatcher->SetPriorityOrdering(enable);
    }
    
    return Napi::Boolean::New(env, true);
}

} // namespace fuse_native