/**
 * @file statfs_only.cc
 * @brief Minimal N-API module for testing FUSE statfs implementation
 * 
 * This file provides a clean, minimal implementation focused solely on
 * validating the statfs operation with BigInt support for 64-bit fields.
 */

#define FUSE_USE_VERSION 31
#include <napi.h>
#include <sys/statvfs.h>
#include <errno.h>
#include <cstring>

#include "napi_bigint.h"
#include "napi_helpers.h"
#include "errno_mapping.h"
#include "timespec_codec.h"
#include "operations.h"
#include "fuse_bridge.h"

namespace fuse_native {

// Helper functions now use the integrated modules

/**
 * Convert struct statvfs to JavaScript object with BigInt fields
 * Now using integrated NapiHelpers
 */
Napi::Object StatvfsToObject(Napi::Env env, const struct statvfs& stvfs) {
    return NapiHelpers::StatvfsToObject(env, stvfs);
}

/**
 * Convert JavaScript object to struct statvfs
 * Enhanced version using integrated helper modules
 */
bool ObjectToStatvfs(Napi::Env env, Napi::Object obj, struct statvfs* stvfs) {
    if (!stvfs) return false;
    
    memset(stvfs, 0, sizeof(*stvfs));
    
    try {
        // 32-bit fields
        if (obj.Has("bsize")) {
            stvfs->f_bsize = obj.Get("bsize").As<Napi::Number>().Uint32Value();
        }
        if (obj.Has("frsize")) {
            stvfs->f_frsize = obj.Get("frsize").As<Napi::Number>().Uint32Value();
        }
        if (obj.Has("flag")) {
            stvfs->f_flag = obj.Get("flag").As<Napi::Number>().Uint32Value();
        }
        if (obj.Has("namemax")) {
            stvfs->f_namemax = obj.Get("namemax").As<Napi::Number>().Uint32Value();
        }
        
        // 64-bit fields using helper functions
        if (obj.Has("blocks")) {
            auto val = NapiHelpers::SafeGetBigIntU64(obj.Get("blocks"));
            if (val) stvfs->f_blocks = *val;
        }
        
        if (obj.Has("bfree")) {
            auto val = NapiHelpers::SafeGetBigIntU64(obj.Get("bfree"));
            if (val) stvfs->f_bfree = *val;
        }
        
        if (obj.Has("bavail")) {
            auto val = NapiHelpers::SafeGetBigIntU64(obj.Get("bavail"));
            if (val) stvfs->f_bavail = *val;
        }
        
        if (obj.Has("files")) {
            auto val = NapiHelpers::SafeGetBigIntU64(obj.Get("files"));
            if (val) stvfs->f_files = *val;
        }
        
        if (obj.Has("ffree")) {
            auto val = NapiHelpers::SafeGetBigIntU64(obj.Get("ffree"));
            if (val) stvfs->f_ffree = *val;
        }
        
        if (obj.Has("favail")) {
            auto val = NapiHelpers::SafeGetBigIntU64(obj.Get("favail"));
            if (val) stvfs->f_favail = *val;
        }
        
        if (obj.Has("fsid")) {
            auto val = NapiHelpers::SafeGetBigIntU64(obj.Get("fsid"));
            if (val) stvfs->f_fsid = *val;
        }
        
        return true;
    } catch (...) {
        return false;
    }
}

/**
 * Test function: Create a sample statvfs and convert to JS object
 */
Napi::Value TestStatvfsToObject(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Create test statvfs with large values to test BigInt
    struct statvfs test_stvfs;
    memset(&test_stvfs, 0, sizeof(test_stvfs));
    
    test_stvfs.f_bsize = 4096;
    test_stvfs.f_frsize = 4096;
    test_stvfs.f_blocks = UINT64_C(18446744073709551615);  // Near max uint64
    test_stvfs.f_bfree = UINT64_C(9223372036854775807);    // Max int64
    test_stvfs.f_bavail = UINT64_C(1234567890123456789);   // Test value from AGENTS.md
    test_stvfs.f_files = UINT64_C(1000000000000);          // 1 trillion files
    test_stvfs.f_ffree = UINT64_C(500000000000);           // 500 billion free
    test_stvfs.f_favail = UINT64_C(400000000000);          // 400 billion available
    test_stvfs.f_fsid = UINT64_C(0xDEADBEEFCAFEBABE);      // Test filesystem ID
    test_stvfs.f_flag = 0;
    test_stvfs.f_namemax = 255;
    
    return StatvfsToObject(env, test_stvfs);
}

/**
 * Test function: Convert JS object to statvfs and back
 */
Napi::Value TestStatvfsRoundtrip(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected an object").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::Object input = info[0].As<Napi::Object>();
    
    // Convert JS object to statvfs
    struct statvfs stvfs;
    if (!ObjectToStatvfs(env, input, &stvfs)) {
        Napi::Error::New(env, "Failed to convert object to statvfs").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    // Convert back to JS object
    return StatvfsToObject(env, stvfs);
}

/**
 * Test function: Validate BigInt precision using helper modules
 */
Napi::Value TestBigIntPrecision(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        Napi::TypeError::New(env, "Expected a BigInt").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::BigInt input = info[0].As<Napi::BigInt>();
    
    // Convert to uint64_t and back using helper functions
    uint64_t cpp_value;
    bool lossless = NapiHelpers::GetBigIntU64(input, &cpp_value);
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("lossless", Napi::Boolean::New(env, lossless));
    result.Set("value", NapiHelpers::CreateBigIntU64(env, cpp_value));
    
    return result;
}

/**
 * Test function: Create realistic filesystem stats
 */
Napi::Value TestRealisticFilesystem(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Simulate a 1TB filesystem with 4K blocks
    const uint64_t block_size = 4096;
    const uint64_t total_bytes = UINT64_C(1024) * 1024 * 1024 * 1024; // 1TB
    const uint64_t total_blocks = total_bytes / block_size;
    const uint64_t free_blocks = (total_blocks * 30 + 50) / 100;  // 30% free (rounded)
    const uint64_t avail_blocks = (total_blocks * 25 + 50) / 100; // 25% available (rounded)
    
    struct statvfs realistic_fs;
    memset(&realistic_fs, 0, sizeof(realistic_fs));
    
    realistic_fs.f_bsize = block_size;
    realistic_fs.f_frsize = block_size;
    realistic_fs.f_blocks = total_blocks;
    realistic_fs.f_bfree = free_blocks;
    realistic_fs.f_bavail = avail_blocks;
    realistic_fs.f_files = 10000000;    // 10M inodes
    realistic_fs.f_ffree = 5000000;     // 5M free
    realistic_fs.f_favail = 4000000;    // 4M available
    realistic_fs.f_fsid = 0x12345678;
    realistic_fs.f_flag = 0;
    realistic_fs.f_namemax = 255;
    
    return StatvfsToObject(env, realistic_fs);
}

/**
 * Get version information
 */
Napi::Value GetVersion(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object version = Napi::Object::New(env);
    version.Set("fuse", Napi::String::New(env, "3.17.1"));
    version.Set("binding", Napi::String::New(env, "1.0.0-statfs-test"));
    version.Set("napi", Napi::String::New(env, "8"));
    
    return version;
}

/**
 * Test function: Validate errno mapping
 */
Napi::Value TestErrnoMapping(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected a number").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    int errno_code = info[0].As<Napi::Number>().Int32Value();
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("errno", Napi::Number::New(env, errno_code));
    result.Set("name", Napi::String::New(env, errno_to_string(errno_code)));
    result.Set("message", Napi::String::New(env, errno_to_message(errno_code)));
    result.Set("isValid", Napi::Boolean::New(env, is_valid_errno(errno_code)));
    result.Set("isTemporary", Napi::Boolean::New(env, is_temporary_error(errno_code)));
    result.Set("isPermission", Napi::Boolean::New(env, is_permission_error(errno_code)));
    result.Set("isNotFound", Napi::Boolean::New(env, is_not_found_error(errno_code)));
    result.Set("isFilesystem", Napi::Boolean::New(env, is_filesystem_error(errno_code)));
    
    return result;
}

/**
 * Test function: Validate timespec ns-epoch BigInt conversion
 */
Napi::Value TestTimespecConversion(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        Napi::TypeError::New(env, "Expected a BigInt (nanoseconds since epoch)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::BigInt input = info[0].As<Napi::BigInt>();
    
    // Convert BigInt to timespec
    struct timespec ts;
    napi_value input_napi = input;
    if (!ns_bigint_to_timespec(env, input_napi, &ts)) {
        Napi::Error::New(env, "Failed to convert BigInt to timespec").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    // Convert back to BigInt
    napi_value result_bigint = timespec_to_ns_bigint(env, ts);
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("original", input);
    result.Set("converted", Napi::BigInt(env, result_bigint));
    result.Set("seconds", Napi::Number::New(env, ts.tv_sec));
    result.Set("nanoseconds", Napi::Number::New(env, ts.tv_nsec));
    result.Set("isValid", Napi::Boolean::New(env, is_valid_timespec(ts)));
    result.Set("asString", Napi::String::New(env, timespec_to_string(ts)));
    
    return result;
}

/**
 * Test function: Current time as ns BigInt
 */
Napi::Value TestCurrentTimeNs(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Get current time as BigInt
    napi_value current_ns = get_current_ns_bigint(env);
    
    // Also get current time as timespec for comparison
    struct timespec current_ts;
    get_current_timespec(&current_ts);
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("currentNs", Napi::BigInt(env, current_ns));
    result.Set("currentSeconds", Napi::Number::New(env, current_ts.tv_sec));
    result.Set("currentNanoseconds", Napi::Number::New(env, current_ts.tv_nsec));
    result.Set("asString", Napi::String::New(env, timespec_to_string(current_ts)));
    
    return result;
}

/**
 * Test function: Timespec operations
 */
Napi::Value TestTimespecOperations(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Create test timespec
    struct timespec ts1 = make_timespec(1234567890, 123456789);
    struct timespec ts2 = make_timespec(1234567891, 234567890);
    
    // Test comparison
    int cmp = timespec_compare(ts1, ts2);
    
    // Test difference
    int64_t diff_ns = timespec_diff_ns(ts2, ts1);
    
    // Test addition
    struct timespec ts3 = ts1;
    timespec_add_ns(&ts3, 1000000000); // Add 1 second
    
    Napi::Object result = Napi::Object::New(env);
    
    // Original timestamps
    result.Set("ts1", Napi::String::New(env, timespec_to_string(ts1)));
    result.Set("ts2", Napi::String::New(env, timespec_to_string(ts2)));
    result.Set("ts3", Napi::String::New(env, timespec_to_string(ts3)));
    
    // Comparison result
    result.Set("comparison", Napi::Number::New(env, cmp));
    result.Set("differenceNs", NapiHelpers::CreateBigInt64(env, diff_ns));
    
    // Validation
    result.Set("ts1Valid", Napi::Boolean::New(env, is_valid_timespec(ts1)));
    result.Set("ts2Valid", Napi::Boolean::New(env, is_valid_timespec(ts2)));
    result.Set("ts3Valid", Napi::Boolean::New(env, is_valid_timespec(ts3)));
    
    return result;
}

/**
 * Test function: String to timespec parsing
 */
Napi::Value TestTimespecParsing(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected a string").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    std::string time_str = info[0].As<Napi::String>().Utf8Value();
    
    struct timespec ts;
    bool success = string_to_timespec(time_str, &ts);
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("input", Napi::String::New(env, time_str));
    result.Set("success", Napi::Boolean::New(env, success));
    
    if (success) {
        result.Set("seconds", Napi::Number::New(env, ts.tv_sec));
        result.Set("nanoseconds", Napi::Number::New(env, ts.tv_nsec));
        result.Set("asString", Napi::String::New(env, timespec_to_string(ts)));
        result.Set("asNsBigInt", Napi::BigInt(env, timespec_to_ns_bigint(env, ts)));
        result.Set("isValid", Napi::Boolean::New(env, is_valid_timespec(ts)));
    }
    
    return result;
}

/**
 * Test function: FUSE Bridge FuseOpType conversion
 */
Napi::Value TestFuseOpTypeConversion(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object result = Napi::Object::New(env);
    
    // Test string to FuseOpType conversion
    FuseOpType lookup_op = StringToFuseOpType("lookup");
    FuseOpType getattr_op = StringToFuseOpType("getattr");
    FuseOpType read_op = StringToFuseOpType("read");
    FuseOpType write_op = StringToFuseOpType("write");
    FuseOpType readdir_op = StringToFuseOpType("readdir");
    FuseOpType statfs_op = StringToFuseOpType("statfs");
    FuseOpType invalid_op = StringToFuseOpType("invalid_operation");
    
    result.Set("lookupOp", Napi::Number::New(env, static_cast<int>(lookup_op)));
    result.Set("getattrOp", Napi::Number::New(env, static_cast<int>(getattr_op)));
    result.Set("readOp", Napi::Number::New(env, static_cast<int>(read_op)));
    result.Set("writeOp", Napi::Number::New(env, static_cast<int>(write_op)));
    result.Set("readdirOp", Napi::Number::New(env, static_cast<int>(readdir_op)));
    result.Set("statfsOp", Napi::Number::New(env, static_cast<int>(statfs_op)));
    result.Set("invalidOp", Napi::Number::New(env, static_cast<int>(invalid_op)));
    
    // Test FuseOpType to string conversion
    result.Set("lookupName", Napi::String::New(env, FuseOpTypeToString(lookup_op)));
    result.Set("getattrName", Napi::String::New(env, FuseOpTypeToString(getattr_op)));
    result.Set("readName", Napi::String::New(env, FuseOpTypeToString(read_op)));
    result.Set("writeName", Napi::String::New(env, FuseOpTypeToString(write_op)));
    result.Set("readdirName", Napi::String::New(env, FuseOpTypeToString(readdir_op)));
    result.Set("statfsName", Napi::String::New(env, FuseOpTypeToString(statfs_op)));
    
    return result;
}

/**
 * Test function: FUSE Request Context creation
 */
Napi::Value TestFuseRequestContext(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object result = Napi::Object::New(env);
    
    // Create a test context (without actual FUSE request)
    FuseRequestContext context(FuseOpType::LOOKUP, nullptr);
    context.ino = 42;
    context.path = "test/path.txt";
    context.offset = 1024;
    context.size = 4096;
    context.flags = 2; // O_RDWR
    context.mode = 33188; // Regular file, 644 permissions
    context.uid = 1000;
    context.gid = 1000;
    
    result.Set("opType", Napi::Number::New(env, static_cast<int>(context.op_type)));
    result.Set("opName", Napi::String::New(env, FuseOpTypeToString(context.op_type)));
    result.Set("ino", Napi::String::New(env, std::to_string(context.ino)));
    result.Set("path", Napi::String::New(env, context.path));
    result.Set("offset", Napi::String::New(env, std::to_string(context.offset)));
    result.Set("size", Napi::Number::New(env, context.size));
    result.Set("flags", Napi::Number::New(env, context.flags));
    result.Set("mode", Napi::Number::New(env, context.mode));
    result.Set("uid", Napi::Number::New(env, context.uid));
    result.Set("gid", Napi::Number::New(env, context.gid));
    result.Set("hasBuffer", Napi::Boolean::New(env, context.buffer != nullptr));
    result.Set("bufferOwned", Napi::Boolean::New(env, context.buffer_owned));
    
    return result;
}

/**
 * Test function: FUSE Response creation and manipulation
 */
Napi::Value TestFuseResponse(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object result = Napi::Object::New(env);
    
    // Test default FuseResponse
    FuseResponse response;
    result.Set("defaultErrno", Napi::Number::New(env, response.errno_result));
    result.Set("defaultHasAttr", Napi::Boolean::New(env, response.has_attr));
    result.Set("defaultHasData", Napi::Boolean::New(env, response.has_data));
    result.Set("defaultHasBuffer", Napi::Boolean::New(env, response.has_buffer));
    
    // Test SetError
    FuseResponse errorResponse;
    errorResponse.SetError(2); // ENOENT
    result.Set("errorErrno", Napi::Number::New(env, errorResponse.errno_result));
    result.Set("errorHasAttr", Napi::Boolean::New(env, errorResponse.has_attr));
    result.Set("errorHasData", Napi::Boolean::New(env, errorResponse.has_data));
    
    // Test SetData
    FuseResponse dataResponse;
    dataResponse.SetData("Hello, FUSE!");
    result.Set("dataErrno", Napi::Number::New(env, dataResponse.errno_result));
    result.Set("dataHasData", Napi::Boolean::New(env, dataResponse.has_data));
    result.Set("dataContent", Napi::String::New(env, dataResponse.data));
    result.Set("dataSize", Napi::Number::New(env, dataResponse.data.size()));
    
    // Test SetAttr
    FuseResponse attrResponse;
    struct stat testStat;
    memset(&testStat, 0, sizeof(testStat));
    testStat.st_ino = 42;
    testStat.st_mode = 33188; // Regular file, 644 permissions
    testStat.st_nlink = 1;
    testStat.st_uid = 1000;
    testStat.st_gid = 1000;
    testStat.st_size = 1024;
    testStat.st_blksize = 4096;
    testStat.st_blocks = 8;
    
    attrResponse.SetAttr(testStat, 5.0);
    result.Set("attrErrno", Napi::Number::New(env, attrResponse.errno_result));
    result.Set("attrHasAttr", Napi::Boolean::New(env, attrResponse.has_attr));
    result.Set("attrTimeout", Napi::Number::New(env, attrResponse.attr_timeout));
    result.Set("attrIno", Napi::String::New(env, std::to_string(attrResponse.attr.st_ino)));
    result.Set("attrMode", Napi::Number::New(env, attrResponse.attr.st_mode));
    result.Set("attrSize", Napi::String::New(env, std::to_string(attrResponse.attr.st_size)));
    
    return result;
}

/**
 * Module initialization
 */
Napi::Value TestOperationsBasic(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object result = Napi::Object::New(env);
    
    // Test 1: Check handler existence for non-existent operation
    bool hasReaddir = HasOperationHandler("readdir");
    result.Set("hasReaddirInitially", Napi::Boolean::New(env, hasReaddir));
    
    // Test 2: Check handler existence for various operations
    result.Set("hasLookup", Napi::Boolean::New(env, HasOperationHandler("lookup")));
    result.Set("hasGetattr", Napi::Boolean::New(env, HasOperationHandler("getattr")));
    result.Set("hasRead", Napi::Boolean::New(env, HasOperationHandler("read")));
    result.Set("hasWrite", Napi::Boolean::New(env, HasOperationHandler("write")));
    
    return result;
}

/**
 * Test function: Operations validation
 */
Napi::Value TestOperationValidation(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object result = Napi::Object::New(env);
    
    // Test argument validation for different operations
    std::vector<napi_value> lookup_args;
    napi_value parent_ino, name;
    napi_create_bigint_uint64(env, 1, &parent_ino);
    napi_create_string_utf8(env, "test.txt", NAPI_AUTO_LENGTH, &name);
    lookup_args.push_back(parent_ino);
    lookup_args.push_back(name);
    
    bool lookup_valid = ValidateOperationArgs("lookup", lookup_args, env);
    result.Set("lookupValidation", Napi::Boolean::New(env, lookup_valid));
    
    // Test getattr validation (needs inode)
    std::vector<napi_value> getattr_args;
    napi_value ino;
    napi_create_bigint_uint64(env, 42, &ino);
    getattr_args.push_back(ino);
    
    bool getattr_valid = ValidateOperationArgs("getattr", getattr_args, env);
    result.Set("getattrValidation", Napi::Boolean::New(env, getattr_valid));
    
    // Test read validation (needs ino, offset, size)
    std::vector<napi_value> read_args;
    napi_value offset, size;
    napi_create_bigint_uint64(env, 0, &offset);
    napi_create_uint32(env, 4096, &size);
    read_args.push_back(ino);
    read_args.push_back(offset);
    read_args.push_back(size);
    
    bool read_valid = ValidateOperationArgs("read", read_args, env);
    result.Set("readValidation", Napi::Boolean::New(env, read_valid));
    
    // Test unknown operation (should default to valid)
    std::vector<napi_value> unknown_args;
    bool unknown_valid = ValidateOperationArgs("unknown_operation", unknown_args, env);
    result.Set("unknownValidation", Napi::Boolean::New(env, unknown_valid));
    
    return result;
}

/**
 * Module initialization
 */
napi_value Init(napi_env env, napi_value exports) {
    Napi::Env napiEnv(env);
    Napi::Object napiExports = Napi::Object(napiEnv, exports);
    
    // Initialize helper modules
    NapiHelpers::InitializeErrorHandling(napiEnv);
    
    // Export test functions
    napiExports.Set("testStatvfsToObject", Napi::Function::New(napiEnv, TestStatvfsToObject));
    napiExports.Set("testStatvfsRoundtrip", Napi::Function::New(napiEnv, TestStatvfsRoundtrip));
    napiExports.Set("testBigIntPrecision", Napi::Function::New(napiEnv, TestBigIntPrecision));
    napiExports.Set("testRealisticFilesystem", Napi::Function::New(napiEnv, TestRealisticFilesystem));
    napiExports.Set("testErrnoMapping", Napi::Function::New(napiEnv, TestErrnoMapping));
    napiExports.Set("testTimespecConversion", Napi::Function::New(napiEnv, TestTimespecConversion));
    napiExports.Set("testCurrentTimeNs", Napi::Function::New(napiEnv, TestCurrentTimeNs));
    napiExports.Set("testTimespecOperations", Napi::Function::New(napiEnv, TestTimespecOperations));
    napiExports.Set("testTimespecParsing", Napi::Function::New(napiEnv, TestTimespecParsing));
    napiExports.Set("getVersion", Napi::Function::New(napiEnv, GetVersion));
    
    // Export operations test functions
    napiExports.Set("testOperationsBasic", Napi::Function::New(napiEnv, TestOperationsBasic));
    napiExports.Set("testOperationValidation", Napi::Function::New(napiEnv, TestOperationValidation));
    
    // Export fuse bridge test functions
    napiExports.Set("testFuseOpTypeConversion", Napi::Function::New(napiEnv, TestFuseOpTypeConversion));
    napiExports.Set("testFuseRequestContext", Napi::Function::New(napiEnv, TestFuseRequestContext));
    napiExports.Set("testFuseResponse", Napi::Function::New(napiEnv, TestFuseResponse));
    
    // Export operations functions
    napiExports.Set("setOperationHandler", Napi::Function::New(napiEnv, SetOperationHandler));
    napiExports.Set("removeOperationHandler", Napi::Function::New(napiEnv, RemoveOperationHandler));
    
    // Export errno constants using errno_mapping
    Napi::Object errno_constants = Napi::Object::New(napiEnv);
    errno_constants.Set("ENOENT", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOENT)));
    errno_constants.Set("EACCES", Napi::Number::New(napiEnv, normalize_fuse_errno(EACCES)));
    errno_constants.Set("EIO", Napi::Number::New(napiEnv, normalize_fuse_errno(EIO)));
    errno_constants.Set("ENOSYS", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOSYS)));
    errno_constants.Set("EINVAL", Napi::Number::New(napiEnv, normalize_fuse_errno(EINVAL)));
    errno_constants.Set("ERANGE", Napi::Number::New(napiEnv, normalize_fuse_errno(ERANGE)));
    errno_constants.Set("EPERM", Napi::Number::New(napiEnv, normalize_fuse_errno(EPERM)));
    errno_constants.Set("EEXIST", Napi::Number::New(napiEnv, normalize_fuse_errno(EEXIST)));
    errno_constants.Set("EISDIR", Napi::Number::New(napiEnv, normalize_fuse_errno(EISDIR)));
    errno_constants.Set("ENOTDIR", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOTDIR)));
    errno_constants.Set("ENOTEMPTY", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOTEMPTY)));
    errno_constants.Set("EROFS", Napi::Number::New(napiEnv, normalize_fuse_errno(EROFS)));
    errno_constants.Set("ENOSPC", Napi::Number::New(napiEnv, normalize_fuse_errno(ENOSPC)));
    
    napiExports.Set("errno", errno_constants);
    
    return exports;
}

} // namespace fuse_native

// Register the module with Node.js
NAPI_MODULE(NODE_GYP_MODULE_NAME, fuse_native::Init)