/**
 * @file abort.ts
 * @brief AbortSignal and timeout utilities for FUSE operations
 *
 * This module provides helpers for handling operation cancellation and timeouts
 * in FUSE operations using modern AbortSignal APIs.
 */
/**
 * Options interface for operations that support cancellation
 */
export interface AbortOptions {
    /** AbortSignal to cancel the operation */
    signal?: AbortSignal;
    /** Timeout in milliseconds to automatically cancel the operation */
    timeout?: number;
}
/**
 * Error thrown when an operation is aborted
 */
export declare class AbortError extends Error {
    readonly name: string;
    readonly code: string;
    constructor(message?: string);
}
/**
 * Error thrown when an operation times out
 */
export declare class TimeoutError extends AbortError {
    readonly name: string;
    readonly code: string;
    constructor(timeout: number);
}
/**
 * Creates an AbortSignal that will be aborted after the specified timeout
 */
export declare function createTimeoutSignal(timeout: number): AbortSignal;
/**
 * Combines multiple AbortSignals into one that will abort when any of them abort
 */
export declare function combineAbortSignals(...signals: (AbortSignal | undefined)[]): AbortSignal;
/**
 * Creates an effective AbortSignal from abort options
 * Combines user signal with timeout signal if specified
 */
export declare function createEffectiveSignal(options?: AbortOptions): AbortSignal;
/**
 * Throws an appropriate error if the signal is aborted
 */
export declare function throwIfAborted(signal: AbortSignal): void;
/**
 * Wraps a Promise to be cancellable with an AbortSignal
 */
export declare function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T>;
/**
 * Creates a Promise that rejects when the signal is aborted
 */
export declare function abortPromise(signal: AbortSignal): Promise<never>;
/**
 * Utility to race a promise against an abort signal
 */
export declare function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T>;
/**
 * Validates abort options and throws if invalid
 */
export declare function validateAbortOptions(options?: AbortOptions): void;
/**
 * Helper to create abort options with validation
 */
export declare function createAbortOptions(signal?: AbortSignal, timeout?: number): AbortOptions;
//# sourceMappingURL=abort.d.ts.map