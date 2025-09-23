/**
 * @file operations.ts
 * @brief FUSE operations management and handler registry
 *
 * This module provides the interface for registering and managing FUSE operation
 * handlers, including validation, error handling, and operation dispatch.
 */
import type { FuseOperationHandlers, FuseOperationName, HandlerFor, RequestContext, StatResult, ReaddirResult, FileInfo, Ino, BaseOperationOptions, ReadOptions, WriteOptions } from './types.js';
/**
 * Operation handler registry and management class
 */
export declare class OperationManager {
    private handlers;
    private defaultTimeouts;
    /**
     * Register an operation handler
     */
    registerHandler<T extends FuseOperationName>(operation: T, handler: HandlerFor<T>, timeout?: number): void;
    /**
     * Remove an operation handler
     */
    removeHandler(operation: FuseOperationName): void;
    /**
     * Check if an operation has a handler
     */
    hasHandler(operation: FuseOperationName): boolean;
    /**
     * Get an operation handler
     */
    getHandler<T extends FuseOperationName>(operation: T): HandlerFor<T> | undefined;
    /**
     * Get default timeout for an operation
     */
    getDefaultTimeout(operation: FuseOperationName): number | undefined;
    /**
     * Validate operation handlers
     */
    validateHandlers(): string[];
    /**
     * Get all registered operation names
     */
    getRegisteredOperations(): FuseOperationName[];
}
/**
 * Operation validation utilities
 */
export declare class OperationValidator {
    /**
     * Validate lookup operation parameters
     */
    static validateLookup(parent: Ino, name: string): void;
    /**
     * Validate getattr operation parameters
     */
    static validateGetattr(ino: Ino): void;
    /**
     * Validate read operation parameters
     */
    static validateRead(ino: Ino, options: ReadOptions): void;
    /**
     * Validate write operation parameters
     */
    static validateWrite(ino: Ino, data: ArrayBuffer, options: WriteOptions): void;
    /**
     * Validate request context
     */
    static validateContext(context: RequestContext): void;
}
/**
 * Operation wrapper for error handling and validation
 */
export declare class OperationWrapper {
    private manager;
    constructor(manager: OperationManager);
    /**
     * Wrap and execute a lookup operation
     */
    lookup(parent: Ino, name: string, context: RequestContext, options?: BaseOperationOptions): Promise<{
        attr: StatResult;
        timeout: number;
    }>;
    /**
     * Wrap and execute a getattr operation
     */
    getattr(ino: Ino, context: RequestContext, fi?: FileInfo, options?: BaseOperationOptions): Promise<{
        attr: StatResult;
        timeout: number;
    }>;
    /**
     * Wrap and execute a read operation
     */
    read(ino: Ino, context: RequestContext, options: ReadOptions): Promise<ArrayBuffer>;
    /**
     * Wrap and execute a write operation
     */
    write(ino: Ino, data: ArrayBuffer, context: RequestContext, options: WriteOptions): Promise<number>;
    /**
     * Wrap and execute a readdir operation
     */
    readdir(ino: Ino, offset: bigint, context: RequestContext, fi?: FileInfo, options?: BaseOperationOptions): Promise<ReaddirResult>;
}
/**
 * Create operation manager with default configuration
 */
export declare function createOperationManager(): OperationManager;
/**
 * Register operation handlers from a handlers object
 */
export declare function registerOperationHandlers(manager: OperationManager, handlers: FuseOperationHandlers): void;
/**
 * Default export
 */
declare const _default: {
    OperationManager: typeof OperationManager;
    OperationValidator: typeof OperationValidator;
    OperationWrapper: typeof OperationWrapper;
    createOperationManager: typeof createOperationManager;
    registerOperationHandlers: typeof registerOperationHandlers;
};
export default _default;
//# sourceMappingURL=operations.d.ts.map