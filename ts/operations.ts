/**
 * @file operations.ts
 * @brief FUSE operations management and handler registry
 *
 * This module provides the interface for registering and managing FUSE operation
 * handlers, including validation, error handling, and operation dispatch.
 */

import type {
  FuseOperationHandlers,
  FuseOperationName,
  HandlerFor,
  RequestContext,
  StatResult,
  ReaddirResult,
  FileInfo,
  Ino,
  BaseOperationOptions,
  ReadOptions,
  WriteOptions,
} from './types.js';

import { FuseErrno, toFuseError } from './errors.js';

/**
 * Operation handler registry and management class
 */
export class OperationManager {
  private handlers: Map<FuseOperationName, Function> = new Map();
  private defaultTimeouts: Map<FuseOperationName, number> = new Map();

  /**
   * Register an operation handler
   */
  registerHandler<T extends FuseOperationName>(
    operation: T,
    handler: HandlerFor<T>,
    timeout?: number
  ): void {
    this.handlers.set(operation, handler);
    if (timeout !== undefined) {
      this.defaultTimeouts.set(operation, timeout);
    }
  }

  /**
   * Remove an operation handler
   */
  removeHandler(operation: FuseOperationName): void {
    this.handlers.delete(operation);
    this.defaultTimeouts.delete(operation);
  }

  /**
   * Check if an operation has a handler
   */
  hasHandler(operation: FuseOperationName): boolean {
    return this.handlers.has(operation);
  }

  /**
   * Get an operation handler
   */
  getHandler<T extends FuseOperationName>(
    operation: T
  ): HandlerFor<T> | undefined {
    return this.handlers.get(operation) as HandlerFor<T> | undefined;
  }

  /**
   * Get default timeout for an operation
   */
  getDefaultTimeout(operation: FuseOperationName): number | undefined {
    return this.defaultTimeouts.get(operation);
  }

  /**
   * Validate operation handlers
   */
  validateHandlers(): string[] {
    const errors: string[] = [];

    // Check for required handlers
    const requiredHandlers: FuseOperationName[] = ['lookup', 'getattr'];
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
  getRegisteredOperations(): FuseOperationName[] {
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
  static validateLookup(parent: Ino, name: string): void {
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
  static validateGetattr(ino: Ino): void {
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
  static validateRead(ino: Ino, options: ReadOptions): void {
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
  static validateWrite(
    ino: Ino,
    data: ArrayBuffer,
    options: WriteOptions
  ): void {
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
  static validateContext(context: RequestContext): void {
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
  private manager: OperationManager;

  constructor(manager: OperationManager) {
    this.manager = manager;
  }

  /**
   * Wrap and execute a lookup operation
   */
  async lookup(
    parent: Ino,
    name: string,
    context: RequestContext,
    options?: BaseOperationOptions
  ): Promise<{ attr: StatResult; timeout: number }> {
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
    } catch (error) {
      throw toFuseError(error);
    }
  }

  /**
   * Wrap and execute a getattr operation
   */
  async getattr(
    ino: Ino,
    context: RequestContext,
    fi?: FileInfo,
    options?: BaseOperationOptions
  ): Promise<{ attr: StatResult; timeout: number }> {
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
    } catch (error) {
      throw toFuseError(error);
    }
  }

  /**
   * Wrap and execute a read operation
   */
  async read(
    ino: Ino,
    context: RequestContext,
    options: ReadOptions
  ): Promise<ArrayBuffer> {
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
    } catch (error) {
      throw toFuseError(error);
    }
  }

  /**
   * Wrap and execute a write operation
   */
  async write(
    ino: Ino,
    data: ArrayBuffer,
    context: RequestContext,
    options: WriteOptions
  ): Promise<number> {
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
    } catch (error) {
      throw toFuseError(error);
    }
  }

  /**
   * Wrap and execute a readdir operation
   */
  async readdir(
    ino: Ino,
    offset: bigint,
    context: RequestContext,
    fi?: FileInfo,
    options?: BaseOperationOptions
  ): Promise<ReaddirResult> {
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
    } catch (error) {
      throw toFuseError(error);
    }
  }
}

/**
 * Create operation manager with default configuration
 */
export function createOperationManager(): OperationManager {
  const manager = new OperationManager();

  // Set default timeouts
  const defaultTimeouts: Record<string, number> = {
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
    manager.registerHandler(
      op as FuseOperationName,
      async () => ({ attr: {} as any, timeout: 1.0 }),
      timeout
    );
    manager.removeHandler(op as FuseOperationName); // Remove dummy handler
  }

  return manager;
}

/**
 * Register operation handlers from a handlers object
 */
export function registerOperationHandlers(
  manager: OperationManager,
  handlers: FuseOperationHandlers
): void {
  for (const [name, handler] of Object.entries(handlers)) {
    if (handler && typeof handler === 'function') {
      manager.registerHandler(name as FuseOperationName, handler);
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
