# Concurrency Model

This document describes the concurrency and threading model used in the FUSE native binding, including the TSFN dispatcher, write queues, and shutdown management.

## Overview

The FUSE native binding uses a sophisticated concurrency model to ensure thread safety, proper ordering of operations, and graceful shutdown. The system consists of three main components:

1. **TSFN Dispatcher** - Unified C++→JavaScript callback management
2. **Write Queues** - Per-FD write operation ordering
3. **Shutdown Manager** - Graceful shutdown with state transitions

Enable `FUSE_LOG=TRACE` during diagnosis to follow dispatcher state changes, queue activity, and shutdown transitions; the new native logger annotates every C++ log line with the originating file and operation.

## TSFN Dispatcher

### Purpose

The ThreadSafeFunction (TSFN) dispatcher provides a unified system for executing JavaScript callbacks from C++ threads in a thread-safe manner. It replaces ad-hoc callback mechanisms with a centralized, ordered, and observable system.

### Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   C++ Thread    │───▶│ TSFN Dispatcher  │───▶│ JavaScript Main │
│   (FUSE Ops)    │    │                  │    │     Thread      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Priority Queue   │
                       │ • HIGH (urgent)  │
                       │ • NORMAL (ops)   │
                       │ • LOW (cleanup)  │
                       └──────────────────┘
```

### Key Features

- **Thread Safety**: All C++→JS calls go through TSFN
- **Priority Ordering**: Critical operations (unmount, errors) have higher priority
- **Request Tracking**: Each dispatch gets a unique ID for tracking completion
- **Statistics**: Comprehensive metrics on dispatch performance
- **Backpressure**: Queue size limits prevent memory exhaustion

### Usage Example

```cpp
// C++ side - dispatch callback to JavaScript
auto dispatcher = GetGlobalDispatcher();
uint64_t request_id = dispatcher->Dispatch("getattr", args, CallbackPriority::NORMAL);

// Wait for completion if needed
dispatcher->WaitForCompletion(request_id, 5000);
```

```javascript
// JavaScript side - register operation handler
binding.setOperationHandler('getattr', async (path) => {
  // Handle getattr operation
  return stat;
});
```

### Guarantees

1. **Ordering**: Higher priority operations execute before lower priority ones
2. **Completion**: All dispatched operations will eventually complete or timeout
3. **Error Handling**: Failed operations are properly reported back to C++
4. **Resource Cleanup**: TSFN resources are automatically cleaned up on shutdown

### Anti-Patterns

❌ **Don't**: Call JavaScript directly from C++ threads
```cpp
// WRONG - not thread safe
js_callback.Call({arg1, arg2});
```

✅ **Do**: Use the TSFN dispatcher
```cpp
// RIGHT - thread safe
dispatcher->Dispatch("operation", args);
```

❌ **Don't**: Block C++ threads waiting for JavaScript
```cpp
// WRONG - can deadlock
while (!js_completed) {
  std::this_thread::sleep_for(std::chrono::milliseconds(1));
}
```

✅ **Do**: Use async completion callbacks
```cpp
// RIGHT - non-blocking with callback
dispatcher->Dispatch("operation", args, priority, [](napi_value result) {
  // Handle completion
});
```

## Write Queues

### Purpose

Write queues ensure that write operations to the same file descriptor are executed in the correct order, preventing race conditions and data corruption in concurrent write scenarios.

### Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Write Op #1   │───▶│                  │───▶│   Execute #1    │
├─────────────────┤    │   Per-FD Queue   │    ├─────────────────┤
│   Write Op #2   │───▶│                  │───▶│   Execute #2    │
├─────────────────┤    │  (Priority Sort) │    ├─────────────────┤
│   Write Op #3   │───▶│                  │───▶│   Execute #3    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Write Priorities │
                       │ • URGENT (sync)  │
                       │ • HIGH (O_SYNC)  │
                       │ • NORMAL (write) │
                       │ • LOW (async)    │
                       └──────────────────┘
```

### Key Features

- **Per-FD Isolation**: Each file descriptor has its own queue
- **Priority Ordering**: Urgent operations (flush, fsync) jump ahead
- **Zero-Copy**: External ArrayBuffer support for large writes
- **Statistics**: Per-FD and aggregate write statistics
- **Flow Control**: Queue size limits prevent unbounded growth

### Usage Example

```javascript
// Enqueue a write operation
const operationId = binding.enqueueWrite(
  fd,                    // File descriptor
  offset,               // Write offset (BigInt)
  size,                 // Write size (BigInt)  
  buffer,               // Data buffer
  priority,             // Priority level (0-3)
  (result) => {         // Completion callback
    console.log(`Write completed with result: ${result}`);
  }
);

// Process all queues
binding.processWriteQueues((operation) => {
  // Execute the actual write
  return fs.write(operation.fd, operation.buffer, 0, operation.size, operation.offset);
});
```

### Ordering Guarantees

1. **FIFO within Priority**: Same priority operations execute in submission order
2. **Priority Precedence**: Higher priority operations execute before lower priority
3. **Per-FD Isolation**: Operations on different FDs can execute concurrently
4. **Flush Semantics**: `flush()` waits for all pending writes to complete

### Queue States

- **Active**: Queue is processing operations normally
- **Draining**: No new operations accepted, existing ones complete
- **Flushing**: Waiting for all operations to complete
- **Cancelled**: All operations cancelled with error code

## Shutdown Management

### Purpose

The shutdown manager provides graceful shutdown of the entire FUSE binding with proper resource cleanup and state transitions.

### State Machine

```
   ┌─────────┐  initiate   ┌──────────┐  drain     ┌────────────┐  cleanup   ┌────────┐
   │ RUNNING │────────────▶│ DRAINING │───────────▶│ UNMOUNTING │───────────▶│ CLOSED │
   └─────────┘             └──────────┘            └────────────┘            └────────┘
        │                                               ▲                         ▲
        │                      force shutdown           │                         │
        └───────────────────────────────────────────────┴─────────────────────────┘
```

### Shutdown Phases

#### 1. DRAINING Phase
- **Goal**: Complete all pending operations
- **Actions**:
  - Stop accepting new operations
  - Flush all write queues
  - Wait for TSFN dispatcher to clear
- **Timeout**: 5 seconds (configurable)
- **Completion Check**: All queues empty

#### 2. UNMOUNTING Phase  
- **Goal**: Unmount FUSE sessions and cleanup resources
- **Actions**:
  - Signal `fuse_session_exit()` on all sessions
  - Shutdown TSFN dispatcher
  - Shutdown write queue manager
- **Timeout**: 8 seconds (configurable)
- **Completion Check**: All FUSE sessions exited

#### 3. CLOSED Phase
- **Goal**: Final cleanup and resource deallocation
- **Actions**:
  - Release all remaining resources
  - Update statistics
  - Notify callbacks

### Signal Handling

The shutdown manager automatically handles SIGINT and SIGTERM signals:

```cpp
// Automatically installed signal handlers
SIGINT  (Ctrl+C) → InitiateShutdown("SIGINT", 15000ms)
SIGTERM (kill)   → InitiateShutdown("SIGTERM", 15000ms)
```

### Usage Example

```javascript
// Initialize shutdown manager
binding.initializeShutdownManager();

// Register shutdown callback
binding.registerShutdownCallback({
  onShutdownBegin: (reason) => {
    console.log(`Shutdown initiated: ${reason}`);
  },
  onShutdownPhase: (phase) => {
    console.log(`Entering phase: ${phase.description}`);
  },
  onShutdownComplete: (stats) => {
    console.log(`Shutdown completed in ${stats.totalDurationMs}ms`);
  }
});

// Initiate graceful shutdown
binding.initiateGracefulShutdown("Application exit", 30000);

// Or force immediate shutdown
binding.forceImmediateShutdown("Emergency");
```

### Shutdown Guarantees

1. **State Consistency**: Clean transitions between states
2. **Resource Cleanup**: All resources properly released
3. **Data Safety**: Pending writes complete or are cleanly cancelled
4. **Timeout Handling**: Each phase has configurable timeout
5. **Signal Safety**: Signal handlers work from any thread

## Thread Safety

### Thread Model

The FUSE binding uses the following threading model:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ JavaScript Main │    │   FUSE Threads   │    │ Worker Threads  │
│     Thread      │    │   (libfuse)      │    │ (TSFN/Queues)   │
│                 │    │                  │    │                 │
│ • User code     │    │ • getattr()      │    │ • Dispatch      │
│ • Event loop    │    │ • read()         │    │ • Write queue   │
│ • Callbacks     │    │ • write()        │    │ • Shutdown      │
│ • Results       │    │ • Other ops      │    │ • Cleanup       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         ▲                        │                        │
         │                        ▼                        │
         └◀────── TSFN Dispatcher ◀────────────────────────┘
```

### Synchronization Primitives

- **Mutexes**: Protect shared data structures
- **Condition Variables**: Signal state changes
- **Atomic Operations**: Lock-free counters and flags
- **TSFN**: Thread-safe JavaScript callbacks

### Data Structures

All shared data structures are protected by appropriate synchronization:

```cpp
// Example: Thread-safe statistics
struct Stats {
    std::atomic<uint64_t> counter{0};          // Lock-free
    mutable std::mutex mutex_;                  // Protects complex data
    std::unordered_map<uint64_t, Data> map_;   // Protected by mutex_
};
```

## Performance Considerations

### Latency Optimization

1. **Priority Queues**: Critical operations bypass normal queue
2. **Lock-Free Counters**: Statistics don't block operations  
3. **Minimal Copying**: Zero-copy buffers where possible
4. **Batch Processing**: Process multiple operations together

### Memory Management

1. **External Buffers**: Avoid unnecessary data copying
2. **Pool Allocation**: Reuse operation structures
3. **Weak References**: Prevent circular dependencies
4. **Automatic Cleanup**: RAII ensures resource release

### Scalability

1. **Per-FD Queues**: Operations on different files are independent
2. **Worker Threads**: Configurable thread pool size
3. **Backpressure**: Queue limits prevent memory exhaustion
4. **Statistics**: Monitor performance bottlenecks

## Error Handling

### Error Propagation

Errors are propagated through the system using consistent mechanisms:

1. **C++ Exceptions**: Caught at TSFN boundaries
2. **Error Callbacks**: Async error reporting
3. **Return Codes**: POSIX errno values
4. **Statistics**: Error counters for monitoring

### Error Recovery

The system includes several error recovery mechanisms:

1. **Timeout Handling**: Operations that take too long are cancelled
2. **Queue Limits**: Prevent unbounded memory growth
3. **Graceful Degradation**: System remains functional during partial failures
4. **Emergency Shutdown**: Force shutdown as last resort

## Debugging and Monitoring

### Statistics

Each component provides detailed statistics:

```javascript
// TSFN Dispatcher stats
const dispatcherStats = binding.getDispatcherStats();
console.log(`Dispatched: ${dispatcherStats.totalDispatched}`);
console.log(`Queue size: ${dispatcherStats.queueSize}`);
console.log(`Avg latency: ${dispatcherStats.avgLatencyMs}ms`);

// Write queue stats  
const writeStats = binding.getWriteQueueStats();
console.log(`Bytes written: ${writeStats.bytesWritten}`);
console.log(`Active FDs: ${writeStats.activeFDs.length}`);

// Shutdown stats
const shutdownStats = binding.getShutdownStats();
console.log(`Graceful: ${shutdownStats.gracefulCompletion}`);
console.log(`Phases: ${shutdownStats.phaseDurations.length}`);
```

### Debugging Tips

1. **Enable Debug Build**: Use `-DCMAKE_BUILD_TYPE=Debug`
2. **AddressSanitizer**: Detects memory errors
3. **Thread Sanitizer**: Detects race conditions  
4. **Statistics**: Monitor queue sizes and latencies
5. **Logging**: Add structured logging for key operations

## Best Practices

### For Application Developers

1. **Handle Shutdown**: Listen for shutdown events and cleanup resources
2. **Monitor Queues**: Watch queue sizes to detect bottlenecks
3. **Use Priorities**: Set appropriate priorities for operations
4. **Error Handling**: Always handle callback errors
5. **Resource Management**: Close file descriptors when done

### For Contributors

1. **Thread Safety**: All shared data must be protected
2. **RAII**: Use RAII for resource management
3. **Error Handling**: Check all N-API return codes
4. **Testing**: Include concurrency tests
5. **Documentation**: Document thread safety guarantees

## Configuration

### TSFN Dispatcher

```javascript
binding.initializeDispatcher({
  maxQueueSize: 1000,      // Max pending callbacks
  workerThreads: 1,        // Number of worker threads
  priorityOrdering: true   // Enable priority queue
});
```

### Write Queues

```javascript
binding.configureWriteQueues({
  defaultMaxQueueSize: 100,    // Default queue size per FD
  fdMaxQueueSize: {            // Per-FD overrides
    "123": 500,               // Large queue for FD 123
    "456": 50                 // Small queue for FD 456
  }
});
```

### Shutdown Manager

```javascript
binding.configureShutdownTimeouts({
  draining: 5000,     // Draining phase timeout (ms)
  unmounting: 8000    // Unmounting phase timeout (ms)
});
```
