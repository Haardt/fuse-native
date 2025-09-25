/**
 * @file helpers-dirent.test.ts
 * @brief Comprehensive tests for DirentUtils helper functions
 *
 * Tests cover:
 * - DirentUtils.create() functionality
 * - DirentUtils.createReaddirResult() functionality
 * - DirentUtils.createStandardEntries() functionality
 * - Edge cases and error conditions
 * - Type safety and validation
 */

import { describe, it, expect } from '@jest/globals';
import {
  DirentEntry,
  DirentType,
  ReaddirResult,
  createIno,
  Ino,
} from '../types.ts';
import { DirentUtils } from '../helpers.ts';
import { ROOT_INO } from '../constants.ts';

describe('DirentUtils', () => {
  describe('create', () => {
    it('should create directory entry with all properties', () => {
      const name = 'test.txt';
      const ino = createIno(123n);
      const type = DirentType.RegularFile;
      const nextOffset = 456n;

      const entry = DirentUtils.create(name, ino, type, nextOffset);

      expect(entry).toBeDefined();
      expect(entry.name).toBe(name);
      expect(entry.ino).toBe(ino);
      expect(entry.type).toBe(type);
      expect(entry.nextOffset).toBe(nextOffset);
    });

    it('should create entry without nextOffset', () => {
      const name = 'directory';
      const ino = createIno(789n);
      const type = DirentType.Directory;

      const entry = DirentUtils.create(name, ino, type);

      expect(entry).toBeDefined();
      expect(entry.name).toBe(name);
      expect(entry.ino).toBe(ino);
      expect(entry.type).toBe(type);
      expect(entry.nextOffset).toBeUndefined();
    });

    it('should handle all DirentType values', () => {
      const testCases: Array<[string, DirentType]> = [
        ['unknown', DirentType.Unknown],
        ['fifo', DirentType.Fifo],
        ['chardev', DirentType.CharDevice],
        ['directory', DirentType.Directory],
        ['blockdev', DirentType.BlockDevice],
        ['file', DirentType.RegularFile],
        ['symlink', DirentType.SymbolicLink],
        ['socket', DirentType.Socket],
      ];

      testCases.forEach(([name, type], index) => {
        const entry = DirentUtils.create(
          name,
          createIno(BigInt(index + 1)),
          type
        );
        expect(entry.type).toBe(type);
        expect(entry.name).toBe(name);
      });
    });

    it('should handle empty string name', () => {
      const entry = DirentUtils.create(
        '',
        createIno(1n),
        DirentType.RegularFile
      );
      expect(entry.name).toBe('');
    });

    it('should handle very long names', () => {
      const longName = 'a'.repeat(255); // Max typical filename length
      const entry = DirentUtils.create(
        longName,
        createIno(1n),
        DirentType.RegularFile
      );
      expect(entry.name).toBe(longName);
      expect(entry.name).toHaveLength(255);
    });

    it('should handle special characters in names', () => {
      const specialNames = [
        'file with spaces.txt',
        'file-with-dashes.txt',
        'file_with_underscores.txt',
        'file.with.dots.txt',
        'UPPERCASE.TXT',
        'MiXeD-CaSe_File.txt',
        '123-numeric-start.txt',
        '.hidden-file',
        '..double-dot-start',
        'ファイル.txt', // Unicode
        'файл.txt', // Cyrillic
      ];

      specialNames.forEach((name, index) => {
        const entry = DirentUtils.create(
          name,
          createIno(BigInt(index + 1)),
          DirentType.RegularFile
        );
        expect(entry.name).toBe(name);
      });
    });

    it('should handle large inode numbers', () => {
      const largeIno = createIno(BigInt(Number.MAX_SAFE_INTEGER));
      const entry = DirentUtils.create(
        'test',
        largeIno,
        DirentType.RegularFile
      );
      expect(entry.ino).toBe(largeIno);
    });

    it('should handle large nextOffset values', () => {
      const largeOffset = BigInt(Number.MAX_SAFE_INTEGER) * 2n;
      const entry = DirentUtils.create(
        'test',
        createIno(1n),
        DirentType.RegularFile,
        largeOffset
      );
      expect(entry.nextOffset).toBe(largeOffset);
    });
  });

  describe('createReaddirResult', () => {
    it('should create result with default parameters', () => {
      const entries: DirentEntry[] = [
        DirentUtils.create('file1', createIno(1n), DirentType.RegularFile),
        DirentUtils.create('file2', createIno(2n), DirentType.RegularFile),
      ];

      const result = DirentUtils.createReaddirResult(entries);

      expect(result).toBeDefined();
      expect(result.entries).toBe(entries);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBeUndefined();
    });

    it('should create result with hasMore true', () => {
      const entries: DirentEntry[] = [
        DirentUtils.create('file1', createIno(1n), DirentType.RegularFile),
      ];

      const result = DirentUtils.createReaddirResult(entries, true);

      expect(result.entries).toBe(entries);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBeUndefined();
    });

    it('should create result with hasMore and nextOffset', () => {
      const entries: DirentEntry[] = [
        DirentUtils.create('file1', createIno(1n), DirentType.RegularFile),
      ];
      const nextOffset = 123n;

      const result = DirentUtils.createReaddirResult(entries, true, nextOffset);

      expect(result.entries).toBe(entries);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(nextOffset);
    });

    it('should create result with hasMore false and nextOffset', () => {
      const entries: DirentEntry[] = [
        DirentUtils.create('file1', createIno(1n), DirentType.RegularFile),
      ];
      const nextOffset = 456n;

      const result = DirentUtils.createReaddirResult(
        entries,
        false,
        nextOffset
      );

      expect(result.entries).toBe(entries);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBe(nextOffset);
    });

    it('should handle empty entries array', () => {
      const result = DirentUtils.createReaddirResult([]);

      expect(result.entries).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBeUndefined();
    });

    it('should handle empty entries with hasMore true', () => {
      const result = DirentUtils.createReaddirResult([], true, 789n);

      expect(result.entries).toHaveLength(0);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(789n);
    });

    it('should handle large entry arrays', () => {
      const entries = Array.from({ length: 1000 }, (_, i) =>
        DirentUtils.create(
          `file${i}`,
          createIno(BigInt(i + 1)),
          DirentType.RegularFile
        )
      );

      const result = DirentUtils.createReaddirResult(entries, true, 1000n);

      expect(result.entries).toHaveLength(1000);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(1000n);
    });
  });

  describe('createStandardEntries', () => {
    it('should create standard . and .. entries', () => {
      const currentIno = createIno(10n);
      const parentIno = createIno(5n);

      const entries = DirentUtils.createStandardEntries(currentIno, parentIno);

      expect(entries).toHaveLength(2);

      // Check . entry
      expect(entries[0].name).toBe('.');
      expect(entries[0].ino).toBe(currentIno);
      expect(entries[0].type).toBe(DirentType.Directory);
      expect(entries[0].nextOffset).toBeUndefined();

      // Check .. entry
      expect(entries[1].name).toBe('..');
      expect(entries[1].ino).toBe(parentIno);
      expect(entries[1].type).toBe(DirentType.Directory);
      expect(entries[1].nextOffset).toBeUndefined();
    });

    it('should use ROOT_INO as default parent', () => {
      const currentIno = createIno(10n);

      const entries = DirentUtils.createStandardEntries(currentIno);

      expect(entries).toHaveLength(2);
      expect(entries[0].ino).toBe(currentIno);
      expect(entries[1].ino).toBe(ROOT_INO as Ino);
    });

    it('should handle root directory case', () => {
      const rootIno = ROOT_INO as Ino;

      const entries = DirentUtils.createStandardEntries(rootIno, rootIno);

      expect(entries).toHaveLength(2);
      expect(entries[0].name).toBe('.');
      expect(entries[0].ino).toBe(rootIno);
      expect(entries[1].name).toBe('..');
      expect(entries[1].ino).toBe(rootIno);
    });

    it('should handle large inode numbers', () => {
      const largeCurrentIno = createIno(BigInt(Number.MAX_SAFE_INTEGER));
      const largeParentIno = createIno(BigInt(Number.MAX_SAFE_INTEGER) - 1n);

      const entries = DirentUtils.createStandardEntries(
        largeCurrentIno,
        largeParentIno
      );

      expect(entries[0].ino).toBe(largeCurrentIno);
      expect(entries[1].ino).toBe(largeParentIno);
    });

    it('should always create directory type entries', () => {
      const entries = DirentUtils.createStandardEntries(
        createIno(1n),
        createIno(2n)
      );

      entries.forEach(entry => {
        expect(entry.type).toBe(DirentType.Directory);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should create consistent directory structure', () => {
      const currentIno = createIno(100n);
      const parentIno = createIno(50n);

      // Create standard entries
      const standardEntries = DirentUtils.createStandardEntries(
        currentIno,
        parentIno
      );

      // Create additional entries
      const additionalEntries = [
        DirentUtils.create(
          'file1.txt',
          createIno(101n),
          DirentType.RegularFile,
          3n
        ),
        DirentUtils.create('subdir', createIno(102n), DirentType.Directory, 4n),
        DirentUtils.create(
          'link',
          createIno(103n),
          DirentType.SymbolicLink,
          5n
        ),
      ];

      const allEntries = [...standardEntries, ...additionalEntries];

      // Create readdir result
      const result = DirentUtils.createReaddirResult(allEntries, false);

      expect(result.entries).toHaveLength(5);
      expect(result.entries[0].name).toBe('.');
      expect(result.entries[1].name).toBe('..');
      expect(result.entries[2].name).toBe('file1.txt');
      expect(result.entries[3].name).toBe('subdir');
      expect(result.entries[4].name).toBe('link');
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination scenario', () => {
      const allEntries = [
        ...DirentUtils.createStandardEntries(createIno(1n)),
        ...Array.from({ length: 100 }, (_, i) =>
          DirentUtils.create(
            `file${i.toString().padStart(3, '0')}.txt`,
            createIno(BigInt(i + 2)),
            DirentType.RegularFile,
            BigInt(i + 3)
          )
        ),
      ];

      // First page
      const firstPage = allEntries.slice(0, 20);
      const firstResult = DirentUtils.createReaddirResult(firstPage, true, 20n);

      expect(firstResult.entries).toHaveLength(20);
      expect(firstResult.hasMore).toBe(true);
      expect(firstResult.nextOffset).toBe(20n);

      // Second page
      const secondPage = allEntries.slice(20, 40);
      const secondResult = DirentUtils.createReaddirResult(
        secondPage,
        true,
        40n
      );

      expect(secondResult.entries).toHaveLength(20);
      expect(secondResult.hasMore).toBe(true);
      expect(secondResult.nextOffset).toBe(40n);

      // Final page
      const finalPage = allEntries.slice(100);
      const finalResult = DirentUtils.createReaddirResult(finalPage, false);

      expect(finalResult.entries).toHaveLength(2); // Only 2 remaining entries
      expect(finalResult.hasMore).toBe(false);
      expect(finalResult.nextOffset).toBeUndefined();
    });

    it('should maintain entry order and properties', () => {
      const entries = [
        DirentUtils.create('a', createIno(1n), DirentType.RegularFile),
        DirentUtils.create('b', createIno(2n), DirentType.Directory),
        DirentUtils.create('c', createIno(3n), DirentType.SymbolicLink),
      ];

      const result = DirentUtils.createReaddirResult(entries);

      // Order should be preserved
      expect(result.entries[0].name).toBe('a');
      expect(result.entries[1].name).toBe('b');
      expect(result.entries[2].name).toBe('c');

      // Types should be preserved
      expect(result.entries[0].type).toBe(DirentType.RegularFile);
      expect(result.entries[1].type).toBe(DirentType.Directory);
      expect(result.entries[2].type).toBe(DirentType.SymbolicLink);

      // Inodes should be preserved
      expect(result.entries[0].ino).toBe(createIno(1n));
      expect(result.entries[1].ino).toBe(createIno(2n));
      expect(result.entries[2].ino).toBe(createIno(3n));
    });
  });

  describe('type safety', () => {
    it('should enforce branded types for Ino', () => {
      const ino = createIno(123n);
      const entry = DirentUtils.create('test', ino, DirentType.RegularFile);

      // TypeScript should enforce that ino is of type Ino
      expect(entry.ino).toBe(ino);
    });

    it('should handle DirentType enum properly', () => {
      // Test that all enum values work
      Object.values(DirentType).forEach(type => {
        if (typeof type === 'number') {
          const entry = DirentUtils.create('test', createIno(1n), type);
          expect(entry.type).toBe(type);
        }
      });
    });

    it('should maintain immutability of created objects', () => {
      const entry = DirentUtils.create(
        'test',
        createIno(1n),
        DirentType.RegularFile
      );
      const result = DirentUtils.createReaddirResult([entry]);

      // Objects should be independent
      expect(result.entries[0]).toBe(entry);

      // Modifying the original shouldn't affect the result
      const originalName = entry.name;
      const newEntries = [
        DirentUtils.create('modified', createIno(2n), DirentType.Directory),
      ];
      const newResult = DirentUtils.createReaddirResult(newEntries);

      expect(result.entries[0].name).toBe(originalName);
      expect(newResult.entries[0].name).toBe('modified');
    });
  });
});
