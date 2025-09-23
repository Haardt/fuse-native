/**
 * @file write_queue.h
 * @brief Per-FD write queue header for ordered write operations
 * 
 * This header defines the write queue system that ensures ordered execution
 * of write operations per file descriptor, preventing race conditions and
 * maintaining data consistency in concurrent write scenarios.
 */

#ifndef WRITE_QUEUE_H
#define WRITE_QUEUE_H

#include <napi.h>
#include <cstdint>
#include <memory>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <unordered_map>
#include <atomic>
#include <functional>
#include <thread>
#include <chrono>
#include <optional>

namespace fuse_native {

/**
 * Write operation priority levels
 */
enum class WriteOperationPriority {
    URGENT = 0,    // flush, fsync operations
    HIGH = 1,      // write operations with O_SYNC
    NORMAL = 2,    // regular write operations
    LOW = 3        // background/async writes
};

/**
 * Write operation context
 */
struct WriteOperation {
    uint64_t fd;                           // File descriptor
    uint64_t offset;                       // Write offset
    uint64_t size;                         // Write size
    void* buffer;                          // Data buffer
    bool owns_buffer;                      // Whether we own the buffer
    WriteOperationPriority priority;       // Operation priority
    std::chrono::steady_clock::time_point timestamp;  // Creation time
    std::function<void(int)> completion_callback;     // Completion callback (errno)
    std::function<void(int)> error_callback;          // Error callback
    uint64_t operation_id;                 // Unique operation ID
    
    WriteOperation(uint64_t file_fd, uint64_t write_offset, uint64_t write_size,
                   void* write_buffer, bool buffer_owned = false,
                   WriteOperationPriority prio = WriteOperationPriority::NORMAL)
        : fd(file_fd), offset(write_offset), size(write_size), 
          buffer(write_buffer), owns_buffer(buffer_owned), priority(prio),
          timestamp(std::chrono::steady_clock::now()), operation_id(0) {}
    
    ~WriteOperation() {
        if (owns_buffer && buffer) {
            free(buffer);
        }
    }
    
    // Disable copy constructor and assignment
    WriteOperation(const WriteOperation&) = delete;
    WriteOperation& operator=(const WriteOperation&) = delete;
    
    // Enable move constructor and assignment
    WriteOperation(WriteOperation&& other) noexcept
        : fd(other.fd), offset(other.offset), size(other.size),
          buffer(other.buffer), owns_buffer(other.owns_buffer),
          priority(other.priority), timestamp(other.timestamp),
          completion_callback(std::move(other.completion_callback)),
          error_callback(std::move(other.error_callback)),
          operation_id(other.operation_id) {
        other.buffer = nullptr;
        other.owns_buffer = false;
    }
    
    WriteOperation& operator=(WriteOperation&& other) noexcept {
        if (this != &other) {
            if (owns_buffer && buffer) {
                free(buffer);
            }
            
            fd = other.fd;
            offset = other.offset;
            size = other.size;
            buffer = other.buffer;
            owns_buffer = other.owns_buffer;
            priority = other.priority;
            timestamp = other.timestamp;
            completion_callback = std::move(other.completion_callback);
            error_callback = std::move(other.error_callback);
            operation_id = other.operation_id;
            
            other.buffer = nullptr;
            other.owns_buffer = false;
        }
        return *this;
    }
};

/**
 * Write queue statistics for a single FD
 */
struct WriteQueueStats {
    uint64_t total_operations = 0;
    uint64_t completed_operations = 0;
    uint64_t failed_operations = 0;
    uint64_t bytes_written = 0;
    uint64_t queue_size = 0;
    uint64_t max_queue_size = 0;
    double avg_latency_ms = 0.0;
    std::chrono::steady_clock::time_point creation_time;
    
    WriteQueueStats() : creation_time(std::chrono::steady_clock::now()) {}
};

/**
 * Per-FD write queue class
 */
class FDWriteQueue {
public:
    /**
     * Constructor
     * @param fd File descriptor
     * @param max_queue_size Maximum queue size (0 = unlimited)
     */
    explicit FDWriteQueue(uint64_t fd, size_t max_queue_size = 100);
    
    /**
     * Destructor - ensures proper cleanup
     */
    ~FDWriteQueue();
    
    // Disable copy constructor and assignment
    FDWriteQueue(const FDWriteQueue&) = delete;
    FDWriteQueue& operator=(const FDWriteQueue&) = delete;
    
    /**
     * Get file descriptor
     * @return File descriptor this queue manages
     */
    uint64_t GetFD() const { return fd_; }
    
    /**
     * Enqueue a write operation
     * @param operation Write operation to enqueue
     * @return Operation ID for tracking, 0 on failure
     */
    uint64_t Enqueue(std::unique_ptr<WriteOperation> operation);
    
    /**
     * Process all queued operations
     * @param executor Function to execute write operations
     * @return Number of operations processed
     */
    size_t ProcessQueue(std::function<int(const WriteOperation&)> executor);
    
    /**
     * Flush all pending operations and wait for completion
     * @param timeout_ms Timeout in milliseconds
     * @return true if all operations completed within timeout
     */
    bool Flush(uint32_t timeout_ms = 5000);
    
    /**
     * Cancel all pending operations
     * @param error_code Error code to report to callbacks
     */
    void CancelAll(int error_code = -ECANCELED);
    
    /**
     * Check if queue is empty
     * @return true if no operations are pending
     */
    bool IsEmpty() const;
    
    /**
     * Get current queue size
     * @return Number of pending operations
     */
    size_t GetQueueSize() const;
    
    /**
     * Get queue statistics
     * @return Current statistics snapshot
     */
    WriteQueueStats GetStats() const;
    
    /**
     * Reset queue statistics
     */
    void ResetStats();
    
    /**
     * Set maximum queue size
     * @param max_size Maximum queue size (0 = unlimited)
     */
    void SetMaxQueueSize(size_t max_size);
    
    /**
     * Enable or disable priority ordering
     * @param enable true to enable priority ordering
     */
    void SetPriorityOrdering(bool enable);

private:
    const uint64_t fd_;
    size_t max_queue_size_;
    std::atomic<uint64_t> next_operation_id_;
    std::atomic<bool> priority_ordering_enabled_;
    
    // Queue management
    mutable std::mutex queue_mutex_;
    std::condition_variable queue_cv_;
    std::priority_queue<std::unique_ptr<WriteOperation>,
                       std::vector<std::unique_ptr<WriteOperation>>,
                       std::function<bool(const std::unique_ptr<WriteOperation>&,
                                        const std::unique_ptr<WriteOperation>&)>> operation_queue_;
    
    // Statistics
    mutable WriteQueueStats stats_;
    
    /**
     * Priority comparison function for operation queue
     */
    static bool ComparePriority(const std::unique_ptr<WriteOperation>& a,
                               const std::unique_ptr<WriteOperation>& b);
    
    /**
     * Update statistics after operation completion
     * @param operation Completed operation
     * @param success Whether operation succeeded
     * @param latency_ms Operation latency in milliseconds
     */
    void UpdateStats(const WriteOperation& operation, bool success, double latency_ms);
};

/**
 * Write queue manager class - manages all per-FD queues
 */
class WriteQueueManager {
public:
    /**
     * Constructor
     * @param default_max_queue_size Default maximum queue size per FD
     */
    explicit WriteQueueManager(size_t default_max_queue_size = 100);
    
    /**
     * Destructor - ensures proper cleanup
     */
    ~WriteQueueManager();
    
    // Disable copy constructor and assignment
    WriteQueueManager(const WriteQueueManager&) = delete;
    WriteQueueManager& operator=(const WriteQueueManager&) = delete;
    
    /**
     * Get or create write queue for a file descriptor
     * @param fd File descriptor
     * @return Pointer to write queue, or nullptr on error
     */
    FDWriteQueue* GetQueue(uint64_t fd);
    
    /**
     * Remove write queue for a file descriptor
     * @param fd File descriptor
     * @param timeout_ms Timeout for flush operations
     * @return true if queue was removed successfully
     */
    bool RemoveQueue(uint64_t fd, uint32_t timeout_ms = 5000);
    
    /**
     * Enqueue a write operation
     * @param fd File descriptor
     * @param operation Write operation to enqueue
     * @return Operation ID for tracking, 0 on failure
     */
    uint64_t EnqueueWrite(uint64_t fd, std::unique_ptr<WriteOperation> operation);
    
    /**
     * Process queues for all file descriptors
     * @param executor Function to execute write operations
     * @return Total number of operations processed
     */
    size_t ProcessAllQueues(std::function<int(const WriteOperation&)> executor);
    
    /**
     * Flush all queues
     * @param timeout_ms Timeout in milliseconds
     * @return true if all queues flushed within timeout
     */
    bool FlushAll(uint32_t timeout_ms = 5000);
    
    /**
     * Flush specific file descriptor queue
     * @param fd File descriptor
     * @param timeout_ms Timeout in milliseconds
     * @return true if queue flushed within timeout
     */
    bool FlushFD(uint64_t fd, uint32_t timeout_ms = 5000);
    
    /**
     * Cancel all operations for all file descriptors
     * @param error_code Error code to report
     */
    void CancelAll(int error_code = -ECANCELED);
    
    /**
     * Get list of active file descriptors with queues
     * @return Vector of file descriptors
     */
    std::vector<uint64_t> GetActiveFDs() const;
    
    /**
     * Get aggregate statistics for all queues
     * @return Aggregate statistics
     */
    WriteQueueStats GetAggregateStats() const;
    
    /**
     * Get statistics for specific file descriptor
     * @param fd File descriptor
     * @return Statistics for the FD, or nullopt if not found
     */
    std::optional<WriteQueueStats> GetFDStats(uint64_t fd) const;
    
    /**
     * Reset statistics for all queues
     */
    void ResetAllStats();
    
    /**
     * Set default maximum queue size
     * @param max_size Maximum queue size for new queues
     */
    void SetDefaultMaxQueueSize(size_t max_size);
    
    /**
     * Set maximum queue size for specific FD
     * @param fd File descriptor
     * @param max_size Maximum queue size
     */
    void SetFDMaxQueueSize(uint64_t fd, size_t max_size);

private:
    const size_t default_max_queue_size_;
    
    // Queue management
    mutable std::mutex queues_mutex_;
    std::unordered_map<uint64_t, std::unique_ptr<FDWriteQueue>> fd_queues_;
    
    /**
     * Get or create queue (internal, assumes mutex is locked)
     * @param fd File descriptor
     * @return Pointer to write queue
     */
    FDWriteQueue* GetQueueLocked(uint64_t fd);
};

/**
 * N-API exposed functions for write queue management
 */

/**
 * Enqueue write operation (N-API exposed function)
 * @param info N-API callback info containing FD and write parameters
 * @return Operation ID for tracking
 */
Napi::Value EnqueueWrite(const Napi::CallbackInfo& info);

/**
 * Process write queues (N-API exposed function)
 * @param info N-API callback info
 * @return Number of operations processed
 */
Napi::Value ProcessWriteQueues(const Napi::CallbackInfo& info);

/**
 * Flush write queue for FD (N-API exposed function)
 * @param info N-API callback info containing FD and timeout
 * @return Boolean indicating success
 */
Napi::Value FlushWriteQueue(const Napi::CallbackInfo& info);

/**
 * Flush all write queues (N-API exposed function)
 * @param info N-API callback info containing timeout
 * @return Boolean indicating success
 */
Napi::Value FlushAllWriteQueues(const Napi::CallbackInfo& info);

/**
 * Get write queue statistics (N-API exposed function)
 * @param info N-API callback info containing optional FD
 * @return Statistics object
 */
Napi::Value GetWriteQueueStats(const Napi::CallbackInfo& info);

/**
 * Reset write queue statistics (N-API exposed function)
 * @param info N-API callback info
 * @return Boolean indicating success
 */
Napi::Value ResetWriteQueueStats(const Napi::CallbackInfo& info);

/**
 * Configure write queue settings (N-API exposed function)
 * @param info N-API callback info containing configuration options
 * @return Boolean indicating success
 */
Napi::Value ConfigureWriteQueues(const Napi::CallbackInfo& info);

/**
 * Get global write queue manager instance
 * @return Pointer to global manager
 */
WriteQueueManager* GetGlobalWriteQueueManager();

/**
 * Initialize global write queue manager
 * @param default_max_queue_size Default maximum queue size
 * @return true if initialization succeeded
 */
bool InitializeGlobalWriteQueueManager(size_t default_max_queue_size = 100);

/**
 * Shutdown global write queue manager
 * @param timeout_ms Timeout for flush operations
 * @return true if shutdown completed successfully
 */
bool ShutdownGlobalWriteQueueManager(uint32_t timeout_ms = 5000);

} // namespace fuse_native

#endif // WRITE_QUEUE_H