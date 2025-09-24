/**
 * @file index.ts
 * @brief Main TypeScript API entry point for FUSE3 Node.js binding
 *
 * This module provides the modern ESM API with Promise-based operations,
 * BigInt support for 64-bit values, and strict TypeScript types.
 */

// Use simple require for both Jest and Node.js environments
// Jest mocks will override the actual require calls
let binding: any;

try {
  // This will work in Jest (with mocks) and Node.js CJS environments
  // For pure ESM, the binding will be handled by the build system
  const req = eval('require');
  try {
    binding = req('../prebuilds/linux-x64/@cocalc+fuse-native.node');
  } catch {
    try {
      binding = req('../build/Release/fuse-native.node');
    } catch {
      binding = req('../build/Debug/fuse-native.node');
    }
  }
} catch (error) {
  console.warn('Failed to load native binding:', error);
  binding = {}; // Fallback for tests or pure ESM without require
}

// Re-export types
export * from './types.js';
export * from './errors.js';
export * from './helpers.js';
export * from './time.js';
export * from './abort.js';
export * from './ops/index.js';
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
import {
  createEffectiveSignal,
  withAbort,
  validateAbortOptions,
  type AbortOptions,
} from './abort.js';

// Re-export native constants with fallbacks
export const errno = {};
export const mode = {};
export const flags = {};
export const xattr = {};

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
 * FUSE connection information from init callback
 */
export interface FuseConnectionInfo {
  /** Protocol major version */
  protoMajor: number;
  /** Protocol minor version */
  protoMinor: number;
  /** Available capabilities */
  capable: number;
  /** Wanted capabilities */
  want: number;
  /** Maximum write size */
  maxWrite: number;
  /** Maximum read size */
  maxRead: number;
  /** Maximum readahead */
  maxReadahead: number;
  /** Maximum background requests */
  maxBackground: number;
  /** Congestion threshold */
  congestionThreshold: number;
  /** Time granularity in nanoseconds */
  timeGranNs: number;
  /** Available capability flags */
  caps: number[];
}

/**
 * FUSE configuration from init callback
 */
export interface FuseConfig {
  /** Override GID flag */
  setGid: number;
  /** GID value */
  gid: number;
  /** Override UID flag */
  setUid: number;
  /** UID value */
  uid: number;
  /** Override mode flag */
  setMode: number;
  /** Umask value */
  umask: number;
  /** Entry timeout in seconds */
  entryTimeout: number;
  /** Negative timeout in seconds */
  negativeTimeout: number;
  /** Attribute timeout in seconds */
  attrTimeout: number;
  /** Use inode numbers */
  useIno: number;
  /** Readdir inode numbers */
  readdirIno: number;
  /** Direct I/O flag */
  directIo: number;
  /** Kernel cache flag */
  kernelCache: number;
  /** Auto cache flag */
  autoCache: number;
  /** AC attribute timeout set flag */
  acAttrTimeoutSet: number;
  /** AC attribute timeout */
  acAttrTimeout: number;
  /** Nullpath ok flag */
  nullpathOk: number;
  /** Show help flag */
  showHelp: number;
  /** Debug flag */
  debug: number;
}

/**
 * Mount options structure
 */
export interface MountOptions {
  /** Available mount options */
  available: string[];
  /** Default recommended options */
  defaults: string[];
}

/**
 * Init callback function type
 */
export type InitCallback = (
  connectionInfo: FuseConnectionInfo,
  config: FuseConfig
) => void | Promise<void>;

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
/**
 * Check if specific FUSE capabilities are supported
 * @param capabilities Array of capability flags to check
 * @returns Promise resolving to true if all capabilities are supported
 */
export async function checkCapabilities(
  capabilities?: number[]
): Promise<boolean> {
  if (!capabilities || capabilities.length === 0) {
    return true;
  }

  return new Promise((resolve, reject) => {
    try {
      const result = binding.checkCapabilities(capabilities);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get available mount options for the current system
 * @returns Object with available and default mount options
 */
export function getMountOptions(): { available: string[]; defaults: string[] } {
  try {
    return binding.getAvailableMountOptions();
  } catch (error) {
    // Fallback to static list if native call fails
    return {
      available: [
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
        'atime',
        'noatime',
        'diratime',
        'nodiratime',
        'relatime',
        'norelatime',
        'strictatime',
        'nostrictatime',
        'uid',
        'gid',
        'umask',
        'entry_timeout',
        'negative_timeout',
        'attr_timeout',
        'ac_attr_timeout',
        'auto_cache',
        'noauto_cache',
        'cache_timeout',
        'max_write',
        'max_read',
        'max_readahead',
        'async_read',
        'sync_read',
        'atomic_o_trunc',
        'big_writes',
        'no_remote_lock',
        'no_remote_flock',
        'no_remote_posix_lock',
        'splice_write',
        'splice_move',
        'splice_read',
      ],
      defaults: [
        'default_permissions',
        'auto_unmount',
        'async_read',
        'atomic_o_trunc',
      ],
    };
  }
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
 * @param options - Abort and timeout options
 * @returns Promise resolving to number of bytes copied
 */
export async function copyFileRange(
  fdIn: number,
  offsetIn: bigint | null,
  fdOut: number,
  offsetOut: bigint | null,
  length: bigint,
  flags: number = 0,
  options?: AbortOptions
): Promise<bigint> {
  validateAbortOptions(options);
  const effectiveSignal = createEffectiveSignal(options);

  const copyPromise = new Promise<bigint>((resolve, reject) => {
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

  return withAbort(copyPromise, effectiveSignal);
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
export async function getDispatcherStats(
  options?: AbortOptions
): Promise<DispatcherStats> {
  validateAbortOptions(options);
  const effectiveSignal = createEffectiveSignal(options);

  const statsPromise = new Promise<DispatcherStats>((resolve, reject) => {
    try {
      const stats = binding.getDispatcherStats();
      resolve(stats);
    } catch (error) {
      reject(error);
    }
  });

  return withAbort(statsPromise, effectiveSignal);
}

/**
 * Reset TSFN dispatcher statistics
 * @returns Promise resolving to true if reset succeeded
 */
export async function resetDispatcherStats(
  options?: AbortOptions
): Promise<boolean> {
  validateAbortOptions(options);
  const effectiveSignal = createEffectiveSignal(options);

  const resetPromise = new Promise<boolean>((resolve, reject) => {
    try {
      const result = binding.resetDispatcherStats();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });

  return withAbort(resetPromise, effectiveSignal);
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
export async function resetWriteQueueStats(
  options?: AbortOptions
): Promise<boolean> {
  validateAbortOptions(options);
  const effectiveSignal = createEffectiveSignal(options);

  const resetPromise = new Promise<boolean>((resolve, reject) => {
    try {
      const result = binding.resetWriteQueueStats();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });

  return withAbort(resetPromise, effectiveSignal);
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
export async function initializeShutdownManager(
  options?: AbortOptions
): Promise<boolean> {
  validateAbortOptions(options);
  const effectiveSignal = createEffectiveSignal(options);

  const initPromise = new Promise<boolean>((resolve, reject) => {
    try {
      const result = binding.initializeShutdownManager();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });

  return withAbort(initPromise, effectiveSignal);
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
export async function getShutdownState(
  options?: AbortOptions
): Promise<ShutdownState> {
  validateAbortOptions(options);
  const effectiveSignal = createEffectiveSignal(options);

  const statePromise = new Promise<ShutdownState>((resolve, reject) => {
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

  return withAbort(statePromise, effectiveSignal);
}

/**
 * Get shutdown statistics
 * @returns Promise resolving to shutdown statistics
 */
export async function getShutdownStats(
  options?: AbortOptions
): Promise<ShutdownStats> {
  validateAbortOptions(options);
  const effectiveSignal = createEffectiveSignal(options);

  const statsPromise = new Promise<ShutdownStats>((resolve, reject) => {
    try {
      const stats = binding.getShutdownStats();
      resolve(stats);
    } catch (error) {
      reject(error);
    }
  });

  return withAbort(statsPromise, effectiveSignal);
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
 * @param options Abort and timeout options
 * @returns Object with size and optional data buffer
 */
export async function getxattr(
  path: string,
  name: string,
  size?: bigint,
  options?: AbortOptions
): Promise<{ size: bigint; data?: Buffer }> {
  if (typeof path !== 'string' || !path.length) {
    throw new Error('Path must be a non-empty string');
  }

  if (typeof name !== 'string' || !name.length) {
    throw new Error('Attribute name must be a non-empty string');
  }

  validateAbortOptions(options);
  const effectiveSignal = createEffectiveSignal(options);

  const getxattrPromise = Promise.resolve(
    binding.getxattr(path, name, size || 0n)
  );

  const processResult = getxattrPromise.then(result => {
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
  });

  return withAbort(processResult, effectiveSignal);
}

/**
 * Set extended attribute value
 *
 * @param path File path
 * @param name Attribute name
 * @param value Attribute value
 * @param flags Creation flags (XATTR_CREATE, XATTR_REPLACE)
 * @param options Abort and timeout options
 */
export async function setxattr(
  path: string,
  name: string,
  value: Buffer,
  flags: number = 0,
  options?: AbortOptions
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

  validateAbortOptions(options);
  const effectiveSignal = createEffectiveSignal(options);

  const setxattrPromise = Promise.resolve(
    binding.setxattr(path, name, value, flags)
  ).then(result => {
    if (result < 0n) {
      throw new FuseErrno(Number(-result), 'setxattr failed');
    }
  });

  return withAbort(setxattrPromise, effectiveSignal);
}

/**
 * List extended attribute names
 *
 * @param path File path
 * @param size Optional buffer size (0 for size query)
 * @param options Abort and timeout options
 * @returns Object with size and optional names array
 */
export async function listxattr(
  path: string,
  size?: bigint,
  options?: AbortOptions
): Promise<{ size: bigint; names?: string[] }> {
  if (typeof path !== 'string' || !path.length) {
    throw new Error('Path must be a non-empty string');
  }

  validateAbortOptions(options);
  const effectiveSignal = createEffectiveSignal(options);

  const listxattrPromise = Promise.resolve(
    binding.listxattr(path, size || 0n)
  ).then(result => {
    if (typeof result === 'bigint') {
      // Check if it's an error (negative value)
      if (result < 0n) {
        throw new FuseErrno(Number(-result), 'listxattr failed');
      }
      // Size query result
      return { size: result };
    }

    // Success with names
    return {
      size: result.size,
      names: result.names,
    };
  });

  return withAbort(listxattrPromise, effectiveSignal);
}

/**
 * Remove extended attribute
 *
 * @param path File path
 * @param name Attribute name
 * @param options Abort and timeout options
 */
export async function removexattr(
  path: string,
  name: string,
  options?: AbortOptions
): Promise<void> {
  if (typeof path !== 'string' || !path.length) {
    throw new Error('Path must be a non-empty string');
  }

  if (typeof name !== 'string' || !name.length) {
    throw new Error('Attribute name must be a non-empty string');
  }

  validateAbortOptions(options);
  const effectiveSignal = createEffectiveSignal(options);

  const removexattrPromise = Promise.resolve(
    binding.removexattr(path, name)
  ).then(result => {
    if (result < 0n) {
      throw new FuseErrno(Number(-result), 'removexattr failed');
    }
  });

  return withAbort(removexattrPromise, effectiveSignal);
}

/**
 * Initialize the init bridge for FUSE init callbacks
 */
export async function initializeInitBridge(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      binding.initializeInitBridge();
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Set callback function to be called during FUSE init
 * @param callback Function to call with connection info and config
 */
export async function setInitCallback(callback: InitCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const wrappedCallback = (
        connInfo: FuseConnectionInfo,
        config: FuseConfig
      ) => {
        try {
          const result = callback(connInfo, config);
          if (result instanceof Promise) {
            result.catch(console.error); // Log async errors but don't block FUSE
          }
        } catch (error) {
          console.error('Init callback error:', error);
        }
      };

      binding.setInitCallback(wrappedCallback);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Remove the init callback
 */
export async function removeInitCallback(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      binding.removeInitCallback();
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get current FUSE connection information
 * @returns Connection info or null if not available
 */
export function getConnectionInfo(): FuseConnectionInfo | null {
  try {
    return binding.getConnectionInfo();
  } catch (error) {
    return null;
  }
}

/**
 * Get current FUSE configuration
 * @returns Config or null if not available
 */
export function getFuseConfig(): FuseConfig | null {
  try {
    return binding.getFuseConfig();
  } catch (error) {
    return null;
  }
}

/**
 * Get capability names as human-readable strings
 * @returns Array of capability names
 */
export function getCapabilityNames(): string[] {
  try {
    return binding.getCapabilityNames();
  } catch (error) {
    return [];
  }
}

/**
 * Reset the init bridge state
 */
export async function resetInitBridge(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      binding.resetInitBridge();
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}



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
  // Phase 8: Extended Attributes (xattr)
  getxattr,
  setxattr,
  listxattr,
  removexattr,
  // Phase 9: Init/Capabilities & Mount-Optionen
  initializeInitBridge,
  setInitCallback,
  removeInitCallback,
  getConnectionInfo,
  getFuseConfig,
  getCapabilityNames,
  resetInitBridge,
};

export default fuseNative;
