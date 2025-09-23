/**
 * @file index.ts
 * @brief Main TypeScript API entry point for FUSE3 Node.js binding
 *
 * This module provides the modern ESM API with Promise-based operations,
 * BigInt support for 64-bit values, and strict TypeScript types.
 */
let binding;
try {
    // Try to load prebuilt binary first
    binding = require('../prebuilds/linux-x64/@cocalc+fuse-native.node');
}
catch {
    try {
        // Fallback to compiled binary
        binding = require('../build/Release/fuse-native.node');
    }
    catch {
        // Final fallback to Debug build
        binding = require('../build/Debug/fuse-native.node');
    }
}
// Re-export types
export * from './types.js';
export * from './errors.js';
export { S_IFMT, S_IFREG, S_IFDIR, S_IFLNK, S_IFBLK, S_IFCHR, S_IFIFO, S_IFSOCK, } from './constants.js';
export * from './operations.js';
export * from './session.js';
export * from './helpers.js';
export * from './time.js';
export { errno as getErrno, errname, errmsg, isValidErrno, normalizeErrno, isPermissionError, isNotFoundError, isExistsError, isTemporaryError, isIOError, isInvalidError, createFuseError as createErrnoError, createENoent, createENotEmpty, OPERATION_ERRORS, getOperationErrors, isValidOperationError, ERRNO, } from './errno.js';
import { createFuseSession } from './session.js';
/**
 * Get version information
 */
export function getVersion() {
    return binding.getVersion();
}
/**
 * Create a new FUSE session
 * @param mountpoint - Directory to mount the filesystem
 * @param operations - FUSE operation handlers
 * @param options - Optional session configuration
 */
export function createSession(mountpoint, operations, options = {}) {
    return createFuseSession(mountpoint, operations, options, binding);
}
/**
 * Check if the current process has the required capabilities for FUSE
 */
export function checkCapabilities() {
    // TODO: Implement capability checking
    return Promise.resolve(true);
}
/**
 * Get available mount options for the current system
 */
export function getMountOptions() {
    // TODO: Implement mount options detection
    return [
        'allow_other',
        'allow_root',
        'auto_unmount',
        'default_permissions',
        'dev',
        'nodev',
        'suid',
        'nosuid',
        'ro',
        'rw',
        'exec',
        'noexec',
        'sync',
        'async',
    ];
}
/**
 * Copy data between file descriptors using copy_file_range
 *
 * @param fdIn - Source file descriptor
 * @param offsetIn - Source offset (null to use current position)
 * @param fdOut - Destination file descriptor
 * @param offsetOut - Destination offset (null to use current position)
 * @param length - Number of bytes to copy
 * @param flags - Optional copy flags
 * @returns Promise resolving to number of bytes copied
 */
export async function copyFileRange(fdIn, offsetIn, fdOut, offsetOut, length, flags = 0) {
    return new Promise((resolve, reject) => {
        try {
            const offsetInValue = offsetIn === null ? 0xffffffffffffffffn : offsetIn;
            const offsetOutValue = offsetOut === null ? 0xffffffffffffffffn : offsetOut;
            const result = binding.copyFileRange(fdIn, offsetInValue, fdOut, offsetOutValue, length, flags);
            resolve(result);
        }
        catch (error) {
            reject(error);
        }
    });
}
/**
 * Set chunk size for copy_file_range fallback operations
 *
 * @param chunkSize - Size of chunks for read/write fallback operations
 */
export function setCopyChunkSize(chunkSize) {
    binding.setCopyChunkSize(chunkSize);
}
/**
 * Get current chunk size for copy_file_range fallback operations
 *
 * @returns Current chunk size in bytes
 */
export function getCopyChunkSize() {
    return binding.getCopyChunkSize();
}
/**
 * Get copy_file_range operation statistics
 *
 * @returns Statistics object with operation counts and performance data
 */
export function getCopyStats() {
    return binding.getCopyStats();
}
/**
 * Reset copy_file_range operation statistics
 */
export function resetCopyStats() {
    binding.resetCopyStats();
}
/**
 * Check if a directory is currently mounted as a FUSE filesystem
 */
export async function isMounted(_path) {
    // TODO: Implement mount status checking
    return Promise.resolve(false);
}
/**
 * List all currently mounted FUSE filesystems
 */
export async function listMounts() {
    // TODO: Implement mount listing
    return Promise.resolve([]);
}
// Re-export native constants
export const errno = binding.errno;
export const mode = binding.mode;
export const flags = binding.flags;
// Default export
const fuseNative = {
    createSession,
    getVersion,
    checkCapabilities,
    getMountOptions,
    isMounted,
    listMounts,
    copyFileRange,
    setCopyChunkSize,
    getCopyChunkSize,
    getCopyStats,
    resetCopyStats,
    errno,
    mode,
    flags,
};
export default fuseNative;
//# sourceMappingURL=index.js.map