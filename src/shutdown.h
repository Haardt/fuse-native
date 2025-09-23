/**
 * @file shutdown.h
 * @brief Geordneter shutdown management header for FUSE native binding
 * 
 * This header defines the shutdown management system that handles graceful
 * shutdown of FUSE sessions with proper state transitions, signal handling,
 * and resource cleanup.
 */

#ifndef SHUTDOWN_H
#define SHUTDOWN_H

#include <napi.h>
#include <atomic>
#include <mutex>
#include <condition_variable>
#include <functional>
#include <vector>
#include <memory>
#include <chrono>
#include <csignal>
#include <thread>

namespace fuse_native {

/**
 * Shutdown state enumeration - follows the required state machine
 */
enum class ShutdownState {
    RUNNING = 0,     // Normal operation
    DRAINING = 1,    // Draining pending operations
    UNMOUNTING = 2,  // Unmounting FUSE session
    CLOSED = 3       // Fully shut down
};

/**
 * Shutdown phase information
 */
struct ShutdownPhase {
    ShutdownState state;
    std::string description;
    std::chrono::milliseconds timeout;
    std::chrono::steady_clock::time_point start_time;
    std::function<bool()> completion_check;
    std::function<void()> cleanup_action;
    
    ShutdownPhase(ShutdownState s, const std::string& desc, 
                  std::chrono::milliseconds to = std::chrono::milliseconds(5000))
        : state(s), description(desc), timeout(to), start_time(std::chrono::steady_clock::now()) {}
};

/**
 * Shutdown statistics
 */
struct ShutdownStats {
    std::chrono::steady_clock::time_point shutdown_start;
    std::chrono::steady_clock::time_point shutdown_end;
    ShutdownState final_state;
    std::vector<std::pair<ShutdownState, std::chrono::milliseconds>> phase_durations;
    bool graceful_completion;
    std::string failure_reason;
    
    ShutdownStats() : final_state(ShutdownState::RUNNING), graceful_completion(false) {}
};

/**
 * Shutdown callback interface
 */
class ShutdownCallback {
public:
    virtual ~ShutdownCallback() = default;
    
    /**
     * Called when shutdown begins
     * @param reason Reason for shutdown
     */
    virtual void OnShutdownBegin(const std::string& reason) {}
    
    /**
     * Called when entering each shutdown phase
     * @param phase Current shutdown phase
     */
    virtual void OnShutdownPhase(const ShutdownPhase& phase) {}
    
    /**
     * Called when shutdown completes
     * @param stats Final shutdown statistics
     */
    virtual void OnShutdownComplete(const ShutdownStats& stats) {}
    
    /**
     * Called if shutdown fails or times out
     * @param state State where failure occurred
     * @param reason Failure reason
     */
    virtual void OnShutdownFailed(ShutdownState state, const std::string& reason) {}
};

/**
 * Main shutdown manager class
 */
class ShutdownManager {
public:
    /**
     * Constructor
     */
    ShutdownManager();
    
    /**
     * Destructor - ensures cleanup
     */
    ~ShutdownManager();
    
    // Disable copy constructor and assignment
    ShutdownManager(const ShutdownManager&) = delete;
    ShutdownManager& operator=(const ShutdownManager&) = delete;
    
    /**
     * Initialize shutdown manager
     * @return true if initialization succeeded
     */
    bool Initialize();
    
    /**
     * Register a shutdown callback
     * @param callback Callback to register
     */
    void RegisterCallback(std::shared_ptr<ShutdownCallback> callback);
    
    /**
     * Unregister a shutdown callback
     * @param callback Callback to unregister
     */
    void UnregisterCallback(std::shared_ptr<ShutdownCallback> callback);
    
    /**
     * Get current shutdown state
     * @return Current state
     */
    ShutdownState GetState() const;
    
    /**
     * Check if shutdown is in progress
     * @return true if shutdown is active
     */
    bool IsShuttingDown() const;
    
    /**
     * Check if shutdown is complete
     * @return true if fully shut down
     */
    bool IsShutdownComplete() const;
    
    /**
     * Initiate graceful shutdown
     * @param reason Reason for shutdown
     * @param timeout_ms Total timeout for shutdown process
     * @return true if shutdown initiated successfully
     */
    bool InitiateShutdown(const std::string& reason = "Manual shutdown", 
                         uint32_t timeout_ms = 15000);
    
    /**
     * Force immediate shutdown (emergency)
     * @param reason Reason for forced shutdown
     */
    void ForceShutdown(const std::string& reason = "Forced shutdown");
    
    /**
     * Wait for shutdown completion
     * @param timeout_ms Timeout in milliseconds
     * @return true if shutdown completed within timeout
     */
    bool WaitForShutdown(uint32_t timeout_ms = 30000);
    
    /**
     * Get shutdown statistics
     * @return Current shutdown statistics
     */
    ShutdownStats GetStats() const;
    
    /**
     * Set phase timeout
     * @param state Shutdown state/phase
     * @param timeout_ms Timeout in milliseconds
     */
    void SetPhaseTimeout(ShutdownState state, uint32_t timeout_ms);
    
    /**
     * Register cleanup function for a specific phase
     * @param state Shutdown state/phase
     * @param cleanup_fn Cleanup function to execute
     */
    void RegisterPhaseCleanup(ShutdownState state, std::function<void()> cleanup_fn);
    
    /**
     * Register completion check for a specific phase
     * @param state Shutdown state/phase
     * @param check_fn Function to check if phase is complete
     */
    void RegisterPhaseCompletionCheck(ShutdownState state, std::function<bool()> check_fn);

private:
    // State management
    mutable std::mutex state_mutex_;
    std::atomic<ShutdownState> current_state_;
    std::condition_variable state_cv_;
    
    // Signal handling
    bool signal_handlers_installed_;
    
    // Shutdown phases configuration
    std::mutex phases_mutex_;
    std::vector<std::unique_ptr<ShutdownPhase>> shutdown_phases_;
    
    // Callbacks
    std::mutex callbacks_mutex_;
    std::vector<std::weak_ptr<ShutdownCallback>> callbacks_;
    
    // Statistics
    mutable std::mutex stats_mutex_;
    ShutdownStats stats_;
    
    // Shutdown execution
    std::atomic<bool> shutdown_in_progress_;
    std::thread shutdown_thread_;
    
    /**
     * Install signal handlers for SIGINT and SIGTERM
     */
    void InstallSignalHandlers();
    
    /**
     * Remove signal handlers
     */
    void RemoveSignalHandlers();
    
    /**
     * Signal handler function
     * @param signal Signal number
     */
    static void SignalHandler(int signal);
    
    /**
     * Execute shutdown process in separate thread
     * @param reason Reason for shutdown
     * @param timeout_ms Total timeout
     */
    void ExecuteShutdown(const std::string& reason, uint32_t timeout_ms);
    
    /**
     * Execute a specific shutdown phase
     * @param phase Phase to execute
     * @return true if phase completed successfully
     */
    bool ExecutePhase(const ShutdownPhase& phase);
    
    /**
     * Transition to next shutdown state
     * @param new_state New state to transition to
     */
    void TransitionState(ShutdownState new_state);
    
    /**
     * Notify all registered callbacks
     * @param callback_fn Function to call on each callback
     */
    void NotifyCallbacks(std::function<void(ShutdownCallback&)> callback_fn);
    
    /**
     * Initialize default shutdown phases
     */
    void InitializeDefaultPhases();
    
    /**
     * Clean up expired callback weak pointers
     */
    void CleanupExpiredCallbacks();
};

/**
 * FUSE session specific shutdown helpers
 */

/**
 * Register FUSE session for shutdown management
 * @param session_id Session ID to register
 * @param session_ptr Pointer to session (for fuse_session_exit)
 * @return true if registration succeeded
 */
bool RegisterFuseSession(uint64_t session_id, void* session_ptr);

/**
 * Unregister FUSE session from shutdown management
 * @param session_id Session ID to unregister
 * @return true if unregistration succeeded
 */
bool UnregisterFuseSession(uint64_t session_id);

/**
 * Signal all registered FUSE sessions to exit
 * @return Number of sessions signaled
 */
size_t SignalAllFuseSessions();

/**
 * Wait for all FUSE sessions to complete shutdown
 * @param timeout_ms Timeout in milliseconds
 * @return true if all sessions shut down within timeout
 */
bool WaitForAllFuseSessions(uint32_t timeout_ms = 10000);

/**
 * Global shutdown manager functions
 */

/**
 * Get the global shutdown manager instance
 * @return Pointer to global shutdown manager, or nullptr if not initialized
 */
ShutdownManager* GetGlobalShutdownManager();

/**
 * Initialize the global shutdown manager
 * @return true if initialization succeeded
 */
bool InitializeGlobalShutdownManager();

/**
 * Shutdown the global shutdown manager
 * @param timeout_ms Timeout for shutdown process
 * @return true if shutdown completed successfully
 */
bool ShutdownGlobalShutdownManager(uint32_t timeout_ms = 30000);

/**
 * N-API exposed functions for shutdown management
 */

/**
 * Initialize shutdown manager (N-API exposed function)
 * @param info N-API callback info
 * @return Boolean indicating success
 */
Napi::Value InitializeShutdownManager(const Napi::CallbackInfo& info);

/**
 * Initiate graceful shutdown (N-API exposed function)
 * @param info N-API callback info containing reason and timeout
 * @return Boolean indicating success
 */
Napi::Value InitiateGracefulShutdown(const Napi::CallbackInfo& info);

/**
 * Force immediate shutdown (N-API exposed function)
 * @param info N-API callback info containing reason
 * @return Boolean indicating success
 */
Napi::Value ForceImmediateShutdown(const Napi::CallbackInfo& info);

/**
 * Get shutdown state (N-API exposed function)
 * @param info N-API callback info
 * @return Number representing current shutdown state
 */
Napi::Value GetShutdownState(const Napi::CallbackInfo& info);

/**
 * Get shutdown statistics (N-API exposed function)
 * @param info N-API callback info
 * @return Object containing shutdown statistics
 */
Napi::Value GetShutdownStats(const Napi::CallbackInfo& info);

/**
 * Register shutdown callback (N-API exposed function)
 * @param info N-API callback info containing callback functions
 * @return Boolean indicating success
 */
Napi::Value RegisterShutdownCallback(const Napi::CallbackInfo& info);

/**
 * Wait for shutdown completion (N-API exposed function)
 * @param info N-API callback info containing timeout
 * @return Promise that resolves when shutdown completes
 */
Napi::Value WaitForShutdownCompletion(const Napi::CallbackInfo& info);

/**
 * Configure shutdown timeouts (N-API exposed function)
 * @param info N-API callback info containing timeout configuration
 * @return Boolean indicating success
 */
Napi::Value ConfigureShutdownTimeouts(const Napi::CallbackInfo& info);

} // namespace fuse_native

#endif // SHUTDOWN_H