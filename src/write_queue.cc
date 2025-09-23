/**
 * @file write_queue.cc
 * @brief Per-FD write queue implementation for ordered write operations
 * 
 * This file implements the write queue system that ensures ordered execution
 * of write operations per file descriptor, preventing race conditions and
 * maintaining data consistency in concurrent write scenarios.
 */

#include "write_queue.h"
#include "napi_helpers.h"
#include <algorithm>
#include <errno.h>

namespace fuse_native {

/**
 * Global write queue manager instance
 */
static std::unique_ptr<WriteQueueManager> global_write_queue_manager_;
static std::mutex global_write_queue_mutex_;

/**
 * FDWriteQueue implementation
 */
FDWriteQueue::FDWriteQueue(uint64_t fd, size_t max_queue_size)
    : fd_(fd), max_queue_size_(max_queue_size), next_operation_id_(1),
      priority_ordering_enabled_(true), operation_queue_(ComparePriority) {
}

FDWriteQueue::~FDWriteQueue() {
    CancelAll(-ECANCELED);
}

uint64_t FDWriteQueue::Enqueue(std::unique_ptr<WriteOperation> operation) {
    if (!operation) {
        return 0;
    }
    
    std::lock_guard<std::mutex> lock(queue_mutex_);
    
    // Check queue size limits
    if (max_queue_size_ > 0 && operation_queue_.size() >= max_queue_size_) {
        return 0; // Queue is full
    }
    
    // Assign operation ID
    uint64_t operation_id = next_operation_id_++;
    operation->operation_id = operation_id;
    
    // Add to queue
    operation_queue_.push(std::move(operation));
    stats_.queue_size = operation_queue_.size();
    stats_.max_queue_size = std::max(stats_.max_queue_size, stats_.queue_size);
    stats_.total_operations++;
    
    queue_cv_.notify_one();
    return operation_id;
}

size_t FDWriteQueue::ProcessQueue(std::function<int(const WriteOperation&)> executor) {
    if (!executor) {
        return 0;
    }
    
    size_t processed = 0;
    
    while (true) {
        std::unique_ptr<WriteOperation> operation;
        
        // Get next operation
        {
            std::lock_guard<std::mutex> lock(queue_mutex_);
            if (operation_queue_.empty()) {
                break;
            }
            
            operation = std::move(const_cast<std::unique_ptr<WriteOperation>&>(operation_queue_.top()));
            operation_queue_.pop();
            stats_.queue_size = operation_queue_.size();
        }
        
        if (!operation) {
            continue;
        }
        
        // Execute the operation
        auto start_time = std::chrono::steady_clock::now();
        int result = executor(*operation);
        auto end_time = std::chrono::steady_clock::now();
        
        // Calculate latency
        auto latency = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time);
        double latency_ms = latency.count() / 1000.0;
        
        bool success = (result >= 0);
        UpdateStats(*operation, success, latency_ms);
        
        // Call completion callback
        if (operation->completion_callback) {
            operation->completion_callback(result);
        } else if (!success && operation->error_callback) {
            operation->error_callback(result);
        }
        
        processed++;
    }
    
    return processed;
}

bool FDWriteQueue::Flush(uint32_t timeout_ms) {
    auto start_time = std::chrono::steady_clock::now();
    auto timeout = std::chrono::milliseconds(timeout_ms);
    
    while (std::chrono::steady_clock::now() - start_time < timeout) {
        {
            std::lock_guard<std::mutex> lock(queue_mutex_);
            if (operation_queue_.empty()) {
                return true;
            }
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    return false; // Timeout
}

void FDWriteQueue::CancelAll(int error_code) {
    std::lock_guard<std::mutex> lock(queue_mutex_);
    
    while (!operation_queue_.empty()) {
        auto operation = std::move(const_cast<std::unique_ptr<WriteOperation>&>(operation_queue_.top()));
        operation_queue_.pop();
        
        if (operation && operation->error_callback) {
            operation->error_callback(error_code);
        }
        
        stats_.failed_operations++;
    }
    
    stats_.queue_size = 0;
}

bool FDWriteQueue::IsEmpty() const {
    std::lock_guard<std::mutex> lock(queue_mutex_);
    return operation_queue_.empty();
}

size_t FDWriteQueue::GetQueueSize() const {
    std::lock_guard<std::mutex> lock(queue_mutex_);
    return operation_queue_.size();
}

WriteQueueStats FDWriteQueue::GetStats() const {
    return stats_;
}

void FDWriteQueue::ResetStats() {
    stats_ = WriteQueueStats();
}

void FDWriteQueue::SetMaxQueueSize(size_t max_size) {
    max_queue_size_ = max_size;
}

void FDWriteQueue::SetPriorityOrdering(bool enable) {
    priority_ordering_enabled_ = enable;
}

bool FDWriteQueue::ComparePriority(const std::unique_ptr<WriteOperation>& a,
                                  const std::unique_ptr<WriteOperation>& b) {
    if (!a || !b) {
        return false;
    }
    
    // Higher priority (lower enum value) comes first
    if (a->priority != b->priority) {
        return static_cast<int>(a->priority) > static_cast<int>(b->priority);
    }
    
    // Same priority, use timestamp (older first)
    return a->timestamp > b->timestamp;
}

void FDWriteQueue::UpdateStats(const WriteOperation& operation, bool success, double latency_ms) {
    if (success) {
        stats_.completed_operations++;
        stats_.bytes_written += operation.size;
    } else {
        stats_.failed_operations++;
    }
    
    // Update rolling average latency
    double current_avg = stats_.avg_latency_ms;
    uint64_t total_completed = stats_.completed_operations;
    if (total_completed > 0) {
        double new_avg = ((current_avg * (total_completed - 1)) + latency_ms) / total_completed;
        stats_.avg_latency_ms = new_avg;
    }
}

/**
 * WriteQueueManager implementation
 */
WriteQueueManager::WriteQueueManager(size_t default_max_queue_size)
    : default_max_queue_size_(default_max_queue_size) {
}

WriteQueueManager::~WriteQueueManager() {
    FlushAll(1000); // Give 1 second for cleanup
}

FDWriteQueue* WriteQueueManager::GetQueue(uint64_t fd) {
    std::lock_guard<std::mutex> lock(queues_mutex_);
    return GetQueueLocked(fd);
}

FDWriteQueue* WriteQueueManager::GetQueueLocked(uint64_t fd) {
    auto it = fd_queues_.find(fd);
    if (it != fd_queues_.end()) {
        return it->second.get();
    }
    
    // Create new queue
    auto queue = std::make_unique<FDWriteQueue>(fd, default_max_queue_size_);
    auto* queue_ptr = queue.get();
    fd_queues_[fd] = std::move(queue);
    
    return queue_ptr;
}

bool WriteQueueManager::RemoveQueue(uint64_t fd, uint32_t timeout_ms) {
    std::unique_ptr<FDWriteQueue> queue;
    
    {
        std::lock_guard<std::mutex> lock(queues_mutex_);
        auto it = fd_queues_.find(fd);
        if (it == fd_queues_.end()) {
            return true; // Already removed
        }
        
        queue = std::move(it->second);
        fd_queues_.erase(it);
    }
    
    if (queue) {
        return queue->Flush(timeout_ms);
    }
    
    return true;
}

uint64_t WriteQueueManager::EnqueueWrite(uint64_t fd, std::unique_ptr<WriteOperation> operation) {
    if (!operation) {
        return 0;
    }
    
    auto queue = GetQueue(fd);
    if (!queue) {
        return 0;
    }
    
    return queue->Enqueue(std::move(operation));
}

size_t WriteQueueManager::ProcessAllQueues(std::function<int(const WriteOperation&)> executor) {
    if (!executor) {
        return 0;
    }
    
    std::vector<FDWriteQueue*> queues;
    
    // Collect all queues
    {
        std::lock_guard<std::mutex> lock(queues_mutex_);
        queues.reserve(fd_queues_.size());
        for (auto& pair : fd_queues_) {
            queues.push_back(pair.second.get());
        }
    }
    
    // Process each queue
    size_t total_processed = 0;
    for (auto queue : queues) {
        if (queue) {
            total_processed += queue->ProcessQueue(executor);
        }
    }
    
    return total_processed;
}

bool WriteQueueManager::FlushAll(uint32_t timeout_ms) {
    std::vector<FDWriteQueue*> queues;
    
    // Collect all queues
    {
        std::lock_guard<std::mutex> lock(queues_mutex_);
        queues.reserve(fd_queues_.size());
        for (auto& pair : fd_queues_) {
            queues.push_back(pair.second.get());
        }
    }
    
    // Flush each queue
    bool all_success = true;
    for (auto queue : queues) {
        if (queue && !queue->Flush(timeout_ms)) {
            all_success = false;
        }
    }
    
    return all_success;
}

bool WriteQueueManager::FlushFD(uint64_t fd, uint32_t timeout_ms) {
    auto queue = GetQueue(fd);
    if (!queue) {
        return true; // No queue exists
    }
    
    return queue->Flush(timeout_ms);
}

void WriteQueueManager::CancelAll(int error_code) {
    std::lock_guard<std::mutex> lock(queues_mutex_);
    
    for (auto& pair : fd_queues_) {
        if (pair.second) {
            pair.second->CancelAll(error_code);
        }
    }
}

std::vector<uint64_t> WriteQueueManager::GetActiveFDs() const {
    std::lock_guard<std::mutex> lock(queues_mutex_);
    
    std::vector<uint64_t> fds;
    fds.reserve(fd_queues_.size());
    
    for (const auto& pair : fd_queues_) {
        fds.push_back(pair.first);
    }
    
    return fds;
}

WriteQueueStats WriteQueueManager::GetAggregateStats() const {
    std::lock_guard<std::mutex> lock(queues_mutex_);
    
    WriteQueueStats aggregate;
    double total_weighted_latency = 0.0;
    uint64_t total_completed = 0;
    
    for (const auto& pair : fd_queues_) {
        if (pair.second) {
            auto stats = pair.second->GetStats();
            aggregate.total_operations += stats.total_operations;
            aggregate.completed_operations += stats.completed_operations;
            aggregate.failed_operations += stats.failed_operations;
            aggregate.bytes_written += stats.bytes_written;
            aggregate.queue_size += stats.queue_size;
            aggregate.max_queue_size = std::max(aggregate.max_queue_size, stats.max_queue_size);
            
            // Calculate weighted average latency
            uint64_t completed = stats.completed_operations;
            if (completed > 0) {
                total_weighted_latency += stats.avg_latency_ms * completed;
                total_completed += completed;
            }
        }
    }
    
    if (total_completed > 0) {
        aggregate.avg_latency_ms = total_weighted_latency / total_completed;
    }
    
    return aggregate;
}

std::optional<WriteQueueStats> WriteQueueManager::GetFDStats(uint64_t fd) const {
    std::lock_guard<std::mutex> lock(queues_mutex_);
    
    auto it = fd_queues_.find(fd);
    if (it != fd_queues_.end() && it->second) {
        return it->second->GetStats();
    }
    
    return std::nullopt;
}

void WriteQueueManager::ResetAllStats() {
    std::lock_guard<std::mutex> lock(queues_mutex_);
    
    for (auto& pair : fd_queues_) {
        if (pair.second) {
            pair.second->ResetStats();
        }
    }
}

void WriteQueueManager::SetDefaultMaxQueueSize(size_t max_size) {
    const_cast<size_t&>(default_max_queue_size_) = max_size;
}

void WriteQueueManager::SetFDMaxQueueSize(uint64_t fd, size_t max_size) {
    auto queue = GetQueue(fd);
    if (queue) {
        queue->SetMaxQueueSize(max_size);
    }
}

/**
 * Global write queue manager functions
 */
WriteQueueManager* GetGlobalWriteQueueManager() {
    std::lock_guard<std::mutex> lock(global_write_queue_mutex_);
    return global_write_queue_manager_.get();
}

bool InitializeGlobalWriteQueueManager(size_t default_max_queue_size) {
    std::lock_guard<std::mutex> lock(global_write_queue_mutex_);
    
    if (global_write_queue_manager_) {
        return false; // Already initialized
    }
    
    global_write_queue_manager_ = std::make_unique<WriteQueueManager>(default_max_queue_size);
    return true;
}

bool ShutdownGlobalWriteQueueManager(uint32_t timeout_ms) {
    std::lock_guard<std::mutex> lock(global_write_queue_mutex_);
    
    if (!global_write_queue_manager_) {
        return true; // Already shutdown
    }
    
    bool success = global_write_queue_manager_->FlushAll(timeout_ms);
    global_write_queue_manager_.reset();
    return success;
}

/**
 * N-API exposed functions
 */
Napi::Value EnqueueWrite(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 4) {
        NapiHelpers::ThrowError(env, "Expected at least 4 arguments: fd, offset, size, buffer");
        return env.Undefined();
    }
    
    // Parse arguments
    uint64_t fd = NapiHelpers::GetBigUint64(env, info[0]);
    uint64_t offset = NapiHelpers::GetBigUint64(env, info[1]);
    uint64_t size = NapiHelpers::GetBigUint64(env, info[2]);
    
    if (!info[3].IsArrayBuffer() && !info[3].IsTypedArray()) {
        NapiHelpers::ThrowTypeError(env, "Buffer must be ArrayBuffer or TypedArray");
        return env.Undefined();
    }
    
    // Get buffer data
    void* buffer_data = nullptr;
    size_t buffer_size = 0;
    
    if (info[3].IsArrayBuffer()) {
        Napi::ArrayBuffer array_buffer = info[3].As<Napi::ArrayBuffer>();
        buffer_data = array_buffer.Data();
        buffer_size = array_buffer.ByteLength();
    } else {
        Napi::TypedArray typed_array = info[3].As<Napi::TypedArray>();
        buffer_data = typed_array.ArrayBuffer().Data();
        buffer_size = typed_array.ByteLength();
    }
    
    if (size > buffer_size) {
        NapiHelpers::ThrowError(env, "Write size exceeds buffer size");
        return env.Undefined();
    }
    
    // Parse optional arguments
    WriteOperationPriority priority = WriteOperationPriority::NORMAL;
    if (info.Length() > 4 && info[4].IsNumber()) {
        int prio = info[4].As<Napi::Number>().Int32Value();
        if (prio >= 0 && prio <= 3) {
            priority = static_cast<WriteOperationPriority>(prio);
        }
    }
    
    // Create write operation
    auto operation = std::make_unique<WriteOperation>(fd, offset, size, buffer_data, false, priority);
    
    // Set completion callback if provided
    if (info.Length() > 5 && info[5].IsFunction()) {
        Napi::Function callback = info[5].As<Napi::Function>();
        auto tsfn = Napi::ThreadSafeFunction::New(env, callback, "WriteCompletion", 0, 1);
        
        operation->completion_callback = [tsfn](int result) {
            tsfn.BlockingCall([result](Napi::Env env, Napi::Function js_callback) {
                js_callback.Call({Napi::Number::New(env, result)});
            });
            tsfn.Release();
        };
    }
    
    // Enqueue the operation
    auto manager = GetGlobalWriteQueueManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Write queue manager not initialized");
        return env.Undefined();
    }
    
    uint64_t operation_id = manager->EnqueueWrite(fd, std::move(operation));
    return NapiHelpers::CreateBigUint64(env, operation_id);
}

Napi::Value ProcessWriteQueues(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsFunction()) {
        NapiHelpers::ThrowError(env, "Expected executor function");
        return env.Undefined();
    }
    
    Napi::Function executor_js = info[0].As<Napi::Function>();
    auto executor_tsfn = Napi::ThreadSafeFunction::New(env, executor_js, "WriteExecutor", 0, 1);
    
    auto manager = GetGlobalWriteQueueManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Write queue manager not initialized");
        return env.Undefined();
    }
    
    // Create executor function
    auto executor = [executor_tsfn](const WriteOperation& operation) -> int {
        int result = -EIO;
        
        auto status = executor_tsfn.BlockingCall([&operation, &result](Napi::Env env, Napi::Function js_executor) {
            try {
                Napi::Object op_obj = Napi::Object::New(env);
                op_obj.Set("fd", NapiHelpers::CreateBigUint64(env, operation.fd));
                op_obj.Set("offset", NapiHelpers::CreateBigUint64(env, operation.offset));
                op_obj.Set("size", NapiHelpers::CreateBigUint64(env, operation.size));
                op_obj.Set("priority", Napi::Number::New(env, static_cast<int>(operation.priority)));
                
                // Create buffer view
                Napi::ArrayBuffer buffer = Napi::ArrayBuffer::New(env, operation.buffer, operation.size);
                op_obj.Set("buffer", buffer);
                
                Napi::Value js_result = js_executor.Call({op_obj});
                if (js_result.IsNumber()) {
                    result = js_result.As<Napi::Number>().Int32Value();
                }
            } catch (const std::exception& e) {
                result = -EIO;
            }
        });
        
        return (status == napi_ok) ? result : -EIO;
    };
    
    size_t processed = manager->ProcessAllQueues(executor);
    executor_tsfn.Release();
    
    return Napi::Number::New(env, static_cast<double>(processed));
}

Napi::Value FlushWriteQueue(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        NapiHelpers::ThrowError(env, "Expected file descriptor");
        return env.Undefined();
    }
    
    uint64_t fd = NapiHelpers::GetBigUint64(env, info[0]);
    
    uint32_t timeout_ms = 5000;
    if (info.Length() > 1 && info[1].IsNumber()) {
        timeout_ms = info[1].As<Napi::Number>().Uint32Value();
    }
    
    auto manager = GetGlobalWriteQueueManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Write queue manager not initialized");
        return env.Undefined();
    }
    
    bool success = manager->FlushFD(fd, timeout_ms);
    return Napi::Boolean::New(env, success);
}

Napi::Value FlushAllWriteQueues(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    uint32_t timeout_ms = 5000;
    if (info.Length() > 0 && info[0].IsNumber()) {
        timeout_ms = info[0].As<Napi::Number>().Uint32Value();
    }
    
    auto manager = GetGlobalWriteQueueManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Write queue manager not initialized");
        return env.Undefined();
    }
    
    bool success = manager->FlushAll(timeout_ms);
    return Napi::Boolean::New(env, success);
}

Napi::Value GetWriteQueueStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    auto manager = GetGlobalWriteQueueManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Write queue manager not initialized");
        return env.Undefined();
    }
    
    if (info.Length() > 0 && info[0].IsBigInt()) {
        // Get stats for specific FD
        uint64_t fd = NapiHelpers::GetBigUint64(env, info[0]);
        auto stats_opt = manager->GetFDStats(fd);
        
        if (!stats_opt.has_value()) {
            return env.Null();
        }
        
        auto stats = stats_opt.value();
        Napi::Object result = Napi::Object::New(env);
        result.Set("fd", NapiHelpers::CreateBigUint64(env, fd));
        result.Set("totalOperations", NapiHelpers::CreateBigUint64(env, stats.total_operations));
        result.Set("completedOperations", NapiHelpers::CreateBigUint64(env, stats.completed_operations));
        result.Set("failedOperations", NapiHelpers::CreateBigUint64(env, stats.failed_operations));
        result.Set("bytesWritten", NapiHelpers::CreateBigUint64(env, stats.bytes_written));
        result.Set("queueSize", NapiHelpers::CreateBigUint64(env, stats.queue_size));
        result.Set("maxQueueSize", NapiHelpers::CreateBigUint64(env, stats.max_queue_size));
        result.Set("avgLatencyMs", Napi::Number::New(env, stats.avg_latency_ms));
        
        return result;
    } else {
        // Get aggregate stats
        auto stats = manager->GetAggregateStats();
        Napi::Object result = Napi::Object::New(env);
        result.Set("totalOperations", NapiHelpers::CreateBigUint64(env, stats.total_operations));
        result.Set("completedOperations", NapiHelpers::CreateBigUint64(env, stats.completed_operations));
        result.Set("failedOperations", NapiHelpers::CreateBigUint64(env, stats.failed_operations));
        result.Set("bytesWritten", NapiHelpers::CreateBigUint64(env, stats.bytes_written));
        result.Set("queueSize", NapiHelpers::CreateBigUint64(env, stats.queue_size));
        result.Set("maxQueueSize", NapiHelpers::CreateBigUint64(env, stats.max_queue_size));
        result.Set("avgLatencyMs", Napi::Number::New(env, stats.avg_latency_ms));
        
        // Add active FDs
        auto active_fds = manager->GetActiveFDs();
        Napi::Array fds_array = Napi::Array::New(env, active_fds.size());
        for (size_t i = 0; i < active_fds.size(); ++i) {
            fds_array.Set(i, NapiHelpers::CreateBigUint64(env, active_fds[i]));
        }
        result.Set("activeFDs", fds_array);
        
        return result;
    }
}

Napi::Value ResetWriteQueueStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    auto manager = GetGlobalWriteQueueManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Write queue manager not initialized");
        return env.Undefined();
    }
    
    manager->ResetAllStats();
    return Napi::Boolean::New(env, true);
}

Napi::Value ConfigureWriteQueues(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsObject()) {
        NapiHelpers::ThrowTypeError(env, "Expected configuration object");
        return env.Undefined();
    }
    
    auto manager = GetGlobalWriteQueueManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Write queue manager not initialized");
        return env.Undefined();
    }
    
    Napi::Object config = info[0].As<Napi::Object>();
    
    if (config.Has("defaultMaxQueueSize")) {
        size_t max_size = config.Get("defaultMaxQueueSize").As<Napi::Number>().Uint32Value();
        manager->SetDefaultMaxQueueSize(max_size);
    }
    
    if (config.Has("fdMaxQueueSize") && config.Get("fdMaxQueueSize").IsObject()) {
        Napi::Object fd_config = config.Get("fdMaxQueueSize").As<Napi::Object>();
        Napi::Array prop_names = fd_config.GetPropertyNames();
        
        for (uint32_t i = 0; i < prop_names.Length(); ++i) {
            Napi::Value key = prop_names.Get(i);
            if (key.IsString()) {
                std::string fd_str = key.As<Napi::String>().Utf8Value();
                uint64_t fd = std::stoull(fd_str);
                size_t max_size = fd_config.Get(key).As<Napi::Number>().Uint32Value();
                manager->SetFDMaxQueueSize(fd, max_size);
            }
        }
    }
    
    return Napi::Boolean::New(env, true);
}

} // namespace fuse_native