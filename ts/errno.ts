/**
 * @file errno.ts
 * @brief Errno utilities and JavaScript wrapper for POSIX error codes
 *
 * This module provides convenient JavaScript access to errno functionality,
 * including lookups, validation, and FUSE-specific error handling.
 */

import { FuseErrno, ERRNO_CODES, ERRNO_MESSAGES } from './errors.ts';

// =============================================================================
// Core Errno Functions
// =============================================================================

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
export function errno(name: string): number {
  // Find errno by searching through ERRNO_CODES
  for (const [code, codeName] of Object.entries(ERRNO_CODES)) {
    if (codeName === name.toUpperCase()) {
      return parseInt(code);
    }
  }
  return 0; // Unknown errno
}

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
export function errname(code: number): string {
  return ERRNO_CODES[code] || 'UNKNOWN';
}

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
export function errmsg(code: number | string): string {
  const errCode = typeof code === 'string' ? errno(code) : code;
  return ERRNO_MESSAGES[errCode] || 'Unknown error';
}

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
export function isValidErrno(code: number): boolean {
  return code === 0 || code in ERRNO_CODES;
}

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
export function normalizeErrno(code: number): number {
  if (code === 0) return 0; // Success
  return code > 0 ? -code : code; // Make negative if positive
}

// =============================================================================
// Error Classification Functions
// =============================================================================

/**
 * Check if errno indicates a permission error
 * @param code Errno code or error name
 * @returns True if permission-related error
 */
export function isPermissionError(code: number | string): boolean {
  const errCode = typeof code === 'string' ? errno(code) : code;
  return errCode === -1 || errCode === -13; // EPERM or EACCES
}

/**
 * Check if errno indicates a file not found error
 * @param code Errno code or error name
 * @returns True if file/directory not found
 */
export function isNotFoundError(code: number | string): boolean {
  const errCode = typeof code === 'string' ? errno(code) : code;
  return errCode === -2 || errCode === -20; // ENOENT or ENOTDIR
}

/**
 * Check if errno indicates a file exists error
 * @param code Errno code or error name
 * @returns True if file already exists
 */
export function isExistsError(code: number | string): boolean {
  const errCode = typeof code === 'string' ? errno(code) : code;
  return errCode === -17; // EEXIST
}

/**
 * Check if errno indicates a temporary/retry error
 * @param code Errno code or error name
 * @returns True if error is temporary (should retry)
 */
export function isTemporaryError(code: number | string): boolean {
  const errCode = typeof code === 'string' ? errno(code) : code;
  return errCode === -11 || errCode === -4; // EAGAIN or EINTR
}

/**
 * Check if errno indicates an I/O error
 * @param code Errno code or error name
 * @returns True if I/O related error
 */
export function isIOError(code: number | string): boolean {
  const errCode = typeof code === 'string' ? errno(code) : code;
  return errCode === -5 || errCode === -28 || errCode === -122; // EIO, ENOSPC, EDQUOT
}

/**
 * Check if errno indicates invalid argument
 * @param code Errno code or error name
 * @returns True if invalid argument error
 */
export function isInvalidError(code: number | string): boolean {
  const errCode = typeof code === 'string' ? errno(code) : code;
  return errCode === -22; // EINVAL
}

// =============================================================================
// FUSE-Specific Error Helpers
// =============================================================================

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
export function createFuseError(
  code: number | string,
  message?: string,
  syscall?: string,
  path?: string
): FuseErrno {
  return new FuseErrno(code, message, syscall, path);
}

/**
 * Common FUSE error creators for convenience
 */
export const createENoent = (path?: string): FuseErrno =>
  createFuseError('ENOENT', undefined, undefined, path);

export const createEAcces = (path?: string): FuseErrno =>
  createFuseError('EACCES', undefined, undefined, path);

export const createEExist = (path?: string): FuseErrno =>
  createFuseError('EEXIST', undefined, undefined, path);

export const createEIsDir = (path?: string): FuseErrno =>
  createFuseError('EISDIR', undefined, undefined, path);

export const createENotDir = (path?: string): FuseErrno =>
  createFuseError('ENOTDIR', undefined, undefined, path);

export const createEInval = (message?: string): FuseErrno =>
  createFuseError('EINVAL', message);

export const createEIO = (message?: string): FuseErrno =>
  createFuseError('EIO', message);

export const createENoSpc = (): FuseErrno =>
  createFuseError('ENOSPC');

export const createENotEmpty = (path?: string): FuseErrno =>
  createFuseError('ENOTEMPTY', undefined, undefined, path);

// =============================================================================
// Error Mapping for FUSE Operations
// =============================================================================

/**
 * Map of FUSE operations to common errno codes they may return
 */
export const OPERATION_ERRORS = {
  lookup: ['ENOENT', 'EACCES', 'ENOTDIR', 'ENAMETOOLONG', 'EIO'],
  getattr: ['ENOENT', 'EACCES', 'EIO'],
  setattr: ['ENOENT', 'EACCES', 'EPERM', 'EROFS', 'EIO'],
  read: ['ENOENT', 'EACCES', 'EISDIR', 'EIO'],
  write: ['ENOENT', 'EACCES', 'EPERM', 'EROFS', 'ENOSPC', 'EISDIR', 'EIO'],
  open: ['ENOENT', 'EACCES', 'EISDIR', 'EMFILE', 'ENFILE', 'EIO'],
  release: ['EIO'],
  create: ['EEXIST', 'EACCES', 'ENOTDIR', 'EROFS', 'ENOSPC', 'ENAMETOOLONG', 'EIO'],
  mkdir: ['EEXIST', 'EACCES', 'ENOTDIR', 'EROFS', 'ENOSPC', 'ENAMETOOLONG', 'EIO'],
  unlink: ['ENOENT', 'EACCES', 'EPERM', 'EROFS', 'EISDIR', 'EIO'],
  rmdir: ['ENOENT', 'EACCES', 'EPERM', 'EROFS', 'ENOTDIR', 'ENOTEMPTY', 'EIO'],
  rename: ['ENOENT', 'EACCES', 'EPERM', 'EROFS', 'EXDEV', 'EISDIR', 'ENOTDIR', 'ENOTEMPTY', 'EIO'],
  readdir: ['ENOENT', 'EACCES', 'ENOTDIR', 'EIO'],
  statfs: ['EACCES', 'EIO'],
  flush: ['EIO'],
  fsync: ['EIO'],
} as const;

/**
 * Get possible errno codes for a FUSE operation
 * @param operation FUSE operation name
 * @returns Array of possible error codes for the operation
 */
export function getOperationErrors(operation: keyof typeof OPERATION_ERRORS): readonly string[] {
  return OPERATION_ERRORS[operation] || [];
}

/**
 * Check if an errno is valid for a specific FUSE operation
 * @param operation FUSE operation name
 * @param code Errno code or name
 * @returns True if errno is expected for the operation
 */
export function isValidOperationError(
  operation: keyof typeof OPERATION_ERRORS,
  code: number | string
): boolean {
  const errName = typeof code === 'string' ? code : errname(code);
  const validErrors = getOperationErrors(operation);
  return validErrors.includes(errName);
}

// =============================================================================
// Errno Constants Export
// =============================================================================

/**
 * Common errno constants for direct use
 */
export const ERRNO = {
  // Success
  OK: 0,

  // Common file system errors
  EPERM: errno('EPERM'),         // -1: Operation not permitted
  ENOENT: errno('ENOENT'),       // -2: No such file or directory
  EIO: errno('EIO'),             // -5: I/O error
  EBADF: errno('EBADF'),         // -9: Bad file descriptor
  EAGAIN: errno('EAGAIN'),       // -11: Try again
  ENOMEM: errno('ENOMEM'),       // -12: Out of memory
  EACCES: errno('EACCES'),       // -13: Permission denied
  EBUSY: errno('EBUSY'),         // -16: Device or resource busy
  EEXIST: errno('EEXIST'),       // -17: File exists
  ENODEV: errno('ENODEV'),       // -19: No such device
  ENOTDIR: errno('ENOTDIR'),     // -20: Not a directory
  EISDIR: errno('EISDIR'),       // -21: Is a directory
  EINVAL: errno('EINVAL'),       // -22: Invalid argument
  EMFILE: errno('EMFILE'),       // -24: Too many open files
  EFBIG: errno('EFBIG'),         // -27: File too large
  ENOSPC: errno('ENOSPC'),       // -28: No space left on device
  EROFS: errno('EROFS'),         // -30: Read-only file system
  ENAMETOOLONG: errno('ENAMETOOLONG'), // -36: File name too long
  ENOSYS: errno('ENOSYS'),       // -38: Function not implemented
  ENOTEMPTY: errno('ENOTEMPTY'), // -39: Directory not empty
  ELOOP: errno('ELOOP'),         // -40: Too many symbolic links
} as const;

// =============================================================================
// Default Export
// =============================================================================

export default {
  // Core functions
  errno,
  errname,
  errmsg,
  isValidErrno,
  normalizeErrno,

  // Error classification
  isPermissionError,
  isNotFoundError,
  isExistsError,
  isTemporaryError,
  isIOError,
  isInvalidError,

  // FUSE error creators
  createFuseError,
  createENoent,
  createEAcces,
  createEExist,
  createEIsDir,
  createENotDir,
  createEInval,
  createEIO,
  createENoSpc,
  createENotEmpty,

  // Operation error mapping
  OPERATION_ERRORS,
  getOperationErrors,
  isValidOperationError,

  // Constants
  ERRNO,
};
