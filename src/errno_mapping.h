/**
 * @file errno_mapping.h
 * @brief Errno mapping utilities header for FUSE operations
 * 
 * This header defines utilities for mapping between POSIX errno codes
 * and FUSE operation results, ensuring consistent error handling.
 */

#ifndef ERRNO_MAPPING_H
#define ERRNO_MAPPING_H

#include <string>

namespace fuse_native {

/**
 * Convert errno to string representation
 * @param err errno value
 * @return String representation of errno (e.g., "ENOENT")
 */
std::string errno_to_string(int err);

/**
 * Convert errno to human-readable message
 * @param err errno value
 * @return Human-readable error message
 */
std::string errno_to_message(int err);

/**
 * Check if errno is a valid POSIX error code
 * @param err errno value
 * @return true if valid errno
 */
bool is_valid_errno(int err);

/**
 * Convert string to errno (reverse lookup)
 * @param err_str Error string (e.g., "ENOENT")
 * @return errno value, or 0 if unknown
 */
int string_to_errno(const std::string& err_str);

/**
 * Normalize errno for FUSE (ensure negative values)
 * @param err errno value
 * @return Normalized errno (negative for errors, 0 for success)
 */
int normalize_fuse_errno(int err);

/**
 * Get the current system errno
 * @return Current errno value
 */
int get_current_errno();

/**
 * Clear the current system errno
 */
void clear_errno();

/**
 * Set the system errno
 * @param err errno value to set
 */
void set_errno(int err);

/**
 * Check if errno indicates a temporary failure
 * @param err errno value
 * @return true if error is temporary (should retry)
 */
bool is_temporary_error(int err);

/**
 * Check if errno indicates a permission error
 * @param err errno value
 * @return true if error is permission-related
 */
bool is_permission_error(int err);

/**
 * Check if errno indicates a file not found error
 * @param err errno value
 * @return true if error indicates file/directory not found
 */
bool is_not_found_error(int err);

/**
 * Check if errno indicates a file system error
 * @param err errno value
 * @return true if error is filesystem-related
 */
bool is_filesystem_error(int err);

} // namespace fuse_native

#endif // ERRNO_MAPPING_H