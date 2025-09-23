/**
 * @file index.ts
 * @brief Main TypeScript API entry point for FUSE3 Node.js binding
 *
 * This module provides the modern ESM API with Promise-based operations,
 * BigInt support for 64-bit values, and strict TypeScript types.
 */

let binding: any;
try {
  // Try to load prebuilt binary first
  binding = require('../prebuilds/linux-x64/@cocalc+fuse-native.node');
} catch {
  try {
    // Fallback to compiled binary
    binding = require('../build/Release/fuse-native.node');
  } catch {
    // Final fallback to Debug build
    binding = require('../build/Debug/fuse-native.node');
  }
}

// Re-export types
export * from './types.js';
export * from './errors.js';
export {
  S_IFMT,
  S_IFREG,
  S_IFDIR,
  S_IFLNK,
  S_IFBLK,
  S_IFCHR,
  S_IFIFO,
  S_IFSOCK,
} from './constants.js';
export * from './operations.js';
export * from './session.js';
export * from './helpers.js';
export * from './time.js';
export {
  errno as getErrno,
  errname,
  errmsg,
  isValidErrno,
  normalizeErrno,
  isPermissionError,
  isNotFoundError,
  isExistsError,
  isTemporaryError,
  isIOError,
  isInvalidError,
  createFuseError as createErrnoError,
  createENoent,
  createENotEmpty,
  OPERATION_ERRORS,
  getOperationErrors,
  isValidOperationError,
  ERRNO,
} from './errno.js';

import { FuseErrno } from './errors.js';

// Import types
import type {
  FuseSession,
  FuseSessionOptions,
  FuseOperationHandlers,
  TSFNDispatcherOptions,
  DispatcherStats,
  DispatcherConfig,
  WriteOperationPriority,
  WriteQueueStats,
  FDWriteQueueConfig,
  WriteCompletionCallback,
  ShutdownState,
  ShutdownStats,
  ShutdownTimeouts,
  ShutdownCallback,
  FuseOperationName,
} from './types.js';

import { createFuseSession } from './session.js';

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
export function getVersion(): VersionInfo {
  return binding.getVersion();
}

/**
 * Create a new FUSE session
 * @param mountpoint - Directory to mount the filesystem
 * @param operations - FUSE operation handlers
 * @param options - Optional session configuration
 */
export function createSession(
  mountpoint: string,
  operations: FuseOperationHandlers,
  options: FuseSessionOptions = {}
): FuseSession {
  return createFuseSession(mountpoint, operations, options, binding);
}

/**
 * Check if the current process has the required capabilities for FUSE
 */
export function checkCapabilities(): Promise<boolean> {
  // TODO: Implement capability checking
  return Promise.resolve(true);
}

/**
 * Get available mount options for the current system
 */
export function getMountOptions(): string[] {
  // TODO: Implement mount options detection
  return [
    'allow_other',
    'allow_root',
    'auto_unmount',
    'default_permissions',
    'dev',
    'nodev',
    'suid',
    'nosuid',
    'ro',
    'rw',
    'exec',
    'noexec',
    'sync',
    'async',
  ];
}

/**
 * Copy data between file descriptors using copy_file_range
 *
 * @param fdIn - Source file descriptor
 * @param offsetIn - Source offset (null to use current position)
 * @param fdOut - Destination file descriptor
 * @param offsetOut - Destination offset (null to use current position)
 * @param length - Number of bytes to copy
 * @param flags - Optional copy flags
 * @returns Promise resolving to number of bytes copied
 */
export async function copyFileRange(
  fdIn: number,
  offsetIn: bigint | null,
  fdOut: number,
  offsetOut: bigint | null,
  length: bigint,
  flags: number = 0
): Promise<bigint> {
  return new Promise((resolve, reject) => {
    try {
      const offsetInValue = offsetIn === null ? 0xffffffffffffffffn : offsetIn;
      const offsetOutValue =
        offsetOut === null ? 0xffffffffffffffffn : offsetOut;

      const result = binding.copyFileRange(
        fdIn,
        offsetInValue,
        fdOut,
        offsetOutValue,
        length,
        flags
      );

      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Set chunk size for copy_file_range fallback operations
 *
 * @param chunkSize - Size of chunks for read/write fallback operations
 */
export function setCopyChunkSize(chunkSize: bigint): void {
  binding.setCopyChunkSize(chunkSize);
}

/**
 * Get current chunk size for copy_file_range fallback operations
 *
 * @returns Current chunk size in bytes
 */
export function getCopyChunkSize(): bigint {
  return binding.getCopyChunkSize();
}

/**
 * Get copy_file_range operation statistics
 *
 * @returns Statistics object with operation counts and performance data
 */
export function getCopyStats(): {
  totalOperations: bigint;
  totalBytesCopied: bigint;
  kernelCopySupported: boolean;
} {
  return binding.getCopyStats();
}

/**
 * Reset copy_file_range operation statistics
 */
export function resetCopyStats(): void {
  binding.resetCopyStats();
}

/**
 * Check if a directory is currently mounted as a FUSE filesystem
 */
export async function isMounted(_path: string): Promise<boolean> {
  // TODO: Implement mount status checking
  return Promise.resolve(false);
}

/**
 * List all currently mounted FUSE filesystems
 */
export async function listMounts(): Promise<string[]> {
  // TODO: Implement mount listing
  return Promise.resolve([]);
}

// =============================================================================
// Phase 7: TSFN Dispatcher Functions
// =============================================================================

/**
 * Initialize TSFN dispatcher
 * @param options - Dispatcher configuration options
 * @returns Promise resolving to true if initialization succeeded
 */
export async function initializeDispatcher(
  options: TSFNDispatcherOptions = {}
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // Set defaults
      const opts = {
        maxQueueSize: 1000,
        workerThreads: 1,
        ...options,
      };

      // Validate options
      if (opts.maxQueueSize !== undefined && opts.maxQueueSize < 0) {
        throw new Error('Invalid maxQueueSize');
      }

      const result = binding.initializeDispatcher(opts);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Shutdown TSFN dispatcher
 * @param timeout - Timeout in milliseconds
 * @returns Promise resolving to true if shutdown succeeded
 */
export async function shutdownDispatcher(
  timeout: number = 5000
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const result = binding.shutdownDispatcher(timeout);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get TSFN dispatcher statistics
 * @returns Promise resolving to current statistics
 */
export async function getDispatcherStats(): Promise<DispatcherStats> {
  return new Promise((resolve, reject) => {
    try {
      const stats = binding.getDispatcherStats();
      resolve(stats);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Reset TSFN dispatcher statistics
 * @returns Promise resolving to true if reset succeeded
 */
export async function resetDispatcherStats(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const result = binding.resetDispatcherStats();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Set TSFN dispatcher configuration
 * @param config - Configuration options
 * @returns Promise resolving to true if configuration succeeded
 */
export async function setDispatcherConfig(
  config: DispatcherConfig
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // Validate config
      if (config.maxQueueSize !== undefined && config.maxQueueSize < 0) {
        throw new Error('Invalid maxQueueSize');
      }

      const result = binding.setDispatcherConfig(config);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Set operation handler
 * @param operation - FUSE operation name
 * @param handler - Handler function
 * @returns Promise resolving to true if handler was set
 */
export async function setOperationHandler(
  operation: FuseOperationName,
  handler: Function
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // Validate operation name
      if (!operation || typeof operation !== 'string') {
        throw new Error('Invalid operation name');
      }

      const validOperations = [
        'lookup',
        'getattr',
        'setattr',
        'read',
        'write',
        'open',
        'release',
        'readdir',
        'mkdir',
        'create',
        'unlink',
        'rmdir',
        'rename',
        'statfs',
        'flush',
        'fsync',
        'opendir',
        'releasedir',
        'fsyncdir',
        'access',
      ];

      if (!validOperations.includes(operation)) {
        throw new Error('Unknown operation');
      }

      if (typeof handler !== 'function') {
        throw new Error('Handler must be a function');
      }

      const result = binding.setOperationHandler(operation, handler);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Remove operation handler
 * @param operation - FUSE operation name
 * @returns Promise resolving to true if handler was removed
 */
export async function removeOperationHandler(
  operation: FuseOperationName
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const result = binding.removeOperationHandler(operation);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

// =============================================================================
// Phase 7: Write Queue Functions
// =============================================================================

/**
 * Enqueue write operation
 * @param fd - File descriptor
 * @param offset - Write offset
 * @param size - Write size
 * @param buffer - Data buffer
 * @param priority - Operation priority
 * @param callback - Completion callback
 * @returns Promise resolving to operation ID
 */
export async function enqueueWrite(
  fd: bigint,
  offset: bigint,
  size: bigint,
  buffer: ArrayBuffer | ArrayBufferView,
  priority: WriteOperationPriority = 'NORMAL',
  callback?: WriteCompletionCallback
): Promise<bigint> {
  return new Promise((resolve, reject) => {
    try {
      // Validate arguments
      if (fd < 0n) {
        throw new Error('Invalid file descriptor');
      }

      if (size <= 0n) {
        throw new Error('Write size must be greater than zero');
      }

      // Get buffer size
      let bufferSize: number;
      if (buffer instanceof ArrayBuffer) {
        bufferSize = buffer.byteLength;
      } else {
        bufferSize = buffer.byteLength;
      }

      if (Number(size) > bufferSize) {
        throw new Error('Write size exceeds buffer size');
      }

      // Validate priority
      const validPriorities: WriteOperationPriority[] = [
        'URGENT',
        'HIGH',
        'NORMAL',
        'LOW',
      ];
      if (!validPriorities.includes(priority)) {
        throw new Error('Invalid priority level');
      }

      // Validate buffer type
      if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) {
        throw new Error('Buffer must be ArrayBuffer or TypedArray');
      }

      const result = binding.enqueueWrite(
        fd,
        offset,
        size,
        buffer,
        priority,
        callback
      );
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Process write queues
 * @param executor - Function to execute write operations
 * @returns Promise resolving to number of operations processed
 */
export async function processWriteQueues(
  executor: (operation: {
    fd: bigint;
    offset: bigint;
    size: bigint;
    buffer: ArrayBuffer;
    priority: WriteOperationPriority;
  }) => number
): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof executor !== 'function') {
        throw new Error('Executor must be a function');
      }

      const result = binding.processWriteQueues(executor);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Flush write queue for specific FD
 * @param fd - File descriptor
 * @param timeout - Timeout in milliseconds
 * @returns Promise resolving to true if flush succeeded
 */
export async function flushWriteQueue(
  fd: bigint,
  timeout: number = 5000
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const result = binding.flushWriteQueue(fd, timeout);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Flush all write queues
 * @param timeout - Timeout in milliseconds
 * @returns Promise resolving to true if flush succeeded
 */
export async function flushAllWriteQueues(
  timeout: number = 5000
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const result = binding.flushAllWriteQueues(timeout);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get write queue statistics
 * @param fd - Optional file descriptor for FD-specific stats
 * @returns Promise resolving to statistics or null if FD not found
 */
export async function getWriteQueueStats(
  fd?: bigint
): Promise<WriteQueueStats | null> {
  return new Promise((resolve, reject) => {
    try {
      const result = binding.getWriteQueueStats(fd);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Reset write queue statistics
 * @returns Promise resolving to true if reset succeeded
 */
export async function resetWriteQueueStats(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const result = binding.resetWriteQueueStats();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Configure write queues
 * @param config - Write queue configuration
 * @returns Promise resolving to true if configuration succeeded
 */
export async function configureWriteQueues(
  config: FDWriteQueueConfig
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // Validate config
      if (
        config.defaultMaxQueueSize !== undefined &&
        config.defaultMaxQueueSize < 0
      ) {
        throw new Error('Invalid defaultMaxQueueSize');
      }

      if (config.fdMaxQueueSize) {
        for (const [fdStr] of Object.entries(config.fdMaxQueueSize)) {
          // Validate FD string is numeric
          if (!/^\d+$/.test(fdStr)) {
            throw new Error('Invalid FD in fdMaxQueueSize');
          }
        }
      }

      const result = binding.configureWriteQueues(config);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

// =============================================================================
// Phase 7: Shutdown Management Functions
// =============================================================================

/**
 * Initialize shutdown manager
 * @returns Promise resolving to true if initialization succeeded
 */
export async function initializeShutdownManager(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const result = binding.initializeShutdownManager();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Initiate graceful shutdown
 * @param reason - Reason for shutdown
 * @param timeout - Total timeout for shutdown process
 * @returns Promise resolving to true if shutdown initiated
 */
export async function initiateGracefulShutdown(
  reason: string = 'Manual shutdown',
  timeout: number = 15000
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      if (timeout < 0) {
        throw new Error('Invalid timeout');
      }

      const result = binding.initiateGracefulShutdown(reason, timeout);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Force immediate shutdown
 * @param reason - Reason for forced shutdown
 * @returns Promise resolving to true
 */
export async function forceImmediateShutdown(
  reason: string = 'Forced shutdown'
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const result = binding.forceImmediateShutdown(reason);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get current shutdown state
 * @returns Promise resolving to current shutdown state
 */
export async function getShutdownState(): Promise<ShutdownState> {
  return new Promise((resolve, reject) => {
    try {
      const stateValue = binding.getShutdownState();
      const states: ShutdownState[] = [
        'RUNNING',
        'DRAINING',
        'UNMOUNTING',
        'CLOSED',
      ];
      const state = states[stateValue] || 'RUNNING';
      resolve(state);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get shutdown statistics
 * @returns Promise resolving to shutdown statistics
 */
export async function getShutdownStats(): Promise<ShutdownStats> {
  return new Promise((resolve, reject) => {
    try {
      const stats = binding.getShutdownStats();
      resolve(stats);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Register shutdown callback
 * @param callback - Shutdown callback object
 * @returns Promise resolving to true if registration succeeded
 */
export async function registerShutdownCallback(
  callback: ShutdownCallback
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      if (!callback || typeof callback !== 'object') {
        throw new Error('Callback must be an object');
      }

      // Validate callback methods are functions
      for (const [, value] of Object.entries(callback)) {
        if (value !== undefined && typeof value !== 'function') {
          throw new Error('Callback methods must be functions');
        }
      }

      const result = binding.registerShutdownCallback(callback);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Wait for shutdown completion
 * @param timeout - Timeout in milliseconds
 * @returns Promise resolving to true if shutdown completed within timeout
 */
export async function waitForShutdownCompletion(
  timeout: number = 30000
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const result = binding.waitForShutdownCompletion(timeout);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Configure shutdown timeouts
 * @param timeouts - Shutdown timeout configuration
 * @returns Promise resolving to true if configuration succeeded
 */
export async function configureShutdownTimeouts(
  timeouts: ShutdownTimeouts
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // Validate timeout values
      for (const [, timeout] of Object.entries(timeouts)) {
        if (timeout !== undefined && timeout <= 0) {
          throw new Error('Invalid timeout value');
        }
      }

      const result = binding.configureShutdownTimeouts(timeouts);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

// =============================================================================
// Extended Attributes (xattr) API
// =============================================================================

/**
 * Get extended attribute value
 *
 * @param path File path
 * @param name Attribute name
 * @param size Optional buffer size (0 for size query)
 * @returns Object with size and optional data buffer
 */
export async function getxattr(
  path: string,
  name: string,
  size?: bigint
): Promise<{ size: bigint; data?: Buffer }> {
  if (typeof path !== 'string' || !path.length) {
    throw new Error('Path must be a non-empty string');
  }

  if (typeof name !== 'string' || !name.length) {
    throw new Error('Attribute name must be a non-empty string');
  }

  const result = binding.getxattr(path, name, size || 0n);

  if (typeof result === 'bigint') {
    // Check if it's an error (negative value)
    if (result < 0n) {
      throw new FuseErrno(Number(-result), 'getxattr failed');
    }
    // Size query result - positive or zero values are success
    return { size: result };
  }

  // Success with data
  return {
    size: result.size,
    data: result.data,
  };
}

/**
 * Set extended attribute value
 *
 * @param path File path
 * @param name Attribute name
 * @param value Attribute value
 * @param flags Creation flags (XATTR_CREATE, XATTR_REPLACE)
 */
export async function setxattr(
  path: string,
  name: string,
  value: Buffer,
  flags: number = 0
): Promise<void> {
  if (typeof path !== 'string' || !path.length) {
    throw new Error('Path must be a non-empty string');
  }

  if (typeof name !== 'string' || !name.length) {
    throw new Error('Attribute name must be a non-empty string');
  }

  if (!Buffer.isBuffer(value)) {
    throw new Error('Value must be a Buffer');
  }

  const result = binding.setxattr(path, name, value, flags);

  if (typeof result === 'bigint') {
    // Check if it's an error (negative value)
    if (result < 0n) {
      throw new FuseErrno(Number(-result), 'setxattr failed');
    }
    // Success case - result is 0 or positive
  }
}

/**
 * List extended attribute names
 *
 * @param path File path
 * @param size Optional buffer size (0 for size query)
 * @returns Object with size and optional names array
 */
export async function listxattr(
  path: string,
  size?: bigint
): Promise<{ size: bigint; names?: string[] }> {
  if (typeof path !== 'string' || !path.length) {
    throw new Error('Path must be a non-empty string');
  }
  const result = binding.listxattr(path, size || 0n);

  if (typeof result === 'bigint') {
    // Check if it's an error (negative value)
    if (result < 0n) {
      throw new FuseErrno(Number(-result), 'listxattr failed');
    }
    // Size query result - positive or zero values are success
    return { size: result };
  }

  // Success with names
  return {
    size: result.size,
    names: result.names,
  };
}

/**
 * Remove extended attribute
 *
 * @param path File path
 * @param name Attribute name
 */
export async function removexattr(path: string, name: string): Promise<void> {
  if (typeof path !== 'string' || !path.length) {
    throw new Error('Path must be a non-empty string');
  }

  if (typeof name !== 'string' || !name.length) {
    throw new Error('Attribute name must be a non-empty string');
  }

  const result = binding.removexattr(path, name);

  if (typeof result === 'bigint') {
    // Check if it's an error (negative value)
    if (result < 0n) {
      throw new FuseErrno(Number(-result), 'removexattr failed');
    }
    // Success case - result is 0 or positive
  }
}

// Re-export native constants
export const errno = binding.errno;
export const mode = binding.mode;
export const flags = binding.flags;
export const xattr = binding.xattr;

// Default export
const fuseNative = {
  createSession,
  getVersion,
  checkCapabilities,
  getMountOptions,
  isMounted,
  listMounts,
  copyFileRange,
  setCopyChunkSize,
  getCopyChunkSize,
  getCopyStats,
  resetCopyStats,
  // Phase 7: TSFN Dispatcher
  initializeDispatcher,
  shutdownDispatcher,
  getDispatcherStats,
  resetDispatcherStats,
  setDispatcherConfig,
  setOperationHandler,
  removeOperationHandler,
  // Phase 7: Write Queues
  enqueueWrite,
  processWriteQueues,
  flushWriteQueue,
  flushAllWriteQueues,
  getWriteQueueStats,
  resetWriteQueueStats,
  configureWriteQueues,
  // Phase 7: Shutdown Management
  initializeShutdownManager,
  initiateGracefulShutdown,
  forceImmediateShutdown,
  getShutdownState,
  getShutdownStats,
  registerShutdownCallback,
  waitForShutdownCompletion,
  configureShutdownTimeouts,
  // Phase 8: Extended Attributes
  getxattr,
  setxattr,
  listxattr,
  removexattr,
  errno,
  mode,
  flags,
  xattr,
};

export default fuseNative;
