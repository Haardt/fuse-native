/**
 * @file errno.ts
 * @brief Errno utilities and JavaScript wrapper for POSIX error codes
 *
 * This module provides convenient JavaScript access to errno functionality,
 * including lookups, validation, and FUSE-specific error handling.
 */
import { FuseErrno } from './errors.js';
/**
 * Get errno code from error name
 * @param name Error name (e.g., 'ENOENT', 'EACCES')
 * @returns Negative errno code or 0 if unknown
 *
 * @example
 * ```typescript
 * errno('ENOENT')  // -2
 * errno('EACCES')  // -13
 * errno('UNKNOWN') // 0
 * ```
 */
export declare function errno(name: string): number;
/**
 * Get error name from errno code
 * @param code Errno code (negative number)
 * @returns Error name or 'UNKNOWN'
 *
 * @example
 * ```typescript
 * errname(-2)  // 'ENOENT'
 * errname(-13) // 'EACCES'
 * errname(-999) // 'UNKNOWN'
 * ```
 */
export declare function errname(code: number): string;
/**
 * Get human-readable error message
 * @param code Errno code (negative number) or error name
 * @returns Human-readable error message
 *
 * @example
 * ```typescript
 * errmsg(-2)        // 'No such file or directory'
 * errmsg('ENOENT')  // 'No such file or directory'
 * errmsg(-999)      // 'Unknown error'
 * ```
 */
export declare function errmsg(code: number | string): string;
/**
 * Check if errno code is valid
 * @param code Errno code to validate
 * @returns True if valid errno code
 *
 * @example
 * ```typescript
 * isValidErrno(-2)   // true (ENOENT)
 * isValidErrno(-999) // false
 * isValidErrno(0)    // true (success)
 * isValidErrno(1)    // false (positive errors not allowed)
 * ```
 */
export declare function isValidErrno(code: number): boolean;
/**
 * Normalize errno for FUSE (ensure negative values for errors)
 * @param code Input errno code
 * @returns Normalized errno (negative for errors, 0 for success)
 *
 * @example
 * ```typescript
 * normalizeErrno(0)   // 0
 * normalizeErrno(2)   // -2 (ENOENT)
 * normalizeErrno(-2)  // -2 (already negative)
 * ```
 */
export declare function normalizeErrno(code: number): number;
/**
 * Check if errno indicates a permission error
 * @param code Errno code or error name
 * @returns True if permission-related error
 */
export declare function isPermissionError(code: number | string): boolean;
/**
 * Check if errno indicates a file not found error
 * @param code Errno code or error name
 * @returns True if file/directory not found
 */
export declare function isNotFoundError(code: number | string): boolean;
/**
 * Check if errno indicates a file exists error
 * @param code Errno code or error name
 * @returns True if file already exists
 */
export declare function isExistsError(code: number | string): boolean;
/**
 * Check if errno indicates a temporary/retry error
 * @param code Errno code or error name
 * @returns True if error is temporary (should retry)
 */
export declare function isTemporaryError(code: number | string): boolean;
/**
 * Check if errno indicates an I/O error
 * @param code Errno code or error name
 * @returns True if I/O related error
 */
export declare function isIOError(code: number | string): boolean;
/**
 * Check if errno indicates invalid argument
 * @param code Errno code or error name
 * @returns True if invalid argument error
 */
export declare function isInvalidError(code: number | string): boolean;
/**
 * Create FuseErrno from errno code or name
 * @param code Errno code or error name
 * @param message Optional custom message
 * @param syscall Optional syscall name
 * @param path Optional file path
 * @returns FuseErrno instance
 *
 * @example
 * ```typescript
 * createFuseError(-2)                    // ENOENT
 * createFuseError('EACCES')              // EACCES
 * createFuseError('ENOENT', 'Custom msg', 'open', '/path/to/file')
 * ```
 */
export declare function createFuseError(code: number | string, message?: string, syscall?: string, path?: string): FuseErrno;
/**
 * Common FUSE error creators for convenience
 */
export declare const createENoent: (path?: string) => FuseErrno;
export declare const createEAcces: (path?: string) => FuseErrno;
export declare const createEExist: (path?: string) => FuseErrno;
export declare const createEIsDir: (path?: string) => FuseErrno;
export declare const createENotDir: (path?: string) => FuseErrno;
export declare const createEInval: (message?: string) => FuseErrno;
export declare const createEIO: (message?: string) => FuseErrno;
export declare const createENoSpc: () => FuseErrno;
export declare const createENotEmpty: (path?: string) => FuseErrno;
/**
 * Map of FUSE operations to common errno codes they may return
 */
export declare const OPERATION_ERRORS: {
    readonly lookup: readonly ["ENOENT", "EACCES", "ENOTDIR", "ENAMETOOLONG", "EIO"];
    readonly getattr: readonly ["ENOENT", "EACCES", "EIO"];
    readonly setattr: readonly ["ENOENT", "EACCES", "EPERM", "EROFS", "EIO"];
    readonly read: readonly ["ENOENT", "EACCES", "EISDIR", "EIO"];
    readonly write: readonly ["ENOENT", "EACCES", "EPERM", "EROFS", "ENOSPC", "EISDIR", "EIO"];
    readonly open: readonly ["ENOENT", "EACCES", "EISDIR", "EMFILE", "ENFILE", "EIO"];
    readonly release: readonly ["EIO"];
    readonly create: readonly ["EEXIST", "EACCES", "ENOTDIR", "EROFS", "ENOSPC", "ENAMETOOLONG", "EIO"];
    readonly mkdir: readonly ["EEXIST", "EACCES", "ENOTDIR", "EROFS", "ENOSPC", "ENAMETOOLONG", "EIO"];
    readonly unlink: readonly ["ENOENT", "EACCES", "EPERM", "EROFS", "EISDIR", "EIO"];
    readonly rmdir: readonly ["ENOENT", "EACCES", "EPERM", "EROFS", "ENOTDIR", "ENOTEMPTY", "EIO"];
    readonly rename: readonly ["ENOENT", "EACCES", "EPERM", "EROFS", "EXDEV", "EISDIR", "ENOTDIR", "ENOTEMPTY", "EIO"];
    readonly readdir: readonly ["ENOENT", "EACCES", "ENOTDIR", "EIO"];
    readonly statfs: readonly ["EACCES", "EIO"];
    readonly flush: readonly ["EIO"];
    readonly fsync: readonly ["EIO"];
};
/**
 * Get possible errno codes for a FUSE operation
 * @param operation FUSE operation name
 * @returns Array of possible error codes for the operation
 */
export declare function getOperationErrors(operation: keyof typeof OPERATION_ERRORS): readonly string[];
/**
 * Check if an errno is valid for a specific FUSE operation
 * @param operation FUSE operation name
 * @param code Errno code or name
 * @returns True if errno is expected for the operation
 */
export declare function isValidOperationError(operation: keyof typeof OPERATION_ERRORS, code: number | string): boolean;
/**
 * Common errno constants for direct use
 */
export declare const ERRNO: {
    readonly OK: 0;
    readonly EPERM: number;
    readonly ENOENT: number;
    readonly EIO: number;
    readonly EBADF: number;
    readonly EAGAIN: number;
    readonly ENOMEM: number;
    readonly EACCES: number;
    readonly EBUSY: number;
    readonly EEXIST: number;
    readonly ENODEV: number;
    readonly ENOTDIR: number;
    readonly EISDIR: number;
    readonly EINVAL: number;
    readonly EMFILE: number;
    readonly EFBIG: number;
    readonly ENOSPC: number;
    readonly EROFS: number;
    readonly ENAMETOOLONG: number;
    readonly ENOSYS: number;
    readonly ENOTEMPTY: number;
    readonly ELOOP: number;
};
declare const _default: {
    errno: typeof errno;
    errname: typeof errname;
    errmsg: typeof errmsg;
    isValidErrno: typeof isValidErrno;
    normalizeErrno: typeof normalizeErrno;
    isPermissionError: typeof isPermissionError;
    isNotFoundError: typeof isNotFoundError;
    isExistsError: typeof isExistsError;
    isTemporaryError: typeof isTemporaryError;
    isIOError: typeof isIOError;
    isInvalidError: typeof isInvalidError;
    createFuseError: typeof createFuseError;
    createENoent: (path?: string) => FuseErrno;
    createEAcces: (path?: string) => FuseErrno;
    createEExist: (path?: string) => FuseErrno;
    createEIsDir: (path?: string) => FuseErrno;
    createENotDir: (path?: string) => FuseErrno;
    createEInval: (message?: string) => FuseErrno;
    createEIO: (message?: string) => FuseErrno;
    createENoSpc: () => FuseErrno;
    createENotEmpty: (path?: string) => FuseErrno;
    OPERATION_ERRORS: {
        readonly lookup: readonly ["ENOENT", "EACCES", "ENOTDIR", "ENAMETOOLONG", "EIO"];
        readonly getattr: readonly ["ENOENT", "EACCES", "EIO"];
        readonly setattr: readonly ["ENOENT", "EACCES", "EPERM", "EROFS", "EIO"];
        readonly read: readonly ["ENOENT", "EACCES", "EISDIR", "EIO"];
        readonly write: readonly ["ENOENT", "EACCES", "EPERM", "EROFS", "ENOSPC", "EISDIR", "EIO"];
        readonly open: readonly ["ENOENT", "EACCES", "EISDIR", "EMFILE", "ENFILE", "EIO"];
        readonly release: readonly ["EIO"];
        readonly create: readonly ["EEXIST", "EACCES", "ENOTDIR", "EROFS", "ENOSPC", "ENAMETOOLONG", "EIO"];
        readonly mkdir: readonly ["EEXIST", "EACCES", "ENOTDIR", "EROFS", "ENOSPC", "ENAMETOOLONG", "EIO"];
        readonly unlink: readonly ["ENOENT", "EACCES", "EPERM", "EROFS", "EISDIR", "EIO"];
        readonly rmdir: readonly ["ENOENT", "EACCES", "EPERM", "EROFS", "ENOTDIR", "ENOTEMPTY", "EIO"];
        readonly rename: readonly ["ENOENT", "EACCES", "EPERM", "EROFS", "EXDEV", "EISDIR", "ENOTDIR", "ENOTEMPTY", "EIO"];
        readonly readdir: readonly ["ENOENT", "EACCES", "ENOTDIR", "EIO"];
        readonly statfs: readonly ["EACCES", "EIO"];
        readonly flush: readonly ["EIO"];
        readonly fsync: readonly ["EIO"];
    };
    getOperationErrors: typeof getOperationErrors;
    isValidOperationError: typeof isValidOperationError;
    ERRNO: {
        readonly OK: 0;
        readonly EPERM: number;
        readonly ENOENT: number;
        readonly EIO: number;
        readonly EBADF: number;
        readonly EAGAIN: number;
        readonly ENOMEM: number;
        readonly EACCES: number;
        readonly EBUSY: number;
        readonly EEXIST: number;
        readonly ENODEV: number;
        readonly ENOTDIR: number;
        readonly EISDIR: number;
        readonly EINVAL: number;
        readonly EMFILE: number;
        readonly EFBIG: number;
        readonly ENOSPC: number;
        readonly EROFS: number;
        readonly ENAMETOOLONG: number;
        readonly ENOSYS: number;
        readonly ENOTEMPTY: number;
        readonly ELOOP: number;
    };
};
export default _default;
//# sourceMappingURL=errno.d.ts.map