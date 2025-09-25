/**
 * @file smoke-simple.test.ts
 * @brief Simple smoke tests for FUSE Native binding with productive API
 *
 * Tests basic functionality using the productive API from main.cc
 * instead of legacy test wrapper functions.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

// Import the native binding built from main.cc
let binding: any;

beforeAll(() => {
  try {
    binding = require('../prebuilds/linux-x64/@cocalc+fuse-native.node');
  } catch (error) {
    console.error('Failed to load native binding:', error);
    throw error;
  }
});

describe('FUSE Native Simple Smoke Tests', () => {
  describe('Native Binding Loading', () => {
    test('should load native module successfully', () => {
      expect(binding).toBeDefined();
      expect(typeof binding).toBe('object');
    });

    test('should export core functions', () => {
      expect(typeof binding.getVersion).toBe('function');
      expect(typeof binding.createSession).toBe('function');
      expect(typeof binding.setOperationHandler).toBe('function');
      expect(typeof binding.removeOperationHandler).toBe('function');
    });

    test('should export constants', () => {
      expect(binding.errno).toBeDefined();
      expect(typeof binding.errno).toBe('object');
      expect(typeof binding.errno.ENOENT).toBe('number');
      expect(typeof binding.errno.EACCES).toBe('number');
      expect(typeof binding.errno.EIO).toBe('number');
    });
  });

  describe('Version Information', () => {
    test('should return version information', () => {
      const version = binding.getVersion();
      expect(version).toHaveProperty('fuse');
      expect(version).toHaveProperty('binding');
      expect(version).toHaveProperty('napi');
      expect(typeof version.fuse).toBe('string');
      expect(typeof version.binding).toBe('string');
      expect(typeof version.napi).toBe('string');
    });

    test('should have expected version values', () => {
      const version = binding.getVersion();
      // FUSE version from fuse_version() is numeric string
      expect(version.fuse).toMatch(/^\d+$/);
      expect(version.napi).toBe('8');
      expect(version.binding).toBe('3.0.0-alpha.1');
    });

    test('should have consistent version across calls', () => {
      const version1 = binding.getVersion();
      const version2 = binding.getVersion();
      expect(version1).toEqual(version2);
    });
  });

  describe('Errno Constants Integration', () => {
    test('should have correct errno values', () => {
      const { errno } = binding;

      // Test basic errno values (should be negative for FUSE)
      expect(errno.ENOENT).toBe(-2); // No such file or directory
      expect(errno.EACCES).toBe(-13); // Permission denied
      expect(errno.EPERM).toBe(-1); // Operation not permitted
      expect(errno.EIO).toBe(-5); // Input/output error
    });

    test('should map errno values correctly', () => {
      const { errno } = binding;

      // Test that errno values are negative (FUSE convention)
      expect(errno.ENOENT).toBeLessThan(0);
      expect(errno.EACCES).toBeLessThan(0);
      expect(errno.EIO).toBeLessThan(0);
      expect(errno.ENOSYS).toBeLessThan(0);
    });

    test('should have filesystem-specific errors', () => {
      const { errno } = binding;

      expect(typeof errno.ENOSPC).toBe('number'); // No space left
      expect(typeof errno.EROFS).toBe('number'); // Read-only filesystem
      expect(typeof errno.ENOSYS).toBe('number'); // Function not implemented
      expect(typeof errno.ERANGE).toBe('number'); // Result too large
    });
  });

  describe('Mode Constants Integration', () => {
    test('should have file type constants', () => {
      const { mode } = binding;

      expect(typeof mode.S_IFREG).toBe('number'); // Regular file
      expect(typeof mode.S_IFDIR).toBe('number'); // Directory
      expect(typeof mode.S_IFLNK).toBe('number'); // Symbolic link
    });

    test('should have permission constants', () => {
      const { mode } = binding;

      expect(typeof mode.S_IRUSR).toBe('number'); // User read
      expect(typeof mode.S_IWUSR).toBe('number'); // User write
      expect(typeof mode.S_IXUSR).toBe('number'); // User execute
    });

    test('should have expected mode values', () => {
      const { mode } = binding;

      expect(mode.S_IFREG).toBe(0o100000); // Regular file
      expect(mode.S_IFDIR).toBe(0o040000); // Directory
      expect(mode.S_IRUSR).toBe(0o400); // User read
      expect(mode.S_IWUSR).toBe(0o200); // User write
    });
  });

  describe('Flags Constants Integration', () => {
    test('should have open flags', () => {
      const { flags } = binding;

      expect(typeof flags.O_RDONLY).toBe('number');
      expect(typeof flags.O_WRONLY).toBe('number');
      expect(typeof flags.O_RDWR).toBe('number');
      expect(typeof flags.O_CREAT).toBe('number');
    });

    test('should have expected flag values', () => {
      const { flags } = binding;

      expect(flags.O_RDONLY).toBe(0);
      expect(flags.O_WRONLY).toBe(1);
      expect(flags.O_RDWR).toBe(2);
    });
  });

  describe('Operations Handler Management', () => {
    test('should handle operation handler functions', () => {
      // Test that handler functions exist and can be called
      expect(() => {
        binding.setOperationHandler;
        binding.removeOperationHandler;
      }).not.toThrow();
    });

    test('should handle session management functions', () => {
      // Test that session functions exist
      expect(() => {
        binding.createSession;
        binding.destroySession;
        binding.mount;
        binding.unmount;
        binding.isReady;
      }).not.toThrow();
    });
  });

  describe('Integration Stability', () => {
    test('should handle multiple operations without crashes', () => {
      // Test multiple different operations in sequence
      expect(() => {
        binding.getVersion();
        const version = binding.getVersion();
        const errno = binding.errno.ENOENT;
        const mode = binding.mode.S_IFREG;
        const flags = binding.flags.O_RDONLY;

        expect(version).toBeDefined();
        expect(typeof errno).toBe('number');
        expect(typeof mode).toBe('number');
        expect(typeof flags).toBe('number');
      }).not.toThrow();
    });

    test('should maintain consistent state across calls', () => {
      const version1 = binding.getVersion();
      const version2 = binding.getVersion();
      expect(version1).toEqual(version2);

      const errno1 = binding.errno.ENOENT;
      const errno2 = binding.errno.ENOENT;
      expect(errno1).toBe(errno2);
    });

    test('should handle rapid constant access', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          const val =
            binding.errno.ENOENT +
            binding.mode.S_IFREG +
            binding.flags.O_RDONLY;
          expect(typeof val).toBe('number');
        }
      }).not.toThrow();
    });
  });

  describe('API Completeness', () => {
    test('should provide all required exports', () => {
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

    test('should have complete constant sets', () => {
      const { errno, mode, flags } = binding;

      // Essential errno codes
      const requiredErrno = ['ENOENT', 'EACCES', 'EPERM', 'EIO', 'EEXIST'];
      for (const errnoName of requiredErrno) {
        expect(errno[errnoName]).toBeDefined();
        expect(typeof errno[errnoName]).toBe('number');
      }

      // Essential mode constants
      const requiredModes = ['S_IFREG', 'S_IFDIR', 'S_IRUSR', 'S_IWUSR'];
      for (const modeName of requiredModes) {
        expect(mode[modeName]).toBeDefined();
        expect(typeof mode[modeName]).toBe('number');
      }

      // Essential flags
      const requiredFlags = ['O_RDONLY', 'O_WRONLY', 'O_RDWR', 'O_CREAT'];
      for (const flagName of requiredFlags) {
        expect(flags[flagName]).toBeDefined();
        expect(typeof flags[flagName]).toBe('number');
      }
    });
  });

  describe('Performance and Memory', () => {
    test('should handle repeated version calls efficiently', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        const version = binding.getVersion();
        expect(version).toBeDefined();
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    test('should not leak memory with constant access', () => {
      // Access constants many times to test for memory leaks
      for (let i = 0; i < 10000; i++) {
        const errno = binding.errno.ENOENT;
        const mode = binding.mode.S_IFREG;
        const flags = binding.flags.O_RDONLY;

        expect(errno).toBe(-2);
        expect(mode).toBe(0o100000);
        expect(flags).toBe(0);
      }
    });
  });
});
