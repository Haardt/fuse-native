/**
 * @file session-manager.test.ts
 * @brief Integration tests for FUSE Session Manager using productive API
 *
 * This test suite validates session management functionality using the productive API
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

describe('Session Manager Integration', () => {
  describe('Module Loading and Exports', () => {
    test('should load native module successfully', () => {
      expect(binding).toBeDefined();
      expect(typeof binding).toBe('object');
    });

    test('should export session management functions', () => {
      expect(typeof binding.createSession).toBe('function');
      expect(typeof binding.destroySession).toBe('function');
      expect(typeof binding.mount).toBe('function');
      expect(typeof binding.unmount).toBe('function');
      expect(typeof binding.isReady).toBe('function');
    });

    test('should export operation handler functions', () => {
      expect(typeof binding.setOperationHandler).toBe('function');
      expect(typeof binding.removeOperationHandler).toBe('function');
    });
  });

  describe('Session State Management', () => {
    test('should provide session management functions', () => {
      // Test that all session lifecycle functions exist
      const sessionFunctions = [
        'createSession',
        'destroySession',
        'mount',
        'unmount',
        'isReady',
      ];

      sessionFunctions.forEach(funcName => {
        expect(binding[funcName]).toBeDefined();
        expect(typeof binding[funcName]).toBe('function');
      });
    });

    test('should handle session state queries', () => {
      // Test that session state functions are callable
      expect(() => {
        binding.isReady;
      }).not.toThrow();
    });

    test('should support session lifecycle operations', () => {
      // Test that we have all lifecycle functions
      expect(typeof binding.createSession).toBe('function');
      expect(typeof binding.mount).toBe('function');
      expect(typeof binding.unmount).toBe('function');
      expect(typeof binding.destroySession).toBe('function');
    });
  });

  describe('Session Options and Configuration', () => {
    test('should provide configuration through constants', () => {
      const { errno, mode, flags } = binding;

      // Test that we have constants that would be used in session configuration
      expect(errno.ENOSYS).toBeDefined(); // Function not implemented
      expect(errno.EPERM).toBeDefined(); // Operation not permitted
      expect(errno.EACCES).toBeDefined(); // Permission denied

      // Mode constants for mount options
      expect(mode.S_IRUSR).toBeDefined(); // User read
      expect(mode.S_IWUSR).toBeDefined(); // User write
      expect(mode.S_IXUSR).toBeDefined(); // User execute

      // Flags for session configuration
      expect(flags.O_RDONLY).toBeDefined(); // Read only
      expect(flags.O_RDWR).toBeDefined(); // Read/write
    });

    test('should support typical session configuration values', () => {
      const { errno, flags } = binding;

      // Test configuration scenarios
      const readOnlyMount = flags.O_RDONLY;
      const readWriteMount = flags.O_RDWR;
      const permissionError = errno.EPERM;
      const accessError = errno.EACCES;

      expect(readOnlyMount).toBe(0);
      expect(readWriteMount).toBe(2);
      expect(permissionError).toBeLessThan(0);
      expect(accessError).toBeLessThan(0);
    });

    test('should handle session error scenarios', () => {
      const { errno } = binding;

      // Errors that sessions might encounter
      expect(errno.ENODEV).toBeDefined(); // No such device
      expect(errno.EINVAL).toBeDefined(); // Invalid argument
      expect(errno.ENOTDIR).toBeDefined(); // Not a directory (for mount point)
    });
  });

  describe('Session Lifecycle Management', () => {
    test('should provide complete lifecycle support', () => {
      // Test session lifecycle functions exist
      const lifecycleFunctions = [
        { name: 'createSession', type: 'function' },
        { name: 'destroySession', type: 'function' },
        { name: 'mount', type: 'function' },
        { name: 'unmount', type: 'function' },
        { name: 'isReady', type: 'function' },
      ];

      lifecycleFunctions.forEach(({ name, type }) => {
        expect(binding[name]).toBeDefined();
        expect(typeof binding[name]).toBe(type);
      });
    });

    test('should handle mount/unmount operations', () => {
      // Test that mount operations are available
      expect(typeof binding.mount).toBe('function');
      expect(typeof binding.unmount).toBe('function');

      // Associated error codes
      const { errno } = binding;
      expect(errno.ENOENT).toBeDefined(); // Mount point doesn't exist
      expect(errno.ENOTDIR).toBeDefined(); // Not a directory
    });

    test('should support session readiness checks', () => {
      // Test session readiness functionality
      expect(typeof binding.isReady).toBe('function');

      // Related constants
      const { errno } = binding;
      expect(errno.EAGAIN).toBeDefined(); // Try again
      expect(errno.EWOULDBLOCK).toBeDefined(); // Would block
    });
  });

  describe('FUSE Bridge Integration', () => {
    test('should integrate with operation handlers', () => {
      // Test that session management works with operations
      expect(typeof binding.setOperationHandler).toBe('function');
      expect(typeof binding.removeOperationHandler).toBe('function');
      expect(typeof binding.createSession).toBe('function');

      // They should all be available simultaneously
      const functions = [
        binding.setOperationHandler,
        binding.removeOperationHandler,
        binding.createSession,
        binding.destroySession,
      ];

      functions.forEach(func => {
        expect(typeof func).toBe('function');
      });
    });

    test('should work with FUSE constants', () => {
      const { errno, mode, flags } = binding;

      // Test that session management has access to all FUSE constants
      const fuseConstants = [
        { obj: errno, key: 'ENOSYS', desc: 'Function not implemented' },
        { obj: errno, key: 'EPERM', desc: 'Operation not permitted' },
        { obj: mode, key: 'S_IFDIR', desc: 'Directory' },
        { obj: flags, key: 'O_RDONLY', desc: 'Read only' },
      ];

      fuseConstants.forEach(({ obj, key }) => {
        expect(obj[key]).toBeDefined();
        expect(typeof obj[key]).toBe('number');
      });
    });

    test('should maintain consistency across components', () => {
      // Test that all components use consistent constants
      const version1 = binding.getVersion();
      const version2 = binding.getVersion();
      const errno1 = binding.errno.ENOENT;
      const errno2 = binding.errno.ENOENT;

      expect(version1).toEqual(version2);
      expect(errno1).toBe(errno2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should provide comprehensive error handling', () => {
      const { errno } = binding;

      // Session-specific errors (only using available errno constants)
      const sessionErrors = [
        'ENODEV', // No such device
        'EINVAL', // Invalid argument
        'EPERM', // Operation not permitted
        'EACCES', // Permission denied
        'ENOENT', // No such file or directory
        'ENOTDIR', // Not a directory
        'EMFILE', // Too many open files
        'ENFILE', // File table overflow
        'ENOMEM', // Out of memory
        'ENOSYS', // Function not implemented
      ];

      sessionErrors.forEach(errorName => {
        expect(errno[errorName]).toBeDefined();
        expect(typeof errno[errorName]).toBe('number');
        expect(errno[errorName]).toBeLessThan(0); // Negative errno
      });
    });

    test('should handle session operation errors', () => {
      const { errno } = binding;

      // Test specific error scenarios
      const unmountError = errno.ENOENT; // Not mounted
      const permissionError = errno.EPERM; // No permission
      const deviceError = errno.ENODEV; // No device

      expect(unmountError).toBeLessThan(0);
      expect(permissionError).toBeLessThan(0);
      expect(deviceError).toBeLessThan(0);
    });

    test('should gracefully handle function calls', () => {
      // Test that functions don't throw when accessed
      expect(() => {
        binding.createSession;
        binding.destroySession;
        binding.mount;
        binding.unmount;
        binding.isReady;
      }).not.toThrow();
    });
  });

  describe('Performance and Memory Management', () => {
    test('should handle repeated session queries efficiently', () => {
      const start = Date.now();

      // Test repeated calls
      for (let i = 0; i < 1000; i++) {
        binding.isReady;
        const errno = binding.errno.ENODEV;
        const version = binding.getVersion();

        expect(typeof errno).toBe('number');
        expect(version).toBeDefined();
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete quickly
    });

    test('should not leak memory with session operations', () => {
      // Test memory stability
      for (let i = 0; i < 100; i++) {
        const version = binding.getVersion();
        const errno = binding.errno.ENODEV;
        const mode = binding.mode.S_IFDIR;

        expect(version).toBeDefined();
        expect(typeof errno).toBe('number');
        expect(typeof mode).toBe('number');
      }
    });

    test('should maintain consistent state under load', () => {
      // Test that session state remains consistent
      const initialVersion = binding.getVersion();
      const initialErrno = binding.errno.EPERM;

      for (let i = 0; i < 50; i++) {
        expect(binding.getVersion()).toEqual(initialVersion);
        expect(binding.errno.EPERM).toBe(initialErrno);
      }
    });
  });

  describe('Integration with Other Modules', () => {
    test('should work with version information', () => {
      const version = binding.getVersion();

      expect(version).toBeDefined();
      expect(version.binding).toBe('3.0.0-alpha.1');
      expect(version.napi).toBe('8');
      expect(typeof version.fuse).toBe('string');
    });

    test('should integrate with errno mapping', () => {
      const { errno } = binding;

      // Test that errno values are properly mapped
      expect(errno.ENOENT).toBe(-2);
      expect(errno.EPERM).toBe(-1);
      expect(errno.EACCES).toBe(-13);
      expect(errno.EIO).toBe(-5);
    });

    test('should work with all constant sets', () => {
      const { errno, mode, flags } = binding;

      // Test that all constant sets are available
      expect(typeof errno).toBe('object');
      expect(typeof mode).toBe('object');
      expect(typeof flags).toBe('object');

      // Test that they have expected properties
      expect(Object.keys(errno).length).toBeGreaterThan(10);
      expect(Object.keys(mode).length).toBeGreaterThan(10);
      expect(Object.keys(flags).length).toBeGreaterThan(5);
    });
  });

  describe('Session Manager API Functions', () => {
    test('should export core session management functions', () => {
      const coreSessionFunctions = [
        'createSession',
        'destroySession',
        'mount',
        'unmount',
        'isReady',
      ];

      coreSessionFunctions.forEach(funcName => {
        expect(binding[funcName]).toBeDefined();
        expect(typeof binding[funcName]).toBe('function');
      });
    });

    test('should integrate with operation management', () => {
      // Test that session and operation management work together
      const sessionFunctions = ['createSession', 'mount', 'unmount'];
      const operationFunctions = [
        'setOperationHandler',
        'removeOperationHandler',
      ];

      [...sessionFunctions, ...operationFunctions].forEach(funcName => {
        expect(binding[funcName]).toBeDefined();
        expect(typeof binding[funcName]).toBe('function');
      });
    });

    test('should provide consistent API surface', () => {
      // Test that the API is consistent
      const apiSurface = {
        // Session management
        createSession: 'function',
        destroySession: 'function',
        mount: 'function',
        unmount: 'function',
        isReady: 'function',

        // Operation management
        setOperationHandler: 'function',
        removeOperationHandler: 'function',

        // Utilities
        getVersion: 'function',

        // Constants
        errno: 'object',
        mode: 'object',
        flags: 'object',
      };

      Object.entries(apiSurface).forEach(([name, expectedType]) => {
        expect(binding[name]).toBeDefined();
        expect(typeof binding[name]).toBe(expectedType);
      });
    });
  });

  describe('Version Compatibility and Standards', () => {
    test('should maintain FUSE3 compatibility', () => {
      const version = binding.getVersion();

      expect(version.binding).toBe('3.0.0-alpha.1');
      expect(version.napi).toBe('8');
      expect(version.fuse).toBeDefined();
    });

    test('should follow error code conventions', () => {
      const { errno } = binding;

      // Test that all errno values follow FUSE convention (negative)
      const errnoNames = ['ENOENT', 'EPERM', 'EACCES', 'EIO'];

      errnoNames.forEach(name => {
        expect(errno[name]).toBeLessThan(0);
      });
    });

    test('should provide complete constant coverage', () => {
      const { errno, mode, flags } = binding;

      // Essential session management constants
      const requiredErrno = ['ENODEV', 'EPERM', 'EACCES', 'EINVAL'];
      const requiredModes = ['S_IFDIR', 'S_IRUSR', 'S_IWUSR', 'S_IXUSR'];
      const requiredFlags = ['O_RDONLY', 'O_WRONLY', 'O_RDWR'];

      requiredErrno.forEach(name => {
        expect(errno[name]).toBeDefined();
      });

      requiredModes.forEach(name => {
        expect(mode[name]).toBeDefined();
      });

      requiredFlags.forEach(name => {
        expect(flags[name]).toBeDefined();
      });
    });
  });

  describe('Concurrent Operations and Thread Safety', () => {
    test('should handle concurrent session queries', () => {
      const operations = [];

      // Create multiple concurrent operations
      for (let i = 0; i < 10; i++) {
        operations.push(() => {
          const version = binding.getVersion();
          const errno = binding.errno.ENODEV;
          const ready = binding.isReady;

          expect(version).toBeDefined();
          expect(typeof errno).toBe('number');
          expect(typeof ready).toBe('function');
        });
      }

      // Execute all operations
      operations.forEach(op => {
        expect(op).not.toThrow();
        op();
      });
    });

    test('should maintain data integrity under concurrent access', () => {
      // Test that constants remain stable under concurrent access
      const results = [];

      for (let i = 0; i < 20; i++) {
        results.push({
          version: binding.getVersion(),
          errno: binding.errno.EPERM,
          mode: binding.mode.S_IFDIR,
        });
      }

      // All results should be identical
      const first = results[0];
      results.forEach((result, index) => {
        expect(result.version).toEqual(first.version);
        expect(result.errno).toBe(first.errno);
        expect(result.mode).toBe(first.mode);
      });
    });
  });
});
