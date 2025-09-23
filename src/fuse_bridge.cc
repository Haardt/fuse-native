/**
 * @file fuse_bridge.cc
 * @brief FUSE3 bridge implementation for N-API integration
 * 
 * This file implements the main bridge between FUSE3 operations and Node.js
 * callbacks through N-API ThreadSafeFunction.
 */

#include "fuse_bridge.h"
#include "napi_helpers.h"
#include <iostream>
#include <memory>

namespace fuse_native {

// Static instance pointer for FUSE callbacks
static FuseBridge* g_bridge_instance = nullptr;

/**
 * FuseRequestContext implementation
 */
FuseRequestContext::FuseRequestContext(FuseOpType type, fuse_req_t request)
    : op_type(type), req(request), ino(0), offset(0), size(0), 
      flags(0), mode(0), uid(0), gid(0), buffer(nullptr), 
      buffer_size(0), buffer_owned(false) {
}

FuseRequestContext::~FuseRequestContext() {
    if (buffer_owned && buffer) {
        free(buffer);
        buffer = nullptr;
    }
}

FuseRequestContext::FuseRequestContext(FuseRequestContext&& other) noexcept
    : op_type(other.op_type), req(other.req), ino(other.ino), 
      path(std::move(other.path)), offset(other.offset), size(other.size),
      flags(other.flags), mode(other.mode), uid(other.uid), gid(other.gid),
      buffer(other.buffer), buffer_size(other.buffer_size), 
      buffer_owned(other.buffer_owned) {
    other.buffer = nullptr;
    other.buffer_owned = false;
}

FuseRequestContext& FuseRequestContext::operator=(FuseRequestContext&& other) noexcept {
    if (this != &other) {
        // Clean up existing resources
        if (buffer_owned && buffer) {
            free(buffer);
        }
        
        // Move from other
        op_type = other.op_type;
        req = other.req;
        ino = other.ino;
        path = std::move(other.path);
        offset = other.offset;
        size = other.size;
        flags = other.flags;
        mode = other.mode;
        uid = other.uid;
        gid = other.gid;
        buffer = other.buffer;
        buffer_size = other.buffer_size;
        buffer_owned = other.buffer_owned;
        
        // Reset other
        other.buffer = nullptr;
        other.buffer_owned = false;
    }
    return *this;
}

/**
 * FuseResponse implementation
 */
FuseResponse::FuseResponse()
    : errno_result(0), next_offset(0), has_attr(false), has_data(false),
      has_buffer(false), attr_timeout(1.0), entry_timeout(1.0) {
    memset(&attr, 0, sizeof(attr));
}

void FuseResponse::SetError(int err) {
    errno_result = err;
    has_attr = false;
    has_data = false;
    has_buffer = false;
}

void FuseResponse::SetAttr(const struct stat& st, double timeout) {
    attr = st;
    has_attr = true;
    attr_timeout = timeout;
    errno_result = 0;
}

void FuseResponse::SetData(const std::string& str) {
    data = str;
    has_data = true;
    errno_result = 0;
}

void FuseResponse::SetData(const char* data_ptr, size_t len) {
    data.assign(data_ptr, len);
    has_data = true;
    errno_result = 0;
}

void FuseResponse::SetBuffer(std::vector<char>&& buf) {
    buffer = std::move(buf);
    has_buffer = true;
    errno_result = 0;
}

/**
 * FuseBridge implementation
 */
FuseBridge::FuseBridge(SessionManager* session_mgr)
    : session_manager_(session_mgr), initialized_(false), shutdown_(false) {
    InitializeFuseOperations();
    g_bridge_instance = this;
}

FuseBridge::~FuseBridge() {
    Shutdown();
    if (g_bridge_instance == this) {
        g_bridge_instance = nullptr;
    }
}

bool FuseBridge::Initialize(Napi::Env env) {
    if (initialized_.load()) {
        return true;
    }
    
    // TODO: Initialize ThreadSafeFunctions for each operation
    
    initialized_.store(true);
    return true;
}

void FuseBridge::Shutdown() {
    if (shutdown_.load()) {
        return;
    }
    
    shutdown_.store(true);
    
    // TODO: Clean up ThreadSafeFunctions
    std::lock_guard<std::mutex> lock(handlers_mutex_);
    operation_handlers_.clear();
}

bool FuseBridge::SetOperationHandler(FuseOpType op_type, Napi::Function handler) {
    if (shutdown_.load()) {
        return false;
    }
    
    // TODO: Create ThreadSafeFunction from handler
    std::lock_guard<std::mutex> lock(handlers_mutex_);
    // operation_handlers_[op_type] = tsfn;
    
    return true;
}

void FuseBridge::RemoveOperationHandler(FuseOpType op_type) {
    std::lock_guard<std::mutex> lock(handlers_mutex_);
    auto it = operation_handlers_.find(op_type);
    if (it != operation_handlers_.end()) {
        // TODO: Release ThreadSafeFunction
        operation_handlers_.erase(it);
    }
}

const struct fuse_lowlevel_ops* FuseBridge::GetFuseOperations() const {
    return &fuse_ops_;
}

void FuseBridge::ProcessRequest(std::unique_ptr<FuseRequestContext> context) {
    if (shutdown_.load()) {
        fuse_reply_err(context->req, ESHUTDOWN);
        return;
    }
    
    // Dispatch to appropriate operation processor
    switch (context->op_type) {
        case FuseOpType::STATFS:
            ProcessStatfsRequest(std::move(context));
            break;
            
        default:
            // For unimplemented operations, just reply with ENOSYS
            fuse_reply_err(context->req, ENOSYS);
            break;
    }
}

void FuseBridge::SendResponse(fuse_req_t req, const FuseResponse& response) {
    if (response.errno_result != 0) {
        fuse_reply_err(req, -response.errno_result);
        return;
    }
    
    // TODO: Handle different response types based on operation
    fuse_reply_err(req, ENOSYS);
}

FuseBridge* FuseBridge::GetBridgeFromRequest(fuse_req_t req) {
    // TODO: Get bridge instance from request user data
    return g_bridge_instance;
}

void FuseBridge::InitializeFuseOperations() {
    memset(&fuse_ops_, 0, sizeof(fuse_ops_));
    
    // Set up FUSE operation callbacks
    fuse_ops_.lookup = ll_lookup;
    fuse_ops_.getattr = ll_getattr;
    fuse_ops_.setattr = ll_setattr;
    fuse_ops_.readlink = ll_readlink;
    fuse_ops_.mknod = ll_mknod;
    fuse_ops_.mkdir = ll_mkdir;
    fuse_ops_.unlink = ll_unlink;
    fuse_ops_.rmdir = ll_rmdir;
    fuse_ops_.symlink = ll_symlink;
    fuse_ops_.rename = ll_rename;
    fuse_ops_.link = ll_link;
    fuse_ops_.open = ll_open;
    fuse_ops_.read = ll_read;
    fuse_ops_.write = ll_write;
    fuse_ops_.flush = ll_flush;
    fuse_ops_.release = ll_release;
    fuse_ops_.fsync = ll_fsync;
    fuse_ops_.opendir = ll_opendir;
    fuse_ops_.readdir = ll_readdir;
    fuse_ops_.releasedir = ll_releasedir;
    fuse_ops_.fsyncdir = ll_fsyncdir;
    fuse_ops_.statfs = ll_statfs;
    fuse_ops_.setxattr = ll_setxattr;
    fuse_ops_.getxattr = ll_getxattr;
    fuse_ops_.listxattr = ll_listxattr;
    fuse_ops_.removexattr = ll_removexattr;
    fuse_ops_.access = ll_access;
    fuse_ops_.create = ll_create;
}

// Static FUSE operation callbacks (stubs for now)
void FuseBridge::ll_lookup(fuse_req_t req, fuse_ino_t parent, const char *name) {
    auto bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, EIO);
        return;
    }
    
    auto context = std::make_unique<FuseRequestContext>(FuseOpType::LOOKUP, req);
    context->ino = parent;
    context->path = name ? name : "";
    
    bridge->ProcessRequest(std::move(context));
}

void FuseBridge::ll_getattr(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
    auto bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, EIO);
        return;
    }
    
    auto context = std::make_unique<FuseRequestContext>(FuseOpType::GETATTR, req);
    context->ino = ino;
    
    bridge->ProcessRequest(std::move(context));
}

// Stub implementations for other operations
void FuseBridge::ll_forget(fuse_req_t req, fuse_ino_t ino, uint64_t nlookup) {
    // Forget doesn't need a reply
}

void FuseBridge::ll_setattr(fuse_req_t req, fuse_ino_t ino, struct stat *attr, int to_set, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_readlink(fuse_req_t req, fuse_ino_t ino) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_mknod(fuse_req_t req, fuse_ino_t parent, const char *name, mode_t mode, dev_t rdev) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_mkdir(fuse_req_t req, fuse_ino_t parent, const char *name, mode_t mode) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_unlink(fuse_req_t req, fuse_ino_t parent, const char *name) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_rmdir(fuse_req_t req, fuse_ino_t parent, const char *name) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_symlink(fuse_req_t req, const char *link, fuse_ino_t parent, const char *name) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_rename(fuse_req_t req, fuse_ino_t parent, const char *name, fuse_ino_t newparent, const char *newname, unsigned int flags) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_link(fuse_req_t req, fuse_ino_t ino, fuse_ino_t newparent, const char *newname) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_open(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_read(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_write(fuse_req_t req, fuse_ino_t ino, const char *buf, size_t size, off_t off, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_flush(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_release(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_fsync(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_opendir(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_readdir(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_releasedir(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_fsyncdir(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_statfs(fuse_req_t req, fuse_ino_t ino) {
    auto bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, EIO);
        return;
    }
    
    auto context = std::make_unique<FuseRequestContext>(FuseOpType::STATFS, req);
    context->ino = ino;
    
    bridge->ProcessRequest(std::move(context));
}

void FuseBridge::ll_setxattr(fuse_req_t req, fuse_ino_t ino, const char *name, const char *value, size_t size, int flags) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_getxattr(fuse_req_t req, fuse_ino_t ino, const char *name, size_t size) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_listxattr(fuse_req_t req, fuse_ino_t ino, size_t size) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_removexattr(fuse_req_t req, fuse_ino_t ino, const char *name) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_access(fuse_req_t req, fuse_ino_t ino, int mask) {
    fuse_reply_err(req, ENOSYS);
}

void FuseBridge::ll_create(fuse_req_t req, fuse_ino_t parent, const char *name, mode_t mode, struct fuse_file_info *fi) {
    fuse_reply_err(req, ENOSYS);
}

/**
 * Helper functions
 */
const char* FuseOpTypeToString(FuseOpType op_type) {
    switch (op_type) {
        case FuseOpType::LOOKUP: return "lookup";
        case FuseOpType::FORGET: return "forget";
        case FuseOpType::GETATTR: return "getattr";
        case FuseOpType::SETATTR: return "setattr";
        case FuseOpType::READLINK: return "readlink";
        case FuseOpType::MKNOD: return "mknod";
        case FuseOpType::MKDIR: return "mkdir";
        case FuseOpType::UNLINK: return "unlink";
        case FuseOpType::RMDIR: return "rmdir";
        case FuseOpType::SYMLINK: return "symlink";
        case FuseOpType::RENAME: return "rename";
        case FuseOpType::LINK: return "link";
        case FuseOpType::OPEN: return "open";
        case FuseOpType::READ: return "read";
        case FuseOpType::WRITE: return "write";
        case FuseOpType::FLUSH: return "flush";
        case FuseOpType::RELEASE: return "release";
        case FuseOpType::FSYNC: return "fsync";
        case FuseOpType::OPENDIR: return "opendir";
        case FuseOpType::READDIR: return "readdir";
        case FuseOpType::RELEASEDIR: return "releasedir";
        case FuseOpType::FSYNCDIR: return "fsyncdir";
        case FuseOpType::STATFS: return "statfs";
        case FuseOpType::SETXATTR: return "setxattr";
        case FuseOpType::GETXATTR: return "getxattr";
        case FuseOpType::LISTXATTR: return "listxattr";
        case FuseOpType::REMOVEXATTR: return "removexattr";
        case FuseOpType::ACCESS: return "access";
        case FuseOpType::CREATE: return "create";
        default: return "unknown";
    }
}

FuseOpType StringToFuseOpType(const std::string& str) {
    if (str == "lookup") return FuseOpType::LOOKUP;
    if (str == "forget") return FuseOpType::FORGET;
    if (str == "getattr") return FuseOpType::GETATTR;
    if (str == "setattr") return FuseOpType::SETATTR;
    if (str == "readlink") return FuseOpType::READLINK;
    if (str == "mknod") return FuseOpType::MKNOD;
    if (str == "mkdir") return FuseOpType::MKDIR;
    if (str == "unlink") return FuseOpType::UNLINK;
    if (str == "rmdir") return FuseOpType::RMDIR;
    if (str == "symlink") return FuseOpType::SYMLINK;
    if (str == "rename") return FuseOpType::RENAME;
    if (str == "link") return FuseOpType::LINK;
    if (str == "open") return FuseOpType::OPEN;
    if (str == "read") return FuseOpType::READ;
    if (str == "write") return FuseOpType::WRITE;
    if (str == "flush") return FuseOpType::FLUSH;
    if (str == "release") return FuseOpType::RELEASE;
    if (str == "fsync") return FuseOpType::FSYNC;
    if (str == "opendir") return FuseOpType::OPENDIR;
    if (str == "readdir") return FuseOpType::READDIR;
    if (str == "releasedir") return FuseOpType::RELEASEDIR;
    if (str == "fsyncdir") return FuseOpType::FSYNCDIR;
    if (str == "statfs") return FuseOpType::STATFS;
    if (str == "setxattr") return FuseOpType::SETXATTR;
    if (str == "getxattr") return FuseOpType::GETXATTR;
    if (str == "listxattr") return FuseOpType::LISTXATTR;
    if (str == "removexattr") return FuseOpType::REMOVEXATTR;
    if (str == "access") return FuseOpType::ACCESS;
    if (str == "create") return FuseOpType::CREATE;
    
    return static_cast<FuseOpType>(-1); // Invalid
}

} // namespace fuse_native