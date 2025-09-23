/**
 * @file errno_mapping.cc
 * @brief Errno mapping utilities for FUSE operations
 * 
 * This file implements utilities for mapping between POSIX errno codes
 * and FUSE operation results, ensuring consistent error handling.
 */

#include "errno_mapping.h"
#include <errno.h>
#include <string>
#include <unordered_map>

namespace fuse_native {

/**
 * Map of errno codes to their string representations
 */
static const std::unordered_map<int, std::string> errno_to_string_map = {
    {EPERM, "EPERM"},
    {ENOENT, "ENOENT"},
    {ESRCH, "ESRCH"},
    {EINTR, "EINTR"},
    {EIO, "EIO"},
    {ENXIO, "ENXIO"},
    {E2BIG, "E2BIG"},
    {ENOEXEC, "ENOEXEC"},
    {EBADF, "EBADF"},
    {ECHILD, "ECHILD"},
    {EAGAIN, "EAGAIN"},
    {ENOMEM, "ENOMEM"},
    {EACCES, "EACCES"},
    {EFAULT, "EFAULT"},
    {ENOTBLK, "ENOTBLK"},
    {EBUSY, "EBUSY"},
    {EEXIST, "EEXIST"},
    {EXDEV, "EXDEV"},
    {ENODEV, "ENODEV"},
    {ENOTDIR, "ENOTDIR"},
    {EISDIR, "EISDIR"},
    {EINVAL, "EINVAL"},
    {ENFILE, "ENFILE"},
    {EMFILE, "EMFILE"},
    {ENOTTY, "ENOTTY"},
    {ETXTBSY, "ETXTBSY"},
    {EFBIG, "EFBIG"},
    {ENOSPC, "ENOSPC"},
    {ESPIPE, "ESPIPE"},
    {EROFS, "EROFS"},
    {EMLINK, "EMLINK"},
    {EPIPE, "EPIPE"},
    {EDOM, "EDOM"},
    {ERANGE, "ERANGE"},
    {EDEADLK, "EDEADLK"},
    {ENAMETOOLONG, "ENAMETOOLONG"},
    {ENOLCK, "ENOLCK"},
    {ENOSYS, "ENOSYS"},
    {ENOTEMPTY, "ENOTEMPTY"},
    {ELOOP, "ELOOP"},
    {ENOMSG, "ENOMSG"},
    {EIDRM, "EIDRM"},
#ifdef ENOTSUP
    {ENOTSUP, "ENOTSUP"},
#endif
    {ETIMEDOUT, "ETIMEDOUT"}
};

/**
 * Map of errno codes to human-readable messages
 */
static const std::unordered_map<int, std::string> errno_to_message_map = {
    {EPERM, "Operation not permitted"},
    {ENOENT, "No such file or directory"},
    {ESRCH, "No such process"},
    {EINTR, "Interrupted system call"},
    {EIO, "Input/output error"},
    {ENXIO, "No such device or address"},
    {E2BIG, "Argument list too long"},
    {ENOEXEC, "Exec format error"},
    {EBADF, "Bad file descriptor"},
    {ECHILD, "No child processes"},
    {EAGAIN, "Resource temporarily unavailable"},
    {ENOMEM, "Cannot allocate memory"},
    {EACCES, "Permission denied"},
    {EFAULT, "Bad address"},
    {ENOTBLK, "Block device required"},
    {EBUSY, "Device or resource busy"},
    {EEXIST, "File exists"},
    {EXDEV, "Invalid cross-device link"},
    {ENODEV, "No such device"},
    {ENOTDIR, "Not a directory"},
    {EISDIR, "Is a directory"},
    {EINVAL, "Invalid argument"},
    {ENFILE, "Too many open files in system"},
    {EMFILE, "Too many open files"},
    {ENOTTY, "Inappropriate ioctl for device"},
    {ETXTBSY, "Text file busy"},
    {EFBIG, "File too large"},
    {ENOSPC, "No space left on device"},
    {ESPIPE, "Illegal seek"},
    {EROFS, "Read-only file system"},
    {EMLINK, "Too many links"},
    {EPIPE, "Broken pipe"},
    {EDOM, "Numerical argument out of domain"},
    {ERANGE, "Numerical result out of range"},
    {EDEADLK, "Resource deadlock avoided"},
    {ENAMETOOLONG, "File name too long"},
    {ENOLCK, "No locks available"},
    {ENOSYS, "Function not implemented"},
    {ENOTEMPTY, "Directory not empty"},
    {ELOOP, "Too many levels of symbolic links"},
    {ENOMSG, "No message of desired type"},
    {EIDRM, "Identifier removed"},
#ifdef ENOTSUP
    {ENOTSUP, "Operation not supported"},
#endif
    {ETIMEDOUT, "Connection timed out"}
};

/**
 * Convert errno to string representation
 */
std::string errno_to_string(int err) {
    auto it = errno_to_string_map.find(err);
    if (it != errno_to_string_map.end()) {
        return it->second;
    }
    return "UNKNOWN";
}

/**
 * Convert errno to human-readable message
 */
std::string errno_to_message(int err) {
    auto it = errno_to_message_map.find(err);
    if (it != errno_to_message_map.end()) {
        return it->second;
    }
    return "Unknown error";
}

/**
 * Check if errno is a valid POSIX error code
 */
bool is_valid_errno(int err) {
    return errno_to_string_map.find(err) != errno_to_string_map.end();
}

/**
 * Convert string to errno (reverse lookup)
 */
int string_to_errno(const std::string& err_str) {
    for (const auto& pair : errno_to_string_map) {
        if (pair.second == err_str) {
            return pair.first;
        }
    }
    return 0; // Unknown
}

/**
 * Normalize errno for FUSE (ensure negative values)
 */
int normalize_fuse_errno(int err) {
    if (err == 0) {
        return 0; // Success
    }
    return (err > 0) ? -err : err;
}

/**
 * Get the current system errno
 */
int get_current_errno() {
    return errno;
}

/**
 * Clear the current system errno
 */
void clear_errno() {
    errno = 0;
}

/**
 * Set the system errno
 */
void set_errno(int err) {
    errno = err;
}

/**
 * Check if errno indicates a temporary failure
 */
bool is_temporary_error(int err) {
    switch (err) {
        case EAGAIN:
#if EWOULDBLOCK != EAGAIN
        case EWOULDBLOCK:
#endif
        case EINTR:
        case ETIMEDOUT:
            return true;
        default:
            return false;
    }
}

/**
 * Check if errno indicates a permission error
 */
bool is_permission_error(int err) {
    switch (err) {
        case EACCES:
        case EPERM:
            return true;
        default:
            return false;
    }
}

/**
 * Check if errno indicates a file not found error
 */
bool is_not_found_error(int err) {
    switch (err) {
        case ENOENT:
        case ENOTDIR:
            return true;
        default:
            return false;
    }
}

/**
 * Check if errno indicates a file system error
 */
bool is_filesystem_error(int err) {
    switch (err) {
        case EIO:
        case EROFS:
        case ENOSPC:
        case ENFILE:
        case EMFILE:
            return true;
        default:
            return false;
    }
}

} // namespace fuse_native