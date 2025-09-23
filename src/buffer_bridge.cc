/**
 * @file buffer_bridge.cc
 * @brief External ArrayBuffer utilities for zero-copy operations
 * 
 * This module provides utilities for creating and managing External ArrayBuffers
 * that reference native memory without copying, enabling zero-copy I/O operations.
 */

#include "buffer_bridge.h"
#include "errno_mapping.h"
#include "napi_helpers.h"
#include <cstring>
#include <algorithm>

namespace FuseNative {

// Static finalizer callback for external array buffers
void BufferBridge::ExternalBufferFinalizer(Napi::Env env, void* data, void* hint) {
    (void)env; // Unused parameter
    
    BufferFinalizerHint* finalizerHint = static_cast<BufferFinalizerHint*>(hint);
    if (!finalizerHint) {
        return;
    }
    
    // Call custom finalizer if provided
    if (finalizerHint->finalizer) {
        finalizerHint->finalizer(data, finalizerHint->hint);
    }
    
    // Clean up the hint structure
    delete finalizerHint;
}

Napi::ArrayBuffer BufferBridge::CreateExternalBuffer(Napi::Env env, void* data, size_t length,
                                                     FuseNative::ExternalBufferFinalizer finalizer,
                                                     void* hint) {
    if (!data) {
        Napi::TypeError::New(env, "Data pointer cannot be null").ThrowAsJavaScriptException();
        return Napi::ArrayBuffer();
    }
    
    if (length == 0) {
        // For zero-length buffers, create a regular ArrayBuffer
        return Napi::ArrayBuffer::New(env, 0);
    }
    
    // Create finalizer hint if we have a custom finalizer
    BufferFinalizerHint* finalizerHint = nullptr;
    if (finalizer) {
        finalizerHint = new BufferFinalizerHint{finalizer, hint};
    }
    
    try {
        return Napi::ArrayBuffer::New(env, data, length, ExternalBufferFinalizer, finalizerHint);
    } catch (const std::exception& e) {
        // Clean up on failure
        if (finalizerHint) {
            delete finalizerHint;
        }
        Napi::Error::New(env, std::string("Failed to create external ArrayBuffer: ") + e.what())
            .ThrowAsJavaScriptException();
        return Napi::ArrayBuffer();
    }
}

Napi::ArrayBuffer BufferBridge::CreateManagedBuffer(Napi::Env env, size_t length) {
    if (length == 0) {
        return Napi::ArrayBuffer::New(env, 0);
    }
    
    try {
        // Allocate aligned memory for better performance
        void* data = aligned_alloc(4096, (length + 4095) & ~4095);
        if (!data) {
            Napi::Error::New(env, "Failed to allocate aligned memory").ThrowAsJavaScriptException();
            return Napi::ArrayBuffer();
        }
        
        // Create external buffer with free() as finalizer
        auto finalizer = [](void* data, void* hint) {
            (void)hint;
            free(data);
        };
        
        return CreateExternalBuffer(env, data, length, finalizer, nullptr);
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to create managed buffer: ") + e.what())
            .ThrowAsJavaScriptException();
        return Napi::ArrayBuffer();
    }
}

BufferView BufferBridge::CreateBufferView(void* data, size_t length, size_t offset, size_t size) {
    if (!data) {
        return {nullptr, 0, 0};
    }
    
    // Clamp offset and size to buffer bounds
    size_t actualOffset = std::min(offset, length);
    size_t maxSize = length - actualOffset;
    size_t actualSize = (size == SIZE_MAX) ? maxSize : std::min(size, maxSize);
    
    return {
        static_cast<uint8_t*>(data) + actualOffset,
        actualSize,
        actualOffset
    };
}

bool BufferBridge::ValidateBuffer(Napi::ArrayBuffer buffer, size_t requiredSize) {
    if (buffer.IsEmpty()) {
        return requiredSize == 0;
    }
    
    return buffer.ByteLength() >= requiredSize;
}

bool BufferBridge::ValidateBufferRange(Napi::ArrayBuffer buffer, size_t offset, size_t length) {
    if (buffer.IsEmpty()) {
        return offset == 0 && length == 0;
    }
    
    size_t bufferSize = buffer.ByteLength();
    
    // Check for overflow
    if (offset > bufferSize) {
        return false;
    }
    
    if (length > (bufferSize - offset)) {
        return false;
    }
    
    return true;
}

Napi::Value BufferBridge::CreateBufferSlice(Napi::Env env, Napi::ArrayBuffer buffer, 
                                            size_t offset, size_t length) {
    if (!ValidateBufferRange(buffer, offset, length)) {
        Napi::RangeError::New(env, "Buffer slice out of bounds").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (length == 0) {
        return Napi::ArrayBuffer::New(env, 0);
    }
    
    // Get pointer to the slice
    uint8_t* data = static_cast<uint8_t*>(buffer.Data()) + offset;
    
    // Create a new ArrayBuffer that references the same memory
    // Note: This creates a dependency on the original buffer's lifetime
    return Napi::ArrayBuffer::New(env, data, length);
}

size_t BufferBridge::CopyBuffer(void* dest, size_t destSize, const void* src, size_t srcSize) {
    if (!dest || !src) {
        return 0;
    }
    
    size_t copySize = std::min(destSize, srcSize);
    if (copySize == 0) {
        return 0;
    }
    
    // Use optimized copy for large buffers
    if (copySize >= 1024) {
        // For large copies, use memcpy which may be optimized
        std::memcpy(dest, src, copySize);
    } else {
        // For small copies, use byte-by-byte copy to avoid overhead
        const uint8_t* srcBytes = static_cast<const uint8_t*>(src);
        uint8_t* destBytes = static_cast<uint8_t*>(dest);
        
        for (size_t i = 0; i < copySize; ++i) {
            destBytes[i] = srcBytes[i];
        }
    }
    
    return copySize;
}

size_t BufferBridge::FillBuffer(void* buffer, size_t size, uint8_t value) {
    if (!buffer || size == 0) {
        return 0;
    }
    
    std::memset(buffer, value, size);
    return size;
}

int BufferBridge::CompareBuffers(const void* buf1, const void* buf2, size_t size) {
    if (!buf1 || !buf2) {
        if (buf1 == buf2) return 0;
        return buf1 ? 1 : -1;
    }
    
    if (size == 0) {
        return 0;
    }
    
    return std::memcmp(buf1, buf2, size);
}

BufferStats BufferBridge::GetBufferStats(Napi::ArrayBuffer buffer) {
    BufferStats stats = {};
    
    if (buffer.IsEmpty()) {
        return stats;
    }
    
    stats.size = buffer.ByteLength();
    stats.data = buffer.Data();
    stats.isExternal = true; // ArrayBuffers in N-API are typically external
    stats.isDetached = false; // Would need additional API to detect this
    
    return stats;
}

// N-API wrapper functions
Napi::Value BufferBridge::CreateExternalBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected at least 2 arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // For safety, we don't expose raw pointer creation from JS
    // Instead, this is a placeholder for internal C++ usage
    auto lengthOpt = fuse_native::NapiHelpers::SafeGetBigIntU64(info[0]);
    if (!lengthOpt) {
        Napi::TypeError::New(env, "Invalid length argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    size_t length = *lengthOpt;
    
    try {
        return CreateManagedBuffer(env, length);
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to create external buffer: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value BufferBridge::CreateManagedBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected buffer size argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    auto lengthOpt = fuse_native::NapiHelpers::SafeGetBigIntU64(info[0]);
    if (!lengthOpt) {
        Napi::TypeError::New(env, "Invalid length argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    size_t length = *lengthOpt;
    
    try {
        return CreateManagedBuffer(env, length);
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to create managed buffer: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value BufferBridge::ValidateBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected buffer and size arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (!info[0].IsArrayBuffer()) {
        Napi::TypeError::New(env, "First argument must be an ArrayBuffer").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::ArrayBuffer buffer = info[0].As<Napi::ArrayBuffer>();
    auto sizeOpt = fuse_native::NapiHelpers::SafeGetBigIntU64(info[1]);
    if (!sizeOpt) {
        Napi::TypeError::New(env, "Invalid required size argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    size_t requiredSize = *sizeOpt;
    
    bool isValid = ValidateBuffer(buffer, requiredSize);
    return Napi::Boolean::New(env, isValid);
}

Napi::Value BufferBridge::ValidateBufferRange(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected buffer, offset, and length arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (!info[0].IsArrayBuffer()) {
        Napi::TypeError::New(env, "First argument must be an ArrayBuffer").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::ArrayBuffer buffer = info[0].As<Napi::ArrayBuffer>();
    auto offsetOpt = fuse_native::NapiHelpers::SafeGetBigIntU64(info[1]);
    auto lengthOpt = fuse_native::NapiHelpers::SafeGetBigIntU64(info[2]);
    if (!offsetOpt || !lengthOpt) {
        Napi::TypeError::New(env, "Invalid offset or length argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    size_t offset = *offsetOpt;
    size_t length = *lengthOpt;
    
    bool isValid = ValidateBufferRange(buffer, offset, length);
    return Napi::Boolean::New(env, isValid);
}

Napi::Value BufferBridge::CreateBufferSlice(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected buffer, offset, and length arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (!info[0].IsArrayBuffer()) {
        Napi::TypeError::New(env, "First argument must be an ArrayBuffer").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::ArrayBuffer buffer = info[0].As<Napi::ArrayBuffer>();
    auto offsetOpt = fuse_native::NapiHelpers::SafeGetBigIntU64(info[1]);
    auto lengthOpt = fuse_native::NapiHelpers::SafeGetBigIntU64(info[2]);
    if (!offsetOpt || !lengthOpt) {
        Napi::TypeError::New(env, "Invalid offset or length argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    size_t offset = *offsetOpt;
    size_t length = *lengthOpt;
    
    try {
        return CreateBufferSlice(env, buffer, offset, length);
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to create buffer slice: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value BufferBridge::GetBufferStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected buffer argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (!info[0].IsArrayBuffer()) {
        Napi::TypeError::New(env, "Argument must be an ArrayBuffer").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::ArrayBuffer buffer = info[0].As<Napi::ArrayBuffer>();
    BufferStats stats = GetBufferStats(buffer);
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("size", fuse_native::NapiHelpers::CreateBigIntU64(env, static_cast<uint64_t>(stats.size)));
    result.Set("isExternal", Napi::Boolean::New(env, stats.isExternal));
    result.Set("isDetached", Napi::Boolean::New(env, stats.isDetached));
    
    return result;
}

} // namespace FuseNative

namespace fuse_native {

/**
 * Free function wrappers for N-API binding
 */

Napi::Value CreateExternalBuffer(const Napi::CallbackInfo& info) {
    return FuseNative::BufferBridge::CreateExternalBuffer(info);
}

Napi::Value CreateManagedBuffer(const Napi::CallbackInfo& info) {
    return FuseNative::BufferBridge::CreateManagedBuffer(info);
}

Napi::Value ValidateBuffer(const Napi::CallbackInfo& info) {
    return FuseNative::BufferBridge::ValidateBuffer(info);
}

Napi::Value ValidateBufferRange(const Napi::CallbackInfo& info) {
    return FuseNative::BufferBridge::ValidateBufferRange(info);
}

Napi::Value CreateBufferSlice(const Napi::CallbackInfo& info) {
    return FuseNative::BufferBridge::CreateBufferSlice(info);
}

Napi::Value GetBufferStats(const Napi::CallbackInfo& info) {
    return FuseNative::BufferBridge::GetBufferStats(info);
}

} // namespace fuse_native