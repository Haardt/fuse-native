/**
 * @file init_bridge.h
 * @brief FUSE init callback bridge for exposing connection info and capabilities
 * 
 * This module handles the FUSE init operation which is called when the filesystem
 * is first mounted. It captures and exposes fuse_conn_info and fuse_config data
 * to the TypeScript layer, including capabilities, mount options, and connection
 * parameters like maxWrite and timeGranNs.
 */

#pragma once

#define FUSE_USE_VERSION 31
#include <napi.h>
#include <fuse3/fuse.h>
#include <fuse3/fuse_lowlevel.h>
#include <memory>
#include <mutex>
#include <vector>
#include <string>

namespace fuse_native {

/**
 * Structure to hold FUSE connection information
 */
struct FuseConnectionInfo {
    // Protocol version
    uint32_t proto_major;
    uint32_t proto_minor;
    
    // Capabilities
    uint32_t capable;
    uint32_t want;
    
    // Connection parameters
    uint32_t max_write;
    uint32_t max_read;
    uint32_t max_readahead;
    uint32_t max_background;
    uint32_t congestion_threshold;
    uint32_t time_gran;
    
    // Reserved fields
    std::vector<uint32_t> reserved;
};

/**
 * Structure to hold FUSE configuration
 */
struct FuseConfig {
    // User/Group override settings
    int32_t set_gid;
    uint32_t gid;
    int32_t set_uid;
    uint32_t uid;
    int32_t set_mode;
    uint32_t umask;
    
    // Timeout settings
    double entry_timeout;
    double negative_timeout;
    double attr_timeout;
    
    // Inode settings
    int32_t use_ino;
    int32_t readdir_ino;
    int32_t direct_io;
    int32_t kernel_cache;
    int32_t auto_cache;
    int32_t ac_attr_timeout_set;
    double ac_attr_timeout;
    int32_t nullpath_ok;
    int32_t show_help;
    
    // File handle options
    char *modules;
    int32_t debug;
};

/**
 * Available FUSE mount options
 */
struct MountOptions {
    std::vector<std::string> available_options;
    std::vector<std::string> default_options;
};

/**
 * FUSE init bridge class for managing init callbacks and connection info
 */
class InitBridge {
public:
    /**
     * Get the singleton instance
     */
    static InitBridge& GetInstance();
    
    /**
     * Initialize the init bridge with FUSE operations
     */
    void Initialize(struct fuse_operations* ops);
    
    /**
     * Set the init callback for JavaScript
     */
    void SetInitCallback(Napi::Function callback);
    
    /**
     * Remove the init callback
     */
    void RemoveInitCallback();
    
    /**
     * Get the current connection information
     */
    std::shared_ptr<FuseConnectionInfo> GetConnectionInfo() const;
    
    /**
     * Get the current configuration
     */
    std::shared_ptr<FuseConfig> GetConfig() const;
    
    /**
     * Get available mount options for the current system
     */
    MountOptions GetAvailableMountOptions() const;
    
    /**
     * Check if specific capabilities are supported
     */
    bool CheckCapabilities(const std::vector<uint32_t>& caps) const;
    
    /**
     * Get capability information as human-readable strings
     */
    std::vector<std::string> GetCapabilityNames() const;
    
    /**
     * Reset the bridge state
     */
    void Reset();

private:
    InitBridge() = default;
    ~InitBridge() = default;
    InitBridge(const InitBridge&) = delete;
    InitBridge& operator=(const InitBridge&) = delete;
    
    /**
     * FUSE init callback implementation
     */
    static void* FuseInitCallback(struct fuse_conn_info *conn, struct fuse_config *cfg);
    
    /**
     * Convert fuse_conn_info to our structure
     */
    std::shared_ptr<FuseConnectionInfo> ConvertConnectionInfo(struct fuse_conn_info *conn);
    
    /**
     * Convert fuse_config to our structure
     */
    std::shared_ptr<FuseConfig> ConvertConfig(struct fuse_config *cfg);
    
    /**
     * Call the JavaScript init callback if set
     */
    void CallJavaScriptCallback(const FuseConnectionInfo& conn_info, const FuseConfig& config);
    
    // Thread safety
    mutable std::mutex mutex_;
    
    // Current connection info and config
    std::shared_ptr<FuseConnectionInfo> connection_info_;
    std::shared_ptr<FuseConfig> config_;
    
    // JavaScript callback
    Napi::ThreadSafeFunction init_callback_;
    bool has_callback_ = false;
    
    // Initialization state
    bool initialized_ = false;
};

/**
 * N-API wrapper functions for JavaScript interface
 */

/**
 * Initialize the init bridge
 * @param info N-API callback info
 * @return undefined
 */
Napi::Value InitializeInitBridge(const Napi::CallbackInfo& info);

/**
 * Set the init callback function
 * @param info N-API callback info - expects a function
 * @return undefined
 */
Napi::Value SetInitCallback(const Napi::CallbackInfo& info);

/**
 * Remove the init callback
 * @param info N-API callback info
 * @return undefined
 */
Napi::Value RemoveInitCallback(const Napi::CallbackInfo& info);

/**
 * Get current connection information
 * @param info N-API callback info
 * @return Object with connection info or null
 */
Napi::Value GetConnectionInfo(const Napi::CallbackInfo& info);

/**
 * Get current FUSE configuration
 * @param info N-API callback info
 * @return Object with config or null
 */
Napi::Value GetFuseConfig(const Napi::CallbackInfo& info);

/**
 * Get available mount options
 * @param info N-API callback info
 * @return Object with available and default options
 */
Napi::Value GetAvailableMountOptions(const Napi::CallbackInfo& info);

/**
 * Check if capabilities are supported
 * @param info N-API callback info - expects array of capability flags
 * @return Boolean indicating support
 */
Napi::Value CheckCapabilities(const Napi::CallbackInfo& info);

/**
 * Get capability names
 * @param info N-API callback info
 * @return Array of capability name strings
 */
Napi::Value GetCapabilityNames(const Napi::CallbackInfo& info);

/**
 * Reset the init bridge
 * @param info N-API callback info
 * @return undefined
 */
Napi::Value ResetInitBridge(const Napi::CallbackInfo& info);

} // namespace fuse_native