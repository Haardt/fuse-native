/**
 * @file copy_file_range.cc
 * @brief copy_file_range implementation with fast-path and chunked fallback
 * 
 * This module provides native copy_file_range implementation that attempts to use
 * the kernel's copy_file_range syscall for optimal performance, with fallback
 * to chunked read/write operations when the syscall is not available or fails.
 */

#include "copy_file_range.h"
#include "buffer_bridge.h"
#include "errno_mapping.h"
#include "napi_helpers.h"
#include <unistd.h>
#include <sys/syscall.h>
#include <linux/fs.h>
#include <errno.h>
#include <algorithm>
#include <memory>

// Fallback syscall number for copy_file_range if not defined in headers
#ifndef __NR_copy_file_range
#ifdef __x86_64__
#define __NR_copy_file_range 326
#elif defined(__aarch64__)
#define __NR_copy_file_range 285
#else
#define __NR_copy_file_range -1  // Unsupported architecture
#endif
#endif

namespace FuseNative {

// Default chunk size for fallback operations (4MB)
static constexpr size_t DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;

// Maximum chunk size (8MB)  
static constexpr size_t MAX_CHUNK_SIZE = 8 * 1024 * 1024;

// Minimum chunk size (64KB)
static constexpr size_t MIN_CHUNK_SIZE = 64 * 1024;

CopyFileRange::CopyFileRange() : chunkSize_(DEFAULT_CHUNK_SIZE), useKernelCopy_(true) {
    // Test if copy_file_range syscall is available
    testKernelSupport();
}

CopyFileRange::~CopyFileRange() = default;

void CopyFileRange::testKernelSupport() {
    // Try a dummy copy_file_range call to test availability
    // This will fail with EBADF for invalid file descriptors, but that's OK
    // If the syscall is not supported, it will fail with ENOSYS
    ssize_t result = syscall(__NR_copy_file_range, -1, nullptr, -1, nullptr, 0, 0);
    
    if (result == -1 && errno == ENOSYS) {
        useKernelCopy_ = false;
    }
}

ssize_t CopyFileRange::copyFileRange(int fdIn, off_t* offsetIn, int fdOut, off_t* offsetOut,
                                     size_t length, unsigned int flags) {
    if (length == 0) {
        return 0;
    }

    // Try kernel copy_file_range first if available
    if (useKernelCopy_) {
        ssize_t result = kernelCopyFileRange(fdIn, offsetIn, fdOut, offsetOut, length, flags);
        
        // If kernel copy succeeded or failed with a non-recoverable error, return result
        if (result >= 0 || (errno != ENOSYS && errno != EOPNOTSUPP && errno != EXDEV)) {
            return result;
        }
        
        // Kernel copy failed with recoverable error, fall back to chunked copy
        if (errno == ENOSYS || errno == EOPNOTSUPP) {
            useKernelCopy_ = false;  // Disable for future calls
        }
    }

    // Fallback to chunked read/write
    return chunkedCopyFileRange(fdIn, offsetIn, fdOut, offsetOut, length);
}

ssize_t CopyFileRange::kernelCopyFileRange(int fdIn, off_t* offsetIn, int fdOut, off_t* offsetOut,
                                           size_t length, unsigned int flags) {
    if (__NR_copy_file_range == -1) {
        errno = ENOSYS;
        return -1;
    }

    // Use the kernel copy_file_range syscall
    return syscall(__NR_copy_file_range, fdIn, offsetIn, fdOut, offsetOut, length, flags);
}

ssize_t CopyFileRange::chunkedCopyFileRange(int fdIn, off_t* offsetIn, int fdOut, off_t* offsetOut,
                                            size_t length) {
    if (length == 0) {
        return 0;
    }

    // Allocate aligned buffer for optimal I/O performance
    size_t actualChunkSize = std::min(std::max(length, MIN_CHUNK_SIZE), chunkSize_);
    
    void* buffer = aligned_alloc(4096, (actualChunkSize + 4095) & ~4095);
    if (!buffer) {
        errno = ENOMEM;
        return -1;
    }

    // RAII wrapper for buffer cleanup
    std::unique_ptr<void, decltype(&free)> bufferGuard(buffer, &free);

    size_t totalCopied = 0;
    off_t currentOffsetIn = offsetIn ? *offsetIn : 0;
    off_t currentOffsetOut = offsetOut ? *offsetOut : 0;
    bool useOffsetIn = (offsetIn != nullptr);
    bool useOffsetOut = (offsetOut != nullptr);

    while (totalCopied < length) {
        size_t remainingBytes = length - totalCopied;
        size_t chunkToCopy = std::min(remainingBytes, actualChunkSize);

        // Read from source
        ssize_t bytesRead;
        if (useOffsetIn) {
            bytesRead = pread(fdIn, buffer, chunkToCopy, currentOffsetIn);
        } else {
            bytesRead = read(fdIn, buffer, chunkToCopy);
        }

        if (bytesRead == -1) {
            return (totalCopied > 0) ? static_cast<ssize_t>(totalCopied) : -1;
        }

        if (bytesRead == 0) {
            // End of file reached
            break;
        }

        // Write to destination
        ssize_t bytesWritten = 0;
        const char* writeBuffer = static_cast<const char*>(buffer);
        
        while (bytesWritten < bytesRead) {
            ssize_t written;
            size_t toWrite = bytesRead - bytesWritten;
            
            if (useOffsetOut) {
                written = pwrite(fdOut, writeBuffer + bytesWritten, toWrite, 
                                currentOffsetOut + bytesWritten);
            } else {
                written = write(fdOut, writeBuffer + bytesWritten, toWrite);
            }

            if (written == -1) {
                if (errno == EINTR) {
                    continue;  // Retry on interrupt
                }
                return (totalCopied > 0) ? static_cast<ssize_t>(totalCopied) : -1;
            }

            if (written == 0) {
                // This shouldn't happen with regular files, but handle it
                errno = ENOSPC;
                return (totalCopied > 0) ? static_cast<ssize_t>(totalCopied) : -1;
            }

            bytesWritten += written;
        }

        totalCopied += bytesRead;
        
        if (useOffsetIn) {
            currentOffsetIn += bytesRead;
        }
        if (useOffsetOut) {
            currentOffsetOut += bytesRead;
        }

        // If we read less than requested, we've reached EOF
        if (static_cast<size_t>(bytesRead) < chunkToCopy) {
            break;
        }
    }

    // Update offset pointers if provided
    if (offsetIn) {
        *offsetIn = currentOffsetIn;
    }
    if (offsetOut) {
        *offsetOut = currentOffsetOut;
    }

    return static_cast<ssize_t>(totalCopied);
}

void CopyFileRange::setChunkSize(size_t chunkSize) {
    chunkSize_ = std::min(std::max(chunkSize, MIN_CHUNK_SIZE), MAX_CHUNK_SIZE);
}

size_t CopyFileRange::getChunkSize() const {
    return chunkSize_;
}

bool CopyFileRange::isKernelCopySupported() const {
    return useKernelCopy_;
}

CopyFileRange::Stats CopyFileRange::getStats() const {
    return stats_;
}

void CopyFileRange::resetStats() {
    stats_ = Stats{};
}

// N-API wrapper functions
Napi::Value CopyFileRange::CreateCopyFileRange(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 6) {
        Napi::TypeError::New(env, "Expected at least 6 arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Extract arguments
    int fdIn = fuse_native::NapiHelpers::GetInt32(env, info[0]);
    uint64_t offsetInValue = fuse_native::NapiHelpers::GetBigUint64(env, info[1]);
    int fdOut = fuse_native::NapiHelpers::GetInt32(env, info[2]);
    uint64_t offsetOutValue = fuse_native::NapiHelpers::GetBigUint64(env, info[3]);
    uint64_t length = fuse_native::NapiHelpers::GetBigUint64(env, info[4]);
    unsigned int flags = info.Length() > 6 ? fuse_native::NapiHelpers::GetUint32(env, info[6]) : 0;

    // Convert to appropriate types
    off_t offsetIn = static_cast<off_t>(offsetInValue);
    off_t offsetOut = static_cast<off_t>(offsetOutValue);
    off_t* pOffsetIn = (offsetInValue != UINT64_MAX) ? &offsetIn : nullptr;
    off_t* pOffsetOut = (offsetOutValue != UINT64_MAX) ? &offsetOut : nullptr;

    // Perform the copy operation
    static thread_local CopyFileRange copier;
    ssize_t result = copier.copyFileRange(fdIn, pOffsetIn, fdOut, pOffsetOut, 
                                         static_cast<size_t>(length), flags);

    if (result == -1) {
        int err = errno;
        Napi::Error::New(env, fuse_native::errno_to_string(err)).ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Update statistics
    copier.stats_.totalOperations++;
    copier.stats_.totalBytesCopied += result;

    // Return result as BigInt
    return fuse_native::NapiHelpers::CreateBigUint64(env, static_cast<uint64_t>(result));
}

Napi::Value CopyFileRange::SetChunkSize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected chunk size argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    uint64_t chunkSize = fuse_native::NapiHelpers::GetBigUint64(env, info[0]);
    
    static thread_local CopyFileRange copier;
    copier.setChunkSize(static_cast<size_t>(chunkSize));

    return env.Undefined();
}

Napi::Value CopyFileRange::GetChunkSize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    static thread_local CopyFileRange copier;
    size_t chunkSize = copier.getChunkSize();

    return fuse_native::NapiHelpers::CreateBigUint64(env, static_cast<uint64_t>(chunkSize));
}

Napi::Value CopyFileRange::GetStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    static thread_local CopyFileRange copier;
    Stats stats = copier.getStats();

    Napi::Object result = Napi::Object::New(env);
    result.Set("totalOperations", fuse_native::NapiHelpers::CreateBigUint64(env, stats.totalOperations));
    result.Set("totalBytesCopied", fuse_native::NapiHelpers::CreateBigUint64(env, stats.totalBytesCopied));
    result.Set("kernelCopySupported", Napi::Boolean::New(env, copier.isKernelCopySupported()));

    return result;
}

Napi::Value CopyFileRange::ResetStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    static thread_local CopyFileRange copier;
    copier.resetStats();

    return env.Undefined();
}

} // namespace FuseNative

namespace fuse_native {

/**
 * Free function wrappers for N-API binding
 */

Napi::Value CopyFileRange(const Napi::CallbackInfo& info) {
    return FuseNative::CopyFileRange::CreateCopyFileRange(info);
}

Napi::Value SetCopyChunkSize(const Napi::CallbackInfo& info) {
    return FuseNative::CopyFileRange::SetChunkSize(info);
}

Napi::Value GetCopyChunkSize(const Napi::CallbackInfo& info) {
    return FuseNative::CopyFileRange::GetChunkSize(info);
}

Napi::Value GetCopyStats(const Napi::CallbackInfo& info) {
    return FuseNative::CopyFileRange::GetStats(info);
}

Napi::Value ResetCopyStats(const Napi::CallbackInfo& info) {
    return FuseNative::CopyFileRange::ResetStats(info);
}

} // namespace fuse_native