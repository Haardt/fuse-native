/**
 * @file tsfn_dispatcher.h
 * @brief Thread-safe function dispatcher for unified C→JS callback management
 * 
 * This header defines the TSFN (ThreadSafeFunction) dispatcher that provides
 * unified management of all C++→JavaScript callbacks in the FUSE native binding.
 * It ensures thread-safe execution, proper ordering, and resource management.
 */

#ifndef TSFN_DISPATCHER_H
#define TSFN_DISPATCHER_H

#include <napi.h>
#include <string>
#include <memory>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <unordered_map>
#include <atomic>
#include <functional>
#include <thread>
#include <chrono>

namespace fuse_native {

/**
 * Callback priority levels for operation ordering
 */
enum class CallbackPriority {
    HIGH = 0,      // Critical operations (unmount, errors)
    NORMAL = 1,    // Regular FUSE operations
    LOW = 2        // Background operations (stats, cleanup)
};

/**
 * Callback context information
 */
struct CallbackContext {
    std::string operation_name;
    uint64_t request_id;
    CallbackPriority priority;
    std::chrono::steady_clock::time_point timestamp;
    std::function<void(Napi::Env, Napi::Function)> callback_fn;
    std::function<void(int)> error_callback;  // For error handling
    
    CallbackContext(const std::string& op_name, uint64_t req_id, CallbackPriority prio)
        : operation_name(op_name), request_id(req_id), priority(prio), 
          timestamp(std::chrono::steady_clock::now()) {}
};

/**
 * Dispatcher statistics
 */
struct DispatcherStats {
    uint64_t total_dispatched = 0;
    uint64_t total_completed = 0;
    uint64_t total_errors = 0;
    uint64_t queue_size = 0;
    uint64_t max_queue_size = 0;
    double avg_latency_ms = 0.0;
    std::chrono::steady_clock::time_point start_time;
    
    DispatcherStats() : start_time(std::chrono::steady_clock::now()) {}
};

/**
 * Thread-safe function dispatcher class
 */
class TSFNDispatcher {
public:
    /**
     * Constructor
     * @param env N-API environment
     * @param max_queue_size Maximum queue size (0 = unlimited)
     * @param worker_threads Number of worker threads for callback processing
     */
    explicit TSFNDispatcher(Napi::Env env, size_t max_queue_size = 1000, size_t worker_threads = 1);
    
    /**
     * Destructor - ensures proper cleanup
     */
    ~TSFNDispatcher();
    
    // Disable copy constructor and assignment
    TSFNDispatcher(const TSFNDispatcher&) = delete;
    TSFNDispatcher& operator=(const TSFNDispatcher&) = delete;
    
    /**
     * Initialize the dispatcher
     * @return true if initialization succeeded
     */
    bool Initialize();
    
    /**
     * Shutdown the dispatcher and cleanup resources
     * @param timeout_ms Timeout for graceful shutdown in milliseconds
     * @return true if shutdown completed within timeout
     */
    bool Shutdown(uint32_t timeout_ms = 5000);
    
    /**
     * Register a JavaScript callback handler for an operation
     * @param operation_name Operation name (e.g., "getattr", "read", "write")
     * @param callback JavaScript function to register
     * @return true if registration succeeded
     */
    bool RegisterHandler(const std::string& operation_name, Napi::Function callback);
    
    /**
     * Unregister a JavaScript callback handler
     * @param operation_name Operation name to unregister
     * @return true if unregistration succeeded
     */
    bool UnregisterHandler(const std::string& operation_name);
    
    /**
     * Dispatch a callback to JavaScript
     * @param operation_name Operation name
     * @param args Arguments to pass to the callback
     * @param priority Callback priority level
     * @param completion_callback Optional completion callback
     * @return Request ID for tracking, 0 on failure
     */
    uint64_t Dispatch(const std::string& operation_name,
                     const std::vector<napi_value>& args,
                     CallbackPriority priority = CallbackPriority::NORMAL,
                     std::function<void(napi_value)> completion_callback = nullptr);
    
    /**
     * Dispatch a callback with custom callback function
     * @param operation_name Operation name
     * @param callback_fn Custom callback function to execute in JS thread
     * @param priority Callback priority level
     * @param error_callback Optional error callback for C++ thread
     * @return Request ID for tracking, 0 on failure
     */
    uint64_t DispatchCustom(const std::string& operation_name,
                           std::function<void(Napi::Env, Napi::Function)> callback_fn,
                           CallbackPriority priority = CallbackPriority::NORMAL,
                           std::function<void(int)> error_callback = nullptr);
    
    /**
     * Wait for a specific request to complete
     * @param request_id Request ID returned by Dispatch
     * @param timeout_ms Timeout in milliseconds
     * @return true if request completed within timeout
     */
    bool WaitForCompletion(uint64_t request_id, uint32_t timeout_ms = 5000);
    
    /**
     * Wait for all pending requests to complete
     * @param timeout_ms Timeout in milliseconds
     * @return true if all requests completed within timeout
     */
    bool WaitForAllCompletion(uint32_t timeout_ms = 5000);
    
    /**
     * Check if dispatcher is running and ready
     * @return true if dispatcher is operational
     */
    bool IsReady() const;
    
    /**
     * Get current queue size
     * @return Number of pending callbacks
     */
    size_t GetQueueSize() const;
    
    /**
     * Get dispatcher statistics
     * @return Current statistics snapshot
     */
    DispatcherStats GetStats() const;
    
    /**
     * Reset dispatcher statistics
     */
    void ResetStats();
    
    /**
     * Set maximum queue size
     * @param max_size Maximum queue size (0 = unlimited)
     */
    void SetMaxQueueSize(size_t max_size);
    
    /**
     * Enable or disable callback ordering by priority
     * @param enable true to enable priority ordering
     */
    void SetPriorityOrdering(bool enable);

private:
    // Internal structures
    struct PendingCallback {
        std::unique_ptr<CallbackContext> context;
        std::function<void(napi_value)> completion_callback;
        std::atomic<bool> completed{false};
        napi_value result;
        
        PendingCallback(std::unique_ptr<CallbackContext> ctx,
                       std::function<void(napi_value)> completion_cb = nullptr)
            : context(std::move(ctx)), completion_callback(completion_cb) {}
    };
    
    // State management
    enum class DispatcherState {
        UNINITIALIZED,
        INITIALIZING,
        RUNNING,
        SHUTTING_DOWN,
        SHUTDOWN
    };
    
    std::atomic<DispatcherState> state_;
    Napi::Env env_;
    size_t max_queue_size_;
    size_t worker_threads_;
    
    // Thread-safe function for JS callbacks
    Napi::ThreadSafeFunction tsfn_;
    
    // Callback handlers registry
    mutable std::mutex handlers_mutex_;
    std::unordered_map<std::string, Napi::ThreadSafeFunction> handlers_;
    
    // Callback queue management
    mutable std::mutex queue_mutex_;
    std::condition_variable queue_cv_;
    std::priority_queue<std::shared_ptr<PendingCallback>,
                       std::vector<std::shared_ptr<PendingCallback>>,
                       std::function<bool(const std::shared_ptr<PendingCallback>&,
                                        const std::shared_ptr<PendingCallback>&)>> callback_queue_;
    
    // Request tracking
    std::atomic<uint64_t> next_request_id_;
    mutable std::mutex pending_requests_mutex_;
    std::unordered_map<uint64_t, std::shared_ptr<PendingCallback>> pending_requests_;
    
    // Worker threads
    std::vector<std::thread> worker_threads_vec_;
    std::atomic<bool> workers_running_;
    
    // Statistics
    mutable std::mutex stats_mutex_;
    DispatcherStats stats_;
    std::atomic<bool> priority_ordering_enabled_;
    
    /**
     * Worker thread main function
     */
    void WorkerThreadMain();
    
    /**
     * Process a single callback
     * @param callback Callback to process
     */
    void ProcessCallback(std::shared_ptr<PendingCallback> callback);
    
    /**
     * Complete a callback request
     * @param request_id Request ID to complete
     * @param result Result value from JavaScript
     */
    void CompleteRequest(uint64_t request_id, napi_value result);
    
    /**
     * Handle callback error
     * @param request_id Request ID that failed
     * @param error_code Error code
     */
    void HandleCallbackError(uint64_t request_id, int error_code);
    
    /**
     * Update statistics
     * @param latency_ms Callback latency in milliseconds
     * @param success Whether callback succeeded
     */
    void UpdateStats(double latency_ms, bool success);
    
    /**
     * Priority comparison function for callback queue
     */
    static bool ComparePriority(const std::shared_ptr<PendingCallback>& a,
                               const std::shared_ptr<PendingCallback>& b);
};

/**
 * Global dispatcher instance management
 */

/**
 * Get the global TSFN dispatcher instance
 * @return Pointer to global dispatcher, or nullptr if not initialized
 */
TSFNDispatcher* GetGlobalDispatcher();

/**
 * Initialize the global TSFN dispatcher
 * @param env N-API environment
 * @param max_queue_size Maximum queue size
 * @param worker_threads Number of worker threads
 * @return true if initialization succeeded
 */
bool InitializeGlobalDispatcher(Napi::Env env, size_t max_queue_size = 1000, size_t worker_threads = 1);

/**
 * Shutdown the global TSFN dispatcher
 * @param timeout_ms Timeout for graceful shutdown
 * @return true if shutdown completed successfully
 */
bool ShutdownGlobalDispatcher(uint32_t timeout_ms = 5000);

/**
 * N-API exposed functions for dispatcher management
 */

/**
 * Initialize dispatcher (N-API exposed function)
 * @param info N-API callback info containing dispatcher options
 * @return Boolean indicating success
 */
Napi::Value InitializeDispatcher(const Napi::CallbackInfo& info);

/**
 * Shutdown dispatcher (N-API exposed function)
 * @param info N-API callback info containing timeout
 * @return Boolean indicating success
 */
Napi::Value ShutdownDispatcher(const Napi::CallbackInfo& info);

/**
 * Get dispatcher statistics (N-API exposed function)
 * @param info N-API callback info
 * @return Object containing statistics
 */
Napi::Value GetDispatcherStats(const Napi::CallbackInfo& info);

/**
 * Reset dispatcher statistics (N-API exposed function)
 * @param info N-API callback info
 * @return Boolean indicating success
 */
Napi::Value ResetDispatcherStats(const Napi::CallbackInfo& info);

/**
 * Set dispatcher configuration (N-API exposed function)
 * @param info N-API callback info containing configuration options
 * @return Boolean indicating success
 */
Napi::Value SetDispatcherConfig(const Napi::CallbackInfo& info);

} // namespace fuse_native

#endif // TSFN_DISPATCHER_H