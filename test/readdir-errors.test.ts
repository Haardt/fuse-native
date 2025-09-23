/**
 * @file readdir-errors.test.ts
 * @brief Comprehensive tests for readdir operation error handling and FUSE specification compliance
 *
 * Tests cover:
 * - All documented errno conditions for readdir
 * - FUSE specification compliance
 * - Edge cases and boundary conditions
 * - Error propagation and handling
 * - Abort signal and timeout behavior
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import {
  DirentEntry,
  DirentType,
  ReaddirResult,
  FuseOperationHandlers,
  createIno,
  Ino,
  RequestContext,
  FileInfo,
  BaseOperationOptions,
} from '../ts/types.js';
import { DirentUtils } from '../ts/helpers.js';
import { FuseErrno, ERRNO_CODES } from '../ts/errors.js';
import { ROOT_INO } from '../ts/constants.js';

describe('readdir error handling', () => {
  let mockContext: RequestContext;
  let mockFileInfo: FileInfo;
  let handlers: FuseOperationHandlers;

  beforeEach(() => {
    mockContext = global.createMockRequestContext();
    mockFileInfo = global.createMockFileInfo();
  });

  describe('ENOENT - No such file or directory', () => {
    beforeEach(() => {
      handlers = {
        readdir: async (ino: Ino) => {
          if (ino === createIno(999n)) {
            throw new FuseErrno('ENOENT');
          }
          throw new Error('Unexpected inode');
        },
      };
    });

    it('should throw ENOENT for non-existent directory', async () => {
      await expect(
        handlers.readdir!(createIno(999n), 0n, mockContext, mockFileInfo)
      ).rejects.toThrow(FuseErrno);

      try {
        await handlers.readdir!(createIno(999n), 0n, mockContext, mockFileInfo);
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        expect((error as FuseErrno).errno).toBe(-2);
        expect((error as FuseErrno).code).toBe('ENOENT');
        expect((error as FuseErrno).message).toContain(
          'No such file or directory'
        );
      }
    });

    it('should handle ENOENT with proper error properties', async () => {
      try {
        await handlers.readdir!(createIno(999n), 0n, mockContext, mockFileInfo);
        expect.fail('Should have thrown ENOENT');
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        const fuseError = error as FuseErrno;
        expect(fuseError.errno).toBe(-2); // ENOENT is -2
        expect(fuseError.code).toBe('ENOENT');
        expect(typeof fuseError.message).toBe('string');
        expect(fuseError.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('ENOTDIR - Not a directory', () => {
    beforeEach(() => {
      handlers = {
        readdir: async (ino: Ino) => {
          if (ino === createIno(100n)) {
            throw new FuseErrno('ENOTDIR');
          }
          throw new Error('Unexpected inode');
        },
      };
    });

    it('should throw ENOTDIR when trying to readdir a regular file', async () => {
      await expect(
        handlers.readdir!(createIno(100n), 0n, mockContext, mockFileInfo)
      ).rejects.toThrow(FuseErrno);

      try {
        await handlers.readdir!(createIno(100n), 0n, mockContext, mockFileInfo);
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        expect((error as FuseErrno).errno).toBe(-20);
        expect((error as FuseErrno).code).toBe('ENOTDIR');
        expect((error as FuseErrno).message).toContain('Not a directory');
      }
    });

    it('should handle ENOTDIR with proper error properties', async () => {
      try {
        await handlers.readdir!(createIno(100n), 0n, mockContext, mockFileInfo);
        expect.fail('Should have thrown ENOTDIR');
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        const fuseError = error as FuseErrno;
        expect(fuseError.errno).toBe(-20); // ENOTDIR is -20
        expect(fuseError.code).toBe('ENOTDIR');
      }
    });
  });

  describe('EACCES - Permission denied', () => {
    beforeEach(() => {
      handlers = {
        readdir: async (ino: Ino, offset: bigint, context: RequestContext) => {
          if (ino === createIno(200n)) {
            // Simulate permission check failure
            if (context.uid !== 0 && context.uid !== 1000) {
              throw new FuseErrno('EACCES');
            }
          }
          throw new Error('Unexpected inode');
        },
      };
    });

    it('should throw EACCES for permission denied', async () => {
      const restrictedContext = {
        ...mockContext,
        uid: global.createUid(500), // Non-owner, non-root
      };

      await expect(
        handlers.readdir!(createIno(200n), 0n, restrictedContext, mockFileInfo)
      ).rejects.toThrow(FuseErrno);

      try {
        await handlers.readdir!(
          createIno(200n),
          0n,
          restrictedContext,
          mockFileInfo
        );
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        expect((error as FuseErrno).errno).toBe(-13);
        expect((error as FuseErrno).code).toBe('EACCES');
      }
    });

    it('should allow access for authorized users', async () => {
      const authorizedContext = {
        ...mockContext,
        uid: global.createUid(0), // Root user
      };

      // This should not throw since we're checking uid in the handler
      // but we need to provide a proper implementation for success case
      handlers.readdir = async (
        ino: Ino,
        offset: bigint,
        context: RequestContext
      ) => {
        if (ino === createIno(200n)) {
          if (context.uid !== 0 && context.uid !== 1000) {
            throw new FuseErrno('EACCES');
          }
          // Return empty directory for authorized access
          return DirentUtils.createReaddirResult([
            ...DirentUtils.createStandardEntries(ino),
          ]);
        }
        throw new FuseErrno('ENOENT');
      };

      const result = await handlers.readdir!(
        createIno(200n),
        0n,
        authorizedContext,
        mockFileInfo
      );
      expect(result).toBeDefined();
      expect(result.entries).toHaveLength(2); // . and ..
    });
  });

  describe('EIO - I/O error', () => {
    beforeEach(() => {
      handlers = {
        readdir: async (ino: Ino) => {
          if (ino === createIno(300n)) {
            throw new FuseErrno('EIO');
          }
          throw new Error('Unexpected inode');
        },
      };
    });

    it('should throw EIO for I/O errors', async () => {
      await expect(
        handlers.readdir!(createIno(300n), 0n, mockContext, mockFileInfo)
      ).rejects.toThrow(FuseErrno);

      try {
        await handlers.readdir!(createIno(300n), 0n, mockContext, mockFileInfo);
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        expect((error as FuseErrno).errno).toBe(-5);
        expect((error as FuseErrno).code).toBe('EIO');
        expect((error as FuseErrno).message).toContain('Input/output error');
      }
    });

    it('should handle EIO with proper error properties', async () => {
      try {
        await handlers.readdir!(createIno(300n), 0n, mockContext, mockFileInfo);
        expect.fail('Should have thrown EIO');
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        const fuseError = error as FuseErrno;
        expect(fuseError.errno).toBe(-5); // EIO is -5
        expect(fuseError.code).toBe('EIO');
      }
    });
  });

  describe('error propagation and consistency', () => {
    it('should maintain error properties across async boundaries', async () => {
      handlers = {
        readdir: async (ino: Ino) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          throw new FuseErrno('ENOENT');
        },
      };

      try {
        await handlers.readdir!(createIno(1n), 0n, mockContext, mockFileInfo);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        expect((error as FuseErrno).errno).toBe(-2);
      }
    });

    it('should handle nested error scenarios', async () => {
      handlers = {
        readdir: async (ino: Ino) => {
          try {
            if (ino === createIno(1n)) {
              throw new FuseErrno('EACCES');
            }
            throw new FuseErrno('ENOENT');
          } catch (error) {
            if (error instanceof FuseErrno && error.code === 'EACCES') {
              // Re-throw as different error
              throw new FuseErrno('EIO');
            }
            throw error;
          }
        },
      };

      // Should get EIO (transformed from EACCES)
      try {
        await handlers.readdir!(createIno(1n), 0n, mockContext, mockFileInfo);
        expect.fail('Should have thrown EIO');
      } catch (error) {
        expect((error as FuseErrno).code).toBe('EIO');
      }

      // Should get ENOENT (passthrough)
      try {
        await handlers.readdir!(createIno(2n), 0n, mockContext, mockFileInfo);
        expect.fail('Should have thrown ENOENT');
      } catch (error) {
        expect((error as FuseErrno).code).toBe('ENOENT');
      }
    });

    it('should handle non-FuseErrno errors appropriately', async () => {
      handlers = {
        readdir: async () => {
          throw new Error('Generic JavaScript error');
        },
      };

      try {
        await handlers.readdir!(createIno(1n), 0n, mockContext, mockFileInfo);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(FuseErrno);
        expect((error as Error).message).toBe('Generic JavaScript error');
      }
    });
  });

  describe('abort signal and timeout handling', () => {
    it('should respect AbortSignal', async () => {
      const abortController = new AbortController();

      handlers = {
        readdir: async (ino, offset, context, fi, options) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve(DirentUtils.createReaddirResult([]));
            }, 1000);

            options?.signal?.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Operation aborted'));
            });
          });
        },
      };

      // Abort after 50ms
      setTimeout(() => abortController.abort(), 50);

      const options: BaseOperationOptions = {
        signal: abortController.signal,
      };

      await expect(
        handlers.readdir!(createIno(1n), 0n, mockContext, mockFileInfo, options)
      ).rejects.toThrow('Operation aborted');
    });

    it('should handle timeout properly', async () => {
      handlers = {
        readdir: async (ino, offset, context, fi, options) => {
          return new Promise(resolve => {
            // Intentionally delay longer than timeout
            setTimeout(() => {
              resolve(DirentUtils.createReaddirResult([]));
            }, 200);
          });
        },
      };

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timed out')), 100);
      });

      const readdirPromise = handlers.readdir!(
        createIno(1n),
        0n,
        mockContext,
        mockFileInfo,
        { timeout: 100 }
      );

      await expect(
        Promise.race([readdirPromise, timeoutPromise])
      ).rejects.toThrow('Operation timed out');
    });
  });

  describe('parameter validation', () => {
    beforeEach(() => {
      handlers = {
        readdir: async (ino: Ino, offset: bigint) => {
          // Validate parameters
          if (typeof ino !== 'bigint') {
            throw new FuseErrno('EINVAL');
          }
          if (typeof offset !== 'bigint') {
            throw new FuseErrno('EINVAL');
          }
          if (offset < 0n) {
            throw new FuseErrno('EINVAL');
          }

          return DirentUtils.createReaddirResult([]);
        },
      };
    });

    it('should handle invalid inode parameter', async () => {
      // This test simulates what would happen if invalid data gets through
      try {
        await handlers.readdir!(null as any, 0n, mockContext, mockFileInfo);
        expect.fail('Should have thrown EINVAL');
      } catch (error) {
        if (error instanceof FuseErrno) {
          expect(error.code).toBe('EINVAL');
        } else {
          // TypeScript/runtime error is also acceptable
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle invalid offset parameter', async () => {
      try {
        await handlers.readdir!(createIno(1n), -1n, mockContext, mockFileInfo);
        expect.fail('Should have thrown EINVAL');
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        expect((error as FuseErrno).code).toBe('EINVAL');
      }
    });

    it('should handle valid parameters', async () => {
      const result = await handlers.readdir!(
        createIno(1n),
        0n,
        mockContext,
        mockFileInfo
      );

      expect(result).toBeDefined();
      expect(result.entries).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
    });
  });

  describe('boundary conditions', () => {
    beforeEach(() => {
      handlers = {
        readdir: async (ino: Ino, offset: bigint) => {
          // Handle various boundary conditions
          if (offset === BigInt(Number.MAX_SAFE_INTEGER)) {
            return DirentUtils.createReaddirResult([]);
          }

          if (ino === createIno(BigInt(Number.MAX_SAFE_INTEGER))) {
            return DirentUtils.createReaddirResult([
              ...DirentUtils.createStandardEntries(ino),
            ]);
          }

          throw new FuseErrno('ENOENT');
        },
      };
    });

    it('should handle maximum safe integer offset', async () => {
      const result = await handlers.readdir!(
        createIno(1n),
        BigInt(Number.MAX_SAFE_INTEGER),
        mockContext,
        mockFileInfo
      );

      expect(result).toBeDefined();
      expect(result.entries).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle maximum safe integer inode', async () => {
      const maxIno = createIno(BigInt(Number.MAX_SAFE_INTEGER));

      const result = await handlers.readdir!(
        maxIno,
        0n,
        mockContext,
        mockFileInfo
      );

      expect(result).toBeDefined();
      expect(result.entries).toHaveLength(2); // . and ..
      expect(result.entries[0].ino).toBe(maxIno);
    });

    it('should handle very large offsets beyond safe integer', async () => {
      const veryLargeOffset = BigInt(Number.MAX_SAFE_INTEGER) * 2n;

      // Should handle gracefully - likely return empty result
      await expect(
        handlers.readdir!(
          createIno(1n),
          veryLargeOffset,
          mockContext,
          mockFileInfo
        )
      ).rejects.toThrow(FuseErrno);
    });
  });

  describe('error message quality', () => {
    it('should provide meaningful error messages', async () => {
      const errorCases = [
        { code: 'ENOENT', expectedSubstring: 'No such file or directory' },
        { code: 'ENOTDIR', expectedSubstring: 'Not a directory' },
        { code: 'EACCES', expectedSubstring: 'Permission denied' },
        { code: 'EIO', expectedSubstring: 'Input/output error' },
      ];

      for (const { code, expectedSubstring } of errorCases) {
        const error = new FuseErrno(code as any);
        expect(error.message).toContain(expectedSubstring);
        expect(error.message.length).toBeGreaterThan(0);
      }
    });

    it('should include errno codes in error objects', () => {
      const error = new FuseErrno('ENOENT');
      expect(error.errno).toBe(-2);
      expect(error.errno).toBeLessThan(0); // All errno codes should be negative
    });
  });
});

describe('readdir specification compliance', () => {
  let handlers: FuseOperationHandlers;
  let mockContext: RequestContext;
  let mockFileInfo: FileInfo;

  beforeEach(() => {
    mockContext = global.createMockRequestContext();
    mockFileInfo = global.createMockFileInfo();
  });

  describe('return value validation', () => {
    it('should return valid ReaddirResult structure', async () => {
      handlers = {
        readdir: async () => {
          return DirentUtils.createReaddirResult([
            DirentUtils.create('test', createIno(1n), DirentType.RegularFile),
          ]);
        },
      };

      const result = await handlers.readdir!(
        createIno(1n),
        0n,
        mockContext,
        mockFileInfo
      );

      // Validate result structure
      expect(result).toHaveProperty('entries');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('nextOffset');

      expect(Array.isArray(result.entries)).toBe(true);
      expect(typeof result.hasMore).toBe('boolean');
      expect(
        result.nextOffset === undefined || typeof result.nextOffset === 'bigint'
      ).toBe(true);
    });

    it('should validate directory entry structure', async () => {
      handlers = {
        readdir: async () => {
          return DirentUtils.createReaddirResult([
            DirentUtils.create(
              'test.txt',
              createIno(123n),
              DirentType.RegularFile,
              456n
            ),
          ]);
        },
      };

      const result = await handlers.readdir!(
        createIno(1n),
        0n,
        mockContext,
        mockFileInfo
      );

      const entry = result.entries[0];
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('ino');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('nextOffset');

      expect(typeof entry.name).toBe('string');
      expect(typeof entry.ino).toBe('bigint');
      expect(typeof entry.type).toBe('number');
      expect(
        entry.nextOffset === undefined || typeof entry.nextOffset === 'bigint'
      ).toBe(true);
    });

    it('should enforce valid DirentType values', async () => {
      const validTypes = [
        DirentType.Unknown,
        DirentType.Fifo,
        DirentType.CharDevice,
        DirentType.Directory,
        DirentType.BlockDevice,
        DirentType.RegularFile,
        DirentType.SymbolicLink,
        DirentType.Socket,
      ];

      for (const type of validTypes) {
        const entry = DirentUtils.create('test', createIno(1n), type);
        expect(validTypes).toContain(entry.type);
      }
    });
  });

  describe('offset handling compliance', () => {
    it('should handle offset 0 as start of directory', async () => {
      const entries = [
        ...DirentUtils.createStandardEntries(createIno(1n)),
        DirentUtils.create('file1', createIno(2n), DirentType.RegularFile),
        DirentUtils.create('file2', createIno(3n), DirentType.RegularFile),
      ];

      handlers = {
        readdir: async (ino: Ino, offset: bigint) => {
          return DirentUtils.createReaddirResult(
            entries.slice(Number(offset)),
            false
          );
        },
      };

      const result = await handlers.readdir!(
        createIno(1n),
        0n,
        mockContext,
        mockFileInfo
      );

      expect(result.entries).toHaveLength(4);
      expect(result.entries[0].name).toBe('.');
      expect(result.entries[1].name).toBe('..');
    });

    it('should handle non-zero offsets correctly', async () => {
      const entries = [
        ...DirentUtils.createStandardEntries(createIno(1n)),
        DirentUtils.create('file1', createIno(2n), DirentType.RegularFile),
        DirentUtils.create('file2', createIno(3n), DirentType.RegularFile),
      ];

      handlers = {
        readdir: async (ino: Ino, offset: bigint) => {
          return DirentUtils.createReaddirResult(
            entries.slice(Number(offset)),
            false
          );
        },
      };

      const result = await handlers.readdir!(
        createIno(1n),
        2n, // Skip . and ..
        mockContext,
        mockFileInfo
      );

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].name).toBe('file1');
      expect(result.entries[1].name).toBe('file2');
    });
  });

  describe('pagination compliance', () => {
    it('should handle pagination correctly with hasMore and nextOffset', async () => {
      const allEntries = Array.from({ length: 100 }, (_, i) =>
        DirentUtils.create(
          `file${i}`,
          createIno(BigInt(i + 1)),
          DirentType.RegularFile
        )
      );

      handlers = {
        readdir: async (ino: Ino, offset: bigint) => {
          const pageSize = 20;
          const start = Number(offset);
          const end = Math.min(start + pageSize, allEntries.length);
          const entries = allEntries.slice(start, end);
          const hasMore = end < allEntries.length;
          const nextOffset = hasMore ? BigInt(end) : undefined;

          return DirentUtils.createReaddirResult(entries, hasMore, nextOffset);
        },
      };

      // First page
      const page1 = await handlers.readdir!(
        createIno(1n),
        0n,
        mockContext,
        mockFileInfo
      );
      expect(page1.entries).toHaveLength(20);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextOffset).toBe(20n);

      // Second page
      const page2 = await handlers.readdir!(
        createIno(1n),
        page1.nextOffset!,
        mockContext,
        mockFileInfo
      );
      expect(page2.entries).toHaveLength(20);
      expect(page2.hasMore).toBe(true);
      expect(page2.nextOffset).toBe(40n);

      // Final page
      let currentOffset = 80n;
      const finalPage = await handlers.readdir!(
        createIno(1n),
        currentOffset,
        mockContext,
        mockFileInfo
      );
      expect(finalPage.entries).toHaveLength(20);
      expect(finalPage.hasMore).toBe(false);
      expect(finalPage.nextOffset).toBeUndefined();
    });
  });
});
