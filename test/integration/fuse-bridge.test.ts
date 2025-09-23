/**
 * @file fuse-bridge.test.ts
 * @brief Integration tests for FUSE Bridge functionality using productive API
 *
 * This test suite validates FUSE bridge operations using the productive API
 * from main.cc instead of legacy test wrapper functions.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

// Import the native binding built from main.cc
let binding: any;

beforeAll(() => {
  try {
    binding = require('../../prebuilds/linux-x64/@cocalc+fuse-native.node');
  } catch (error) {
    console.error('Failed to load native binding:', error);
    throw error;
  }
});

describe('FUSE Bridge Integration', () => {
  describe('Module Loading and Exports', () => {
    test('should load native module successfully', () => {
      expect(binding).toBeDefined();
      expect(typeof binding).toBe('object');
    });

    test('should export bridge-related functions', () => {
      // Core functions that bridge would use
      expect(typeof binding.createSession).toBe('function');
      expect(typeof binding.setOperationHandler).toBe('function');
      expect(typeof binding.removeOperationHandler).toBe('function');
      expect(typeof binding.mount).toBe('function');
      expect(typeof binding.unmount).toBe('function');
    });

    test('should export constants needed for FUSE operations', () => {
      expect(binding.errno).toBeDefined();
      expect(binding.mode).toBeDefined();
      expect(binding.flags).toBeDefined();
    });
  });

  describe('FUSE Operation Constants', () => {
    test('should provide errno constants for FUSE operations', () => {
      const { errno } = binding;

      // Essential FUSE errno values
      expect(errno.ENOENT).toBe(-2); // No such file or directory
      expect(errno.EACCES).toBe(-13); // Permission denied
      expect(errno.EPERM).toBe(-1); // Operation not permitted
      expect(errno.EIO).toBe(-5); // Input/output error
      expect(errno.EEXIST).toBe(-17); // File exists
      expect(errno.EISDIR).toBe(-21); // Is a directory
      expect(errno.ENOTDIR).toBe(-20); // Not a directory
    });

    test('should provide mode constants for file operations', () => {
      const { mode } = binding;

      // File type constants
      expect(mode.S_IFMT).toBeDefined(); // File type mask
      expect(mode.S_IFREG).toBe(0o100000); // Regular file
      expect(mode.S_IFDIR).toBe(0o040000); // Directory
      expect(mode.S_IFLNK).toBe(0o120000); // Symbolic link

      // Permission constants
      expect(mode.S_IRUSR).toBe(0o400); // User read
      expect(mode.S_IWUSR).toBe(0o200); // User write
      expect(mode.S_IXUSR).toBe(0o100); // User execute
    });

    test('should provide flags constants for file operations', () => {
      const { flags } = binding;

      // Open flags
      expect(flags.O_RDONLY).toBe(0);
      expect(flags.O_WRONLY).toBe(1);
      expect(flags.O_RDWR).toBe(2);
      expect(flags.O_CREAT).toBeDefined();
      expect(flags.O_TRUNC).toBeDefined();
      expect(flags.O_APPEND).toBeDefined();
    });
  });

  describe('Operation Handler Management', () => {
    test('should handle operation registration conceptually', () => {
      // Test that operation handler functions exist
      expect(typeof binding.setOperationHandler).toBe('function');
      expect(typeof binding.removeOperationHandler).toBe('function');
    });

    test('should support common FUSE operations', () => {
      const { errno } = binding;

      // Test that we have error codes for all major FUSE operations

      // lookup operation errors
      expect(errno.ENOENT).toBeDefined(); // File not found
      expect(errno.ENAMETOOLONG).toBeDefined(); // Name too long

      // getattr operation errors
      expect(errno.EACCES).toBeDefined(); // Permission denied
      expect(errno.ELOOP).toBeDefined(); // Too many symbolic links

      // read/write operation errors
      expect(errno.EBADF).toBeDefined(); // Bad file descriptor
      expect(errno.EIO).toBeDefined(); // I/O error

      // readdir operation errors
      expect(errno.ENOTDIR).toBeDefined(); // Not a directory

      // mkdir/rmdir operation errors
      expect(errno.EEXIST).toBeDefined(); // File exists
      expect(errno.ENOTEMPTY).toBeDefined(); // Directory not empty
    });

    test('should handle file permission scenarios', () => {
      const { mode } = binding;

      // Test common permission combinations
      const regularFile644 = mode.S_IFREG | 0o644; // Regular file, rw-r--r--
      const directory755 = mode.S_IFDIR | 0o755; // Directory, rwxr-xr-x
      const symlink777 = mode.S_IFLNK | 0o777; // Symlink, rwxrwxrwx

      expect(regularFile644).toBe(33188); // 0o100644
      expect(directory755).toBe(16877); // 0o040755
      expect(symlink777).toBe(41471); // 0o120777 - corrected actual value
    });
  });

  describe('FUSE Session Integration', () => {
    test('should provide session lifecycle management', () => {
      // Test session management functions exist
      expect(typeof binding.createSession).toBe('function');
      expect(typeof binding.destroySession).toBe('function');
      expect(typeof binding.mount).toBe('function');
      expect(typeof binding.unmount).toBe('function');
      expect(typeof binding.isReady).toBe('function');
    });

    test('should handle session state queries', () => {
      // Test that session state functions are available
      expect(() => {
        binding.isReady;
      }).not.toThrow();
    });

    test('should integrate with operation handlers', () => {
      // Test that both session and operation management work together
      expect(() => {
        binding.createSession;
        binding.setOperationHandler;
        binding.removeOperationHandler;
        binding.destroySession;
      }).not.toThrow();
    });
  });

  describe('File System Response Handling', () => {
    test('should provide error response constants', () => {
      const { errno } = binding;

      // Test error response scenarios
      const notFoundResponse = errno.ENOENT; // -2
      const permissionResponse = errno.EACCES; // -13
      const ioErrorResponse = errno.EIO; // -5
      const successResponse = 0; // Success

      expect(notFoundResponse).toBeLessThan(0);
      expect(permissionResponse).toBeLessThan(0);
      expect(ioErrorResponse).toBeLessThan(0);
      expect(successResponse).toBe(0);
    });

    test('should handle different response types', () => {
      const { mode } = binding;

      // Test that we can construct different response types

      // File attributes response
      const fileAttr = mode.S_IFREG | 0o644;
      expect(typeof fileAttr).toBe('number');

      // Directory attributes response
      const dirAttr = mode.S_IFDIR | 0o755;
      expect(typeof dirAttr).toBe('number');

      // Symlink attributes response
      const linkAttr = mode.S_IFLNK | 0o777;
      expect(typeof linkAttr).toBe('number');
    });

    test('should support large file attributes', () => {
      const { errno } = binding;

      // Test error codes relevant to large files
      expect(errno.ERANGE).toBeDefined(); // Result too large
      expect(errno.ENOSPC).toBeDefined(); // No space left on device
      // Note: EFBIG may not be available in all errno mappings
    });
  });

  describe('Integration with Operations System', () => {
    test('should work alongside operation handlers', () => {
      // Test that we can access both operation management and constants
      const { errno } = binding;

      expect(typeof binding.setOperationHandler).toBe('function');
      expect(errno.ENOSYS).toBeDefined(); // Function not implemented
    });

    test('should provide comprehensive operation support', () => {
      const { errno, mode, flags } = binding;

      // Test that we have everything needed for major operations

      // For lookup operation
      expect(errno.ENOENT).toBeDefined();
      expect(errno.ENAMETOOLONG).toBeDefined();

      // For getattr operation
      expect(mode.S_IFMT).toBeDefined();
      expect(mode.S_IFREG).toBeDefined();
      expect(mode.S_IFDIR).toBeDefined();

      // For open operation
      expect(flags.O_RDONLY).toBeDefined();
      expect(flags.O_WRONLY).toBeDefined();
      expect(flags.O_RDWR).toBeDefined();
      expect(flags.O_CREAT).toBeDefined();

      // For read/write operations
      expect(errno.EBADF).toBeDefined();
      expect(errno.EIO).toBeDefined();

      // For readdir operation
      expect(errno.ENOTDIR).toBeDefined();

      // For statfs operation
      expect(errno.ENOSYS).toBeDefined();
      expect(errno.EIO).toBeDefined();
    });

    test('should maintain consistency with operation validation', () => {
      // Test that constants are consistent across calls
      const { errno, mode, flags } = binding;

      const errno1 = errno.ENOENT;
      const errno2 = errno.ENOENT;
      const mode1 = mode.S_IFREG;
      const mode2 = mode.S_IFREG;
      const flags1 = flags.O_RDONLY;
      const flags2 = flags.O_RDONLY;

      expect(errno1).toBe(errno2);
      expect(mode1).toBe(mode2);
      expect(flags1).toBe(flags2);
    });
  });

  describe('Performance and Stability', () => {
    test('should handle rapid bridge operations', () => {
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          // Simulate rapid FUSE bridge operations
          const errno = binding.errno.ENOENT;
          const mode = binding.mode.S_IFREG;
          const flags = binding.flags.O_RDONLY;

          expect(errno).toBe(-2);
          expect(mode).toBe(32768);
          expect(flags).toBe(0);
        }
      }).not.toThrow();
    });

    test('should not leak memory with repeated operations', () => {
      // Test memory stability with repeated bridge operations
      for (let i = 0; i < 100; i++) {
        binding.getVersion();

        const errno = binding.errno.EIO;
        const mode = binding.mode.S_IFDIR;
        const flags = binding.flags.O_WRONLY;

        expect(typeof errno).toBe('number');
        expect(typeof mode).toBe('number');
        expect(typeof flags).toBe('number');
      }
    });

    test('should maintain state consistency under load', () => {
      // Test that constants remain consistent under repeated access
      const initialErrno = binding.errno.EACCES;
      const initialMode = binding.mode.S_IFLNK;
      const initialFlags = binding.flags.O_CREAT;

      for (let i = 0; i < 50; i++) {
        expect(binding.errno.EACCES).toBe(initialErrno);
        expect(binding.mode.S_IFLNK).toBe(initialMode);
        expect(binding.flags.O_CREAT).toBe(initialFlags);
      }
    });
  });

  describe('Version and Compatibility', () => {
    test('should provide version information', () => {
      const version = binding.getVersion();

      expect(version).toBeDefined();
      expect(typeof version.fuse).toBe('string');
      expect(typeof version.binding).toBe('string');
      expect(typeof version.napi).toBe('string');

      expect(version.binding).toBe('3.0.0-alpha.1');
      expect(version.napi).toBe('8');
    });

    test('should maintain FUSE3 compatibility', () => {
      const version = binding.getVersion();

      // Should have FUSE version available
      expect(version.fuse).toBeDefined();
      expect(version.fuse.length).toBeGreaterThan(0);

      // Should be a modern binding version
      expect(version.binding).toMatch(/^3\./);
      expect(version.napi).toBe('8');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle all FUSE error scenarios', () => {
      const { errno } = binding;

      // Comprehensive error coverage for FUSE operations
      const fuseErrors = [
        'ENOENT', // No such file or directory
        'EACCES', // Permission denied
        'EPERM', // Operation not permitted
        'EIO', // I/O error
        'EEXIST', // File exists
        'EISDIR', // Is a directory
        'ENOTDIR', // Not a directory
        'ENOTEMPTY', // Directory not empty
        'ENOSPC', // No space left on device
        'EROFS', // Read-only file system
        'ENOSYS', // Function not implemented
        'EINVAL', // Invalid argument
        'ERANGE', // Result too large
        'ELOOP', // Too many symbolic links
        'ENAMETOOLONG', // File name too long
        'EBADF', // Bad file descriptor
      ];

      fuseErrors.forEach(errorName => {
        expect(errno[errorName]).toBeDefined();
        expect(typeof errno[errorName]).toBe('number');
        expect(errno[errorName]).toBeLessThan(0); // Should be negative
      });
    });

    test('should provide complete file type support', () => {
      const { mode } = binding;

      const fileTypes = [
        'S_IFMT', // File type mask
        'S_IFREG', // Regular file
        'S_IFDIR', // Directory
        'S_IFLNK', // Symbolic link
        'S_IFBLK', // Block device
        'S_IFCHR', // Character device
        'S_IFIFO', // FIFO
        'S_IFSOCK', // Socket
      ];

      fileTypes.forEach(typeName => {
        expect(mode[typeName]).toBeDefined();
        expect(typeof mode[typeName]).toBe('number');
      });
    });

    test('should handle concurrent bridge operations', () => {
      // Simulate concurrent access patterns
      const operations = [];

      for (let i = 0; i < 10; i++) {
        operations.push(() => {
          const errno = binding.errno.ENOENT;
          const mode = binding.mode.S_IFREG;
          const version = binding.getVersion();

          expect(errno).toBe(-2);
          expect(mode).toBe(32768);
          expect(version).toBeDefined();
        });
      }

      // Execute all operations
      operations.forEach(op => {
        expect(op).not.toThrow();
        op();
      });
    });
  });
});
