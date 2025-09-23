/**
 * @file fuse_bridge.h
 * @brief FUSE3 bridge declarations for N-API integration
 * 
 * This header defines the main bridge structures and functions that connect
 * FUSE3 operations with Node.js callbacks through N-API ThreadSafeFunction.
 */

#ifndef FUSE_BRIDGE_H
#define FUSE_BRIDGE_H

#include <napi.h>
#include <fuse3/fuse.h>
#include <fuse3/fuse_lowlevel.h>
#include <memory>
#include <unordered_map>
#include <string>
#include <mutex>
#include <condition_variable>
#include <atomic>

namespace fuse_native {

/**
 * Forward declarations
 */
class SessionManager;
class Operations;

/**
 * FUSE operation types enumeration
 * Maps to the FUSE lowlevel operations structure
 */
enum class FuseOpType {
    LOOKUP = 0,
    FORGET,
    GETATTR,
    SETATTR,
    READLINK,
    MKNOD,
    MKDIR,
    UNLINK,
    RMDIR,
    SYMLINK,
    RENAME,
    LINK,
    OPEN,
    READ,
    WRITE,
    FLUSH,
    RELEASE,
    FSYNC,
    OPENDIR,
    READDIR,
    RELEASEDIR,
    FSYNCDIR,
    STATFS,
    SETXATTR,
    GETXATTR,
    LISTXATTR,
    REMOVEXATTR,
    ACCESS,
    CREATE,
    GETLK,
    SETLK,
    BMAP,
    IOCTL,
    POLL,
    WRITE_BUF,
    RETRIEVE_REPLY,
    FORGET_MULTI,
    FLOCK,
    FALLOCATE,
    READDIRPLUS,
    RENAME2,
    LSEEK,
    COPY_FILE_RANGE,
    SETUPMAPPING,
    REMOVEMAPPING
};

/**
 * Operation context for FUSE requests
 * Contains all necessary information for processing a FUSE operation
 */
struct FuseRequestContext {
    FuseOpType op_type;
    fuse_req_t req;
    fuse_ino_t ino;
    std::string path;
    uint64_t offset;
    size_t size;
    int flags;
    mode_t mode;
    uid_t uid;
    gid_t gid;
    void* buffer;
    size_t buffer_size;
    bool buffer_owned;
    
    // Constructor
    FuseRequestContext(FuseOpType type, fuse_req_t request);
    
    // Destructor - cleans up owned buffers
    ~FuseRequestContext();
    
    // Disable copy constructor and assignment
    FuseRequestContext(const FuseRequestContext&) = delete;
    FuseRequestContext& operator=(const FuseRequestContext&) = delete;
    
    // Enable move constructor and assignment
    FuseRequestContext(FuseRequestContext&& other) noexcept;
    FuseRequestContext& operator=(FuseRequestContext&& other) noexcept;
};

/**
 * Response data for FUSE operations
 * Contains the result data and status for a FUSE operation
 */
struct FuseResponse {
    int errno_result;
    struct stat attr;
    std::string data;
    std::vector<char> buffer;
    uint64_t next_offset;
    bool has_attr;
    bool has_data;
    bool has_buffer;
    double attr_timeout;
    double entry_timeout;
    
    // Constructor
    FuseResponse();
    
    // Helper methods
    void SetError(int err);
    void SetAttr(const struct stat& st, double timeout = 1.0);
    void SetData(const std::string& str);
    void SetData(const char* data, size_t len);
    void SetBuffer(std::vector<char>&& buf);
};

/**
 * FUSE Bridge class
 * Manages the connection between FUSE operations and Node.js callbacks
 */
class FuseBridge {
public:
    explicit FuseBridge(SessionManager* session_mgr);
    ~FuseBridge();
    
    // Initialize the bridge with operation handlers
    bool Initialize(Napi::Env env);
    
    // Shutdown the bridge and clean up resources
    void Shutdown();
    
    // Set operation handler for a specific FUSE operation
    bool SetOperationHandler(FuseOpType op_type, Napi::Function handler);
    
    // Remove operation handler for a specific FUSE operation
    void RemoveOperationHandler(FuseOpType op_type);
    
    // Get the FUSE lowlevel operations structure
    const struct fuse_lowlevel_ops* GetFuseOperations() const;
    
    // Process a FUSE request (called from FUSE operation callbacks)
    void ProcessRequest(std::unique_ptr<FuseRequestContext> context);
    
    // Send response back to FUSE (called from Node.js callback completion)
    void SendResponse(fuse_req_t req, const FuseResponse& response);
    
    // Specific operation processors
    void ProcessStatfsRequest(std::unique_ptr<FuseRequestContext> context);
    
    // Specific operation handlers
    static void HandleStatfsSuccess(Napi::Env env, Napi::Value result, FuseRequestContext* context);
    static void HandleStatfsError(Napi::Env env, Napi::Value error, FuseRequestContext* context);

private:
    SessionManager* session_manager_;
    std::unordered_map<FuseOpType, Napi::ThreadSafeFunction> operation_handlers_;
    std::mutex handlers_mutex_;
    std::atomic<bool> initialized_;
    std::atomic<bool> shutdown_;
    
    // FUSE lowlevel operations structure
    struct fuse_lowlevel_ops fuse_ops_;
    
    // ThreadSafeFunction callback for processing requests
    static void ProcessRequestCallback(Napi::Env env, Napi::Function js_callback, 
                                     std::unique_ptr<FuseRequestContext>* context);
    
    // Initialize FUSE operations structure
    void InitializeFuseOperations();
    
    // Static FUSE operation callbacks
    static void ll_lookup(fuse_req_t req, fuse_ino_t parent, const char *name);
    static void ll_forget(fuse_req_t req, fuse_ino_t ino, uint64_t nlookup);
    static void ll_getattr(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi);
    static void ll_setattr(fuse_req_t req, fuse_ino_t ino, struct stat *attr, 
                          int to_set, struct fuse_file_info *fi);
    static void ll_readlink(fuse_req_t req, fuse_ino_t ino);
    static void ll_mknod(fuse_req_t req, fuse_ino_t parent, const char *name, 
                        mode_t mode, dev_t rdev);
    static void ll_mkdir(fuse_req_t req, fuse_ino_t parent, const char *name, mode_t mode);
    static void ll_unlink(fuse_req_t req, fuse_ino_t parent, const char *name);
    static void ll_rmdir(fuse_req_t req, fuse_ino_t parent, const char *name);
    static void ll_symlink(fuse_req_t req, const char *link, fuse_ino_t parent, 
                          const char *name);
    static void ll_rename(fuse_req_t req, fuse_ino_t parent, const char *name, 
                         fuse_ino_t newparent, const char *newname, unsigned int flags);
    static void ll_link(fuse_req_t req, fuse_ino_t ino, fuse_ino_t newparent, 
                       const char *newname);
    static void ll_open(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi);
    static void ll_read(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off, 
                       struct fuse_file_info *fi);
    static void ll_write(fuse_req_t req, fuse_ino_t ino, const char *buf, size_t size, 
                        off_t off, struct fuse_file_info *fi);
    static void ll_flush(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi);
    static void ll_release(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi);
    static void ll_fsync(fuse_req_t req, fuse_ino_t ino, int datasync, 
                        struct fuse_file_info *fi);
    static void ll_opendir(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi);
    static void ll_readdir(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off, 
                          struct fuse_file_info *fi);
    static void ll_releasedir(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi);
    static void ll_fsyncdir(fuse_req_t req, fuse_ino_t ino, int datasync, 
                           struct fuse_file_info *fi);
    static void ll_statfs(fuse_req_t req, fuse_ino_t ino);
    static void ll_setxattr(fuse_req_t req, fuse_ino_t ino, const char *name, 
                           const char *value, size_t size, int flags);
    static void ll_getxattr(fuse_req_t req, fuse_ino_t ino, const char *name, size_t size);
    static void ll_listxattr(fuse_req_t req, fuse_ino_t ino, size_t size);
    static void ll_removexattr(fuse_req_t req, fuse_ino_t ino, const char *name);
    static void ll_access(fuse_req_t req, fuse_ino_t ino, int mask);
    static void ll_create(fuse_req_t req, fuse_ino_t parent, const char *name, 
                         mode_t mode, struct fuse_file_info *fi);
    
    // Helper method to get bridge instance from FUSE request
    static FuseBridge* GetBridgeFromRequest(fuse_req_t req);
};

/**
 * Helper function to convert FuseOpType to string
 */
const char* FuseOpTypeToString(FuseOpType op_type);

/**
 * Helper function to convert string to FuseOpType
 */
FuseOpType StringToFuseOpType(const std::string& str);

} // namespace fuse_native

#endif // FUSE_BRIDGE_H