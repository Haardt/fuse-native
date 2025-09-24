/**
 * @file session.ts
 * @brief FUSE session management and lifecycle control
 *
 * This module provides the FuseSession implementation for managing FUSE
 * filesystem sessions, including mounting, unmounting, and resource cleanup.
 */

import type {
  FuseSession,
  FuseSessionOptions,
  FuseOperationHandlers,
  MountOptions,
  UnmountOptions,
} from './types.js';

import { FuseErrno, toFuseError } from './errors.js';

/**
 * Session state enumeration
 */
export enum SessionState {
  CREATED = 'created',
  MOUNTING = 'mounting',
  MOUNTED = 'mounted',
  UNMOUNTING = 'unmounting',
  DESTROYED = 'destroyed',
}

/**
 * FUSE session implementation
 */
export class FuseSessionImpl implements FuseSession {
  private readonly _mountpoint: string;
  private readonly options: Required<FuseSessionOptions>;
  private readonly binding: any;
  private readonly registeredOperations: (keyof FuseOperationHandlers)[];

  private state: SessionState = SessionState.CREATED;
  private sessionHandle: any = null;
  private mountPromise: Promise<void> | null = null;
  private unmountPromise: Promise<void> | null = null;

  constructor(
    mountpoint: string,
    operations: FuseOperationHandlers,
    options: FuseSessionOptions,
    binding: any
  ) {
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

    // Register operation handlers
    this.registeredOperations = [];
    for (const opName in operations) {
      const op = opName as keyof FuseOperationHandlers;
      const handler = operations[op];
      if (handler) {
        this.binding.setOperationHandler(op, handler);
        this.registeredOperations.push(op);
      }
    }

    // Setup cleanup on process exit
    if (this.options.autoUnmount) {
      this.setupExitHandlers();
    }
  }

  /**
   * Get mountpoint path
   */
  get mountpoint(): string {
    return this._mountpoint;
  }

  /**
   * Check if filesystem is mounted
   */
  get mounted(): boolean {
    return this.state === SessionState.MOUNTED;
  }

  /**
   * Check if session is ready to handle operations
   */
  get ready(): boolean {
    return this.state === SessionState.MOUNTED && this.sessionHandle !== null;
  }

  /**
   * Mount the filesystem
   */
  async mount(options: MountOptions = {}): Promise<void> {
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
    } catch (error) {
      this.state = SessionState.CREATED;
      this.mountPromise = null;
      throw toFuseError(error);
    }
  }

  /**
   * Unmount the filesystem
   */
  async unmount(options: UnmountOptions = {}): Promise<void> {
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
    } catch (error) {
      this.state = SessionState.MOUNTED; // Revert state on failure
      throw toFuseError(error);
    } finally {
      this.unmountPromise = null;
    }
  }

  /**
   * Destroy the session and cleanup resources
   */
  async destroy(): Promise<void> {
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
      for (const op of this.registeredOperations) {
        this.binding.removeOperationHandler(op);
      }
    } catch (error) {
      console.error('Error during session cleanup:', error);
    } finally {
      this.state = SessionState.DESTROYED;
    }
  }

  /**
   * Perform the actual mount operation
   */
  private async performMount(options: MountOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create native session
        this.sessionHandle = this.binding.createSession({
          mountpoint: this.mountpoint,
          options: this.options,
        });

        // Mount the filesystem
        this.binding.mount(
          this.sessionHandle,
          {
            ...options,
            timeout: options.timeout || 30000,
          },
          (error: any) => {
            if (error) {
              reject(toFuseError(error));
            } else {
              resolve();
            }
          }
        );
      } catch (error) {
        reject(toFuseError(error));
      }
    });
  }

  /**
   * Perform the actual unmount operation
   */
  private async performUnmount(options: UnmountOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.sessionHandle) {
        resolve();
        return;
      }

      try {
        this.binding.unmount(
          this.sessionHandle,
          {
            ...options,
            timeout: options.timeout || 10000,
          },
          (error: any) => {
            if (error) {
              reject(toFuseError(error));
            } else {
              resolve();
            }
          }
        );
      } catch (error) {
        reject(toFuseError(error));
      }
    });
  }



  /**
   * Setup exit handlers for auto-unmount
   */
  private setupExitHandlers(): void {
    const cleanup = async () => {
      if (this.state === SessionState.MOUNTED) {
        try {
          await this.unmount({ force: true });
        } catch (error) {
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
        } catch (error) {
          console.error('Failed to cleanup session on exit:', error);
        }
      }
    });
  }
}

/**
 * Create a new FUSE session
 */
export function createFuseSession(
  mountpoint: string,
  operations: FuseOperationHandlers,
  options: FuseSessionOptions,
  binding: any
): FuseSession {
  return new FuseSessionImpl(mountpoint, operations, options, binding);
}

/**
 * Session factory with validation
 */
export function createSession(
  mountpoint: string,
  operations: FuseOperationHandlers,
  options: FuseSessionOptions = {},
  binding?: any
): FuseSession {
  // Mock binding for development/testing
  const mockBinding = binding || {
    createSession: () => ({ id: Math.random() }),
    destroySession: () => {},
    mount: (_session: any, _opts: any, callback: Function) => {
      setTimeout(() => callback(null), 100);
    },
    unmount: (_session: any, _opts: any, callback: Function) => {
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
  isValidMountpoint(path: string): boolean {
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
  normalizeMountpoint(path: string): string {
    if (!this.isValidMountpoint(path)) {
      throw new FuseErrno('EINVAL', `Invalid mountpoint: ${path}`);
    }

    return path;
  },

  /**
   * Get default session options
   */
  getDefaultOptions(): Required<FuseSessionOptions> {
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
