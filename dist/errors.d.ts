/**
 * @file errors.ts
 * @brief Error handling and errno mapping for FUSE3 Node.js binding
 *
 * This module provides comprehensive error handling with POSIX errno codes,
 * custom FUSE error types, and proper error propagation between C++ and TypeScript.
 */
/**
 * FUSE-specific error class that extends the standard Error
 * with errno support for POSIX-compliant error handling
 */
export declare class FuseErrno extends Error {
    /** The errno code (negative value following POSIX convention) */
    readonly errno: number;
    /** The errno name (e.g., 'ENOENT', 'EACCES') */
    readonly code: string;
    /** System error message */
    /** System call that caused the error (optional) */
    readonly syscall?: string | undefined;
    /** File path associated with the error (optional) */
    readonly path?: string | undefined;
    constructor(code: string | number, message?: string, syscall?: string, path?: string);
    /**
     * Convert to JSON representation
     */
    toJSON(): {
        name: string;
        message: string;
        errno: number;
        code: string;
        syscall: string | undefined;
        path: string | undefined;
        stack: string | undefined;
    };
    /**
     * String representation
     */
    toString(): string;
}
/**
 * Map of errno codes to their string representations
 */
export declare const ERRNO_CODES: Record<number, string>;
/**
 * Reverse map of errno string codes to numbers
 */
export declare const CODE_TO_ERRNO: Record<string, number>;
/**
 * Human-readable error messages for common errno codes
 */
export declare const ERRNO_MESSAGES: Record<number, string>;
/**
 * Get errno code from string representation
 */
export declare function getErrnoFromCode(code: string): number;
/**
 * Get string code from errno number
 */
export declare function getCodeFromErrno(errno: number): string;
/**
 * Get human-readable message for errno
 */
export declare function getErrnoMessage(errno: number): string;
/**
 * Check if an error is a FuseErrno
 */
export declare function isFuseError(error: unknown): error is FuseErrno;
/**
 * Convert any error to a FuseErrno
 */
export declare function toFuseError(error: unknown, fallbackErrno?: number): FuseErrno;
/**
 * Create convenience functions for common errors
 */
export declare const createENoEnt: (message?: string, path?: string) => FuseErrno;
export declare const createEAcces: (message?: string, path?: string) => FuseErrno;
export declare const createEExist: (message?: string, path?: string) => FuseErrno;
export declare const createEIsDir: (message?: string, path?: string) => FuseErrno;
export declare const createENotDir: (message?: string, path?: string) => FuseErrno;
export declare const createENoTEmpty: (message?: string, path?: string) => FuseErrno;
export declare const createEPerm: (message?: string, path?: string) => FuseErrno;
export declare const createEIO: (message?: string, path?: string) => FuseErrno;
export declare const createEInval: (message?: string) => FuseErrno;
export declare const createENoSpc: (message?: string, path?: string) => FuseErrno;
/**
 * Type guard for checking specific errno codes
 */
export declare function isErrno(error: unknown, code: string): error is FuseErrno;
/**
 * Error handling utilities for async operations
 */
export declare class ErrorHandler {
    /**
     * Wrap an async function with error handling
     */
    static wrapAsync<T extends any[], R>(fn: (...args: T) => Promise<R>, errorTransform?: (error: unknown) => FuseErrno): (...args: T) => Promise<R>;
    /**
     * Wrap a sync function with error handling
     */
    static wrapSync<T extends any[], R>(fn: (...args: T) => R, errorTransform?: (error: unknown) => FuseErrno): (...args: T) => R;
}
/**
 * Default export
 */
declare const _default: {
    FuseErrno: typeof FuseErrno;
    ERRNO_CODES: Record<number, string>;
    CODE_TO_ERRNO: Record<string, number>;
    ERRNO_MESSAGES: Record<number, string>;
    getErrnoFromCode: typeof getErrnoFromCode;
    getCodeFromErrno: typeof getCodeFromErrno;
    getErrnoMessage: typeof getErrnoMessage;
    isFuseError: typeof isFuseError;
    toFuseError: typeof toFuseError;
    isErrno: typeof isErrno;
    ErrorHandler: typeof ErrorHandler;
    createENoEnt: (message?: string, path?: string) => FuseErrno;
    createEAcces: (message?: string, path?: string) => FuseErrno;
    createEExist: (message?: string, path?: string) => FuseErrno;
    createEIsDir: (message?: string, path?: string) => FuseErrno;
    createENotDir: (message?: string, path?: string) => FuseErrno;
    createENoTEmpty: (message?: string, path?: string) => FuseErrno;
    createEPerm: (message?: string, path?: string) => FuseErrno;
    createEIO: (message?: string, path?: string) => FuseErrno;
    createEInval: (message?: string) => FuseErrno;
    createENoSpc: (message?: string, path?: string) => FuseErrno;
};
export default _default;
//# sourceMappingURL=errors.d.ts.map