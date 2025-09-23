/**
 * @file napi_helpers.cc
 * @brief N-API helper functions implementation for type conversions and error handling
 * 
 * This file implements utility functions for seamless conversion between
 * Node.js N-API types and native C++ types, with focus on BigInt handling,
 * timespec conversion, and errno error propagation.
 */

#include "napi_helpers.h"
#include <cstdarg>
#include <cstring>
#include <chrono>
#include <iostream>

namespace fuse_native {

// Static members
Napi::FunctionReference NapiHelpers::errno_error_constructor_;
bool NapiHelpers::error_handling_initialized_ = false;

/**
 * Initialize error handling
 */
void NapiHelpers::InitializeErrorHandling(Napi::Env env) {
    if (error_handling_initialized_) {
        return;
    }
    
    InitializeErrnoErrorConstructor(env);
    error_handling_initialized_ = true;
}

/**
 * BigInt conversions for 64-bit values
 */
Napi::BigInt NapiHelpers::CreateBigInt64(Napi::Env env, int64_t value) {
    return Napi::BigInt::New(env, value);
}

Napi::BigInt NapiHelpers::CreateBigIntU64(Napi::Env env, uint64_t value) {
    return Napi::BigInt::New(env, value);
}

Napi::BigInt NapiHelpers::CreateBigUint64(Napi::Env env, uint64_t value) {
    return Napi::BigInt::New(env, value);
}

bool NapiHelpers::GetBigInt64(Napi::BigInt bigint, int64_t* result) {
    if (!bigint.IsBigInt()) {
        return false;
    }
    
    bool lossless = false;
    *result = bigint.Int64Value(&lossless);
    return lossless;
}

bool NapiHelpers::GetBigIntU64(Napi::BigInt bigint, uint64_t* result) {
    if (!bigint.IsBigInt()) {
        return false;
    }
    
    bool lossless = false;
    *result = bigint.Uint64Value(&lossless);
    return lossless;
}

uint64_t NapiHelpers::GetBigUint64(Napi::Env env, Napi::Value value) {
    if (!value.IsBigInt()) {
        ThrowTypeError(env, "Expected BigInt");
        return 0;
    }
    
    bool lossless = false;
    uint64_t result = value.As<Napi::BigInt>().Uint64Value(&lossless);
    if (!lossless) {
        ThrowError(env, "BigInt value out of range for uint64_t");
        return 0;
    }
    return result;
}

int32_t NapiHelpers::GetInt32(Napi::Env env, Napi::Value value) {
    if (!value.IsNumber()) {
        ThrowTypeError(env, "Expected number");
        return 0;
    }
    return value.As<Napi::Number>().Int32Value();
}

uint32_t NapiHelpers::GetUint32(Napi::Env env, Napi::Value value) {
    if (!value.IsNumber()) {
        ThrowTypeError(env, "Expected number");
        return 0;
    }
    return value.As<Napi::Number>().Uint32Value();
}

double NapiHelpers::GetDouble(Napi::Env env, Napi::Value value) {
    if (!value.IsNumber()) {
        ThrowTypeError(env, "Expected number");
        return 0.0;
    }
    return value.As<Napi::Number>().DoubleValue();
}

bool NapiHelpers::GetBoolean(Napi::Env env, Napi::Value value) {
    if (!value.IsBoolean()) {
        ThrowTypeError(env, "Expected boolean");
        return false;
    }
    return value.As<Napi::Boolean>().Value();
}



/**
 * Safe BigInt conversions with bounds checking
 */
std::optional<int64_t> NapiHelpers::SafeGetBigInt64(Napi::Value value) {
    if (!value.IsBigInt()) {
        return std::nullopt;
    }
    
    int64_t result;
    if (GetBigInt64(value.As<Napi::BigInt>(), &result)) {
        return result;
    }
    
    return std::nullopt;
}

std::optional<uint64_t> NapiHelpers::SafeGetBigIntU64(Napi::Value value) {
    if (!value.IsBigInt()) {
        return std::nullopt;
    }
    
    uint64_t result;
    if (GetBigIntU64(value.As<Napi::BigInt>(), &result)) {
        return result;
    }
    
    return std::nullopt;
}

/**
 * Timespec conversions (ns-epoch BigInt)
 */
Napi::BigInt NapiHelpers::TimespecToNsBigInt(Napi::Env env, const struct timespec& ts) {
    uint64_t ns = static_cast<uint64_t>(ts.tv_sec) * 1000000000ULL + 
                  static_cast<uint64_t>(ts.tv_nsec);
    return CreateBigIntU64(env, ns);
}

bool NapiHelpers::NsBigIntToTimespec(Napi::BigInt ns_bigint, struct timespec* ts) {
    uint64_t ns;
    if (!GetBigIntU64(ns_bigint, &ns)) {
        return false;
    }
    
    ts->tv_sec = static_cast<time_t>(ns / 1000000000ULL);
    ts->tv_nsec = static_cast<long>(ns % 1000000000ULL);
    return true;
}

Napi::BigInt NapiHelpers::CurrentTimeNs(Napi::Env env) {
    auto now = std::chrono::high_resolution_clock::now();
    auto ns = std::chrono::duration_cast<std::chrono::nanoseconds>(now.time_since_epoch());
    return CreateBigIntU64(env, static_cast<uint64_t>(ns.count()));
}

/**
 * Stat structure conversions
 */
Napi::Object NapiHelpers::StatToObject(Napi::Env env, const struct stat& st) {
    Napi::Object obj = Napi::Object::New(env);
    
    obj.Set("ino", CreateBigIntU64(env, st.st_ino));
    obj.Set("mode", Napi::Number::New(env, st.st_mode));
    obj.Set("nlink", Napi::Number::New(env, st.st_nlink));
    obj.Set("uid", Napi::Number::New(env, st.st_uid));
    obj.Set("gid", Napi::Number::New(env, st.st_gid));
    obj.Set("rdev", CreateBigIntU64(env, st.st_rdev));
    obj.Set("size", CreateBigIntU64(env, st.st_size));
    obj.Set("blksize", Napi::Number::New(env, st.st_blksize));
    obj.Set("blocks", CreateBigIntU64(env, st.st_blocks));
    
    struct timespec atime = {st.st_atime, 0};
    struct timespec mtime = {st.st_mtime, 0};
    struct timespec ctime = {st.st_ctime, 0};
    
    obj.Set("atime", TimespecToNsBigInt(env, atime));
    obj.Set("mtime", TimespecToNsBigInt(env, mtime));
    obj.Set("ctime", TimespecToNsBigInt(env, ctime));
    
    return obj;
}

bool NapiHelpers::ObjectToStat(Napi::Object obj, struct stat* st) {
    if (!obj.IsObject()) {
        return false;
    }
    
    memset(st, 0, sizeof(*st));
    
    // Extract values with error checking
    auto ino_opt = SafeGetBigIntU64(obj.Get("ino"));
    if (ino_opt) st->st_ino = *ino_opt;
    
    if (obj.Has("mode")) {
        Napi::Value mode_val = obj.Get("mode");
        if (mode_val.IsNumber()) {
            st->st_mode = mode_val.As<Napi::Number>().Uint32Value();
        }
    }
    
    if (obj.Has("nlink")) {
        Napi::Value nlink_val = obj.Get("nlink");
        if (nlink_val.IsNumber()) {
            st->st_nlink = nlink_val.As<Napi::Number>().Uint32Value();
        }
    }
    
    // Continue for other fields...
    
    return true;
}

/**
 * Statvfs structure conversions
 */
Napi::Object NapiHelpers::StatvfsToObject(Napi::Env env, const struct statvfs& stvfs) {
    Napi::Object obj = Napi::Object::New(env);
    
    obj.Set("bsize", Napi::Number::New(env, stvfs.f_bsize));
    obj.Set("frsize", Napi::Number::New(env, stvfs.f_frsize));
    obj.Set("blocks", CreateBigIntU64(env, stvfs.f_blocks));
    obj.Set("bfree", CreateBigIntU64(env, stvfs.f_bfree));
    obj.Set("bavail", CreateBigIntU64(env, stvfs.f_bavail));
    obj.Set("files", CreateBigIntU64(env, stvfs.f_files));
    obj.Set("ffree", CreateBigIntU64(env, stvfs.f_ffree));
    obj.Set("favail", CreateBigIntU64(env, stvfs.f_favail));
    obj.Set("fsid", CreateBigIntU64(env, stvfs.f_fsid));
    obj.Set("flag", Napi::Number::New(env, stvfs.f_flag));
    obj.Set("namemax", Napi::Number::New(env, stvfs.f_namemax));
    
    return obj;
}

/**
 * Buffer and ArrayBuffer utilities
 */
Napi::ArrayBuffer NapiHelpers::CreateExternalArrayBuffer(Napi::Env env, void* data, size_t length, 
                                                         void (*finalize_cb)(Napi::Env, void*, void*),
                                                         void* finalize_hint) {
    if (finalize_cb) {
        return Napi::ArrayBuffer::New(env, data, length, finalize_cb, finalize_hint);
    } else {
        return Napi::ArrayBuffer::New(env, data, length);
    }
}

void* NapiHelpers::GetArrayBufferData(Napi::ArrayBuffer buffer) {
    return buffer.Data();
}

size_t NapiHelpers::GetArrayBufferLength(Napi::ArrayBuffer buffer) {
    return buffer.ByteLength();
}

/**
 * String utilities
 */
std::string NapiHelpers::GetString(Napi::Value value) {
    if (!value.IsString()) {
        return "";
    }
    return value.As<Napi::String>().Utf8Value();
}

Napi::String NapiHelpers::CreateString(Napi::Env env, const std::string& str) {
    return Napi::String::New(env, str);
}

Napi::String NapiHelpers::CreateString(Napi::Env env, const char* str, size_t length) {
    return Napi::String::New(env, str, length);
}

/**
 * Type checking utilities
 */
bool NapiHelpers::IsBigInt(Napi::Value value) {
    return value.IsBigInt();
}

bool NapiHelpers::IsArrayBuffer(Napi::Value value) {
    return value.IsArrayBuffer();
}

bool NapiHelpers::IsUint8Array(Napi::Value value) {
    return value.IsTypedArray() && value.As<Napi::TypedArray>().TypedArrayType() == napi_uint8_array;
}

bool NapiHelpers::IsString(Napi::Value value) {
    return value.IsString();
}

bool NapiHelpers::IsFunction(Napi::Value value) {
    return value.IsFunction();
}

bool NapiHelpers::IsObject(Napi::Value value) {
    return value.IsObject();
}

/**
 * Error creation and throwing
 */
void NapiHelpers::ThrowErrnoError(Napi::Env env, int errno_code, const std::string& message) {
    auto error = CreateErrnoError(env, errno_code, message);
    error.ThrowAsJavaScriptException();
}

Napi::Error NapiHelpers::CreateErrnoError(Napi::Env env, int errno_code, const std::string& message) {
    std::string full_message = message.empty() ? 
        ErrnoToMessage(errno_code) : 
        message;
    
    Napi::Error error = Napi::Error::New(env, full_message);
    error.Set("errno", Napi::Number::New(env, errno_code));
    error.Set("code", Napi::String::New(env, ErrnoToString(errno_code)));
    
    return error;
}

void NapiHelpers::ThrowError(Napi::Env env, const std::string& message) {
    Napi::Error::New(env, message).ThrowAsJavaScriptException();
}

void NapiHelpers::ThrowTypeError(Napi::Env env, const std::string& message) {
    Napi::TypeError::New(env, message).ThrowAsJavaScriptException();
}

/**
 * Errno utilities
 */
std::string NapiHelpers::ErrnoToString(int errno_code) {
    switch (-errno_code) {
        case 1: return "EPERM";
        case 2: return "ENOENT";
        case 3: return "ESRCH";
        case 4: return "EINTR";
        case 5: return "EIO";
        case 6: return "ENXIO";
        case 9: return "EBADF";
        case 11: return "EAGAIN";
        case 12: return "ENOMEM";
        case 13: return "EACCES";
        case 14: return "EFAULT";
        case 16: return "EBUSY";
        case 17: return "EEXIST";
        case 18: return "EXDEV";
        case 19: return "ENODEV";
        case 20: return "ENOTDIR";
        case 21: return "EISDIR";
        case 22: return "EINVAL";
        case 23: return "ENFILE";
        case 24: return "EMFILE";
        case 28: return "ENOSPC";
        case 30: return "EROFS";
        case 38: return "ENOSYS";
        case 39: return "ENOTEMPTY";
        default: return "UNKNOWN";
    }
}

std::string NapiHelpers::ErrnoToMessage(int errno_code) {
    switch (-errno_code) {
        case 1: return "Operation not permitted";
        case 2: return "No such file or directory";
        case 5: return "Input/output error";
        case 13: return "Permission denied";
        case 17: return "File exists";
        case 20: return "Not a directory";
        case 21: return "Is a directory";
        case 22: return "Invalid argument";
        case 28: return "No space left on device";
        case 38: return "Function not implemented";
        case 39: return "Directory not empty";
        default: return "Unknown error";
    }
}

int NapiHelpers::GetLastErrno() {
    return errno;
}

void NapiHelpers::ClearErrno() {
    errno = 0;
}

/**
 * Debugging utilities
 */
void NapiHelpers::DebugLog(const std::string& message) {
    if (const char* debug = getenv("DEBUG")) {
        if (strstr(debug, "fuse-native") || strstr(debug, "*")) {
            std::cerr << "[fuse-native] " << message << std::endl;
        }
    }
}

void NapiHelpers::DebugLog(const char* format, ...) {
    if (const char* debug = getenv("DEBUG")) {
        if (strstr(debug, "fuse-native") || strstr(debug, "*")) {
            char buffer[1024];
            va_list args;
            va_start(args, format);
            vsnprintf(buffer, sizeof(buffer), format, args);
            va_end(args);
            
            std::cerr << "[fuse-native] " << buffer << std::endl;
        }
    }
}

std::string NapiHelpers::ValueToString(Napi::Value value) {
    if (value.IsUndefined()) return "undefined";
    if (value.IsNull()) return "null";
    if (value.IsBoolean()) return value.As<Napi::Boolean>().Value() ? "true" : "false";
    if (value.IsNumber()) return std::to_string(value.As<Napi::Number>().DoubleValue());
    if (value.IsString()) return value.As<Napi::String>().Utf8Value();
    if (value.IsBigInt()) return "[BigInt]";
    if (value.IsObject()) return "[Object]";
    if (value.IsFunction()) return "[Function]";
    return "[Unknown]";
}

/**
 * Private helper methods
 */
void NapiHelpers::InitializeErrnoErrorConstructor(Napi::Env env) {
    // Create a basic error constructor for now
    // TODO: Implement proper FuseErrno constructor
}

const char* NapiHelpers::GetErrnoName(int errno_code) {
    return ErrnoToString(errno_code).c_str();
}

} // namespace fuse_native