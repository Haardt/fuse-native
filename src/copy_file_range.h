/**
 * @file copy_file_range.h
 * @brief copy_file_range implementation with fast-path and chunked fallback
 * 
 * This module provides native copy_file_range implementation that attempts to use
 * the kernel's copy_file_range syscall for optimal performance, with fallback
 * to chunked read/write operations when the syscall is not available or fails.
 */

#ifndef FUSE_NATIVE_COPY_FILE_RANGE_H
#define FUSE_NATIVE_COPY_FILE_RANGE_H

#include <napi.h>
#include <cstddef>
#include <sys/types.h>

namespace FuseNative {

/**
 * CopyFileRange - High-performance file copying with kernel fast-path
 * 
 * This class provides copy_file_range functionality with automatic fallback
 * from kernel syscalls to chunked read/write operations for maximum compatibility
 * and performance.
 */
class CopyFileRange {
public:
    /**
     * Statistics for copy operations
     */
    struct Stats {
        uint64_t totalOperations = 0;     ///< Total number of copy operations performed
        uint64_t totalBytesCopied = 0;    ///< Total bytes copied across all operations
    };

    /**
     * Constructor - initializes and tests kernel support
     */
    CopyFileRange();

    /**
     * Destructor
     */
    ~CopyFileRange();

    /**
     * Copy data between file descriptors
     * 
     * @param fdIn - Source file descriptor
     * @param offsetIn - Source offset (nullptr to use current position)
     * @param fdOut - Destination file descriptor  
     * @param offsetOut - Destination offset (nullptr to use current position)
     * @param length - Number of bytes to copy
     * @param flags - Copy flags (for kernel copy_file_range)
     * @return Number of bytes copied, or -1 on error (errno set)
     * 
     * @note This function first attempts to use the kernel copy_file_range syscall
     *       for optimal performance. If that fails or is unavailable, it falls back
     *       to chunked read/write operations.
     */
    ssize_t copyFileRange(int fdIn, off_t* offsetIn, int fdOut, off_t* offsetOut,
                          size_t length, unsigned int flags = 0);

    /**
     * Set the chunk size for fallback operations
     * 
     * @param chunkSize - Size of chunks for read/write fallback (clamped to valid range)
     */
    void setChunkSize(size_t chunkSize);

    /**
     * Get the current chunk size
     * 
     * @return Current chunk size in bytes
     */
    size_t getChunkSize() const;

    /**
     * Check if kernel copy_file_range is supported
     * 
     * @return true if kernel copy is available and enabled
     */
    bool isKernelCopySupported() const;

    /**
     * Get copy operation statistics
     * 
     * @return Stats structure with operation counts and bytes copied
     */
    Stats getStats() const;

    /**
     * Reset statistics counters
     */
    void resetStats();

    // N-API wrapper functions for JavaScript interface
    
    /**
     * N-API wrapper for copy_file_range operation
     * 
     * JavaScript signature:
     * copyFileRange(fdIn: number, offsetIn: bigint, fdOut: number, 
     *               offsetOut: bigint, length: bigint, flags?: number): bigint
     * 
     * @param info - N-API callback info with arguments
     * @return Promise resolving to bytes copied (as BigInt)
     */
    static Napi::Value CreateCopyFileRange(const Napi::CallbackInfo& info);

    /**
     * N-API wrapper to set chunk size
     * 
     * JavaScript signature: setChunkSize(size: bigint): void
     */
    static Napi::Value SetChunkSize(const Napi::CallbackInfo& info);

    /**
     * N-API wrapper to get chunk size
     * 
     * JavaScript signature: getChunkSize(): bigint
     */
    static Napi::Value GetChunkSize(const Napi::CallbackInfo& info);

    /**
     * N-API wrapper to get statistics
     * 
     * JavaScript signature: getStats(): { totalOperations: bigint, totalBytesCopied: bigint, kernelCopySupported: boolean }
     */
    static Napi::Value GetStats(const Napi::CallbackInfo& info);

    /**
     * N-API wrapper to reset statistics
     * 
     * JavaScript signature: resetStats(): void
     */
    static Napi::Value ResetStats(const Napi::CallbackInfo& info);

private:
    /**
     * Test if kernel copy_file_range syscall is available
     */
    void testKernelSupport();

    /**
     * Attempt kernel copy_file_range syscall
     * 
     * @param fdIn - Source file descriptor
     * @param offsetIn - Source offset pointer
     * @param fdOut - Destination file descriptor
     * @param offsetOut - Destination offset pointer
     * @param length - Bytes to copy
     * @param flags - Syscall flags
     * @return Bytes copied or -1 on error
     */
    ssize_t kernelCopyFileRange(int fdIn, off_t* offsetIn, int fdOut, off_t* offsetOut,
                                size_t length, unsigned int flags);

    /**
     * Fallback chunked copy using read/write
     * 
     * @param fdIn - Source file descriptor
     * @param offsetIn - Source offset pointer
     * @param fdOut - Destination file descriptor
     * @param offsetOut - Destination offset pointer
     * @param length - Bytes to copy
     * @return Bytes copied or -1 on error
     */
    ssize_t chunkedCopyFileRange(int fdIn, off_t* offsetIn, int fdOut, off_t* offsetOut,
                                 size_t length);

    size_t chunkSize_;        ///< Chunk size for fallback operations
    bool useKernelCopy_;      ///< Whether kernel copy_file_range is available
    Stats stats_;             ///< Operation statistics
};

} // namespace FuseNative

namespace fuse_native {

/**
 * Free function wrappers for N-API binding
 * These functions provide the interface expected by Napi::Function::New()
 */

/**
 * Copy file range (N-API exposed function)
 * @param info N-API callback info containing file descriptors, offsets, length, and flags
 * @return Promise resolving to bytes copied (as BigInt)
 */
Napi::Value CopyFileRange(const Napi::CallbackInfo& info);

/**
 * Set chunk size (N-API exposed function)
 * @param info N-API callback info containing chunk size
 * @return Undefined
 */
Napi::Value SetCopyChunkSize(const Napi::CallbackInfo& info);

/**
 * Get chunk size (N-API exposed function)
 * @param info N-API callback info (no arguments)
 * @return Current chunk size as BigInt
 */
Napi::Value GetCopyChunkSize(const Napi::CallbackInfo& info);

/**
 * Get copy statistics (N-API exposed function)
 * @param info N-API callback info (no arguments)
 * @return Object with copy statistics
 */
Napi::Value GetCopyStats(const Napi::CallbackInfo& info);

/**
 * Reset copy statistics (N-API exposed function)
 * @param info N-API callback info (no arguments)
 * @return Undefined
 */
Napi::Value ResetCopyStats(const Napi::CallbackInfo& info);

} // namespace fuse_native

#endif // FUSE_NATIVE_COPY_FILE_RANGE_H