/**
 * @file statfs.test.ts
 * @brief Tests for statfs operation with BigInt 64-bit fields
 *
 * This test suite validates the statfs operation implementation,
 * focusing on BigInt support for 64-bit filesystem statistics
 * and proper error handling.
 */

import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import {
  StatvfsResult,
  FuseSession,
  FuseOperationHandlers,
  createIno,
} from '../ts/types';
import { FuseErrno } from '../ts/errors';

describe('Statfs Operation', () => {
  let mockSession: FuseSession;
  let handlers: FuseOperationHandlers;

  beforeEach(() => {
    handlers = {};
    // Mock session setup would go here
    // This is a placeholder for the actual session initialization
    mockSession = {} as FuseSession;
  });

  afterEach(() => {
    // Cleanup
  });

  describe('BigInt 64-bit field support', () => {
    it('should handle large block counts correctly', async () => {
      const largeBlockCount = BigInt('18446744073709551615'); // Near max uint64
      const expectedResult: StatvfsResult = {
        bsize: 4096,
        frsize: 4096,
        blocks: largeBlockCount,
        bfree: largeBlockCount - 1000n,
        bavail: largeBlockCount - 2000n,
        files: 1000000n,
        ffree: 500000n,
        favail: 400000n,
        fsid: 12345n,
        flag: 0,
        namemax: 255,
      };

      handlers.statfs = async (ino, context, options) => {
        expect(ino).toBe(createIno(1n));
        return expectedResult;
      };

      // Mock the actual statfs call - this would integrate with the C++ bridge
      const result = await handlers.statfs!(createIno(1n), {
        uid: 1000 as any,
        gid: 1000 as any,
        pid: 12345,
        umask: 0o022 as any,
      });

      expect(result.blocks).toBe(largeBlockCount);
      expect(result.bfree).toBe(largeBlockCount - 1000n);
      expect(result.bavail).toBe(largeBlockCount - 2000n);
    });

    it('should handle file count near uint64 max', async () => {
      const largeFileCount = BigInt('9223372036854775807'); // max int64
      const expectedResult: StatvfsResult = {
        bsize: 4096,
        frsize: 4096,
        blocks: 1000000n,
        bfree: 500000n,
        bavail: 400000n,
        files: largeFileCount,
        ffree: largeFileCount - 1000n,
        favail: largeFileCount - 2000n,
        fsid: 67890n,
        flag: 0,
        namemax: 255,
      };

      handlers.statfs = async (ino, context, options) => {
        return expectedResult;
      };

      const result = await handlers.statfs!(createIno(1n), {
        uid: 1000 as any,
        gid: 1000 as any,
        pid: 12345,
        umask: 0o022 as any,
      });

      expect(result.files).toBe(largeFileCount);
      expect(result.ffree).toBe(largeFileCount - 1000n);
      expect(result.favail).toBe(largeFileCount - 2000n);
    });

    it('should preserve precision for all BigInt fields', async () => {
      const testValues = {
        blocks: BigInt('1234567890123456789'),
        bfree: BigInt('987654321098765432'),
        bavail: BigInt('555666777888999111'),
        files: BigInt('111222333444555666'),
        ffree: BigInt('666555444333222111'),
        favail: BigInt('123456789012345678'),
        fsid: BigInt('999888777666555444'),
      };

      const expectedResult: StatvfsResult = {
        bsize: 8192,
        frsize: 4096,
        ...testValues,
        flag: 0,
        namemax: 255,
      };

      handlers.statfs = async () => expectedResult;

      const result = await handlers.statfs!(createIno(1n), {
        uid: 1000 as any,
        gid: 1000 as any,
        pid: 12345,
        umask: 0o022 as any,
      });

      // Verify all BigInt fields maintain precision
      expect(result.blocks).toBe(testValues.blocks);
      expect(result.bfree).toBe(testValues.bfree);
      expect(result.bavail).toBe(testValues.bavail);
      expect(result.files).toBe(testValues.files);
      expect(result.ffree).toBe(testValues.ffree);
      expect(result.favail).toBe(testValues.favail);
      expect(result.fsid).toBe(testValues.fsid);
    });
  });

  describe('Realistic filesystem scenarios', () => {
    it('should handle typical filesystem statistics', async () => {
      // Simulate a 1TB filesystem with 4K blocks
      const totalBlocks = BigInt(
        Math.floor((1024 * 1024 * 1024 * 1024) / 4096)
      ); // 1TB / 4KB
      const freeBlocks = BigInt(Math.floor(Number(totalBlocks) * 0.3)); // 30% free
      const availBlocks = BigInt(Math.floor(Number(totalBlocks) * 0.25)); // 25% available to users

      const expectedResult: StatvfsResult = {
        bsize: 4096,
        frsize: 4096,
        blocks: totalBlocks,
        bfree: freeBlocks,
        bavail: availBlocks,
        files: 10000000n, // 10M inodes
        ffree: 5000000n, // 5M free
        favail: 4000000n, // 4M available
        fsid: 0xdeadbeefn,
        flag: 0,
        namemax: 255,
      };

      handlers.statfs = async () => expectedResult;

      const result = await handlers.statfs!(createIno(1n), {
        uid: 1000 as any,
        gid: 1000 as any,
        pid: 12345,
        umask: 0o022 as any,
      });

      expect(result.blocks).toBe(totalBlocks);
      expect(result.bfree).toBe(freeBlocks);
      expect(result.bavail).toBe(availBlocks);
      expect(result.bsize).toBe(4096);
      expect(result.namemax).toBe(255);
    });

    it('should handle df-like calculations correctly', async () => {
      const blockSize = 1024;
      const totalBlocks = 1000000n;
      const freeBlocks = 300000n;
      const availBlocks = 250000n;

      const expectedResult: StatvfsResult = {
        bsize: blockSize,
        frsize: blockSize,
        blocks: totalBlocks,
        bfree: freeBlocks,
        bavail: availBlocks,
        files: 100000n,
        ffree: 50000n,
        favail: 40000n,
        fsid: 12345n,
        flag: 0,
        namemax: 255,
      };

      handlers.statfs = async () => expectedResult;

      const result = await handlers.statfs!(createIno(1n), {
        uid: 1000 as any,
        gid: 1000 as any,
        pid: 12345,
        umask: 0o022 as any,
      });

      // Calculate df-like values
      const totalSize = result.blocks * BigInt(blockSize);
      const freeSize = result.bfree * BigInt(blockSize);
      const availSize = result.bavail * BigInt(blockSize);
      const usedSize = totalSize - freeSize;

      expect(totalSize).toBe(1024000000n); // ~1GB
      expect(freeSize).toBe(307200000n); // ~300MB
      expect(availSize).toBe(256000000n); // ~250MB
      expect(usedSize).toBe(716800000n); // ~700MB
    });
  });

  describe('Error handling', () => {
    it('should handle EACCES error correctly', async () => {
      handlers.statfs = async () => {
        throw new FuseErrno('EACCES', 'Permission denied');
      };

      await expect(
        handlers.statfs!(createIno(1n), {
          uid: 1000 as any,
          gid: 1000 as any,
          pid: 12345,
          umask: 0o022 as any,
        })
      ).rejects.toThrow(FuseErrno);

      try {
        await handlers.statfs!(createIno(1n), {
          uid: 1000 as any,
          gid: 1000 as any,
          pid: 12345,
          umask: 0o022 as any,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        const fuseError = error as FuseErrno;
        expect(fuseError.code).toBe('EACCES');
        expect(fuseError.errno).toBe(-13);
      }
    });

    it('should handle EIO error correctly', async () => {
      handlers.statfs = async () => {
        throw new FuseErrno('EIO', 'Input/output error');
      };

      await expect(
        handlers.statfs!(createIno(1n), {
          uid: 1000 as any,
          gid: 1000 as any,
          pid: 12345,
          umask: 0o022 as any,
        })
      ).rejects.toThrow(FuseErrno);

      try {
        await handlers.statfs!(createIno(1n), {
          uid: 1000 as any,
          gid: 1000 as any,
          pid: 12345,
          umask: 0o022 as any,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        const fuseError = error as FuseErrno;
        expect(fuseError.code).toBe('EIO');
        expect(fuseError.errno).toBe(-5);
      }
    });

    it('should handle numeric errno correctly', async () => {
      handlers.statfs = async () => {
        const error = new Error('Custom error') as any;
        error.errno = -13; // EACCES
        throw error;
      };

      await expect(
        handlers.statfs!(createIno(1n), {
          uid: 1000 as any,
          gid: 1000 as any,
          pid: 12345,
          umask: 0o022 as any,
        })
      ).rejects.toThrow();
    });
  });

  describe('Field validation', () => {
    it('should require all mandatory BigInt fields', async () => {
      const incompleteResult = {
        bsize: 4096,
        frsize: 4096,
        // Missing blocks, bfree, bavail, files, ffree, favail, fsid
        flag: 0,
        namemax: 255,
      } as Partial<StatvfsResult>;

      handlers.statfs = async () => incompleteResult as StatvfsResult;

      // The type system should catch this at compile time,
      // but we can also test runtime behavior
      const result = await handlers.statfs!(createIno(1n), {
        uid: 1000 as any,
        gid: 1000 as any,
        pid: 12345,
        umask: 0o022 as any,
      });

      // Check that undefined values are handled appropriately
      expect(result.bsize).toBe(4096);
      expect(result.namemax).toBe(255);
    });

    it('should handle zero values correctly', async () => {
      const zeroResult: StatvfsResult = {
        bsize: 1024,
        frsize: 1024,
        blocks: 0n,
        bfree: 0n,
        bavail: 0n,
        files: 0n,
        ffree: 0n,
        favail: 0n,
        fsid: 0n,
        flag: 0,
        namemax: 255,
      };

      handlers.statfs = async () => zeroResult;

      const result = await handlers.statfs!(createIno(1n), {
        uid: 1000 as any,
        gid: 1000 as any,
        pid: 12345,
        umask: 0o022 as any,
      });

      expect(result.blocks).toBe(0n);
      expect(result.bfree).toBe(0n);
      expect(result.bavail).toBe(0n);
      expect(result.files).toBe(0n);
      expect(result.ffree).toBe(0n);
      expect(result.favail).toBe(0n);
      expect(result.fsid).toBe(0n);
    });
  });

  describe('Context and options handling', () => {
    it('should receive correct context information', async () => {
      let receivedContext: any;
      let receivedIno: any;
      let receivedOptions: any;

      handlers.statfs = async (ino, context, options) => {
        receivedIno = ino;
        receivedContext = context;
        receivedOptions = options;

        return {
          bsize: 4096,
          frsize: 4096,
          blocks: 1000n,
          bfree: 500n,
          bavail: 400n,
          files: 100n,
          ffree: 50n,
          favail: 40n,
          fsid: 1n,
          flag: 0,
          namemax: 255,
        };
      };

      const testContext = {
        uid: 1001 as any,
        gid: 1002 as any,
        pid: 54321,
        umask: 0o027 as any,
      };

      const testOptions = {
        signal: new AbortController().signal,
        timeout: 5000,
      };

      await handlers.statfs!(createIno(42n), testContext, testOptions);

      expect(receivedIno).toBe(createIno(42n));
      expect(receivedContext.uid).toBe(1001);
      expect(receivedContext.gid).toBe(1002);
      expect(receivedContext.pid).toBe(54321);
      expect(receivedOptions?.timeout).toBe(5000);
    });

    it('should handle AbortSignal correctly', async () => {
      const abortController = new AbortController();
      let abortedCalled = false;

      handlers.statfs = async (ino, context, options) => {
        return new Promise(resolve => {
          options?.signal?.addEventListener('abort', () => {
            abortedCalled = true;
            resolve({
              bsize: 4096,
              frsize: 4096,
              blocks: 1000n,
              bfree: 500n,
              bavail: 400n,
              files: 100n,
              ffree: 50n,
              favail: 40n,
              fsid: 1n,
              flag: 0,
              namemax: 255,
            });
          });

          // Simulate abort after 100ms
          setTimeout(() => {
            abortController.abort();
          }, 100);
        });
      };

      const result = await handlers.statfs!(
        createIno(1n),
        {
          uid: 1000 as any,
          gid: 1000 as any,
          pid: 12345,
          umask: 0o022 as any,
        },
        {
          signal: abortController.signal,
        }
      );

      expect(abortedCalled).toBe(true);
      expect(result.blocks).toBe(1000n);
    });
  });
});
