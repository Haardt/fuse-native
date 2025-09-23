/**
 * @file operations.ts
 * @brief FUSE operations management and handler registry
 *
 * This module provides the interface for registering and managing FUSE operation
 * handlers, including validation, error handling, and operation dispatch.
 */
import { FuseErrno, toFuseError } from './errors.js';
/**
 * Operation handler registry and management class
 */
export class OperationManager {
    handlers = new Map();
    defaultTimeouts = new Map();
    /**
     * Register an operation handler
     */
    registerHandler(operation, handler, timeout) {
        this.handlers.set(operation, handler);
        if (timeout !== undefined) {
            this.defaultTimeouts.set(operation, timeout);
        }
    }
    /**
     * Remove an operation handler
     */
    removeHandler(operation) {
        this.handlers.delete(operation);
        this.defaultTimeouts.delete(operation);
    }
    /**
     * Check if an operation has a handler
     */
    hasHandler(operation) {
        return this.handlers.has(operation);
    }
    /**
     * Get an operation handler
     */
    getHandler(operation) {
        return this.handlers.get(operation);
    }
    /**
     * Get default timeout for an operation
     */
    getDefaultTimeout(operation) {
        return this.defaultTimeouts.get(operation);
    }
    /**
     * Validate operation handlers
     */
    validateHandlers() {
        const errors = [];
        // Check for required handlers
        const requiredHandlers = ['lookup', 'getattr'];
        for (const required of requiredHandlers) {
            if (!this.hasHandler(required)) {
                errors.push(`Missing required handler: ${required}`);
            }
        }
        return errors;
    }
    /**
     * Get all registered operation names
     */
    getRegisteredOperations() {
        return Array.from(this.handlers.keys());
    }
}
/**
 * Operation validation utilities
 */
export class OperationValidator {
    /**
     * Validate lookup operation parameters
     */
    static validateLookup(parent, name) {
        if (typeof parent !== 'bigint') {
            throw new FuseErrno('EINVAL', 'Parent inode must be a BigInt');
        }
        if (typeof name !== 'string' || name.length === 0) {
            throw new FuseErrno('EINVAL', 'Name must be a non-empty string');
        }
        if (name.includes('/')) {
            throw new FuseErrno('EINVAL', 'Name cannot contain path separators');
        }
        if (name === '.' || name === '..') {
            throw new FuseErrno('EINVAL', 'Name cannot be . or ..');
        }
    }
    /**
     * Validate getattr operation parameters
     */
    static validateGetattr(ino) {
        if (typeof ino !== 'bigint') {
            throw new FuseErrno('EINVAL', 'Inode must be a BigInt');
        }
        if (ino <= 0n) {
            throw new FuseErrno('EINVAL', 'Inode must be positive');
        }
    }
    /**
     * Validate read operation parameters
     */
    static validateRead(ino, options) {
        this.validateGetattr(ino);
        if (typeof options.offset !== 'bigint') {
            throw new FuseErrno('EINVAL', 'Offset must be a BigInt');
        }
        if (options.offset < 0n) {
            throw new FuseErrno('EINVAL', 'Offset cannot be negative');
        }
        if (typeof options.size !== 'number' || options.size < 0) {
            throw new FuseErrno('EINVAL', 'Size must be a non-negative number');
        }
        if (options.size > 1024 * 1024 * 128) {
            // 128MB limit
            throw new FuseErrno('EINVAL', 'Size too large');
        }
    }
    /**
     * Validate write operation parameters
     */
    static validateWrite(ino, data, options) {
        this.validateGetattr(ino);
        if (!(data instanceof ArrayBuffer)) {
            throw new FuseErrno('EINVAL', 'Data must be an ArrayBuffer');
        }
        if (typeof options.offset !== 'bigint') {
            throw new FuseErrno('EINVAL', 'Offset must be a BigInt');
        }
        if (options.offset < 0n) {
            throw new FuseErrno('EINVAL', 'Offset cannot be negative');
        }
    }
    /**
     * Validate request context
     */
    static validateContext(context) {
        if (typeof context.uid !== 'number' || context.uid < 0) {
            throw new FuseErrno('EINVAL', 'Invalid UID in context');
        }
        if (typeof context.gid !== 'number' || context.gid < 0) {
            throw new FuseErrno('EINVAL', 'Invalid GID in context');
        }
        if (typeof context.pid !== 'number' || context.pid <= 0) {
            throw new FuseErrno('EINVAL', 'Invalid PID in context');
        }
    }
}
/**
 * Operation wrapper for error handling and validation
 */
export class OperationWrapper {
    manager;
    constructor(manager) {
        this.manager = manager;
    }
    /**
     * Wrap and execute a lookup operation
     */
    async lookup(parent, name, context, options) {
        OperationValidator.validateLookup(parent, name);
        OperationValidator.validateContext(context);
        const handler = this.manager.getHandler('lookup');
        if (!handler) {
            throw new FuseErrno('ENOSYS', 'lookup operation not implemented');
        }
        try {
            const result = await handler(parent, name, context, options);
            if (!result || !result.attr) {
                throw new FuseErrno('EIO', 'Invalid lookup result');
            }
            return result;
        }
        catch (error) {
            throw toFuseError(error);
        }
    }
    /**
     * Wrap and execute a getattr operation
     */
    async getattr(ino, context, fi, options) {
        OperationValidator.validateGetattr(ino);
        OperationValidator.validateContext(context);
        const handler = this.manager.getHandler('getattr');
        if (!handler) {
            throw new FuseErrno('ENOSYS', 'getattr operation not implemented');
        }
        try {
            const result = await handler(ino, context, fi, options);
            if (!result || !result.attr) {
                throw new FuseErrno('EIO', 'Invalid getattr result');
            }
            return result;
        }
        catch (error) {
            throw toFuseError(error);
        }
    }
    /**
     * Wrap and execute a read operation
     */
    async read(ino, context, options) {
        OperationValidator.validateRead(ino, options);
        OperationValidator.validateContext(context);
        const handler = this.manager.getHandler('read');
        if (!handler) {
            throw new FuseErrno('ENOSYS', 'read operation not implemented');
        }
        try {
            const result = await handler(ino, context, options);
            if (!(result instanceof ArrayBuffer)) {
                throw new FuseErrno('EIO', 'Invalid read result');
            }
            return result;
        }
        catch (error) {
            throw toFuseError(error);
        }
    }
    /**
     * Wrap and execute a write operation
     */
    async write(ino, data, context, options) {
        OperationValidator.validateWrite(ino, data, options);
        OperationValidator.validateContext(context);
        const handler = this.manager.getHandler('write');
        if (!handler) {
            throw new FuseErrno('ENOSYS', 'write operation not implemented');
        }
        try {
            const result = await handler(ino, data, context, options);
            if (typeof result !== 'number' || result < 0) {
                throw new FuseErrno('EIO', 'Invalid write result');
            }
            return result;
        }
        catch (error) {
            throw toFuseError(error);
        }
    }
    /**
     * Wrap and execute a readdir operation
     */
    async readdir(ino, offset, context, fi, options) {
        OperationValidator.validateGetattr(ino);
        OperationValidator.validateContext(context);
        if (typeof offset !== 'bigint' || offset < 0n) {
            throw new FuseErrno('EINVAL', 'Invalid offset');
        }
        const handler = this.manager.getHandler('readdir');
        if (!handler) {
            throw new FuseErrno('ENOSYS', 'readdir operation not implemented');
        }
        try {
            const result = await handler(ino, offset, context, fi, options);
            if (!result || !Array.isArray(result.entries)) {
                throw new FuseErrno('EIO', 'Invalid readdir result');
            }
            return result;
        }
        catch (error) {
            throw toFuseError(error);
        }
    }
}
/**
 * Create operation manager with default configuration
 */
export function createOperationManager() {
    const manager = new OperationManager();
    // Set default timeouts
    const defaultTimeouts = {
        lookup: 1.0,
        getattr: 1.0,
        setattr: 1.0,
        read: 0.0,
        write: 0.0,
        readdir: 1.0,
        mkdir: 1.0,
        create: 1.0,
        unlink: 0.0,
        rmdir: 0.0,
        rename: 0.0,
        statfs: 1.0,
    };
    for (const [op, timeout] of Object.entries(defaultTimeouts)) {
        manager.registerHandler(op, async () => ({ attr: {}, timeout: 1.0 }), timeout);
        manager.removeHandler(op); // Remove dummy handler
    }
    return manager;
}
/**
 * Register operation handlers from a handlers object
 */
export function registerOperationHandlers(manager, handlers) {
    for (const [name, handler] of Object.entries(handlers)) {
        if (handler && typeof handler === 'function') {
            manager.registerHandler(name, handler);
        }
    }
}
/**
 * Default export
 */
export default {
    OperationManager,
    OperationValidator,
    OperationWrapper,
    createOperationManager,
    registerOperationHandlers,
};
//# sourceMappingURL=operations.js.map