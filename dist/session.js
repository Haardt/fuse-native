/**
 * @file session.ts
 * @brief FUSE session management and lifecycle control
 *
 * This module provides the FuseSession implementation for managing FUSE
 * filesystem sessions, including mounting, unmounting, and resource cleanup.
 */
import { FuseErrno, toFuseError } from './errors.js';
import { OperationManager, OperationWrapper, registerOperationHandlers, } from './operations.js';
/**
 * Session state enumeration
 */
export var SessionState;
(function (SessionState) {
    SessionState["CREATED"] = "created";
    SessionState["MOUNTING"] = "mounting";
    SessionState["MOUNTED"] = "mounted";
    SessionState["UNMOUNTING"] = "unmounting";
    SessionState["DESTROYED"] = "destroyed";
})(SessionState || (SessionState = {}));
/**
 * FUSE session implementation
 */
export class FuseSessionImpl {
    _mountpoint;
    options;
    operationManager;
    operationWrapper;
    binding;
    state = SessionState.CREATED;
    sessionHandle = null;
    mountPromise = null;
    unmountPromise = null;
    constructor(mountpoint, operations, options, binding) {
        // Validate parameters
        if (typeof mountpoint !== 'string' || mountpoint.length === 0) {
            throw new FuseErrno('EINVAL', 'Mountpoint must be a non-empty string');
        }
        if (!operations || typeof operations !== 'object') {
            throw new FuseErrno('EINVAL', 'Operations must be an object');
        }
        if (!binding) {
            throw new FuseErrno('EINVAL', 'Native binding not available');
        }
        this._mountpoint = mountpoint;
        this.binding = binding;
        // Set default options
        this.options = {
            allowOther: false,
            allowRoot: false,
            autoUnmount: true,
            defaultPermissions: true,
            mountOptions: [],
            debug: false,
            singleThreaded: false,
            maxRead: 131072,
            maxWrite: 131072,
            timeout: 1.0,
            ...options,
        };
        // Initialize operation management
        this.operationManager = new OperationManager();
        this.operationWrapper = new OperationWrapper(this.operationManager);
        // Register operation handlers
        registerOperationHandlers(this.operationManager, operations);
        // Validate required operations
        const validationErrors = this.operationManager.validateHandlers();
        if (validationErrors.length > 0) {
            throw new FuseErrno('EINVAL', `Missing required operations: ${validationErrors.join(', ')}`);
        }
        // Setup cleanup on process exit
        if (this.options.autoUnmount) {
            this.setupExitHandlers();
        }
    }
    /**
     * Get mountpoint path
     */
    get mountpoint() {
        return this._mountpoint;
    }
    /**
     * Check if filesystem is mounted
     */
    get mounted() {
        return this.state === SessionState.MOUNTED;
    }
    /**
     * Check if session is ready to handle operations
     */
    get ready() {
        return this.state === SessionState.MOUNTED && this.sessionHandle !== null;
    }
    /**
     * Mount the filesystem
     */
    async mount(options = {}) {
        if (this.state === SessionState.DESTROYED) {
            throw new FuseErrno('EINVAL', 'Session has been destroyed');
        }
        if (this.state === SessionState.MOUNTED) {
            return; // Already mounted
        }
        if (this.mountPromise) {
            return this.mountPromise; // Mount in progress
        }
        this.state = SessionState.MOUNTING;
        this.mountPromise = this.performMount(options);
        try {
            await this.mountPromise;
            this.state = SessionState.MOUNTED;
        }
        catch (error) {
            this.state = SessionState.CREATED;
            this.mountPromise = null;
            throw toFuseError(error);
        }
    }
    /**
     * Unmount the filesystem
     */
    async unmount(options = {}) {
        if (this.state !== SessionState.MOUNTED) {
            return; // Not mounted
        }
        if (this.unmountPromise) {
            return this.unmountPromise; // Unmount in progress
        }
        this.state = SessionState.UNMOUNTING;
        this.unmountPromise = this.performUnmount(options);
        try {
            await this.unmountPromise;
            this.state = SessionState.CREATED;
            this.sessionHandle = null;
        }
        catch (error) {
            this.state = SessionState.MOUNTED; // Revert state on failure
            throw toFuseError(error);
        }
        finally {
            this.unmountPromise = null;
        }
    }
    /**
     * Destroy the session and cleanup resources
     */
    async destroy() {
        if (this.state === SessionState.DESTROYED) {
            return; // Already destroyed
        }
        try {
            // Unmount if mounted
            if (this.state === SessionState.MOUNTED) {
                await this.unmount({ force: true });
            }
            // Cleanup native session
            if (this.sessionHandle) {
                this.binding.destroySession(this.sessionHandle);
                this.sessionHandle = null;
            }
            // Clear operation handlers
            this.operationManager.getRegisteredOperations().forEach(op => {
                this.operationManager.removeHandler(op);
            });
        }
        catch (error) {
            console.error('Error during session cleanup:', error);
        }
        finally {
            this.state = SessionState.DESTROYED;
        }
    }
    /**
     * Perform the actual mount operation
     */
    async performMount(options) {
        return new Promise((resolve, reject) => {
            try {
                // Create native session
                this.sessionHandle = this.binding.createSession({
                    mountpoint: this.mountpoint,
                    options: this.options,
                    operations: this.createOperationCallbacks(),
                });
                // Mount the filesystem
                this.binding.mount(this.sessionHandle, {
                    ...options,
                    timeout: options.timeout || 30000,
                }, (error) => {
                    if (error) {
                        reject(toFuseError(error));
                    }
                    else {
                        resolve();
                    }
                });
            }
            catch (error) {
                reject(toFuseError(error));
            }
        });
    }
    /**
     * Perform the actual unmount operation
     */
    async performUnmount(options) {
        return new Promise((resolve, reject) => {
            if (!this.sessionHandle) {
                resolve();
                return;
            }
            try {
                this.binding.unmount(this.sessionHandle, {
                    ...options,
                    timeout: options.timeout || 10000,
                }, (error) => {
                    if (error) {
                        reject(toFuseError(error));
                    }
                    else {
                        resolve();
                    }
                });
            }
            catch (error) {
                reject(toFuseError(error));
            }
        });
    }
    /**
     * Create operation callbacks for the native binding
     */
    createOperationCallbacks() {
        const callbacks = {};
        for (const operation of this.operationManager.getRegisteredOperations()) {
            callbacks[operation] = this.createOperationCallback(operation);
        }
        return callbacks;
    }
    /**
     * Create callback for a specific operation
     */
    createOperationCallback(operation) {
        return async (...args) => {
            try {
                switch (operation) {
                    case 'lookup':
                        return await this.operationWrapper.lookup(args[0], args[1], args[2], args[3]);
                    case 'getattr':
                        return await this.operationWrapper.getattr(args[0], args[1], args[2], args[3]);
                    case 'read':
                        return await this.operationWrapper.read(args[0], args[1], args[2]);
                    case 'write':
                        return await this.operationWrapper.write(args[0], args[1], args[2], args[3]);
                    case 'readdir':
                        return await this.operationWrapper.readdir(args[0], args[1], args[2], args[3], args[4]);
                    default:
                        throw new FuseErrno('ENOSYS', `Operation ${operation} not implemented`);
                }
            }
            catch (error) {
                throw toFuseError(error);
            }
        };
    }
    /**
     * Setup exit handlers for auto-unmount
     */
    setupExitHandlers() {
        const cleanup = async () => {
            if (this.state === SessionState.MOUNTED) {
                try {
                    await this.unmount({ force: true });
                }
                catch (error) {
                    console.error('Failed to unmount filesystem on exit:', error);
                }
            }
            await this.destroy();
        };
        process.once('SIGINT', cleanup);
        process.once('SIGTERM', cleanup);
        process.once('exit', () => {
            // Synchronous cleanup on exit
            if (this.sessionHandle) {
                try {
                    this.binding.destroySession(this.sessionHandle);
                }
                catch (error) {
                    console.error('Failed to cleanup session on exit:', error);
                }
            }
        });
    }
}
/**
 * Create a new FUSE session
 */
export function createFuseSession(mountpoint, operations, options, binding) {
    return new FuseSessionImpl(mountpoint, operations, options, binding);
}
/**
 * Session factory with validation
 */
export function createSession(mountpoint, operations, options = {}, binding) {
    // Mock binding for development/testing
    const mockBinding = binding || {
        createSession: () => ({ id: Math.random() }),
        destroySession: () => { },
        mount: (_session, _opts, callback) => {
            setTimeout(() => callback(null), 100);
        },
        unmount: (_session, _opts, callback) => {
            setTimeout(() => callback(null), 100);
        },
    };
    return createFuseSession(mountpoint, operations, options, mockBinding);
}
/**
 * Session state utilities
 */
export const SessionUtils = {
    /**
     * Check if a path is a valid mountpoint
     */
    isValidMountpoint(path) {
        if (typeof path !== 'string' || path.length === 0) {
            return false;
        }
        // Must be an absolute path
        if (!path.startsWith('/')) {
            return false;
        }
        // Cannot end with / unless it's root
        if (path.length > 1 && path.endsWith('/')) {
            return false;
        }
        return true;
    },
    /**
     * Normalize mountpoint path
     */
    normalizeMountpoint(path) {
        if (!this.isValidMountpoint(path)) {
            throw new FuseErrno('EINVAL', `Invalid mountpoint: ${path}`);
        }
        return path;
    },
    /**
     * Get default session options
     */
    getDefaultOptions() {
        return {
            allowOther: false,
            allowRoot: false,
            autoUnmount: true,
            defaultPermissions: true,
            mountOptions: [],
            debug: false,
            singleThreaded: false,
            maxRead: 131072,
            maxWrite: 131072,
            timeout: 1.0,
        };
    },
};
/**
 * Default export
 */
export default {
    FuseSessionImpl,
    createFuseSession,
    createSession,
    SessionState,
    SessionUtils,
};
//# sourceMappingURL=session.js.map