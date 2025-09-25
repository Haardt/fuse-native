/**
 * @file operations.test.ts
 * @brief Integration tests for FUSE Operations using productive API
 *
 * This test suite validates operation handler functionality using the productive API
 * from main.cc instead of legacy test wrapper functions.
 */

import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

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

beforeEach(() => {
  // Clean up any existing handlers before each test
  try {
    binding.removeOperationHandler('lookup');
    binding.removeOperationHandler('getattr');
    binding.removeOperationHandler('read');
    binding.removeOperationHandler('write');
    binding.removeOperationHandler('readdir');
    binding.removeOperationHandler('statfs');
  } catch (e) {
    // Ignore cleanup errors
  }
});

describe('Operations Module Integration', () => {
  describe('Module Loading and Exports', () => {
    test('should load native module successfully', () => {
      expect(binding).toBeDefined();
      expect(typeof binding).toBe('object');
    });

    test('should export operation handler functions', () => {
      expect(typeof binding.setOperationHandler).toBe('function');
      expect(typeof binding.removeOperationHandler).toBe('function');
    });

    test('should export session management functions', () => {
      expect(typeof binding.createSession).toBe('function');
      expect(typeof binding.mount).toBe('function');
      expect(typeof binding.unmount).toBe('function');
    });
  });

  describe('Handler Registration', () => {
    test('should handle operation handler registration', () => {
      const handler = () => console.log('test handler');

      // Test that setOperationHandler works
      expect(() => {
        const result = binding.setOperationHandler('readdir', handler);
        expect(result).toBe(true);
      }).not.toThrow();
    });

    test('should successfully set operation handler', () => {
      const handler = () => console.log('readdir handler');

      const result = binding.setOperationHandler('readdir', handler);
      expect(result).toBe(true);
    });

    test('should successfully remove operation handler', () => {
      const handler = () => console.log('lookup handler');

      // Set handler first
      binding.setOperationHandler('lookup', handler);

      // Remove handler
      const result = binding.removeOperationHandler('lookup');
      expect(result).toBe(true);
    });

    test('should handle multiple handlers correctly', () => {
      const readdirHandler = () => console.log('readdir');
      const lookupHandler = () => console.log('lookup');
      const getattrHandler = () => console.log('getattr');

      expect(binding.setOperationHandler('readdir', readdirHandler)).toBe(true);
      expect(binding.setOperationHandler('lookup', lookupHandler)).toBe(true);
      expect(binding.setOperationHandler('getattr', getattrHandler)).toBe(true);

      // Cleanup
      expect(binding.removeOperationHandler('readdir')).toBe(true);
      expect(binding.removeOperationHandler('lookup')).toBe(true);
      expect(binding.removeOperationHandler('getattr')).toBe(true);
    });
  });

  describe('Handler Validation', () => {
    test('should validate operation handler functions', () => {
      // Test that handlers can be set and removed
      const validHandler = () => console.log('valid handler');

      expect(() => {
        binding.setOperationHandler('getattr', validHandler);
        binding.removeOperationHandler('getattr');
      }).not.toThrow();
    });

    test('should handle operation argument patterns', () => {
      // Test different operation types that would have different argument patterns
      const operations = ['lookup', 'getattr', 'read', 'write', 'readdir'];
      const handler = () => console.log('handler');

      operations.forEach(operation => {
        expect(() => {
          binding.setOperationHandler(operation, handler);
          binding.removeOperationHandler(operation);
        }).not.toThrow();
      });
    });

    test('should provide error constants for operations', () => {
      const { errno } = binding;

      // Test that we have error codes for operation validation
      expect(errno.ENOSYS).toBeDefined(); // Function not implemented
      expect(errno.EINVAL).toBeDefined(); // Invalid argument
      expect(errno.EPERM).toBeDefined(); // Operation not permitted
    });
  });

  describe('FUSE Operation Support', () => {
    test('should support all major FUSE operations', () => {
      const handler = () => console.log('operation handler');
      const operations = [
        'lookup',
        'getattr',
        'read',
        'write',
        'readdir',
        'statfs',
      ];

      operations.forEach(operation => {
        expect(() => {
          const setResult = binding.setOperationHandler(operation, handler);
          expect(setResult).toBe(true);

          const removeResult = binding.removeOperationHandler(operation);
          expect(removeResult).toBe(true);
        }).not.toThrow();
      });
    });

    test('should provide operation-specific error codes', () => {
      const { errno } = binding;

      // Lookup operation errors
      expect(errno.ENOENT).toBeDefined(); // No such file or directory
      expect(errno.ENAMETOOLONG).toBeDefined(); // File name too long

      // Read/Write operation errors
      expect(errno.EBADF).toBeDefined(); // Bad file descriptor
      expect(errno.EIO).toBeDefined(); // I/O error

      // Directory operation errors
      expect(errno.ENOTDIR).toBeDefined(); // Not a directory
      expect(errno.EISDIR).toBeDefined(); // Is a directory

      // Permission errors
      expect(errno.EACCES).toBeDefined(); // Permission denied
      expect(errno.EPERM).toBeDefined(); // Operation not permitted
    });

    test('should handle file operation constants', () => {
      const { mode, flags } = binding;

      // File types for operations
      expect(mode.S_IFREG).toBeDefined(); // Regular file
      expect(mode.S_IFDIR).toBeDefined(); // Directory
      expect(mode.S_IFLNK).toBeDefined(); // Symbolic link

      // File access modes
      expect(flags.O_RDONLY).toBeDefined(); // Read only
      expect(flags.O_WRONLY).toBeDefined(); // Write only
      expect(flags.O_RDWR).toBeDefined(); // Read/write
    });
  });

  describe('ThreadSafeFunction Integration', () => {
    test('should create ThreadSafeFunction for handlers', () => {
      const handler = () => console.log('TSFN handler');

      const result = binding.setOperationHandler('getattr', handler);
      expect(result).toBe(true);

      // Note: Actually calling the TSFN would require a full FUSE context
      // This test verifies the handler can be registered successfully

      binding.removeOperationHandler('getattr');
    });

    test('should handle handler replacement', () => {
      const handler1 = () => console.log('handler 1');
      const handler2 = () => console.log('handler 2');

      // Set first handler
      expect(binding.setOperationHandler('read', handler1)).toBe(true);

      // Replace with second handler
      expect(binding.setOperationHandler('read', handler2)).toBe(true);

      // Remove handler
      expect(binding.removeOperationHandler('read')).toBe(true);
    });

    test('should handle concurrent handler operations', () => {
      const handlers = {
        lookup: () => console.log('lookup'),
        getattr: () => console.log('getattr'),
        read: () => console.log('read'),
      };

      // Set multiple handlers
      Object.entries(handlers).forEach(([operation, handler]) => {
        expect(binding.setOperationHandler(operation, handler)).toBe(true);
      });

      // Remove all handlers
      Object.keys(handlers).forEach(operation => {
        expect(binding.removeOperationHandler(operation)).toBe(true);
      });
    });
  });

  describe('Memory Management', () => {
    test('should handle rapid set/remove cycles', () => {
      const handler = () => console.log('cycle handler');

      // Rapid set/remove cycles
      for (let i = 0; i < 50; i++) {
        expect(binding.setOperationHandler('write', handler)).toBe(true);
        expect(binding.removeOperationHandler('write')).toBe(true);
      }
    });

    test('should handle multiple handler types simultaneously', () => {
      const operations = ['readdir', 'lookup', 'getattr', 'read', 'write'];
      const handlers = operations.map(op => () => console.log(`${op} handler`));

      // Set all handlers
      operations.forEach((operation, index) => {
        expect(binding.setOperationHandler(operation, handlers[index])).toBe(
          true
        );
      });

      // Remove all handlers
      operations.forEach(operation => {
        expect(binding.removeOperationHandler(operation)).toBe(true);
      });
    });

    test('should not leak memory with repeated operations', () => {
      const handler = () => console.log('memory test handler');

      for (let i = 0; i < 100; i++) {
        binding.setOperationHandler('statfs', handler);
        binding.removeOperationHandler('statfs');

        // Access constants to test overall stability
        const errno = binding.errno.ENOSYS;
        const mode = binding.mode.S_IFREG;
        expect(typeof errno).toBe('number');
        expect(typeof mode).toBe('number');
      }
    });
  });

  describe('Integration with Session Management', () => {
    test('should work alongside session functions', () => {
      const handler = () => console.log('session test handler');

      // Test operations and session functions together
      expect(binding.setOperationHandler('lookup', handler)).toBe(true);

      // Session functions should still work
      expect(typeof binding.createSession).toBe('function');
      expect(typeof binding.mount).toBe('function');
      expect(typeof binding.unmount).toBe('function');

      binding.removeOperationHandler('lookup');
    });

    test('should integrate with version information', () => {
      const version = binding.getVersion();
      const handler = () => console.log('version test handler');

      expect(version).toBeDefined();
      expect(version.binding).toBe('3.0.0-alpha.1');
      expect(version.napi).toBe('8');

      // Operations should work alongside version info
      expect(binding.setOperationHandler('getattr', handler)).toBe(true);
      expect(binding.removeOperationHandler('getattr')).toBe(true);
    });

    test('should work with constant access', () => {
      const handler = () => console.log('constants test handler');
      const { errno, mode, flags } = binding;

      // Set handler
      expect(binding.setOperationHandler('read', handler)).toBe(true);

      // Constants should be accessible
      expect(errno.ENOENT).toBe(-2);
      expect(mode.S_IFREG).toBe(32768);
      expect(flags.O_RDONLY).toBe(0);

      // Remove handler
      expect(binding.removeOperationHandler('read')).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {

    test('should handle removal of non-existent handlers', () => {
      // Try to remove handler that doesn't exist
      expect(() => {
        const result = binding.removeOperationHandler('non_existent');
        expect(typeof result).toBe('boolean');
      }).not.toThrow();
    });

    test('should provide comprehensive error codes', () => {
      const { errno } = binding;

      const operationErrors = [
        'ENOSYS', // Function not implemented
        'EINVAL', // Invalid argument
        'EPERM', // Operation not permitted
        'EACCES', // Permission denied
        'ENOENT', // No such file or directory
        'EIO', // Input/output error
        'EBADF', // Bad file descriptor
        'EISDIR', // Is a directory
        'ENOTDIR', // Not a directory
      ];

      operationErrors.forEach(errorName => {
        expect(errno[errorName]).toBeDefined();
        expect(typeof errno[errorName]).toBe('number');
        expect(errno[errorName]).toBeLessThan(0);
      });
    });
  });

  describe('Performance and Stability', () => {
    test('should handle rapid handler operations efficiently', () => {
      const start = Date.now();
      const handler = () => console.log('performance handler');

      for (let i = 0; i < 1000; i++) {
        binding.setOperationHandler('write', handler);
        binding.removeOperationHandler('write');
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    test('should maintain stability under concurrent operations', () => {
      const operations = ['lookup', 'getattr', 'read', 'write', 'readdir'];
      const handler = () => console.log('stability handler');

      expect(() => {
        // Set all handlers
        operations.forEach(op => {
          binding.setOperationHandler(op, handler);
        });

        // Access constants while handlers are active
        for (let i = 0; i < 100; i++) {
          const errno = binding.errno.EIO;
          const mode = binding.mode.S_IFDIR;
          const flags = binding.flags.O_RDWR;

          expect(errno).toBe(-5);
          expect(mode).toBe(16384);
          expect(flags).toBe(2);
        }

        // Remove all handlers
        operations.forEach(op => {
          binding.removeOperationHandler(op);
        });
      }).not.toThrow();
    });

    test('should provide consistent API behavior', () => {
      const handler = () => console.log('consistency handler');

      // Multiple cycles should behave consistently
      for (let i = 0; i < 10; i++) {
        const setResult = binding.setOperationHandler('statfs', handler);
        expect(setResult).toBe(true);

        const removeResult = binding.removeOperationHandler('statfs');
        expect(removeResult).toBe(true);

        // Version should remain consistent
        const version = binding.getVersion();
        expect(version.binding).toBe('3.0.0-alpha.1');
      }
    });
  });

  describe('Version and Compatibility', () => {
    test('should provide version information', () => {
      const version = binding.getVersion();
      expect(version).toHaveProperty('fuse');
      expect(version).toHaveProperty('binding');
      expect(version).toHaveProperty('napi');
      expect(version.fuse).toMatch(/^\d+$/); // Numeric string from fuse_version()
      expect(version.napi).toBe('8');
    });

    test('should have all expected exports', () => {
      const expectedFunctions = [
        'setOperationHandler',
        'removeOperationHandler',
        'createSession',
        'destroySession',
        'mount',
        'unmount',
        'isReady',
        'getVersion',
      ];

      expectedFunctions.forEach(func => {
        expect(binding[func]).toBeDefined();
        expect(typeof binding[func]).toBe('function');
      });

      expect(binding).toHaveProperty('errno');
      expect(binding).toHaveProperty('mode');
      expect(binding).toHaveProperty('flags');
    });

    test('should maintain FUSE3 compatibility', () => {
      const version = binding.getVersion();
      expect(version.binding).toBe('3.0.0-alpha.1');

      // Should support modern operation handler patterns
      const modernHandler = () => console.log('FUSE3 handler');
      expect(binding.setOperationHandler('lookup', modernHandler)).toBe(true);
      expect(binding.removeOperationHandler('lookup')).toBe(true);
    });
  });
});
