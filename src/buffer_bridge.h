/**
 * @file buffer_bridge.h
 * @brief External ArrayBuffer utilities for zero-copy operations
 * 
 * This module provides utilities for creating and managing External ArrayBuffers
 * that reference native memory without copying, enabling zero-copy I/O operations.
 */

#ifndef FUSE_NATIVE_BUFFER_BRIDGE_H
#define FUSE_NATIVE_BUFFER_BRIDGE_H

#include <napi.h>
#include <cstddef>
#include <functional>

namespace FuseNative {

/**
 * Custom finalizer function type for external buffers
 * @param data - Pointer to the buffer data
 * @param hint - User-provided hint/context
 */
using ExternalBufferFinalizer = std::function<void(void* data, void* hint)>;

/**
 * Internal structure for finalizer hints
 */
struct BufferFinalizerHint {
    ExternalBufferFinalizer finalizer;
    void* hint;
};

/**
 * Structure representing a view into a buffer
 */
struct BufferView {
    void* data;       ///< Pointer to the data
    size_t size;      ///< Size of the view
    size_t offset;    ///< Offset from the original buffer start
};

/**
 * Buffer statistics and information
 */
struct BufferStats {
    size_t size;         ///< Buffer size in bytes
    void* data;          ///< Raw data pointer
    bool isExternal;     ///< Whether buffer is external
    bool isDetached;     ///< Whether buffer is detached
};

/**
 * BufferBridge - Utilities for External ArrayBuffer management
 */
class BufferBridge {
public:
    /**
     * Create an External ArrayBuffer that references existing memory
     * 
     * @param env - N-API environment
     * @param data - Pointer to existing memory (must remain valid until finalizer is called)
     * @param length - Size of the memory block in bytes
     * @param finalizer - Optional custom finalizer to clean up the memory
     * @param hint - Optional hint passed to the finalizer
     * @return ArrayBuffer that references the external memory
     * 
     * @note The memory pointed to by 'data' must remain valid until the finalizer
     *       is called by the garbage collector. Use with caution!
     */
    static Napi::ArrayBuffer CreateExternalBuffer(Napi::Env env, void* data, size_t length,
                                                  ExternalBufferFinalizer finalizer = nullptr,
                                                  void* hint = nullptr);

    /**
     * Create a managed buffer with automatic cleanup
     * 
     * @param env - N-API environment  
     * @param length - Size of the buffer to allocate
     * @return ArrayBuffer with automatically managed memory
     * 
     * @note This allocates aligned memory and sets up automatic cleanup
     */
    static Napi::ArrayBuffer CreateManagedBuffer(Napi::Env env, size_t length);

    /**
     * Create a view into an existing buffer
     * 
     * @param data - Pointer to the buffer data
     * @param length - Total length of the buffer
     * @param offset - Offset to start the view at
     * @param size - Size of the view (SIZE_MAX for remaining buffer)
     * @return BufferView structure
     */
    static BufferView CreateBufferView(void* data, size_t length, size_t offset, size_t size = SIZE_MAX);

    /**
     * Validate that a buffer has at least the required size
     * 
     * @param buffer - ArrayBuffer to validate
     * @param requiredSize - Minimum required size
     * @return true if buffer is valid and large enough
     */
    static bool ValidateBuffer(Napi::ArrayBuffer buffer, size_t requiredSize);

    /**
     * Validate that a buffer range is within bounds
     * 
     * @param buffer - ArrayBuffer to validate
     * @param offset - Starting offset
     * @param length - Length of the range
     * @return true if range is valid and within buffer bounds
     */
    static bool ValidateBufferRange(Napi::ArrayBuffer buffer, size_t offset, size_t length);

    /**
     * Create a slice of an existing ArrayBuffer
     * 
     * @param env - N-API environment
     * @param buffer - Source ArrayBuffer
     * @param offset - Offset to start the slice
     * @param length - Length of the slice
     * @return New ArrayBuffer referencing the slice
     * 
     * @warning The returned buffer depends on the original buffer's lifetime
     */
    static Napi::Value CreateBufferSlice(Napi::Env env, Napi::ArrayBuffer buffer, 
                                        size_t offset, size_t length);

    /**
     * Copy data between buffers with size validation
     * 
     * @param dest - Destination buffer
     * @param destSize - Size of destination buffer
     * @param src - Source buffer
     * @param srcSize - Size of source buffer
     * @return Number of bytes actually copied
     */
    static size_t CopyBuffer(void* dest, size_t destSize, const void* src, size_t srcSize);

    /**
     * Fill buffer with a specific byte value
     * 
     * @param buffer - Buffer to fill
     * @param size - Size of buffer
     * @param value - Byte value to fill with
     * @return Number of bytes filled
     */
    static size_t FillBuffer(void* buffer, size_t size, uint8_t value);

    /**
     * Compare two buffers
     * 
     * @param buf1 - First buffer
     * @param buf2 - Second buffer  
     * @param size - Number of bytes to compare
     * @return 0 if equal, < 0 if buf1 < buf2, > 0 if buf1 > buf2
     */
    static int CompareBuffers(const void* buf1, const void* buf2, size_t size);

    /**
     * Get statistics about a buffer
     * 
     * @param buffer - ArrayBuffer to analyze
     * @return BufferStats structure with buffer information
     */
    static BufferStats GetBufferStats(Napi::ArrayBuffer buffer);

    // N-API wrapper functions for JavaScript interface

    /**
     * N-API wrapper for creating external buffer
     * 
     * JavaScript signature: createExternalBuffer(size: bigint): ArrayBuffer
     */
    static Napi::Value CreateExternalBuffer(const Napi::CallbackInfo& info);

    /**
     * N-API wrapper for creating managed buffer
     * 
     * JavaScript signature: createManagedBuffer(size: bigint): ArrayBuffer
     */
    static Napi::Value CreateManagedBuffer(const Napi::CallbackInfo& info);

    /**
     * N-API wrapper for buffer validation
     * 
     * JavaScript signature: validateBuffer(buffer: ArrayBuffer, requiredSize: bigint): boolean
     */
    static Napi::Value ValidateBuffer(const Napi::CallbackInfo& info);

    /**
     * N-API wrapper for buffer range validation
     * 
     * JavaScript signature: validateBufferRange(buffer: ArrayBuffer, offset: bigint, length: bigint): boolean
     */
    static Napi::Value ValidateBufferRange(const Napi::CallbackInfo& info);

    /**
     * N-API wrapper for creating buffer slice
     * 
     * JavaScript signature: createBufferSlice(buffer: ArrayBuffer, offset: bigint, length: bigint): ArrayBuffer
     */
    static Napi::Value CreateBufferSlice(const Napi::CallbackInfo& info);

    /**
     * N-API wrapper for getting buffer statistics
     * 
     * JavaScript signature: getBufferStats(buffer: ArrayBuffer): { size: bigint, isExternal: boolean, isDetached: boolean }
     */
    static Napi::Value GetBufferStats(const Napi::CallbackInfo& info);

private:
    /**
     * Static finalizer callback for N-API external ArrayBuffers
     */
    static void ExternalBufferFinalizer(Napi::Env env, void* data, void* hint);
};

} // namespace FuseNative

namespace fuse_native {

/**
 * Free function wrappers for N-API binding
 * These functions provide the interface expected by Napi::Function::New()
 */

/**
 * Create external buffer (N-API exposed function)
 * @param info N-API callback info containing buffer size
 * @return ArrayBuffer backed by external memory
 */
Napi::Value CreateExternalBuffer(const Napi::CallbackInfo& info);

/**
 * Create managed buffer (N-API exposed function)
 * @param info N-API callback info containing buffer size
 * @return ArrayBuffer with automatic memory management
 */
Napi::Value CreateManagedBuffer(const Napi::CallbackInfo& info);

/**
 * Validate buffer (N-API exposed function)
 * @param info N-API callback info containing buffer and required size
 * @return Boolean indicating if buffer is valid
 */
Napi::Value ValidateBuffer(const Napi::CallbackInfo& info);

/**
 * Validate buffer range (N-API exposed function)
 * @param info N-API callback info containing buffer, offset, and length
 * @return Boolean indicating if range is valid
 */
Napi::Value ValidateBufferRange(const Napi::CallbackInfo& info);

/**
 * Create buffer slice (N-API exposed function)
 * @param info N-API callback info containing buffer, offset, and length
 * @return ArrayBuffer slice
 */
Napi::Value CreateBufferSlice(const Napi::CallbackInfo& info);

/**
 * Get buffer statistics (N-API exposed function)
 * @param info N-API callback info containing buffer
 * @return Object with buffer statistics
 */
Napi::Value GetBufferStats(const Napi::CallbackInfo& info);

} // namespace fuse_native

#endif // FUSE_NATIVE_BUFFER_BRIDGE_H