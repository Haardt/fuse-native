/**
 * @file readdir.test.ts
 * @brief Comprehensive tests for readdir operation with pagination and d_type support
 *
 * Tests cover:
 * - Basic readdir functionality
 * - Pagination with offsets and nextOffset
 * - Large directory handling (10k+ entries)
 * - Directory entry types (d_type)
 * - Error conditions and edge cases
 * - Helper functions for readdir operations
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
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

describe('readdir operation', () => {
  let mockContext: RequestContext;
  let mockFileInfo: FileInfo;
  let handlers: FuseOperationHandlers;
  let mockFileSystem: Map<Ino, { entries: DirentEntry[]; isDir: boolean }>;

  beforeEach(() => {
    mockContext = global.createMockRequestContext();
    mockFileInfo = global.createMockFileInfo();
    mockFileSystem = new Map();

    // Create mock filesystem structure
    const rootEntries = [
      DirentUtils.create('.', ROOT_INO as Ino, DirentType.Directory),
      DirentUtils.create('..', ROOT_INO as Ino, DirentType.Directory),
      DirentUtils.create('file1.txt', createIno(2n), DirentType.RegularFile),
      DirentUtils.create('subdir', createIno(3n), DirentType.Directory),
      DirentUtils.create('link', createIno(4n), DirentType.SymbolicLink),
    ];

    const subdirEntries = [
      DirentUtils.create('.', createIno(3n), DirentType.Directory),
      DirentUtils.create('..', ROOT_INO as Ino, DirentType.Directory),
      DirentUtils.create('nested.txt', createIno(5n), DirentType.RegularFile),
    ];

    mockFileSystem.set(ROOT_INO as Ino, { entries: rootEntries, isDir: true });
    mockFileSystem.set(createIno(3n), { entries: subdirEntries, isDir: true });

    // Simple mock readdir handler
    handlers = {
      readdir: async (
        ino: Ino,
        offset: bigint,
        context: RequestContext,
        fi?: FileInfo,
        options?: BaseOperationOptions
      ): Promise<ReaddirResult> => {
        const fsEntry = mockFileSystem.get(ino);
        if (!fsEntry) {
          throw new FuseErrno('ENOENT');
        }
        if (!fsEntry.isDir) {
          throw new FuseErrno('ENOTDIR');
        }

        const startIndex = Number(offset);
        const entries = fsEntry.entries.slice(startIndex);
        const hasMore = false; // Simple implementation

        return DirentUtils.createReaddirResult(entries, hasMore);
      },
    };
  });

  afterEach(() => {
    mockFileSystem.clear();
  });

  describe('basic functionality', () => {
    it('should read root directory contents', async () => {
      const result = await handlers.readdir!(
        ROOT_INO as Ino,
        0n,
        mockContext,
        mockFileInfo
      );

      expect(result).toBeDefined();
      expect(result.entries).toHaveLength(5);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBeUndefined();

      // Check standard entries
      expect(result.entries[0].name).toBe('.');
      expect(result.entries[0].type).toBe(DirentType.Directory);
      expect(result.entries[1].name).toBe('..');
      expect(result.entries[1].type).toBe(DirentType.Directory);

      // Check file types
      const fileEntry = result.entries.find(e => e.name === 'file1.txt');
      expect(fileEntry?.type).toBe(DirentType.RegularFile);

      const dirEntry = result.entries.find(e => e.name === 'subdir');
      expect(dirEntry?.type).toBe(DirentType.Directory);

      const linkEntry = result.entries.find(e => e.name === 'link');
      expect(linkEntry?.type).toBe(DirentType.SymbolicLink);
    });

    it('should read subdirectory contents', async () => {
      const result = await handlers.readdir!(
        createIno(3n),
        0n,
        mockContext,
        mockFileInfo
      );

      expect(result).toBeDefined();
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].name).toBe('.');
      expect(result.entries[1].name).toBe('..');
      expect(result.entries[2].name).toBe('nested.txt');
      expect(result.entries[2].type).toBe(DirentType.RegularFile);
    });

    it('should handle offset parameter', async () => {
      const result = await handlers.readdir!(
        ROOT_INO as Ino,
        2n, // Skip first two entries (. and ..)
        mockContext,
        mockFileInfo
      );

      expect(result).toBeDefined();
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].name).toBe('file1.txt');
      expect(result.entries[1].name).toBe('subdir');
      expect(result.entries[2].name).toBe('link');
    });
  });

  describe('error handling', () => {
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
      }
    });

    it('should throw ENOTDIR when trying to readdir a file', async () => {
      // Add a file to the filesystem
      mockFileSystem.set(createIno(100n), { entries: [], isDir: false });

      await expect(
        handlers.readdir!(createIno(100n), 0n, mockContext, mockFileInfo)
      ).rejects.toThrow(FuseErrno);

      try {
        await handlers.readdir!(createIno(100n), 0n, mockContext, mockFileInfo);
      } catch (error) {
        expect(error).toBeInstanceOf(FuseErrno);
        expect((error as FuseErrno).errno).toBe(-20);
        expect((error as FuseErrno).code).toBe('ENOTDIR');
      }
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      // Create a large directory for pagination testing
      const largeEntries = [
        DirentUtils.create('.', createIno(10n), DirentType.Directory),
        DirentUtils.create('..', ROOT_INO as Ino, DirentType.Directory),
      ];

      // Add 1000 files
      for (let i = 0; i < 1000; i++) {
        largeEntries.push(
          DirentUtils.create(
            `file${i.toString().padStart(4, '0')}.txt`,
            createIno(BigInt(1000 + i)),
            DirentType.RegularFile
          )
        );
      }

      mockFileSystem.set(createIno(10n), {
        entries: largeEntries,
        isDir: true,
      });

      // Enhanced readdir handler with pagination support
      handlers.readdir = async (
        ino: Ino,
        offset: bigint,
        context: RequestContext,
        fi?: FileInfo,
        options?: BaseOperationOptions
      ): Promise<ReaddirResult> => {
        const fsEntry = mockFileSystem.get(ino);
        if (!fsEntry) {
          throw new FuseErrno('ENOENT');
        }
        if (!fsEntry.isDir) {
          throw new FuseErrno('ENOTDIR');
        }

        const pageSize = 100; // Entries per page
        const startIndex = Number(offset);
        const endIndex = Math.min(
          startIndex + pageSize,
          fsEntry.entries.length
        );

        const entries = fsEntry.entries.slice(startIndex, endIndex);
        const hasMore = endIndex < fsEntry.entries.length;
        const nextOffset = hasMore ? BigInt(endIndex) : undefined;

        // Set nextOffset on individual entries for FUSE compatibility
        entries.forEach((entry, index) => {
          if (startIndex + index + 1 < fsEntry.entries.length) {
            entry.nextOffset = BigInt(startIndex + index + 1);
          }
        });

        return DirentUtils.createReaddirResult(entries, hasMore, nextOffset);
      };
    });

    it('should handle pagination with large directories', async () => {
      // First page
      const page1 = await handlers.readdir!(
        createIno(10n),
        0n,
        mockContext,
        mockFileInfo
      );

      expect(page1.entries).toHaveLength(100);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextOffset).toBe(100n);
      expect(page1.entries[0].name).toBe('.');
      expect(page1.entries[1].name).toBe('..');
      expect(page1.entries[2].name).toBe('file0000.txt');

      // Second page
      const page2 = await handlers.readdir!(
        createIno(10n),
        page1.nextOffset!,
        mockContext,
        mockFileInfo
      );

      expect(page2.entries).toHaveLength(100);
      expect(page2.hasMore).toBe(true);
      expect(page2.nextOffset).toBe(200n);
      expect(page2.entries[0].name).toBe('file0098.txt');
      expect(page2.entries[1].name).toBe('file0099.txt');
    });

    it('should handle final page correctly', async () => {
      // Go to last page
      const lastPage = await handlers.readdir!(
        createIno(10n),
        900n, // Near the end
        mockContext,
        mockFileInfo
      );

      expect(lastPage.entries).toHaveLength(100);
      expect(lastPage.hasMore).toBe(true);
      expect(lastPage.nextOffset).toBe(1000n);

      // Very last page
      const finalPage = await handlers.readdir!(
        createIno(10n),
        1000n,
        mockContext,
        mockFileInfo
      );

      expect(finalPage.entries).toHaveLength(2); // Only last 2 entries
      expect(finalPage.hasMore).toBe(false);
      expect(finalPage.nextOffset).toBeUndefined();
    });

    it('should handle offset beyond directory size', async () => {
      const result = await handlers.readdir!(
        createIno(10n),
        5000n, // Way beyond directory size
        mockContext,
        mockFileInfo
      );

      expect(result.entries).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBeUndefined();
    });

    it('should set nextOffset on individual entries', async () => {
      const result = await handlers.readdir!(
        createIno(10n),
        0n,
        mockContext,
        mockFileInfo
      );

      // Check that entries have nextOffset set
      for (let i = 0; i < result.entries.length - 1; i++) {
        expect(result.entries[i].nextOffset).toBe(BigInt(i + 1));
      }

      // Last entry might not have nextOffset if it's the last in page
      if (result.hasMore) {
        expect(
          result.entries[result.entries.length - 1].nextOffset
        ).toBeDefined();
      }
    });
  });

  describe('directory entry types (d_type)', () => {
    beforeEach(() => {
      // Create directory with various file types
      const mixedEntries = [
        DirentUtils.create('.', createIno(20n), DirentType.Directory),
        DirentUtils.create('..', ROOT_INO as Ino, DirentType.Directory),
        DirentUtils.create(
          'regular.txt',
          createIno(21n),
          DirentType.RegularFile
        ),
        DirentUtils.create('directory', createIno(22n), DirentType.Directory),
        DirentUtils.create('symlink', createIno(23n), DirentType.SymbolicLink),
        DirentUtils.create('blockdev', createIno(24n), DirentType.BlockDevice),
        DirentUtils.create('chardev', createIno(25n), DirentType.CharDevice),
        DirentUtils.create('fifo', createIno(26n), DirentType.Fifo),
        DirentUtils.create('socket', createIno(27n), DirentType.Socket),
        DirentUtils.create('unknown', createIno(28n), DirentType.Unknown),
      ];

      mockFileSystem.set(createIno(20n), {
        entries: mixedEntries,
        isDir: true,
      });
    });

    it('should return correct d_type for all file types', async () => {
      const result = await handlers.readdir!(
        createIno(20n),
        0n,
        mockContext,
        mockFileInfo
      );

      const typeMap = new Map(result.entries.map(e => [e.name, e.type]));

      expect(typeMap.get('regular.txt')).toBe(DirentType.RegularFile);
      expect(typeMap.get('directory')).toBe(DirentType.Directory);
      expect(typeMap.get('symlink')).toBe(DirentType.SymbolicLink);
      expect(typeMap.get('blockdev')).toBe(DirentType.BlockDevice);
      expect(typeMap.get('chardev')).toBe(DirentType.CharDevice);
      expect(typeMap.get('fifo')).toBe(DirentType.Fifo);
      expect(typeMap.get('socket')).toBe(DirentType.Socket);
      expect(typeMap.get('unknown')).toBe(DirentType.Unknown);
    });

    it('should handle DirentType enum values correctly', () => {
      expect(DirentType.Unknown).toBe(0);
      expect(DirentType.Fifo).toBe(1);
      expect(DirentType.CharDevice).toBe(2);
      expect(DirentType.Directory).toBe(4);
      expect(DirentType.BlockDevice).toBe(6);
      expect(DirentType.RegularFile).toBe(8);
      expect(DirentType.SymbolicLink).toBe(10);
      expect(DirentType.Socket).toBe(12);
    });
  });

  describe('concurrent readdir operations', () => {
    it('should handle multiple concurrent readdir calls', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        handlers.readdir!(
          ROOT_INO as Ino,
          BigInt(i % 3), // Different offsets
          mockContext,
          mockFileInfo
        )
      );

      const results = await Promise.all(promises);

      // All should succeed
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.entries).toBeDefined();
        expect(Array.isArray(result.entries)).toBe(true);
      });
    });

    it('should maintain consistent results across concurrent calls', async () => {
      const results = await Promise.all([
        handlers.readdir!(ROOT_INO as Ino, 0n, mockContext, mockFileInfo),
        handlers.readdir!(ROOT_INO as Ino, 0n, mockContext, mockFileInfo),
        handlers.readdir!(ROOT_INO as Ino, 0n, mockContext, mockFileInfo),
      ]);

      // All results should be identical
      const [first, second, third] = results;
      expect(first.entries).toHaveLength(second.entries.length);
      expect(second.entries).toHaveLength(third.entries.length);

      first.entries.forEach((entry, index) => {
        expect(entry.name).toBe(second.entries[index].name);
        expect(entry.name).toBe(third.entries[index].name);
        expect(entry.type).toBe(second.entries[index].type);
        expect(entry.type).toBe(third.entries[index].type);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty directory', async () => {
      const emptyEntries = [
        DirentUtils.create('.', createIno(30n), DirentType.Directory),
        DirentUtils.create('..', ROOT_INO as Ino, DirentType.Directory),
      ];

      mockFileSystem.set(createIno(30n), {
        entries: emptyEntries,
        isDir: true,
      });

      const result = await handlers.readdir!(
        createIno(30n),
        0n,
        mockContext,
        mockFileInfo
      );

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].name).toBe('.');
      expect(result.entries[1].name).toBe('..');
      expect(result.hasMore).toBe(false);
    });

    it('should handle directory with only standard entries', async () => {
      // Ensure the directory is set up in this test's scope
      const emptyEntries = [
        DirentUtils.create('.', createIno(30n), DirentType.Directory),
        DirentUtils.create('..', ROOT_INO as Ino, DirentType.Directory),
      ];

      mockFileSystem.set(createIno(30n), {
        entries: emptyEntries,
        isDir: true,
      });

      const result = await handlers.readdir!(
        createIno(30n),
        0n,
        mockContext,
        mockFileInfo
      );

      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => ['.', '..'].includes(e.name))).toBe(
        true
      );
    });

    it('should handle very large offset values', async () => {
      const result = await handlers.readdir!(
        ROOT_INO as Ino,
        BigInt(Number.MAX_SAFE_INTEGER),
        mockContext,
        mockFileInfo
      );

      expect(result.entries).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });
});

describe('DirentUtils helper functions', () => {
  describe('create', () => {
    it('should create directory entry with all properties', () => {
      const entry = DirentUtils.create(
        'test.txt',
        createIno(123n),
        DirentType.RegularFile,
        456n
      );

      expect(entry.name).toBe('test.txt');
      expect(entry.ino).toBe(createIno(123n));
      expect(entry.type).toBe(DirentType.RegularFile);
      expect(entry.nextOffset).toBe(456n);
    });

    it('should create entry without nextOffset', () => {
      const entry = DirentUtils.create(
        'dir',
        createIno(789n),
        DirentType.Directory
      );

      expect(entry.name).toBe('dir');
      expect(entry.ino).toBe(createIno(789n));
      expect(entry.type).toBe(DirentType.Directory);
      expect(entry.nextOffset).toBeUndefined();
    });
  });

  describe('createReaddirResult', () => {
    it('should create result with hasMore false and no nextOffset', () => {
      const entries = [
        DirentUtils.create('file1', createIno(1n), DirentType.RegularFile),
        DirentUtils.create('file2', createIno(2n), DirentType.RegularFile),
      ];

      const result = DirentUtils.createReaddirResult(entries);

      expect(result.entries).toBe(entries);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBeUndefined();
    });

    it('should create result with hasMore true and nextOffset', () => {
      const entries = [
        DirentUtils.create('file1', createIno(1n), DirentType.RegularFile),
      ];

      const result = DirentUtils.createReaddirResult(entries, true, 123n);

      expect(result.entries).toBe(entries);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(123n);
    });

    it('should handle empty entries array', () => {
      const result = DirentUtils.createReaddirResult([], false);

      expect(result.entries).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBeUndefined();
    });
  });

  describe('createStandardEntries', () => {
    it('should create standard . and .. entries', () => {
      const entries = DirentUtils.createStandardEntries(
        createIno(10n),
        createIno(5n)
      );

      expect(entries).toHaveLength(2);
      expect(entries[0].name).toBe('.');
      expect(entries[0].ino).toBe(createIno(10n));
      expect(entries[0].type).toBe(DirentType.Directory);
      expect(entries[1].name).toBe('..');
      expect(entries[1].ino).toBe(createIno(5n));
      expect(entries[1].type).toBe(DirentType.Directory);
    });

    it('should use ROOT_INO as default parent', () => {
      const entries = DirentUtils.createStandardEntries(createIno(10n));

      expect(entries[1].ino).toBe(ROOT_INO as Ino);
    });
  });
});

describe('readdir performance scenarios', () => {
  let handlers: FuseOperationHandlers;
  let mockContext: RequestContext;
  let mockFileInfo: FileInfo;

  beforeEach(() => {
    mockContext = global.createMockRequestContext();
    mockFileInfo = global.createMockFileInfo();

    // Create very large directory for performance testing
    const createLargeDirectory = (size: number, inoBase: bigint) => {
      const entries = [
        DirentUtils.create('.', createIno(inoBase), DirentType.Directory),
        DirentUtils.create('..', ROOT_INO as Ino, DirentType.Directory),
      ];

      for (let i = 0; i < size; i++) {
        entries.push(
          DirentUtils.create(
            `file${i.toString().padStart(6, '0')}.dat`,
            createIno(inoBase + BigInt(i + 1)),
            i % 10 === 0 ? DirentType.Directory : DirentType.RegularFile
          )
        );
      }

      return entries;
    };

    const largeDir = createLargeDirectory(10000, 1000000n);

    handlers = {
      readdir: async (ino: Ino, offset: bigint) => {
        if (ino === createIno(1000000n)) {
          const pageSize = 1000;
          const startIndex = Number(offset);
          const endIndex = Math.min(startIndex + pageSize, largeDir.length);

          const entries = largeDir.slice(startIndex, endIndex);
          const hasMore = endIndex < largeDir.length;
          const nextOffset = hasMore ? BigInt(endIndex) : undefined;

          return DirentUtils.createReaddirResult(entries, hasMore, nextOffset);
        }
        throw new FuseErrno('ENOENT');
      },
    };
  });

  it('should handle 10k+ directory entries with pagination', async () => {
    let totalEntries = 0;
    let offset = 0n;
    let pageCount = 0;
    const maxPages = 15; // Safety limit

    do {
      const result = await handlers.readdir!(
        createIno(1000000n),
        offset,
        mockContext,
        mockFileInfo
      );

      totalEntries += result.entries.length;
      pageCount++;

      if (result.hasMore && result.nextOffset !== undefined) {
        offset = result.nextOffset;
      } else {
        break;
      }
    } while (pageCount < maxPages);

    expect(totalEntries).toBe(10002); // 10000 files + . + ..
    expect(pageCount).toBeGreaterThan(10);
    expect(pageCount).toBeLessThanOrEqual(12);
  });

  it('should handle rapid sequential pagination', async () => {
    const promises = [];

    // Start 5 pagination sequences simultaneously
    for (let seq = 0; seq < 5; seq++) {
      const promise = (async () => {
        let offset = BigInt(seq * 2000); // Start from different offsets
        let entriesRead = 0;

        for (let page = 0; page < 3; page++) {
          const result = await handlers.readdir!(
            createIno(1000000n),
            offset,
            mockContext,
            mockFileInfo
          );

          entriesRead += result.entries.length;

          if (result.hasMore && result.nextOffset !== undefined) {
            offset = result.nextOffset;
          } else {
            break;
          }
        }

        return entriesRead;
      })();

      promises.push(promise);
    }

    const results = await Promise.all(promises);

    // Each sequence should have read some entries
    results.forEach(count => {
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(3000);
    });
  });
});

describe('readdir integration scenarios', () => {
  it('should work with readdirAll helper pattern', async () => {
    const mockFileSystem = new Map();
    const largeEntries = Array.from({ length: 250 }, (_, i) =>
      DirentUtils.create(
        `file${i}.txt`,
        createIno(BigInt(i + 100)),
        DirentType.RegularFile
      )
    );

    // Add standard entries
    largeEntries.unshift(
      DirentUtils.create('.', createIno(50n), DirentType.Directory),
      DirentUtils.create('..', ROOT_INO as Ino, DirentType.Directory)
    );

    mockFileSystem.set(createIno(50n), largeEntries);

    const readdirPaginated = async (
      ino: Ino,
      offset: bigint
    ): Promise<ReaddirResult> => {
      const entries = mockFileSystem.get(ino) || [];
      const pageSize = 50;
      const startIndex = Number(offset);
      const endIndex = Math.min(startIndex + pageSize, entries.length);

      const pageEntries = entries.slice(startIndex, endIndex);
      const hasMore = endIndex < entries.length;
      const nextOffset = hasMore ? BigInt(endIndex) : undefined;

      return DirentUtils.createReaddirResult(pageEntries, hasMore, nextOffset);
    };

    // Simulate readdirAll implementation
    const readdirAll = async (ino: Ino): Promise<DirentEntry[]> => {
      const allEntries: DirentEntry[] = [];
      let offset = 0n;

      do {
        const result = await readdirPaginated(ino, offset);
        allEntries.push(...result.entries);

        if (result.hasMore && result.nextOffset !== undefined) {
          offset = result.nextOffset;
        } else {
          break;
        }
      } while (true);

      return allEntries;
    };

    const allEntries = await readdirAll(createIno(50n));

    expect(allEntries).toHaveLength(252); // 250 files + . + ..
    expect(allEntries[0].name).toBe('.');
    expect(allEntries[1].name).toBe('..');
    expect(allEntries[2].name).toBe('file0.txt');
    expect(allEntries[allEntries.length - 1].name).toBe('file249.txt');
  });
});
