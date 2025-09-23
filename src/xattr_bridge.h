#ifndef FUSE_NATIVE_XATTR_BRIDGE_H
#define FUSE_NATIVE_XATTR_BRIDGE_H

#include <napi.h>
#include <string>
#include <vector>

namespace fuse_native {

/**
 * Extended attributes (xattr) bridge for FUSE operations.
 * 
 * Provides unified API with platform-specific handling:
 * - macOS: Forces position=0 in C layer
 * - Linux: Direct xattr operations
 * - Size queries: Optional size probing for getxattr/listxattr
 */

/**
 * Get extended attribute value
 * 
 * @param path File path
 * @param name Attribute name
 * @param buffer Optional buffer for value (null for size query)
 * @param size Buffer size (0 for size query)
 * @return Actual size needed or error code
 */
Napi::Value GetXAttr(const Napi::CallbackInfo& info);

/**
 * Set extended attribute value
 * 
 * @param path File path  
 * @param name Attribute name
 * @param value Attribute value
 * @param size Value size
 * @param flags Creation flags (XATTR_CREATE, XATTR_REPLACE)
 * @return Success/error code
 */
Napi::Value SetXAttr(const Napi::CallbackInfo& info);

/**
 * List extended attribute names
 * 
 * @param path File path
 * @param buffer Optional buffer for names (null for size query)
 * @param size Buffer size (0 for size query)
 * @return Actual size needed or error code
 */
Napi::Value ListXAttr(const Napi::CallbackInfo& info);

/**
 * Remove extended attribute
 * 
 * @param path File path
 * @param name Attribute name
 * @return Success/error code
 */
Napi::Value RemoveXAttr(const Napi::CallbackInfo& info);

// Internal helpers

/**
 * Platform-specific getxattr implementation
 * Handles macOS position parameter internally
 */
int platform_getxattr(const char* path, const char* name, void* value, size_t size);

/**
 * Platform-specific setxattr implementation
 * Handles macOS position parameter internally
 */
int platform_setxattr(const char* path, const char* name, const void* value, size_t size, int flags);

/**
 * Platform-specific listxattr implementation
 */
int platform_listxattr(const char* path, char* list, size_t size);

/**
 * Platform-specific removexattr implementation
 */
int platform_removexattr(const char* path, const char* name);

/**
 * Parse attribute names from null-separated list
 * 
 * @param buffer Null-separated names
 * @param size Buffer size
 * @return Vector of attribute names
 */
std::vector<std::string> ParseAttributeList(const char* buffer, size_t size);

/**
 * Validate attribute name
 * 
 * @param name Attribute name
 * @return true if valid
 */
bool IsValidAttributeName(const std::string& name);

/**
 * Convert xattr flags to platform-specific flags
 * 
 * @param flags Generic flags
 * @return Platform-specific flags
 */
int ConvertXAttrFlags(int flags);

// ENOATTR definition for cross-platform compatibility
#ifndef ENOATTR
#ifdef ENODATA
#define ENOATTR ENODATA
#else
#define ENOATTR 93
#endif
#endif

} // namespace fuse_native

#endif // FUSE_NATIVE_XATTR_BRIDGE_H