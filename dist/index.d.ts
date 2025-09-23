/**
 * @file index.ts
 * @brief Main TypeScript API entry point for FUSE3 Node.js binding
 *
 * This module provides the modern ESM API with Promise-based operations,
 * BigInt support for 64-bit values, and strict TypeScript types.
 */
export * from './types.js';
export * from './errors.js';
export { S_IFMT, S_IFREG, S_IFDIR, S_IFLNK, S_IFBLK, S_IFCHR, S_IFIFO, S_IFSOCK, } from './constants.js';
export * from './operations.js';
export * from './session.js';
export * from './helpers.js';
export * from './time.js';
export { errno as getErrno, errname, errmsg, isValidErrno, normalizeErrno, isPermissionError, isNotFoundError, isExistsError, isTemporaryError, isIOError, isInvalidError, createFuseError as createErrnoError, createENoent, createENotEmpty, OPERATION_ERRORS, getOperationErrors, isValidOperationError, ERRNO, } from './errno.js';
import type { FuseSession, FuseSessionOptions, FuseOperationHandlers } from './types.js';
/**
 * FUSE version information
 */
export interface VersionInfo {
    /** FUSE library version */
    fuse: string;
    /** Binding version */
    binding: string;
    /** N-API version */
    napi: string;
}
/**
 * Get version information
 */
export declare function getVersion(): VersionInfo;
/**
 * Create a new FUSE session
 * @param mountpoint - Directory to mount the filesystem
 * @param operations - FUSE operation handlers
 * @param options - Optional session configuration
 */
export declare function createSession(mountpoint: string, operations: FuseOperationHandlers, options?: FuseSessionOptions): FuseSession;
/**
 * Check if the current process has the required capabilities for FUSE
 */
export declare function checkCapabilities(): Promise<boolean>;
/**
 * Get available mount options for the current system
 */
export declare function getMountOptions(): string[];
/**
 * Check if a directory is currently mounted as a FUSE filesystem
 */
export declare function isMounted(_path: string): Promise<boolean>;
/**
 * List all currently mounted FUSE filesystems
 */
export declare function listMounts(): Promise<string[]>;
export declare const errno: any;
export declare const mode: any;
export declare const flags: any;
declare const fuseNative: {
    createSession: typeof createSession;
    getVersion: typeof getVersion;
    checkCapabilities: typeof checkCapabilities;
    getMountOptions: typeof getMountOptions;
    isMounted: typeof isMounted;
    listMounts: typeof listMounts;
    errno: any;
    mode: any;
    flags: any;
};
export default fuseNative;
//# sourceMappingURL=index.d.ts.map