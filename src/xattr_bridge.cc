#define FUSE_USE_VERSION 31

#include <sys/xattr.h>
#include <fuse3/fuse.h>
#include <cstring>
#include <cerrno>
#include <algorithm>

#include "xattr_bridge.h"
#include "napi_helpers.h"
#include "errno_mapping.h"

namespace fuse_native {

// Platform-specific implementations

int platform_getxattr(const char* path, const char* name, void* value, size_t size) {
#ifdef __APPLE__
    // macOS: Force position=0 for compatibility
    return getxattr(path, name, value, size, 0, XATTR_NOFOLLOW);
#else
    // Linux: Direct call
    return getxattr(path, name, value, size);
#endif
}

int platform_setxattr(const char* path, const char* name, const void* value, size_t size, int flags) {
#ifdef __APPLE__
    // macOS: Force position=0 and convert flags
    int options = XATTR_NOFOLLOW;
    return setxattr(path, name, value, size, 0, options | flags);
#else
    // Linux: Direct call
    return setxattr(path, name, value, size, flags);
#endif
}

int platform_listxattr(const char* path, char* list, size_t size) {
#ifdef __APPLE__
    return listxattr(path, list, size, XATTR_NOFOLLOW);
#else
    return listxattr(path, list, size);
#endif
}

int platform_removexattr(const char* path, const char* name) {
#ifdef __APPLE__
    return removexattr(path, name, XATTR_NOFOLLOW);
#else
    return removexattr(path, name);
#endif
}

// Helper functions

std::vector<std::string> ParseAttributeList(const char* buffer, size_t size) {
    std::vector<std::string> names;
    if (size == 0 || !buffer) return names;

    const char* ptr = buffer;
    const char* end = buffer + size;

    while (ptr < end) {
        size_t len = strnlen(ptr, end - ptr);
        if (len == 0) break;

        names.emplace_back(ptr, len);
        ptr += len + 1; // Skip null terminator
    }

    return names;
}

bool IsValidAttributeName(const std::string& name) {
    if (name.empty() || name.length() > 255) return false;

    // Check for null bytes
    if (name.find('\0') != std::string::npos) return false;

    // Platform-specific validation
#ifdef __APPLE__
    // macOS allows most names
    return true;
#else
    // Linux: Must not start with null
    return name[0] != '\0';
#endif
}

int ConvertXAttrFlags(int flags) {
    // System constants are already correct, just return as-is
    return flags;
}

// N-API implementations

Napi::Value GetXAttr(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected at least 2 arguments: path, name")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Parse arguments
    std::string path = info[0].As<Napi::String>().Utf8Value();
    std::string name = info[1].As<Napi::String>().Utf8Value();

    // Optional size argument (0 for size query)
    size_t size = 0;
    if (info.Length() > 2 && info[2].IsNumber()) {
        size = NapiHelpers::GetBigUint64(env, info[2]);
    }

    // Validate attribute name
    if (!IsValidAttributeName(name)) {
        return NapiHelpers::CreateBigInt64(env, -EINVAL);
    }

    if (size == 0) {
        // Size query
        ssize_t result = platform_getxattr(path.c_str(), name.c_str(), nullptr, 0);
        if (result < 0) {
            return NapiHelpers::CreateBigInt64(env, -errno);
        }
        return NapiHelpers::CreateBigIntU64(env, static_cast<uint64_t>(result));
    }

    // Get attribute value
    std::vector<char> buffer(size);
    ssize_t result = platform_getxattr(path.c_str(), name.c_str(), buffer.data(), size);

    if (result < 0) {
        return NapiHelpers::CreateBigInt64(env, -errno);
    }

    // Create result object
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("size", NapiHelpers::CreateBigIntU64(env, static_cast<uint64_t>(result)));

    if (result > 0) {
        Napi::Buffer<char> napiBuffer = Napi::Buffer<char>::Copy(env, buffer.data(), result);
        obj.Set("data", napiBuffer);
    }

    return obj;
}

Napi::Value SetXAttr(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 4) {
        Napi::TypeError::New(env, "Expected 4 arguments: path, name, value, flags")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Parse arguments
    std::string path = info[0].As<Napi::String>().Utf8Value();
    std::string name = info[1].As<Napi::String>().Utf8Value();

    if (!info[2].IsBuffer()) {
        Napi::TypeError::New(env, "Value must be a Buffer")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Buffer<char> valueBuffer = info[2].As<Napi::Buffer<char>>();
    int flags = NapiHelpers::GetInt32(env, info[3]);

    // Validate attribute name
    if (!IsValidAttributeName(name)) {
        return NapiHelpers::CreateBigInt64(env, -EINVAL);
    }

    // Set attribute
    int result = platform_setxattr(
        path.c_str(),
        name.c_str(),
        valueBuffer.Data(),
        valueBuffer.Length(),
        ConvertXAttrFlags(flags)
    );

    if (result < 0) {
        return NapiHelpers::CreateBigInt64(env, -errno);
    }

    return NapiHelpers::CreateBigInt64(env, 0);
}

Napi::Value ListXAttr(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected at least 1 argument: path")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Parse arguments
    std::string path = info[0].As<Napi::String>().Utf8Value();

    // Optional size argument (0 for size query)
    size_t size = 0;
    if (info.Length() > 1 && info[1].IsNumber()) {
        size = NapiHelpers::GetBigUint64(env, info[1]);
    }

    if (size == 0) {
        // Size query
        ssize_t result = platform_listxattr(path.c_str(), nullptr, 0);
        if (result < 0) {
            return NapiHelpers::CreateBigInt64(env, -errno);
        }
        return NapiHelpers::CreateBigIntU64(env, static_cast<uint64_t>(result));
    }

    // Get attribute list
    std::vector<char> buffer(size);
    ssize_t result = platform_listxattr(path.c_str(), buffer.data(), size);

    if (result < 0) {
        return NapiHelpers::CreateBigInt64(env, -errno);
    }

    // Parse names
    auto names = ParseAttributeList(buffer.data(), result);

    // Create result object
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("size", NapiHelpers::CreateBigIntU64(env, static_cast<uint64_t>(result)));

    Napi::Array nameArray = Napi::Array::New(env, names.size());
    for (size_t i = 0; i < names.size(); i++) {
        nameArray.Set(i, Napi::String::New(env, names[i]));
    }
    obj.Set("names", nameArray);

    return obj;
}

Napi::Value RemoveXAttr(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected 2 arguments: path, name")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Parse arguments
    std::string path = info[0].As<Napi::String>().Utf8Value();
    std::string name = info[1].As<Napi::String>().Utf8Value();

    // Validate attribute name
    if (!IsValidAttributeName(name)) {
        return NapiHelpers::CreateBigInt64(env, -EINVAL);
    }

    // Remove attribute
    int result = platform_removexattr(path.c_str(), name.c_str());

    if (result < 0) {
        return NapiHelpers::CreateBigInt64(env, -errno);
    }

    return NapiHelpers::CreateBigInt64(env, 0);
}

} // namespace fuse_native
