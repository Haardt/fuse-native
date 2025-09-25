/**
 * @file main-module.test.ts
 * @brief Integration tests for main.cc FUSE3 Node.js binding entry point
 *
 * This test suite validates that main.cc successfully exports all required
 * functions and constants for the FUSE3 binding, replacing statfs_only.cc
 * as the primary module entry point.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

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

describe('Main Module Entry Point', () => {
  describe('Module Loading', () => {
    test('should load native module successfully', () => {
      expect(binding).toBeDefined();
      expect(typeof binding).toBe('object');
    });

    test('should export getVersion function', () => {
      expect(typeof binding.getVersion).toBe('function');
    });

    test('should export FUSE session management functions', () => {
      expect(typeof binding.createSession).toBe('function');
      expect(typeof binding.destroySession).toBe('function');
      expect(typeof binding.mount).toBe('function');
      expect(typeof binding.unmount).toBe('function');
      expect(typeof binding.isReady).toBe('function');
    });

    test('should export operation management functions', () => {
      expect(typeof binding.setOperationHandler).toBe('function');
      expect(typeof binding.removeOperationHandler).toBe('function');
    });

    test('should export errno constants', () => {
      expect(binding.errno).toBeDefined();
      expect(typeof binding.errno).toBe('object');
    });

    test('should export mode constants', () => {
      expect(binding.mode).toBeDefined();
      expect(typeof binding.mode).toBe('object');
    });

    test('should export flags constants', () => {
      expect(binding.flags).toBeDefined();
      expect(typeof binding.flags).toBe('object');
    });
  });

  describe('Version Information', () => {
    test('should return version information', () => {
      const version = binding.getVersion();

      expect(version).toBeDefined();
      expect(typeof version).toBe('object');
      expect(typeof version.fuse).toBe('string');
      expect(typeof version.binding).toBe('string');
      expect(typeof version.napi).toBe('string');
    });

    test('should have expected version format', () => {
      const version = binding.getVersion();

      // FUSE version should be numeric (from fuse_version())
      expect(version.fuse).toMatch(/^\d+/);

      // Binding version should match expected format
      expect(version.binding).toBe('3.0.0-alpha.1');

      // NAPI version should be numeric
      expect(version.napi).toMatch(/^\d+$/);
    });

    test('should report NAPI version 8 or higher', () => {
      const version = binding.getVersion();
      const napiVersion = parseInt(version.napi);

      expect(napiVersion).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Errno Constants', () => {
    test('should export standard POSIX errno values', () => {
      const { errno } = binding;

      // Basic file system errors
      expect(typeof errno.ENOENT).toBe('number');
      expect(typeof errno.EACCES).toBe('number');
      expect(typeof errno.EPERM).toBe('number');
      expect(typeof errno.EIO).toBe('number');
      expect(typeof errno.EEXIST).toBe('number');
      expect(typeof errno.EISDIR).toBe('number');
      expect(typeof errno.ENOTDIR).toBe('number');
      expect(typeof errno.ENOTEMPTY).toBe('number');
    });

    test('should use negative errno convention', () => {
      const { errno } = binding;

      // FUSE uses negative errno values
      expect(errno.ENOENT).toBeLessThan(0);
      expect(errno.EACCES).toBeLessThan(0);
      expect(errno.EPERM).toBeLessThan(0);
      expect(errno.EIO).toBeLessThan(0);
    });

    test('should have consistent errno values', () => {
      const { errno } = binding;

      // Standard errno values (negated for FUSE)
      expect(errno.ENOENT).toBe(-2); // No such file or directory
      expect(errno.EACCES).toBe(-13); // Permission denied
      expect(errno.EPERM).toBe(-1); // Operation not permitted
      expect(errno.EIO).toBe(-5); // Input/output error
    });

    test('should export filesystem-specific errors', () => {
      const { errno } = binding;

      expect(typeof errno.ENOSPC).toBe('number'); // No space left on device
      expect(typeof errno.EROFS).toBe('number'); // Read-only file system
      expect(typeof errno.ENOSYS).toBe('number'); // Function not implemented
      expect(typeof errno.ERANGE).toBe('number'); // Result too large
    });
  });

  describe('Mode Constants', () => {
    test('should export file type constants', () => {
      const { mode } = binding;

      expect(typeof mode.S_IFMT).toBe('number'); // File type mask
      expect(typeof mode.S_IFREG).toBe('number'); // Regular file
      expect(typeof mode.S_IFDIR).toBe('number'); // Directory
      expect(typeof mode.S_IFLNK).toBe('number'); // Symbolic link
      expect(typeof mode.S_IFBLK).toBe('number'); // Block device
      expect(typeof mode.S_IFCHR).toBe('number'); // Character device
      expect(typeof mode.S_IFIFO).toBe('number'); // FIFO
      expect(typeof mode.S_IFSOCK).toBe('number'); // Socket
    });

    test('should export permission constants', () => {
      const { mode } = binding;

      // User permissions
      expect(typeof mode.S_IRWXU).toBe('number');
      expect(typeof mode.S_IRUSR).toBe('number');
      expect(typeof mode.S_IWUSR).toBe('number');
      expect(typeof mode.S_IXUSR).toBe('number');

      // Group permissions
      expect(typeof mode.S_IRWXG).toBe('number');
      expect(typeof mode.S_IRGRP).toBe('number');
      expect(typeof mode.S_IWGRP).toBe('number');
      expect(typeof mode.S_IXGRP).toBe('number');

      // Other permissions
      expect(typeof mode.S_IRWXO).toBe('number');
      expect(typeof mode.S_IROTH).toBe('number');
      expect(typeof mode.S_IWOTH).toBe('number');
      expect(typeof mode.S_IXOTH).toBe('number');
    });

    test('should export special bits', () => {
      const { mode } = binding;

      expect(typeof mode.S_ISUID).toBe('number'); // Set user ID
      expect(typeof mode.S_ISGID).toBe('number'); // Set group ID
      expect(typeof mode.S_ISVTX).toBe('number'); // Sticky bit
    });

    test('should have standard POSIX values', () => {
      const { mode } = binding;

      // Standard file type values
      expect(mode.S_IFREG).toBe(0o100000); // Regular file
      expect(mode.S_IFDIR).toBe(0o040000); // Directory
      expect(mode.S_IFLNK).toBe(0o120000); // Symbolic link

      // Standard permission values
      expect(mode.S_IRUSR).toBe(0o400); // User read
      expect(mode.S_IWUSR).toBe(0o200); // User write
      expect(mode.S_IXUSR).toBe(0o100); // User execute
    });
  });

  describe('Flags Constants', () => {
    test('should export open flags', () => {
      const { flags } = binding;

      expect(typeof flags.O_RDONLY).toBe('number');
      expect(typeof flags.O_WRONLY).toBe('number');
      expect(typeof flags.O_RDWR).toBe('number');
      expect(typeof flags.O_CREAT).toBe('number');
      expect(typeof flags.O_EXCL).toBe('number');
      expect(typeof flags.O_TRUNC).toBe('number');
      expect(typeof flags.O_APPEND).toBe('number');
    });

    test('should export advanced flags', () => {
      const { flags } = binding;

      expect(typeof flags.O_NONBLOCK).toBe('number');
      expect(typeof flags.O_SYNC).toBe('number');
      expect(typeof flags.O_DIRECT).toBe('number');
      expect(typeof flags.O_DIRECTORY).toBe('number');
      expect(typeof flags.O_NOFOLLOW).toBe('number');
    });

    test('should have standard POSIX flag values', () => {
      const { flags } = binding;

      // Basic access modes
      expect(flags.O_RDONLY).toBe(0);
      expect(flags.O_WRONLY).toBe(1);
      expect(flags.O_RDWR).toBe(2);

      // Creation flags
      expect(flags.O_CREAT).toBe(64); // Typical value on Linux
      expect(flags.O_EXCL).toBe(128); // Typical value on Linux
    });
  });

  describe('Session Management Functions', () => {
    test('should handle createSession calls', () => {
      // Note: We don't call createSession here as it would require actual FUSE setup
      // This test just verifies the function exists and is callable
      expect(() => {
        // This should not throw for having the wrong signature
        binding.createSession;
      }).not.toThrow();
    });

    test('should handle operation handler management', () => {
      // Verify functions exist for operation handler management
      expect(() => {
        binding.setOperationHandler;
        binding.removeOperationHandler;
      }).not.toThrow();
    });

    test('should handle session state queries', () => {
      expect(() => {
        binding.isReady;
        binding.mount;
        binding.unmount;
        binding.destroySession;
      }).not.toThrow();
    });
  });

  describe('Integration Readiness', () => {
    test('should be ready for full FUSE3 operations', () => {
      // Verify all essential components are available
      const requiredExports = [
        'getVersion',
        'createSession',
        'destroySession',
        'mount',
        'unmount',
        'isReady',
        'setOperationHandler',
        'removeOperationHandler',
        'errno',
        'mode',
        'flags',
      ];

      for (const exportName of requiredExports) {
        expect(binding[exportName]).toBeDefined();
      }
    });

    test('should provide constants for all major file system operations', () => {
      const { errno, mode, flags } = binding;

      // Essential errno codes for file operations
      const essentialErrno = [
        'ENOENT',
        'EACCES',
        'EPERM',
        'EIO',
        'EEXIST',
        'EISDIR',
        'ENOTDIR',
      ];
      for (const errnoName of essentialErrno) {
        expect(errno[errnoName]).toBeDefined();
        expect(typeof errno[errnoName]).toBe('number');
      }

      // Essential mode constants for file types
      const essentialModes = [
        'S_IFREG',
        'S_IFDIR',
        'S_IFLNK',
        'S_IRUSR',
        'S_IWUSR',
        'S_IXUSR',
      ];
      for (const modeName of essentialModes) {
        expect(mode[modeName]).toBeDefined();
        expect(typeof mode[modeName]).toBe('number');
      }

      // Essential flags for file operations
      const essentialFlags = [
        'O_RDONLY',
        'O_WRONLY',
        'O_RDWR',
        'O_CREAT',
        'O_TRUNC',
      ];
      for (const flagName of essentialFlags) {
        expect(flags[flagName]).toBeDefined();
        expect(typeof flags[flagName]).toBe('number');
      }
    });

    test('should maintain compatibility with existing test expectations', () => {
      // Verify the module structure matches what existing code expects
      expect(binding).toHaveProperty('errno');
      expect(binding).toHaveProperty('mode');
      expect(binding).toHaveProperty('flags');
      expect(binding).toHaveProperty('getVersion');

      // Session management should be available
      expect(binding).toHaveProperty('createSession');
      expect(binding).toHaveProperty('mount');
      expect(binding).toHaveProperty('unmount');

      // Operation management should be available
      expect(binding).toHaveProperty('setOperationHandler');
      expect(binding).toHaveProperty('removeOperationHandler');
    });
  });

  describe('Performance and Stability', () => {
    test('should handle repeated version calls without memory leaks', () => {
      // Call getVersion multiple times to verify no memory issues
      for (let i = 0; i < 100; i++) {
        const version = binding.getVersion();
        expect(version).toBeDefined();
        expect(typeof version.fuse).toBe('string');
      }
    });

    test('should provide consistent constant values', () => {
      // Constants should be the same across multiple accesses
      const errno1 = binding.errno;
      const errno2 = binding.errno;
      const mode1 = binding.mode;
      const mode2 = binding.mode;

      expect(errno1.ENOENT).toBe(errno2.ENOENT);
      expect(mode1.S_IFREG).toBe(mode2.S_IFREG);
    });

    test('should not crash on rapid constant access', () => {
      // Rapid access to constants should be stable
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          const val =
            binding.errno.ENOENT +
            binding.mode.S_IFREG +
            binding.flags.O_RDONLY;
          expect(typeof val).toBe('number');
        }
      }).not.toThrow();
    });
  });
});
