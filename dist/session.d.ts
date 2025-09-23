/**
 * @file session.ts
 * @brief FUSE session management and lifecycle control
 *
 * This module provides the FuseSession implementation for managing FUSE
 * filesystem sessions, including mounting, unmounting, and resource cleanup.
 */
import type { FuseSession, FuseSessionOptions, FuseOperationHandlers, MountOptions, UnmountOptions } from './types.js';
/**
 * Session state enumeration
 */
export declare enum SessionState {
    CREATED = "created",
    MOUNTING = "mounting",
    MOUNTED = "mounted",
    UNMOUNTING = "unmounting",
    DESTROYED = "destroyed"
}
/**
 * FUSE session implementation
 */
export declare class FuseSessionImpl implements FuseSession {
    private readonly _mountpoint;
    private readonly options;
    private readonly operationManager;
    private readonly operationWrapper;
    private readonly binding;
    private state;
    private sessionHandle;
    private mountPromise;
    private unmountPromise;
    constructor(mountpoint: string, operations: FuseOperationHandlers, options: FuseSessionOptions, binding: any);
    /**
     * Get mountpoint path
     */
    get mountpoint(): string;
    /**
     * Check if filesystem is mounted
     */
    get mounted(): boolean;
    /**
     * Check if session is ready to handle operations
     */
    get ready(): boolean;
    /**
     * Mount the filesystem
     */
    mount(options?: MountOptions): Promise<void>;
    /**
     * Unmount the filesystem
     */
    unmount(options?: UnmountOptions): Promise<void>;
    /**
     * Destroy the session and cleanup resources
     */
    destroy(): Promise<void>;
    /**
     * Perform the actual mount operation
     */
    private performMount;
    /**
     * Perform the actual unmount operation
     */
    private performUnmount;
    /**
     * Create operation callbacks for the native binding
     */
    private createOperationCallbacks;
    /**
     * Create callback for a specific operation
     */
    private createOperationCallback;
    /**
     * Setup exit handlers for auto-unmount
     */
    private setupExitHandlers;
}
/**
 * Create a new FUSE session
 */
export declare function createFuseSession(mountpoint: string, operations: FuseOperationHandlers, options: FuseSessionOptions, binding: any): FuseSession;
/**
 * Session factory with validation
 */
export declare function createSession(mountpoint: string, operations: FuseOperationHandlers, options?: FuseSessionOptions, binding?: any): FuseSession;
/**
 * Session state utilities
 */
export declare const SessionUtils: {
    /**
     * Check if a path is a valid mountpoint
     */
    isValidMountpoint(path: string): boolean;
    /**
     * Normalize mountpoint path
     */
    normalizeMountpoint(path: string): string;
    /**
     * Get default session options
     */
    getDefaultOptions(): Required<FuseSessionOptions>;
};
/**
 * Default export
 */
declare const _default: {
    FuseSessionImpl: typeof FuseSessionImpl;
    createFuseSession: typeof createFuseSession;
    createSession: typeof createSession;
    SessionState: typeof SessionState;
    SessionUtils: {
        /**
         * Check if a path is a valid mountpoint
         */
        isValidMountpoint(path: string): boolean;
        /**
         * Normalize mountpoint path
         */
        normalizeMountpoint(path: string): string;
        /**
         * Get default session options
         */
        getDefaultOptions(): Required<FuseSessionOptions>;
    };
};
export default _default;
//# sourceMappingURL=session.d.ts.map