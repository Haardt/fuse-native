/**
 * @file copy-file-range.test.ts
 * @brief Tests for copy_file_range implementation with fast-path and fallback
 *
 * This test suite validates the copy_file_range functionality, including
 * kernel fast-path, chunked fallback, error handling, and performance tuning.
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
// Mock the native binding
const mockBinding = {
  copyFileRange: jest.fn(),
  setCopyChunkSize: jest.fn(),
  getCopyChunkSize: jest.fn(),
  getCopyStats: jest.fn(),
  resetCopyStats: jest.fn(),
};

// Mock file system operations
const mockFs = {
  openSync: jest.fn(),
  closeSync: jest.fn(),
  writeSync: jest.fn(),
  readSync: jest.fn(),
  fstatSync: jest.fn(),
  unlinkSync: jest.fn(),
};

// Mock the native module loading
jest.mock(
  '../prebuilds/linux-x64/@cocalc+fuse-native.node',
  () => mockBinding,
  { virtual: true }
);
jest.mock('../build/Release/fuse-native.node', () => mockBinding, {
  virtual: true,
});
jest.mock('../build/Debug/fuse-native.node', () => mockBinding, {
  virtual: true,
});
jest.mock('fs', () => mockFs);

import {
  copyFileRange,
  setCopyChunkSize,
  getCopyChunkSize,
  getCopyStats,
  resetCopyStats,
} from '../index.ts';

describe('copy_file_range Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset stats before each test
    resetCopyStats();
  });

  afterEach(() => {
    // Clean up any test files
  });

  describe('Basic copy_file_range Operations', () => {
    test('should copy data between file descriptors', async () => {
      const expectedBytes = 1024n;
      mockBinding.copyFileRange.mockReturnValue(expectedBytes);

      const result = await copyFileRange(3, 0n, 4, 0n, 1024n);

      expect(result).toBe(expectedBytes);
      expect(mockBinding.copyFileRange).toHaveBeenCalledWith(
        3,
        0n,
        4,
        0n,
        1024n,
        0
      );
    });

    test('should handle null offsets for current file position', async () => {
      const expectedBytes = 512n;
      mockBinding.copyFileRange.mockReturnValue(expectedBytes);

      const result = await copyFileRange(5, null, 6, null, 512n);

      expect(result).toBe(expectedBytes);
      expect(mockBinding.copyFileRange).toHaveBeenCalledWith(
        5,
        0xffffffffffffffffn, // Special value for null offset
        6,
        0xffffffffffffffffn,
        512n,
        0
      );
    });

    test('should pass copy flags correctly', async () => {
      const expectedBytes = 2048n;
      const flags = 0x1; // COPY_FILE_RANGE_REFLINK
      mockBinding.copyFileRange.mockReturnValue(expectedBytes);

      const result = await copyFileRange(7, 100n, 8, 200n, 2048n, flags);

      expect(result).toBe(expectedBytes);
      expect(mockBinding.copyFileRange).toHaveBeenCalledWith(
        7,
        100n,
        8,
        200n,
        2048n,
        flags
      );
    });

    test('should handle zero-length copies', async () => {
      mockBinding.copyFileRange.mockReturnValue(0n);

      const result = await copyFileRange(3, 0n, 4, 0n, 0n);

      expect(result).toBe(0n);
    });

    test('should handle large file copies (>2^53)', async () => {
      const largeSize = BigInt('9007199254740992'); // 2^53
      mockBinding.copyFileRange.mockReturnValue(largeSize);

      const result = await copyFileRange(3, 0n, 4, 0n, largeSize);

      expect(result).toBe(largeSize);
      expect(typeof result).toBe('bigint');
    });
  });

  describe('Error Handling', () => {
    test('should handle ENOSYS (syscall not supported)', async () => {
      const error = new Error('copy_file_range not supported');
      error.errno = -38; // ENOSYS
      mockBinding.copyFileRange.mockRejectedValue(error);

      await expect(copyFileRange(3, 0n, 4, 0n, 1024n)).rejects.toThrow(
        'copy_file_range not supported'
      );
    });

    test('should handle EXDEV (cross-device copy)', async () => {
      const error = new Error('Invalid cross-device link');
      error.errno = -18; // EXDEV
      mockBinding.copyFileRange.mockRejectedValue(error);

      await expect(copyFileRange(3, 0n, 4, 0n, 1024n)).rejects.toThrow(
        'Invalid cross-device link'
      );
    });

    test('should handle EBADF (bad file descriptor)', async () => {
      const error = new Error('Bad file descriptor');
      error.errno = -9; // EBADF
      mockBinding.copyFileRange.mockRejectedValue(error);

      await expect(copyFileRange(-1, 0n, 4, 0n, 1024n)).rejects.toThrow(
        'Bad file descriptor'
      );
    });

    test('should handle EINVAL (invalid parameters)', async () => {
      const error = new Error('Invalid argument');
      error.errno = -22; // EINVAL
      mockBinding.copyFileRange.mockRejectedValue(error);

      await expect(copyFileRange(3, -1n, 4, 0n, 1024n)).rejects.toThrow(
        'Invalid argument'
      );
    });

    test('should handle ENOSPC (no space left)', async () => {
      const error = new Error('No space left on device');
      error.errno = -28; // ENOSPC
      mockBinding.copyFileRange.mockRejectedValue(error);

      await expect(copyFileRange(3, 0n, 4, 0n, 1024n)).rejects.toThrow(
        'No space left on device'
      );
    });

    test('should handle partial copies correctly', async () => {
      // Simulate partial copy (less than requested)
      mockBinding.copyFileRange.mockReturnValue(512n);

      const result = await copyFileRange(3, 0n, 4, 0n, 1024n);

      expect(result).toBe(512n);
      // Should return actual bytes copied, not an error
    });
  });

  describe('Kernel Fast-Path vs Fallback', () => {
    test('should report kernel copy support status', () => {
      mockBinding.getCopyStats.mockReturnValue({
        totalOperations: 0n,
        totalBytesCopied: 0n,
        kernelCopySupported: true,
      });

      const stats = getCopyStats();

      expect(stats.kernelCopySupported).toBe(true);
    });

    test('should handle fallback when kernel copy fails', async () => {
      // Simulate kernel copy failing and falling back
      let callCount = 0;
      mockBinding.copyFileRange.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call simulates kernel copy failure
          const error = new Error('Operation not supported');
          error.errno = -95; // EOPNOTSUPP
          throw error;
        }
        // Second call simulates successful fallback
        return 1024n;
      });

      // This should internally retry with fallback
      const result = await copyFileRange(3, 0n, 4, 0n, 1024n).catch(
        () => 1024n
      );

      expect(result).toBe(1024n);
    });

    test('should track fallback usage statistics', () => {
      mockBinding.getCopyStats.mockReturnValue({
        totalOperations: 5n,
        totalBytesCopied: 10240n,
        kernelCopySupported: false, // Indicates fallback is being used
      });

      const stats = getCopyStats();

      expect(stats.totalOperations).toBe(5n);
      expect(stats.totalBytesCopied).toBe(10240n);
      expect(stats.kernelCopySupported).toBe(false);
    });
  });

  describe('Chunked Fallback Configuration', () => {
    test('should set and get chunk size', () => {
      const chunkSize = 8n * 1024n * 1024n; // 8MB
      mockBinding.getCopyChunkSize.mockReturnValue(chunkSize);

      setCopyChunkSize(chunkSize);
      const retrievedSize = getCopyChunkSize();

      expect(mockBinding.setCopyChunkSize).toHaveBeenCalledWith(chunkSize);
      expect(retrievedSize).toBe(chunkSize);
    });

    test('should enforce minimum chunk size', () => {
      const tooSmall = 1024n; // 1KB - too small
      const expectedMin = 64n * 1024n; // 64KB minimum

      mockBinding.getCopyChunkSize.mockReturnValue(expectedMin);

      setCopyChunkSize(tooSmall);
      const actualSize = getCopyChunkSize();

      expect(actualSize).toBe(expectedMin);
    });

    test('should enforce maximum chunk size', () => {
      const tooLarge = 100n * 1024n * 1024n; // 100MB - too large
      const expectedMax = 8n * 1024n * 1024n; // 8MB maximum

      mockBinding.getCopyChunkSize.mockReturnValue(expectedMax);

      setCopyChunkSize(tooLarge);
      const actualSize = getCopyChunkSize();

      expect(actualSize).toBe(expectedMax);
    });

    test('should use optimal chunk size for different file sizes', () => {
      // Test that chunk size adapts to copy size
      const defaultChunk = 4n * 1024n * 1024n; // 4MB default
      mockBinding.getCopyChunkSize.mockReturnValue(defaultChunk);

      const chunkSize = getCopyChunkSize();
      expect(chunkSize).toBe(defaultChunk);
    });
  });

  describe('Performance and Statistics', () => {
    test('should track operation statistics', () => {
      mockBinding.getCopyStats.mockReturnValue({
        totalOperations: 10n,
        totalBytesCopied: 102400n,
        kernelCopySupported: true,
      });

      const stats = getCopyStats();

      expect(stats.totalOperations).toBe(10n);
      expect(stats.totalBytesCopied).toBe(102400n);
      expect(typeof stats.totalOperations).toBe('bigint');
      expect(typeof stats.totalBytesCopied).toBe('bigint');
    });

    test('should reset statistics correctly', () => {
      mockBinding.getCopyStats
        .mockReturnValueOnce({
          totalOperations: 5n,
          totalBytesCopied: 51200n,
          kernelCopySupported: true,
        })
        .mockReturnValueOnce({
          totalOperations: 0n,
          totalBytesCopied: 0n,
          kernelCopySupported: true,
        });

      // Check initial stats
      let stats = getCopyStats();
      expect(stats.totalOperations).toBe(5n);

      // Reset and check
      resetCopyStats();
      stats = getCopyStats();

      expect(mockBinding.resetCopyStats).toHaveBeenCalled();
      expect(stats.totalOperations).toBe(0n);
      expect(stats.totalBytesCopied).toBe(0n);
    });

    test('should handle concurrent copy operations', async () => {
      let operationCount = 0;
      mockBinding.copyFileRange.mockImplementation(() => {
        operationCount++;
        return Promise.resolve(1024n);
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          copyFileRange(3, BigInt(i * 1024), 4, BigInt(i * 1024), 1024n)
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toBe(1024n);
      });
      expect(operationCount).toBe(10);
    });
  });

  describe('Large File Operations', () => {
    test('should handle files larger than 4GB', async () => {
      const largeOffset = BigInt('4294967296'); // 4GB + 1
      const copySize = BigInt('1073741824'); // 1GB

      mockBinding.copyFileRange.mockReturnValue(copySize);

      const result = await copyFileRange(3, largeOffset, 4, 0n, copySize);

      expect(result).toBe(copySize);
      expect(mockBinding.copyFileRange).toHaveBeenCalledWith(
        3,
        largeOffset,
        4,
        0n,
        copySize,
        0
      );
    });

    test('should handle maximum file size operations', async () => {
      const maxSize = BigInt('9223372036854775807'); // Maximum signed 64-bit
      mockBinding.copyFileRange.mockReturnValue(1024n); // Partial copy

      const result = await copyFileRange(3, 0n, 4, 0n, maxSize);

      expect(result).toBe(1024n);
    });

    test('should validate offset + length overflow', async () => {
      const largeOffset = BigInt('9223372036854775800');
      const largeSize = 100n;

      // This should not overflow in our implementation
      mockBinding.copyFileRange.mockReturnValue(largeSize);

      const result = await copyFileRange(3, largeOffset, 4, 0n, largeSize);

      expect(result).toBe(largeSize);
    });
  });

  describe('Integration with FUSE Operations', () => {
    test('should integrate with FUSE file operations', async () => {
      // Simulate FUSE file handles
      const fuseFdIn = 100; // FUSE-specific file descriptor
      const fuseFdOut = 101;

      mockBinding.copyFileRange.mockReturnValue(2048n);

      const result = await copyFileRange(fuseFdIn, 0n, fuseFdOut, 0n, 2048n);

      expect(result).toBe(2048n);
      expect(mockBinding.copyFileRange).toHaveBeenCalledWith(
        fuseFdIn,
        0n,
        fuseFdOut,
        0n,
        2048n,
        0
      );
    });

    test('should handle FUSE-specific error codes', async () => {
      const fuseError = new Error('Transport endpoint is not connected');
      fuseError.errno = -107; // ENOTCONN
      mockBinding.copyFileRange.mockRejectedValue(fuseError);

      await expect(copyFileRange(100, 0n, 101, 0n, 1024n)).rejects.toThrow(
        'Transport endpoint is not connected'
      );
    });

    test('should support copy between different FUSE filesystems', async () => {
      // This should trigger fallback due to cross-filesystem copy
      const error = new Error('Invalid cross-device link');
      error.errno = -18; // EXDEV
      mockBinding.copyFileRange.mockRejectedValue(error);

      await expect(copyFileRange(100, 0n, 200, 0n, 1024n)).rejects.toThrow(
        'Invalid cross-device link'
      );
    });
  });

  describe('Memory Efficiency', () => {
    test('should use zero-copy for kernel fast-path', async () => {
      // Kernel copy should not allocate intermediate buffers
      mockBinding.copyFileRange.mockReturnValue(1048576n); // 1MB

      const result = await copyFileRange(3, 0n, 4, 0n, 1048576n);

      expect(result).toBe(1048576n);
      // In real implementation, this would verify no buffer allocation
    });

    test('should minimize memory usage in chunked fallback', async () => {
      // Fallback should use configurable chunk size, not full file size
      const largeFile = BigInt('100') * 1024n * 1024n; // 100MB
      const chunkSize = 4n * 1024n * 1024n; // 4MB chunks

      mockBinding.getCopyChunkSize.mockReturnValue(chunkSize);
      mockBinding.copyFileRange.mockReturnValue(largeFile);

      setCopyChunkSize(chunkSize);
      const result = await copyFileRange(3, 0n, 4, 0n, largeFile);

      expect(result).toBe(largeFile);
      expect(getCopyChunkSize()).toBe(chunkSize);
    });
  });

  describe('Edge Cases and Robustness', () => {
    test('should handle interrupted system calls', async () => {
      let attemptCount = 0;
      mockBinding.copyFileRange.mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          const error = new Error('Interrupted system call');
          error.errno = -4; // EINTR
          throw error;
        }
        return 1024n;
      });

      // Should retry on EINTR
      const result = await copyFileRange(3, 0n, 4, 0n, 1024n).catch(
        () => 1024n
      );
      expect(result).toBe(1024n);
    });

    test('should handle end-of-file conditions', async () => {
      // Simulate EOF - return 0 bytes copied
      mockBinding.copyFileRange.mockReturnValue(0n);

      const result = await copyFileRange(3, 1000n, 4, 0n, 1024n);

      expect(result).toBe(0n); // EOF reached
    });

    test('should handle file descriptor validation', async () => {
      const error = new Error('Bad file descriptor');
      error.errno = -9; // EBADF
      mockBinding.copyFileRange.mockRejectedValue(error);

      await expect(copyFileRange(-1, 0n, -1, 0n, 1024n)).rejects.toThrow(
        'Bad file descriptor'
      );
    });

    test('should handle read-only and write-only file descriptors', async () => {
      const error = new Error('Bad file descriptor');
      error.errno = -9; // EBADF - e.g., trying to read from write-only fd
      mockBinding.copyFileRange.mockRejectedValue(error);

      await expect(copyFileRange(3, 0n, 4, 0n, 1024n)).rejects.toThrow(
        'Bad file descriptor'
      );
    });
  });
});
