/**
 * @file session_manager.h
 * @brief FUSE session manager header for lifecycle management
 * 
 * This header defines the FUSE session manager that handles the lifecycle
 * of FUSE sessions, including creation, mounting, unmounting, and cleanup.
 */

#ifndef SESSION_MANAGER_H
#define SESSION_MANAGER_H

#include <napi.h>
#include <fuse3/fuse.h>
#include <fuse3/fuse_lowlevel.h>
#include <string>
#include <memory>
#include <mutex>
#include <thread>
#include <atomic>

namespace fuse_native {

// Forward declarations
class FuseBridge;

/**
 * Session state enumeration
 */
enum class SessionState {
    CREATED,      // Session created but not initialized
    INITIALIZED,  // Session initialized but not mounted
    MOUNTED,      // Session mounted and running
    UNMOUNTING,   // Session in process of unmounting
    UNMOUNTED,    // Session unmounted but not destroyed
    DESTROYED     // Session destroyed and cleaned up
};

/**
 * Session configuration options
 */
struct SessionOptions {
    bool debug = false;              // Enable debug mode
    bool foreground = false;         // Run in foreground
    bool single_threaded = false;    // Single-threaded mode
    bool allow_other = false;        // Allow other users to access
    bool allow_root = false;         // Allow root access
    bool auto_unmount = true;        // Auto-unmount on exit
    uint32_t max_read = 131072;      // Maximum read size (128KB)
    uint32_t max_write = 131072;     // Maximum write size (128KB)
    double timeout = 1.0;            // Default timeout
};

/**
 * FUSE session manager class
 */
class SessionManager {
public:
    /**
     * Constructor
     * @param mountpoint Directory to mount filesystem
     * @param options Session configuration options
     */
    explicit SessionManager(const std::string& mountpoint, const SessionOptions& options = {});
    
    /**
     * Destructor - ensures proper cleanup
     */
    ~SessionManager();
    
    // Disable copy constructor and assignment
    SessionManager(const SessionManager&) = delete;
    SessionManager& operator=(const SessionManager&) = delete;
    
    // Enable move constructor and assignment
    SessionManager(SessionManager&& other) noexcept = default;
    SessionManager& operator=(SessionManager&& other) noexcept = default;
    
    /**
     * Get unique session ID
     * @return Session ID
     */
    uint64_t GetSessionId() const;
    
    /**
     * Get mountpoint path
     * @return Mountpoint directory path
     */
    std::string GetMountpoint() const;
    
    /**
     * Get current session state
     * @return Current state
     */
    SessionState GetState() const;
    
    /**
     * Check if session is ready to handle operations
     * @return true if session is mounted and ready
     */
    bool IsReady() const;
    
    /**
     * Initialize the FUSE session
     * @return true if initialization succeeded
     */
    bool Initialize();
    
    /**
     * Mount the filesystem
     * @return true if mount succeeded
     */
    bool Mount();
    
    /**
     * Unmount the filesystem
     * @return true if unmount succeeded
     */
    bool Unmount();
    
    /**
     * Destroy session and cleanup all resources
     */
    void Destroy();
    
    /**
     * Get FUSE bridge instance
     * @return Pointer to FuseBridge, or nullptr if not initialized
     */
    FuseBridge* GetBridge() const { return bridge_.get(); }

private:
    // Session configuration
    const std::string mountpoint_;
    const SessionOptions options_;
    const uint64_t session_id_;
    
    // Session state
    mutable std::mutex state_mutex_;
    SessionState state_;
    
    // FUSE components
    struct fuse_session* fuse_session_;
    struct fuse_chan* fuse_channel_;
    std::unique_ptr<FuseBridge> bridge_;
    
    // Mount thread management
    std::thread mount_thread_;
    std::atomic<bool> mount_thread_running_;
    
    /**
     * Main FUSE loop (runs in separate thread)
     */
    void RunFuseLoop();
};

/**
 * Static session management functions (exposed to N-API)
 */

/**
 * Create session (N-API exposed function)
 * @param info N-API callback info containing session options
 * @return Session handle object
 */
Napi::Value CreateSession(const Napi::CallbackInfo& info);

/**
 * Destroy session (N-API exposed function)
 * @param info N-API callback info containing session handle
 * @return Boolean indicating success
 */
Napi::Value DestroySession(const Napi::CallbackInfo& info);

/**
 * Mount session (N-API exposed function)
 * @param info N-API callback info containing session handle and mount options
 * @return Boolean indicating success
 */
Napi::Value Mount(const Napi::CallbackInfo& info);

/**
 * Unmount session (N-API exposed function)
 * @param info N-API callback info containing session handle and unmount options
 * @return Boolean indicating success
 */
Napi::Value Unmount(const Napi::CallbackInfo& info);

/**
 * Check if session is ready (N-API exposed function)
 * @param info N-API callback info containing session handle
 * @return Boolean indicating readiness
 */
Napi::Value IsReady(const Napi::CallbackInfo& info);

// SessionManager namespace removed to avoid naming conflicts
// Functions are exposed directly from the main namespace

} // namespace fuse_native

#endif // SESSION_MANAGER_H