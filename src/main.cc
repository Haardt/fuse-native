/**
 * @file main.cc
 * @brief Main N-API module entry point for FUSE3 Node.js binding
 * 
 * This file serves as the primary entry point for the native FUSE3 binding,
 * providing the module initialization and registration of all FUSE operations.
 */

#define FUSE_USE_VERSION 31
#include <napi.h>
#include <fuse3/fuse.h>
#include <fuse3/fuse_lowlevel.h>
#include <sys/xattr.h>

#include "fuse_bridge.h"
#include "napi_helpers.h"
#include "session_manager.h"
#include "operations.h"
#include "errno_mapping.h"
#include "buffer_bridge.h"
#include "copy_file_range.h"
#include "tsfn_dispatcher.h"
#include "write_queue.h"
#include "shutdown.h"
#include "xattr_bridge.h"

namespace fuse_native {

/**
 * Get version information
 */
Napi::Value GetVersion(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object version = Napi::Object::New(env);
    version.Set("fuse", Napi::String::New(env, std::to_string(fuse_version())));
    version.Set("binding", Napi::String::New(env, "3.0.0-alpha.1"));
    version.Set("napi", Napi::String::New(env, std::to_string(NAPI_VERSION)));
    
    return version;
}

/**
 * Module initialization
 */
napi_value Init(napi_env env, napi_value exports) {
    Napi::Env napiEnv(env);
    Napi::Object napiExports = Napi::Object(napiEnv, exports);
    
    // Initialize error handling
    NapiHelpers::InitializeErrorHandling(napiEnv);
    
    // Register FUSE session management functions
    napiExports.Set("createSession", Napi::Function::New(napiEnv, CreateSession));
    napiExports.Set("destroySession", Napi::Function::New(napiEnv, DestroySession));
    napiExports.Set("mount", Napi::Function::New(napiEnv, Mount));
    napiExports.Set("unmount", Napi::Function::New(napiEnv, Unmount));
    napiExports.Set("isReady", Napi::Function::New(napiEnv, IsReady));
    
    // Register operation management functions
    napiExports.Set("setOperationHandler", Napi::Function::New(napiEnv, SetOperationHandler));
    napiExports.Set("removeOperationHandler", Napi::Function::New(napiEnv, RemoveOperationHandler));
    
    // Register TSFN dispatcher functions
    napiExports.Set("initializeDispatcher", Napi::Function::New(napiEnv, InitializeDispatcher));
    napiExports.Set("shutdownDispatcher", Napi::Function::New(napiEnv, ShutdownDispatcher));
    napiExports.Set("getDispatcherStats", Napi::Function::New(napiEnv, GetDispatcherStats));
    napiExports.Set("resetDispatcherStats", Napi::Function::New(napiEnv, ResetDispatcherStats));
    napiExports.Set("setDispatcherConfig", Napi::Function::New(napiEnv, SetDispatcherConfig));
    
    // Register write queue functions
    napiExports.Set("enqueueWrite", Napi::Function::New(napiEnv, EnqueueWrite));
    napiExports.Set("processWriteQueues", Napi::Function::New(napiEnv, ProcessWriteQueues));
    napiExports.Set("flushWriteQueue", Napi::Function::New(napiEnv, FlushWriteQueue));
    napiExports.Set("flushAllWriteQueues", Napi::Function::New(napiEnv, FlushAllWriteQueues));
    napiExports.Set("getWriteQueueStats", Napi::Function::New(napiEnv, GetWriteQueueStats));
    napiExports.Set("resetWriteQueueStats", Napi::Function::New(napiEnv, ResetWriteQueueStats));
    napiExports.Set("configureWriteQueues", Napi::Function::New(napiEnv, ConfigureWriteQueues));
    
    // Register shutdown management functions
    napiExports.Set("initializeShutdownManager", Napi::Function::New(napiEnv, InitializeShutdownManager));
    napiExports.Set("initiateGracefulShutdown", Napi::Function::New(napiEnv, InitiateGracefulShutdown));
    napiExports.Set("forceImmediateShutdown", Napi::Function::New(napiEnv, ForceImmediateShutdown));
    napiExports.Set("getShutdownState", Napi::Function::New(napiEnv, GetShutdownState));
    napiExports.Set("getShutdownStats", Napi::Function::New(napiEnv, GetShutdownStats));
    napiExports.Set("registerShutdownCallback", Napi::Function::New(napiEnv, RegisterShutdownCallback));
    napiExports.Set("waitForShutdownCompletion", Napi::Function::New(napiEnv, WaitForShutdownCompletion));
    napiExports.Set("configureShutdownTimeouts", Napi::Function::New(napiEnv, ConfigureShutdownTimeouts));
    
    // Register utility functions
    napiExports.Set("getVersion", Napi::Function::New(napiEnv, GetVersion));
    
    // Register buffer bridge functions
    napiExports.Set("createExternalBuffer", Napi::Function::New(napiEnv, CreateExternalBuffer));
    napiExports.Set("createManagedBuffer", Napi::Function::New(napiEnv, CreateManagedBuffer));
    napiExports.Set("validateBuffer", Napi::Function::New(napiEnv, ValidateBuffer));
    napiExports.Set("validateBufferRange", Napi::Function::New(napiEnv, ValidateBufferRange));
    napiExports.Set("createBufferSlice", Napi::Function::New(napiEnv, CreateBufferSlice));
    napiExports.Set("getBufferStats", Napi::Function::New(napiEnv, GetBufferStats));
    
    // Register copy file range functions
    napiExports.Set("copyFileRange", Napi::Function::New(napiEnv, CopyFileRange));
    napiExports.Set("setCopyChunkSize", Napi::Function::New(napiEnv, SetCopyChunkSize));
    napiExports.Set("getCopyChunkSize", Napi::Function::New(napiEnv, GetCopyChunkSize));
    napiExports.Set("getCopyStats", Napi::Function::New(napiEnv, GetCopyStats));
    napiExports.Set("resetCopyStats", Napi::Function::New(napiEnv, ResetCopyStats));
    
    // Register xattr functions
    napiExports.Set("getxattr", Napi::Function::New(napiEnv, GetXAttr));
    napiExports.Set("setxattr", Napi::Function::New(napiEnv, SetXAttr));
    napiExports.Set("listxattr", Napi::Function::New(napiEnv, ListXAttr));
    napiExports.Set("removexattr", Napi::Function::New(napiEnv, RemoveXAttr));
    
    // Register errno constants using errno_mapping
    Napi::Object errno_constants = Napi::Object::New(napiEnv);
    errno_constants.Set("ENOENT", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOENT)));
    errno_constants.Set("EACCES", Napi::Number::New(napiEnv, normalize_fuse_errno(EACCES)));
    errno_constants.Set("EEXIST", Napi::Number::New(napiEnv, normalize_fuse_errno(EEXIST)));
    errno_constants.Set("EISDIR", Napi::Number::New(napiEnv, normalize_fuse_errno(EISDIR)));
    errno_constants.Set("ENOTDIR", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOTDIR)));
    errno_constants.Set("ENOTEMPTY", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOTEMPTY)));
    errno_constants.Set("EPERM", Napi::Number::New(napiEnv, normalize_fuse_errno(EPERM)));
    errno_constants.Set("EIO", Napi::Number::New(napiEnv, normalize_fuse_errno(EIO)));
    errno_constants.Set("ENOMEM", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOMEM)));
    errno_constants.Set("ENOSPC", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOSPC)));
    errno_constants.Set("EINVAL", Napi::Number::New(napiEnv, normalize_fuse_errno(EINVAL)));
    errno_constants.Set("ENODEV", Napi::Number::New(napiEnv, normalize_fuse_errno(ENODEV)));
    errno_constants.Set("EROFS", Napi::Number::New(napiEnv, normalize_fuse_errno(EROFS)));
    errno_constants.Set("EAGAIN", Napi::Number::New(napiEnv, normalize_fuse_errno(EAGAIN)));
    errno_constants.Set("EWOULDBLOCK", Napi::Number::New(napiEnv, normalize_fuse_errno(EWOULDBLOCK)));
    errno_constants.Set("EMFILE", Napi::Number::New(napiEnv, normalize_fuse_errno(EMFILE)));
    errno_constants.Set("ENFILE", Napi::Number::New(napiEnv, normalize_fuse_errno(ENFILE)));
    errno_constants.Set("EBADF", Napi::Number::New(napiEnv, normalize_fuse_errno(EBADF)));
    errno_constants.Set("EFAULT", Napi::Number::New(napiEnv, normalize_fuse_errno(EFAULT)));
    errno_constants.Set("ELOOP", Napi::Number::New(napiEnv, normalize_fuse_errno(ELOOP)));
    errno_constants.Set("ENAMETOOLONG", Napi::Number::New(napiEnv, normalize_fuse_errno(ENAMETOOLONG)));
    errno_constants.Set("ENOTSUPP", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOTSUP)));
    errno_constants.Set("EXDEV", Napi::Number::New(napiEnv, normalize_fuse_errno(EXDEV)));
    errno_constants.Set("ENOSYS", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOSYS)));
    errno_constants.Set("ERANGE", Napi::Number::New(napiEnv, normalize_fuse_errno(ERANGE)));
    errno_constants.Set("ENOATTR", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOATTR)));
    
    napiExports.Set("errno", errno_constants);
    
    // Register xattr flags constants
    Napi::Object xattr_constants = Napi::Object::New(napiEnv);
    xattr_constants.Set("XATTR_CREATE", Napi::Number::New(napiEnv, XATTR_CREATE));
    xattr_constants.Set("XATTR_REPLACE", Napi::Number::New(napiEnv, XATTR_REPLACE));
    
    napiExports.Set("xattr", xattr_constants);
    
    // Register file mode constants
    Napi::Object mode_constants = Napi::Object::New(napiEnv);
    mode_constants.Set("S_IFMT", Napi::Number::New(napiEnv, S_IFMT));
    mode_constants.Set("S_IFREG", Napi::Number::New(napiEnv, S_IFREG));
    mode_constants.Set("S_IFDIR", Napi::Number::New(napiEnv, S_IFDIR));
    mode_constants.Set("S_IFLNK", Napi::Number::New(napiEnv, S_IFLNK));
    mode_constants.Set("S_IFBLK", Napi::Number::New(napiEnv, S_IFBLK));
    mode_constants.Set("S_IFCHR", Napi::Number::New(napiEnv, S_IFCHR));
    mode_constants.Set("S_IFIFO", Napi::Number::New(napiEnv, S_IFIFO));
    mode_constants.Set("S_IFSOCK", Napi::Number::New(napiEnv, S_IFSOCK));
    mode_constants.Set("S_ISUID", Napi::Number::New(napiEnv, S_ISUID));
    mode_constants.Set("S_ISGID", Napi::Number::New(napiEnv, S_ISGID));
    mode_constants.Set("S_ISVTX", Napi::Number::New(napiEnv, S_ISVTX));
    mode_constants.Set("S_IRWXU", Napi::Number::New(napiEnv, S_IRWXU));
    mode_constants.Set("S_IRUSR", Napi::Number::New(napiEnv, S_IRUSR));
    mode_constants.Set("S_IWUSR", Napi::Number::New(napiEnv, S_IWUSR));
    mode_constants.Set("S_IXUSR", Napi::Number::New(napiEnv, S_IXUSR));
    mode_constants.Set("S_IRWXG", Napi::Number::New(napiEnv, S_IRWXG));
    mode_constants.Set("S_IRGRP", Napi::Number::New(napiEnv, S_IRGRP));
    mode_constants.Set("S_IWGRP", Napi::Number::New(napiEnv, S_IWGRP));
    mode_constants.Set("S_IXGRP", Napi::Number::New(napiEnv, S_IXGRP));
    mode_constants.Set("S_IRWXO", Napi::Number::New(napiEnv, S_IRWXO));
    mode_constants.Set("S_IROTH", Napi::Number::New(napiEnv, S_IROTH));
    mode_constants.Set("S_IWOTH", Napi::Number::New(napiEnv, S_IWOTH));
    mode_constants.Set("S_IXOTH", Napi::Number::New(napiEnv, S_IXOTH));
    
    napiExports.Set("mode", mode_constants);
    
    // Register open flags constants
    Napi::Object flag_constants = Napi::Object::New(napiEnv);
    flag_constants.Set("O_RDONLY", Napi::Number::New(napiEnv, O_RDONLY));
    flag_constants.Set("O_WRONLY", Napi::Number::New(napiEnv, O_WRONLY));
    flag_constants.Set("O_RDWR", Napi::Number::New(napiEnv, O_RDWR));
    flag_constants.Set("O_CREAT", Napi::Number::New(napiEnv, O_CREAT));
    flag_constants.Set("O_EXCL", Napi::Number::New(napiEnv, O_EXCL));
    flag_constants.Set("O_TRUNC", Napi::Number::New(napiEnv, O_TRUNC));
    flag_constants.Set("O_APPEND", Napi::Number::New(napiEnv, O_APPEND));
    flag_constants.Set("O_NONBLOCK", Napi::Number::New(napiEnv, O_NONBLOCK));
    flag_constants.Set("O_SYNC", Napi::Number::New(napiEnv, O_SYNC));
    flag_constants.Set("O_DIRECT", Napi::Number::New(napiEnv, O_DIRECT));
    flag_constants.Set("O_DIRECTORY", Napi::Number::New(napiEnv, O_DIRECTORY));
    flag_constants.Set("O_NOFOLLOW", Napi::Number::New(napiEnv, O_NOFOLLOW));
    
    napiExports.Set("flags", flag_constants);
    
    // Initialize global components
    InitializeGlobalDispatcher(napiEnv);
    InitializeGlobalWriteQueueManager();
    InitializeGlobalShutdownManager();
    
    return exports;
}

} // namespace fuse_native

// Register the module with Node.js
NAPI_MODULE(NODE_GYP_MODULE_NAME, fuse_native::Init)