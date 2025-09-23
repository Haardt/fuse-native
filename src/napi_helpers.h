/**
 * @file napi_helpers.h
 * @brief N-API helper functions for type conversions and error handling
 * 
 * This header provides utility functions for seamless conversion between
 * Node.js N-API types and native C++ types, with focus on BigInt handling,
 * timespec conversion, and errno error propagation.
 */

#ifndef NAPI_HELPERS_H
#define NAPI_HELPERS_H

#include <napi.h>
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <sys/types.h>
#include <errno.h>
#include <string>
#include <vector>
#include <optional>

namespace fuse_native {

/**
 * NAPI Helpers class
 * Provides static utility functions for N-API type conversions
 */
class NapiHelpers {
public:
    // Error handling initialization
    static void InitializeErrorHandling(Napi::Env env);
    
    // BigInt conversions for 64-bit values
    static Napi::BigInt CreateBigInt64(Napi::Env env, int64_t value);
    static Napi::BigInt CreateBigIntU64(Napi::Env env, uint64_t value);
    static Napi::BigInt CreateBigUint64(Napi::Env env, uint64_t value);
    static bool GetBigInt64(Napi::BigInt bigint, int64_t* result);
    static bool GetBigIntU64(Napi::BigInt bigint, uint64_t* result);
    static uint64_t GetBigUint64(Napi::Env env, Napi::Value value);
    
    // Basic type conversions
    static int32_t GetInt32(Napi::Env env, Napi::Value value);
    static uint32_t GetUint32(Napi::Env env, Napi::Value value);
    static double GetDouble(Napi::Env env, Napi::Value value);
    static bool GetBoolean(Napi::Env env, Napi::Value value);
    
    // Safe BigInt conversions with bounds checking
    static std::optional<int64_t> SafeGetBigInt64(Napi::Value value);
    static std::optional<uint64_t> SafeGetBigIntU64(Napi::Value value);
    
    // Timespec conversions (ns-epoch BigInt)
    static Napi::BigInt TimespecToNsBigInt(Napi::Env env, const struct timespec& ts);
    static bool NsBigIntToTimespec(Napi::BigInt ns_bigint, struct timespec* ts);
    static Napi::BigInt CurrentTimeNs(Napi::Env env);
    
    // Stat structure conversions
    static Napi::Object StatToObject(Napi::Env env, const struct stat& st);
    static bool ObjectToStat(Napi::Object obj, struct stat* st);
    
    // Statvfs structure conversions
    static Napi::Object StatvfsToObject(Napi::Env env, const struct statvfs& stvfs);
    
    // File info conversions
    static Napi::Object FileInfoToObject(Napi::Env env, const struct fuse_file_info& fi);
    static bool ObjectToFileInfo(Napi::Object obj, struct fuse_file_info* fi);
    
    // Buffer and ArrayBuffer utilities
    static Napi::ArrayBuffer CreateExternalArrayBuffer(Napi::Env env, void* data, size_t length, 
                                                       void (*finalize_cb)(Napi::Env, void*, void*) = nullptr,
                                                       void* finalize_hint = nullptr);
    static void* GetArrayBufferData(Napi::ArrayBuffer buffer);
    static size_t GetArrayBufferLength(Napi::ArrayBuffer buffer);
    
    // String utilities
    static std::string GetString(Napi::Value value);
    static Napi::String CreateString(Napi::Env env, const std::string& str);
    static Napi::String CreateString(Napi::Env env, const char* str, size_t length);
    
    // Type checking utilities
    static bool IsBigInt(Napi::Value value);
    static bool IsArrayBuffer(Napi::Value value);
    static bool IsUint8Array(Napi::Value value);
    static bool IsString(Napi::Value value);
    static bool IsFunction(Napi::Value value);
    static bool IsObject(Napi::Value value);
    
    // Object property utilities
    static bool HasProperty(Napi::Object obj, const std::string& key);
    static Napi::Value GetProperty(Napi::Object obj, const std::string& key);
    static void SetProperty(Napi::Object obj, const std::string& key, Napi::Value value);
    
    // Array utilities
    static Napi::Array CreateArray(Napi::Env env, size_t length = 0);
    static void SetArrayElement(Napi::Array array, uint32_t index, Napi::Value value);
    static Napi::Value GetArrayElement(Napi::Array array, uint32_t index);
    static uint32_t GetArrayLength(Napi::Array array);
    
    // Error creation and throwing
    static void ThrowErrnoError(Napi::Env env, int errno_code, const std::string& message = "");
    static Napi::Error CreateErrnoError(Napi::Env env, int errno_code, const std::string& message = "");
    static void ThrowError(Napi::Env env, const std::string& message);
    static void ThrowTypeError(Napi::Env env, const std::string& message);
    
    // Errno utilities
    static std::string ErrnoToString(int errno_code);
    static std::string ErrnoToMessage(int errno_code);
    static int GetLastErrno();
    static void ClearErrno();
    
    // AbortSignal utilities
    static bool IsAborted(Napi::Value abort_signal);
    static void CheckAborted(Napi::Env env, Napi::Value abort_signal);
    
    // Promise utilities
    static Napi::Promise CreateRejectedPromise(Napi::Env env, Napi::Error error);
    static Napi::Promise CreateResolvedPromise(Napi::Env env, Napi::Value value);
    
    // Validation helpers
    static void ValidateArgumentCount(const Napi::CallbackInfo& info, size_t expected);
    static void ValidateArgumentType(const Napi::CallbackInfo& info, size_t index, 
                                   napi_valuetype expected_type, const std::string& arg_name);
    static void ValidateString(const Napi::CallbackInfo& info, size_t index, const std::string& arg_name);
    static void ValidateBigInt(const Napi::CallbackInfo& info, size_t index, const std::string& arg_name);
    static void ValidateFunction(const Napi::CallbackInfo& info, size_t index, const std::string& arg_name);
    static void ValidateObject(const Napi::CallbackInfo& info, size_t index, const std::string& arg_name);
    
    // Path utilities
    static std::string NormalizePath(const std::string& path);
    static bool IsAbsolutePath(const std::string& path);
    static std::string JoinPaths(const std::string& base, const std::string& relative);
    
    // Memory utilities
    static void* AlignedAlloc(size_t alignment, size_t size);
    static void AlignedFree(void* ptr);
    static bool IsValidPointer(const void* ptr);
    
    // Debugging utilities
    static void DebugLog(const std::string& message);
    static void DebugLog(const char* format, ...);
    static std::string ValueToString(Napi::Value value);
    
private:
    static Napi::FunctionReference errno_error_constructor_;
    static bool error_handling_initialized_;
    
    // Private helper methods
    static void InitializeErrnoErrorConstructor(Napi::Env env);
    static const char* GetErrnoName(int errno_code);
};

/**
 * RAII wrapper for N-API handles
 */
template<typename T>
class NapiHandleWrapper {
public:
    explicit NapiHandleWrapper(T handle) : handle_(std::move(handle)), valid_(true) {}
    ~NapiHandleWrapper() = default;
    
    NapiHandleWrapper(const NapiHandleWrapper&) = delete;
    NapiHandleWrapper& operator=(const NapiHandleWrapper&) = delete;
    
    NapiHandleWrapper(NapiHandleWrapper&& other) noexcept 
        : handle_(std::move(other.handle_)), valid_(other.valid_) {
        other.valid_ = false;
    }
    
    NapiHandleWrapper& operator=(NapiHandleWrapper&& other) noexcept {
        if (this != &other) {
            handle_ = std::move(other.handle_);
            valid_ = other.valid_;
            other.valid_ = false;
        }
        return *this;
    }
    
    T& Get() { return handle_; }
    const T& Get() const { return handle_; }
    bool IsValid() const { return valid_; }
    
    T Release() {
        valid_ = false;
        return std::move(handle_);
    }

private:
    T handle_;
    bool valid_;
};

/**
 * Scoped N-API exception handler
 */
class ScopedNapiExceptionHandler {
public:
    explicit ScopedNapiExceptionHandler(Napi::Env env);
    ~ScopedNapiExceptionHandler();
    
    bool HasPendingException() const;
    Napi::Error GetPendingException() const;
    void ClearPendingException();

private:
    Napi::Env env_;
    bool had_pending_exception_;
};

} // namespace fuse_native

#endif // NAPI_HELPERS_H