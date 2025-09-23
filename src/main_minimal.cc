/**
 * @file main_minimal.cc
 * @brief Minimal N-API module entry point for FUSE3 statfs testing
 * 
 * This file serves as a minimal entry point for testing the statfs implementation,
 * without the complex session management that's causing build issues.
 */

#define FUSE_USE_VERSION 31
#include <napi.h>
#include <fuse3/fuse.h>
#include <fuse3/fuse_lowlevel.h>
#include <sys/statvfs.h>
#include <errno.h>

#include "napi_helpers.h"
#include "napi_bigint.h"
#include "errno_mapping.h"

namespace fuse_native {

/**
 * Test function to validate StatvfsToObject conversion
 */
Napi::Value TestStatvfsConversion(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Create a test statvfs structure with known values
    struct statvfs test_stvfs;
    memset(&test_stvfs, 0, sizeof(test_stvfs));
    
    test_stvfs.f_bsize = 4096;
    test_stvfs.f_frsize = 4096;
    test_stvfs.f_blocks = 1000000;
    test_stvfs.f_bfree = 300000;
    test_stvfs.f_bavail = 250000;
    test_stvfs.f_files = 100000;
    test_stvfs.f_ffree = 50000;
    test_stvfs.f_favail = 40000;
    test_stvfs.f_fsid = 0xdeadbeef;
    test_stvfs.f_flag = 0;
    test_stvfs.f_namemax = 255;
    
    // Convert to JavaScript object
    return NapiHelpers::StatvfsToObject(env, test_stvfs);
}

/**
 * Test function to validate BigInt conversion with large values
 */
Napi::Value TestBigIntRoundtrip(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        Napi::TypeError::New(env, "Expected a BigInt argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    // Get BigInt from JavaScript
    Napi::BigInt js_bigint = info[0].As<Napi::BigInt>();
    bool lossless;
    uint64_t cpp_value;
    lossless = NapiHelpers::GetBigIntU64(js_bigint, &cpp_value);
    
    if (!lossless) {
        Napi::Error::New(env, "BigInt conversion was not lossless").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    // Convert back to BigInt
    Napi::BigInt result = NapiHelpers::CreateBigIntU64(env, cpp_value);
    
    return result;
}

/**
 * Test function to validate error handling
 */
Napi::Value TestErrorHandling(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected a string error code").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    std::string error_code = info[0].As<Napi::String>().Utf8Value();
    int errno_val = string_to_errno(error_code);
    
    return Napi::Number::New(env, errno_val);
}

/**
 * Get version information
 */
Napi::Value GetVersion(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object version = Napi::Object::New(env);
    version.Set("fuse", Napi::String::New(env, "3.17.1"));
    version.Set("binding", Napi::String::New(env, "1.0.0-alpha"));
    version.Set("napi", Napi::String::New(env, "8"));
    
    return version;
}

/**
 * Module initialization
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Initialize error handling
    NapiHelpers::InitializeErrorHandling(env);
    
    // Export test functions for statfs validation
    exports.Set("testStatvfsConversion", Napi::Function::New(env, TestStatvfsConversion));
    exports.Set("testBigIntRoundtrip", Napi::Function::New(env, TestBigIntRoundtrip));
    exports.Set("testErrorHandling", Napi::Function::New(env, TestErrorHandling));
    exports.Set("getVersion", Napi::Function::New(env, GetVersion));
    
    // Export errno constants for testing
    Napi::Object errno_constants = Napi::Object::New(env);
    
    // Common FUSE errno values
    errno_constants.Set("ENOENT", Napi::Number::New(env, -ENOENT));
    errno_constants.Set("EACCES", Napi::Number::New(env, -EACCES));
    errno_constants.Set("EIO", Napi::Number::New(env, -EIO));
    errno_constants.Set("ENOTSUP", Napi::Number::New(env, -ENOTSUP));
    errno_constants.Set("ENOSYS", Napi::Number::New(env, -ENOSYS));
    errno_constants.Set("EINVAL", Napi::Number::New(env, -EINVAL));
    errno_constants.Set("ERANGE", Napi::Number::New(env, -ERANGE));
    errno_constants.Set("EPERM", Napi::Number::New(env, -EPERM));
    errno_constants.Set("EISDIR", Napi::Number::New(env, -EISDIR));
    errno_constants.Set("ENOTDIR", Napi::Number::New(env, -ENOTDIR));
    errno_constants.Set("EEXIST", Napi::Number::New(env, -EEXIST));
    errno_constants.Set("EMFILE", Napi::Number::New(env, -EMFILE));
    errno_constants.Set("ENFILE", Napi::Number::New(env, -ENFILE));
    errno_constants.Set("ENODEV", Napi::Number::New(env, -ENODEV));
    errno_constants.Set("EROFS", Napi::Number::New(env, -EROFS));
    errno_constants.Set("ENOSPC", Napi::Number::New(env, -ENOSPC));
    errno_constants.Set("EFBIG", Napi::Number::New(env, -EFBIG));
    errno_constants.Set("ENOTEMPTY", Napi::Number::New(env, -ENOTEMPTY));
    errno_constants.Set("EMLINK", Napi::Number::New(env, -EMLINK));
    errno_constants.Set("EFAULT", Napi::Number::New(env, -EFAULT));
    errno_constants.Set("ELOOP", Napi::Number::New(env, -ELOOP));
    errno_constants.Set("ENAMETOOLONG", Napi::Number::New(env, -ENAMETOOLONG));
    errno_constants.Set("EXDEV", Napi::Number::New(env, -EXDEV));
    
    exports.Set("errno", errno_constants);
    
    return exports;
}

} // namespace fuse_native

// Register the module with Node.js
NODE_API_MODULE(fuse_native, fuse_native::Init)