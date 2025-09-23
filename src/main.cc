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

#include "fuse_bridge.h"
#include "napi_helpers.h"
#include "session_manager.h"
#include "operations.h"

namespace fuse_native {

/**
 * Initialize the FUSE Native module
 * Registers all FUSE operations and helper functions
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Initialize error handling
    NapiHelpers::InitializeErrorHandling(env);
    
    // Register FUSE session management functions
    // Session management functions - placeholder for now
    // exports.Set("createSession", Napi::Function::New(env, SessionManager::CreateSession));
    // exports.Set("destroySession", Napi::Function::New(env, SessionManager::DestroySession));
    // exports.Set("mount", Napi::Function::New(env, SessionManager::Mount));
    // exports.Set("unmount", Napi::Function::New(env, SessionManager::Unmount));
    // exports.Set("isReady", Napi::Function::New(env, SessionManager::IsReady));
    
    // Operation management functions - placeholder for now
    // exports.Set("setOperationHandler", Napi::Function::New(env, Operations::SetOperationHandler));
    // exports.Set("removeOperationHandler", Napi::Function::New(env, Operations::RemoveOperationHandler));
    
    // Register utility functions
    exports.Set("getVersion", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        Napi::Env env = info.Env();
        Napi::Object version = Napi::Object::New(env);
        
        version.Set("fuse", Napi::String::New(env, std::to_string(fuse_version())));
        version.Set("binding", Napi::String::New(env, "3.0.0-alpha.1"));
        version.Set("napi", Napi::String::New(env, std::to_string(NAPI_VERSION)));
        
        return version;
    }));
    
    // Register errno constants
    Napi::Object errno_constants = Napi::Object::New(env);
    errno_constants.Set("ENOENT", Napi::Number::New(env, -ENOENT));
    errno_constants.Set("EACCES", Napi::Number::New(env, -EACCES));
    errno_constants.Set("EEXIST", Napi::Number::New(env, -EEXIST));
    errno_constants.Set("EISDIR", Napi::Number::New(env, -EISDIR));
    errno_constants.Set("ENOTDIR", Napi::Number::New(env, -ENOTDIR));
    errno_constants.Set("ENOTEMPTY", Napi::Number::New(env, -ENOTEMPTY));
    errno_constants.Set("EPERM", Napi::Number::New(env, -EPERM));
    errno_constants.Set("EIO", Napi::Number::New(env, -EIO));
    errno_constants.Set("ENOMEM", Napi::Number::New(env, -ENOMEM));
    errno_constants.Set("ENOSPC", Napi::Number::New(env, -ENOSPC));
    errno_constants.Set("EINVAL", Napi::Number::New(env, -EINVAL));
    errno_constants.Set("ENODEV", Napi::Number::New(env, -ENODEV));
    errno_constants.Set("EROFS", Napi::Number::New(env, -EROFS));
    errno_constants.Set("EAGAIN", Napi::Number::New(env, -EAGAIN));
    errno_constants.Set("EWOULDBLOCK", Napi::Number::New(env, -EWOULDBLOCK));
    errno_constants.Set("EMFILE", Napi::Number::New(env, -EMFILE));
    errno_constants.Set("ENFILE", Napi::Number::New(env, -ENFILE));
    errno_constants.Set("EBADF", Napi::Number::New(env, -EBADF));
    errno_constants.Set("EFAULT", Napi::Number::New(env, -EFAULT));
    errno_constants.Set("ELOOP", Napi::Number::New(env, -ELOOP));
    errno_constants.Set("ENAMETOOLONG", Napi::Number::New(env, -ENAMETOOLONG));
    errno_constants.Set("ENOTSUPP", Napi::Number::New(env, -ENOTSUP));
    errno_constants.Set("EXDEV", Napi::Number::New(env, -EXDEV));
    errno_constants.Set("ENOSYS", Napi::Number::New(env, -ENOSYS));
    
    exports.Set("errno", errno_constants);
    
    // Register file mode constants
    Napi::Object mode_constants = Napi::Object::New(env);
    mode_constants.Set("S_IFMT", Napi::Number::New(env, S_IFMT));
    mode_constants.Set("S_IFREG", Napi::Number::New(env, S_IFREG));
    mode_constants.Set("S_IFDIR", Napi::Number::New(env, S_IFDIR));
    mode_constants.Set("S_IFLNK", Napi::Number::New(env, S_IFLNK));
    mode_constants.Set("S_IFBLK", Napi::Number::New(env, S_IFBLK));
    mode_constants.Set("S_IFCHR", Napi::Number::New(env, S_IFCHR));
    mode_constants.Set("S_IFIFO", Napi::Number::New(env, S_IFIFO));
    mode_constants.Set("S_IFSOCK", Napi::Number::New(env, S_IFSOCK));
    mode_constants.Set("S_ISUID", Napi::Number::New(env, S_ISUID));
    mode_constants.Set("S_ISGID", Napi::Number::New(env, S_ISGID));
    mode_constants.Set("S_ISVTX", Napi::Number::New(env, S_ISVTX));
    mode_constants.Set("S_IRWXU", Napi::Number::New(env, S_IRWXU));
    mode_constants.Set("S_IRUSR", Napi::Number::New(env, S_IRUSR));
    mode_constants.Set("S_IWUSR", Napi::Number::New(env, S_IWUSR));
    mode_constants.Set("S_IXUSR", Napi::Number::New(env, S_IXUSR));
    mode_constants.Set("S_IRWXG", Napi::Number::New(env, S_IRWXG));
    mode_constants.Set("S_IRGRP", Napi::Number::New(env, S_IRGRP));
    mode_constants.Set("S_IWGRP", Napi::Number::New(env, S_IWGRP));
    mode_constants.Set("S_IXGRP", Napi::Number::New(env, S_IXGRP));
    mode_constants.Set("S_IRWXO", Napi::Number::New(env, S_IRWXO));
    mode_constants.Set("S_IROTH", Napi::Number::New(env, S_IROTH));
    mode_constants.Set("S_IWOTH", Napi::Number::New(env, S_IWOTH));
    mode_constants.Set("S_IXOTH", Napi::Number::New(env, S_IXOTH));
    
    exports.Set("mode", mode_constants);
    
    // Register open flags constants
    Napi::Object flag_constants = Napi::Object::New(env);
    flag_constants.Set("O_RDONLY", Napi::Number::New(env, O_RDONLY));
    flag_constants.Set("O_WRONLY", Napi::Number::New(env, O_WRONLY));
    flag_constants.Set("O_RDWR", Napi::Number::New(env, O_RDWR));
    flag_constants.Set("O_CREAT", Napi::Number::New(env, O_CREAT));
    flag_constants.Set("O_EXCL", Napi::Number::New(env, O_EXCL));
    flag_constants.Set("O_TRUNC", Napi::Number::New(env, O_TRUNC));
    flag_constants.Set("O_APPEND", Napi::Number::New(env, O_APPEND));
    flag_constants.Set("O_NONBLOCK", Napi::Number::New(env, O_NONBLOCK));
    flag_constants.Set("O_SYNC", Napi::Number::New(env, O_SYNC));
    flag_constants.Set("O_DIRECT", Napi::Number::New(env, O_DIRECT));
    flag_constants.Set("O_DIRECTORY", Napi::Number::New(env, O_DIRECTORY));
    flag_constants.Set("O_NOFOLLOW", Napi::Number::New(env, O_NOFOLLOW));
    
    exports.Set("flags", flag_constants);
    
    return exports;
}

} // namespace fuse_native

// Register the module with Node.js
NODE_API_MODULE(fuse-native, fuse_native::Init)