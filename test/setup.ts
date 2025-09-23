/**
 * @file setup.ts
 * @brief Jest test setup configuration for FUSE3 Node.js binding tests
 *
 * This file configures the test environment, sets up mocks, and provides
 * utilities for testing FUSE operations without requiring actual mounts.
 */

import { jest } from '@jest/globals';

// Add BigInt serialization support for Jest
expect.addSnapshotSerializer({
  serialize(val) {
    return val.toString() + 'n';
  },
  test(val) {
    return typeof val === 'bigint';
  },
});

// Override JSON.stringify to handle BigInt
const originalStringify = JSON.stringify;
JSON.stringify = function (value: any, ...args: any[]) {
  return originalStringify(
    value,
    (key, val) => {
      if (typeof val === 'bigint') {
        return val.toString() + 'n';
      }
      return val;
    },
    ...args.slice(1)
  );
};

// Extend Jest matchers for BigInt support
expect.extend({
  /**
   * Custom matcher for BigInt values
   */
  toBeBigInt(received: unknown) {
    const pass = typeof received === 'bigint';
    if (pass) {
      return {
        message: () => `expected ${received} not to be a BigInt`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a BigInt`,
        pass: false,
      };
    }
  },

  /**
   * Custom matcher for BigInt equality with tolerance
   */
  toBeCloseToBigInt(
    received: unknown,
    expected: bigint,
    tolerance: bigint = 0n
  ) {
    if (typeof received !== 'bigint') {
      return {
        message: () => `expected ${received} to be a BigInt`,
        pass: false,
      };
    }

    const diff =
      received > expected ? received - expected : expected - received;
    const pass = diff <= tolerance;

    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be close to ${expected} (tolerance: ${tolerance})`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be close to ${expected} (tolerance: ${tolerance}), but difference was ${diff}`,
        pass: false,
      };
    }
  },

  /**
   * Custom matcher for branded types
   */
  toBeBrandedType(received: unknown, expectedBrand: string) {
    // Since branded types are compile-time only, we can only check the underlying type
    const pass = typeof received === 'number' || typeof received === 'bigint';
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be a valid branded type for ${expectedBrand}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be a valid branded type for ${expectedBrand}`,
        pass: false,
      };
    }
  },
});

// Augment Jest matchers type definitions
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeBigInt(): R;
      toBeCloseToBigInt(expected: bigint, tolerance?: bigint): R;
      toBeBrandedType(expectedBrand: string): R;
    }
  }
}

// Mock native binding for tests that don't need actual FUSE functionality
const mockBinding = {
  getVersion: jest.fn(() => ({
    fuse: '3.14.1',
    binding: '3.0.0-alpha.1',
    napi: '8',
  })),
  createSession: jest.fn(),
  destroySession: jest.fn(),
  mount: jest.fn(),
  unmount: jest.fn(),
  isReady: jest.fn(() => true),
  setOperationHandler: jest.fn(),
  removeOperationHandler: jest.fn(),
  errno: {
    ENOENT: -2,
    EACCES: -13,
    EEXIST: -17,
    EISDIR: -21,
    ENOTDIR: -20,
    ENOTEMPTY: -39,
    EPERM: -1,
    EIO: -5,
    ENOMEM: -12,
    ENOSPC: -28,
    EINVAL: -22,
  },
  mode: {
    S_IFMT: 61440,
    S_IFREG: 32768,
    S_IFDIR: 16384,
    S_IFLNK: 40960,
    S_IRWXU: 448,
    S_IRUSR: 256,
    S_IWUSR: 128,
    S_IXUSR: 64,
  },
  flags: {
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
    O_CREAT: 64,
    O_EXCL: 128,
    O_TRUNC: 512,
    O_APPEND: 1024,
  },
};

// Set up mock environment variable for testing
process.env.NODE_ENV = 'test';
process.env.FUSE_NATIVE_TEST = 'true';

// Global test utilities
global.mockBinding = mockBinding;

// Helper functions for tests
global.createMockStat = () => ({
  ino: 1n,
  mode: 33188, // Regular file, 644 permissions
  nlink: 1,
  uid: 1000,
  gid: 1000,
  rdev: 0n,
  size: 1024n,
  blksize: 4096,
  blocks: 8n,
  atime: BigInt(Date.now()) * 1_000_000n,
  mtime: BigInt(Date.now()) * 1_000_000n,
  ctime: BigInt(Date.now()) * 1_000_000n,
});

global.createMockFileInfo = () => ({
  fh: 42,
  flags: 2, // O_RDWR
  direct_io: false,
  keep_cache: false,
  flush: false,
  nonseekable: false,
  cache_readdir: false,
  parallel_direct_writes: false,
});

global.createMockContext = () => ({
  uid: 1000,
  gid: 1000,
  pid: 12345,
  umask: 18, // 022
});

// Helper functions for creating branded types
global.createUid = (value: number) => value as any;
global.createGid = (value: number) => value as any;
global.createMode = (value: number) => value as any;
global.createFlags = (value: number) => value as any;

// Typed helper functions for tests
global.createMockRequestContext = () => ({
  uid: global.createUid(1000),
  gid: global.createGid(1000),
  pid: 12345,
  umask: global.createMode(18), // 022
});

// Timeout for async tests
jest.setTimeout(10000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Clean up after all tests
afterAll(() => {
  jest.restoreAllMocks();
});

// Console log filtering for tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

if (process.env.JEST_SILENT !== 'false') {
  console.log = (...args: any[]) => {
    // Only log if it's a test-specific message or debug is enabled
    if (
      process.env.DEBUG ||
      args.some(
        arg =>
          typeof arg === 'string' &&
          (arg.includes('[TEST]') || arg.includes('[DEBUG]'))
      )
    ) {
      originalConsoleLog(...args);
    }
  };

  console.error = (...args: any[]) => {
    // Always log errors, but filter out expected test errors
    if (
      !args.some(
        arg => typeof arg === 'string' && arg.includes('[EXPECTED_ERROR]')
      )
    ) {
      originalConsoleError(...args);
    }
  };

  console.warn = (...args: any[]) => {
    // Log warnings unless explicitly marked as expected
    if (
      !args.some(
        arg => typeof arg === 'string' && arg.includes('[EXPECTED_WARN]')
      )
    ) {
      originalConsoleWarn(...args);
    }
  };
}

// Type declarations for global test utilities
declare global {
  var mockBinding: typeof mockBinding;

  function createMockStat(): {
    ino: bigint;
    mode: number;
    nlink: number;
    uid: number;
    gid: number;
    rdev: bigint;
    size: bigint;
    blksize: number;
    blocks: bigint;
    atime: bigint;
    mtime: bigint;
    ctime: bigint;
  };

  function createMockFileInfo(): {
    fh: number;
    flags: number;
    direct_io: boolean;
    keep_cache: boolean;
    flush: boolean;
    nonseekable: boolean;
    cache_readdir: boolean;
    parallel_direct_writes: boolean;
  };

  function createMockContext(): {
    uid: number;
    gid: number;
    pid: number;
    umask: number;
  };

  function createUid(value: number): any;
  function createGid(value: number): any;
  function createMode(value: number): any;
  function createFlags(value: number): any;

  function createMockRequestContext(): {
    uid: any;
    gid: any;
    pid: number;
    umask: any;
  };
}
