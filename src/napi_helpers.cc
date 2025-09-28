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
#include <cmath>

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

namespace {

template <typename Getter>
void AssignTimespecField(Napi::Value value, struct stat* st, Getter setter) {
    if (!value.IsBigInt() || !st) {
        return;
    }

    struct timespec ts {0, 0};
    if (!NapiHelpers::NsBigIntToTimespec(value.As<Napi::BigInt>(), &ts)) {
        return;
    }

    setter(st, ts);
}

#if defined(__APPLE__)
inline void SetStatAtime(struct stat* st, const struct timespec& ts) {
    st->st_atimespec = ts;
    st->st_atime = ts.tv_sec;
}

inline void SetStatMtime(struct stat* st, const struct timespec& ts) {
    st->st_mtimespec = ts;
    st->st_mtime = ts.tv_sec;
}

inline void SetStatCtime(struct stat* st, const struct timespec& ts) {
    st->st_ctimespec = ts;
    st->st_ctime = ts.tv_sec;
}
#else
inline void SetStatAtime(struct stat* st, const struct timespec& ts) {
    st->st_atim = ts;
    st->st_atime = ts.tv_sec;
}

inline void SetStatMtime(struct stat* st, const struct timespec& ts) {
    st->st_mtim = ts;
    st->st_mtime = ts.tv_sec;
}

inline void SetStatCtime(struct stat* st, const struct timespec& ts) {
    st->st_ctim = ts;
    st->st_ctime = ts.tv_sec;
}
#endif

} // namespace

bool NapiHelpers::ObjectToStat(Napi::Object obj, struct stat* st) {
    if (!obj.IsObject()) {
        return false;
    }

    memset(st, 0, sizeof(*st));

    auto ino_opt = SafeGetBigIntU64(obj.Get("ino"));
    if (ino_opt) {
        st->st_ino = *ino_opt;
    }

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

    if (obj.Has("uid")) {
        Napi::Value uid_val = obj.Get("uid");
        if (uid_val.IsNumber()) {
            st->st_uid = uid_val.As<Napi::Number>().Uint32Value();
        }
    }

    if (obj.Has("gid")) {
        Napi::Value gid_val = obj.Get("gid");
        if (gid_val.IsNumber()) {
            st->st_gid = gid_val.As<Napi::Number>().Uint32Value();
        }
    }

    auto rdev_opt = SafeGetBigIntU64(obj.Get("rdev"));
    if (rdev_opt) {
        st->st_rdev = static_cast<dev_t>(*rdev_opt);
    }

    if (obj.Has("size")) {
        Napi::Value size_val = obj.Get("size");
        if (auto size_opt = NapiHelpers::SafeGetBigInt64(size_val)) {
            st->st_size = static_cast<off_t>(*size_opt);
        } else if (size_val.IsNumber()) {
            st->st_size = static_cast<off_t>(size_val.As<Napi::Number>().Int64Value());
        }
    }

    if (obj.Has("blksize")) {
        Napi::Value blksize_val = obj.Get("blksize");
        if (blksize_val.IsNumber()) {
            st->st_blksize = blksize_val.As<Napi::Number>().Int32Value();
        }
    }

    if (obj.Has("blocks")) {
        Napi::Value blocks_val = obj.Get("blocks");
        if (auto blocks_opt = NapiHelpers::SafeGetBigInt64(blocks_val)) {
            st->st_blocks = static_cast<blkcnt_t>(*blocks_opt);
        } else if (blocks_val.IsNumber()) {
            st->st_blocks = static_cast<blkcnt_t>(blocks_val.As<Napi::Number>().Int64Value());
        }
    }

    if (obj.Has("atime")) {
        AssignTimespecField(obj.Get("atime"), st, SetStatAtime);
    }

    if (obj.Has("mtime")) {
        AssignTimespecField(obj.Get("mtime"), st, SetStatMtime);
    }

    if (obj.Has("ctime")) {
        AssignTimespecField(obj.Get("ctime"), st, SetStatCtime);
    }

    if (obj.Has("birthtime")) {
#if defined(__APPLE__)
        AssignTimespecField(obj.Get("birthtime"), st, [](struct stat* target, const struct timespec& ts) {
            target->st_birthtimespec = ts;
        });
#endif
    }

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

bool NapiHelpers::ObjectToStatvfs(Napi::Object obj, struct statvfs* st) {
    if (!st) return false;

    if (obj.Has("bsize")) st->f_bsize = obj.Get("bsize").As<Napi::Number>().Uint32Value();
    if (obj.Has("frsize")) st->f_frsize = obj.Get("frsize").As<Napi::Number>().Uint32Value();
    if (obj.Has("blocks")) st->f_blocks = GetBigUint64(obj.Env(), obj.Get("blocks"));
    if (obj.Has("bfree")) st->f_bfree = GetBigUint64(obj.Env(), obj.Get("bfree"));
    if (obj.Has("bavail")) st->f_bavail = GetBigUint64(obj.Env(), obj.Get("bavail"));
    if (obj.Has("files")) st->f_files = GetBigUint64(obj.Env(), obj.Get("files"));
    if (obj.Has("ffree")) st->f_ffree = GetBigUint64(obj.Env(), obj.Get("ffree"));
    if (obj.Has("favail")) st->f_favail = GetBigUint64(obj.Env(), obj.Get("favail"));
    if (obj.Has("fsid")) st->f_fsid = GetBigUint64(obj.Env(), obj.Get("fsid"));
    if (obj.Has("flag")) st->f_flag = obj.Get("flag").As<Napi::Number>().Uint32Value();
    if (obj.Has("namemax")) st->f_namemax = obj.Get("namemax").As<Napi::Number>().Uint32Value();

    return true;
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
  switch (errno_code) {
    case EPERM:   return "EPERM";
    case ENOENT:  return "ENOENT";
    case ESRCH:   return "ESRCH";
    case EINTR:   return "EINTR";
    case EIO:     return "EIO";
    case ENXIO:   return "ENXIO";
    case EBADF:   return "EBADF";
    case EAGAIN:  return "EAGAIN";
    case ENOMEM:  return "ENOMEM";
    case EACCES:  return "EACCES";
    case EFAULT:  return "EFAULT";
    case EBUSY:   return "EBUSY";
    case EEXIST:  return "EEXIST";
    case EXDEV:   return "EXDEV";
    case ENODEV:  return "ENODEV";
    case ENOTDIR: return "ENOTDIR";
    case EISDIR:  return "EISDIR";
    case EINVAL:  return "EINVAL";
    case ENFILE:  return "ENFILE";
    case EMFILE:  return "EMFILE";
    case ENOSPC:  return "ENOSPC";
    case EROFS:   return "EROFS";
    case ENOSYS:  return "ENOSYS";
    case ENOTEMPTY:return "ENOTEMPTY";
    default:      return "UNKNOWN";
  }
}

std::string NapiHelpers::ErrnoToMessage(int errno_code) {
  switch (errno_code) {
    case EPERM:   return "Operation not permitted";
    case ENOENT:  return "No such file or directory";
    case EIO:     return "Input/output error";
    case EACCES:  return "Permission denied";
    case EEXIST:  return "File exists";
    case ENOTDIR: return "Not a directory";
    case EISDIR:  return "Is a directory";
    case EINVAL:  return "Invalid argument";
    case ENOSPC:  return "No space left on device";
    case ENOSYS:  return "Function not implemented";
    case ENOTEMPTY:return "Directory not empty";
    default:      return "Unknown error";
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
  static thread_local std::string s;
  s = ErrnoToString(errno_code);
  return s.c_str(); // jetzt kein Dangling-Pointer mehr
}

/**
 * File info conversions
 */
Napi::Object NapiHelpers::FileInfoToObject(Napi::Env env, const struct fuse_file_info& fi) {
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("flags", Napi::Number::New(env, fi.flags));
    obj.Set("writepage", Napi::Boolean::New(env, fi.writepage));
    obj.Set("direct_io", Napi::Boolean::New(env, fi.direct_io));
    obj.Set("keep_cache", Napi::Boolean::New(env, fi.keep_cache));
    obj.Set("flush", Napi::Boolean::New(env, fi.flush));
    obj.Set("nonseekable", Napi::Boolean::New(env, fi.nonseekable));
    obj.Set("flock_release", Napi::Boolean::New(env, fi.flock_release));
    obj.Set("cache_readdir", Napi::Boolean::New(env, fi.cache_readdir));
    obj.Set("fh", CreateBigUint64(env, fi.fh));
    obj.Set("lock_owner", CreateBigUint64(env, fi.lock_owner));
    obj.Set("poll_events", Napi::Number::New(env, fi.poll_events));

    return obj;
}

bool NapiHelpers::ObjectToFileInfo(Napi::Object obj, struct fuse_file_info* fi) {
  if (!obj.IsObject() || fi == nullptr) {
    return false;
  }

  std::memset(fi, 0, sizeof(*fi));

  // Helper: uint64 aus BigInt ODER Number (verlustfrei)
  auto read_u64_bigint_or_number = [&](const char* key, uint64_t* out) -> bool {
    if (!obj.Has(key)) return false; // optional
    Napi::Value v = obj.Get(key);

    if (v.IsBigInt()) {
      bool lossless = false;
      uint64_t tmp = v.As<Napi::BigInt>().Uint64Value(&lossless);
      if (!lossless) return false;
      if (out) *out = tmp;
      return true;
    }

    if (v.IsNumber()) {
      double d = v.As<Napi::Number>().DoubleValue();
      if (!std::isfinite(d) || d < 0.0) return false;
      uint64_t tmp = static_cast<uint64_t>(d);
      if (static_cast<double>(tmp) != d) return false; // keine Nachkommastellen
      if (out) *out = tmp;
      return true;
    }

    return false;
  };

  // flags (int32)
  if (obj.Has("flags") && obj.Get("flags").IsNumber()) {
    fi->flags = obj.Get("flags").As<Napi::Number>().Int32Value();
  }

  // Bitfields: direkt setzen, KEINE Adresse nehmen
  if (obj.Has("writepage") && obj.Get("writepage").IsBoolean()) {
    fi->writepage = obj.Get("writepage").As<Napi::Boolean>().Value() ? 1 : 0;
  }
  if (obj.Has("direct_io") && obj.Get("direct_io").IsBoolean()) {
    fi->direct_io = obj.Get("direct_io").As<Napi::Boolean>().Value() ? 1 : 0;
  }
  if (obj.Has("keep_cache") && obj.Get("keep_cache").IsBoolean()) {
    fi->keep_cache = obj.Get("keep_cache").As<Napi::Boolean>().Value() ? 1 : 0;
  }
  if (obj.Has("flush") && obj.Get("flush").IsBoolean()) {
    fi->flush = obj.Get("flush").As<Napi::Boolean>().Value() ? 1 : 0;
  }
  if (obj.Has("nonseekable") && obj.Get("nonseekable").IsBoolean()) {
    fi->nonseekable = obj.Get("nonseekable").As<Napi::Boolean>().Value() ? 1 : 0;
  }
  if (obj.Has("flock_release") && obj.Get("flock_release").IsBoolean()) {
    fi->flock_release = obj.Get("flock_release").As<Napi::Boolean>().Value() ? 1 : 0;
  }
  if (obj.Has("cache_readdir") && obj.Get("cache_readdir").IsBoolean()) {
    fi->cache_readdir = obj.Get("cache_readdir").As<Napi::Boolean>().Value() ? 1 : 0;
  }

  // fh (u64)
  {
    uint64_t tmp = 0;
    if (read_u64_bigint_or_number("fh", &tmp)) {
      fi->fh = tmp;
    }
  }

  // lock_owner (u64)
  {
    uint64_t tmp = 0;
    if (read_u64_bigint_or_number("lock_owner", &tmp)) {
      fi->lock_owner = tmp;
    }
  }

  // poll_events (uint32)
  if (obj.Has("poll_events") && obj.Get("poll_events").IsNumber()) {
    fi->poll_events = obj.Get("poll_events").As<Napi::Number>().Uint32Value();
  }

  return true;
}

} // namespace fuse_native
