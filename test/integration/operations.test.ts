/**
 * @file operations.test.ts
 * @brief Integration tests for FUSE operations module
 *
 * Tests the operations handler registration, validation, and basic functionality
 * using the native binding with BigInt support and errno mapping.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';

// Import the native binding
const binding = require('../../prebuilds/linux-x64/@cocalc+fuse-native.node');

describe('Operations Module Integration', () => {
  beforeEach(() => {
    // Clean up any existing handlers before each test
    try {
      binding.removeOperationHandler('readdir');
      binding.removeOperationHandler('lookup');
      binding.removeOperationHandler('getattr');
      binding.removeOperationHandler('read');
      binding.removeOperationHandler('write');
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Handler Registration', () => {
    test('should initially have no handlers', () => {
      const result = binding.testOperationsBasic();
      expect(result.hasReaddirInitially).toBe(false);
      expect(result.hasLookup).toBe(false);
      expect(result.hasGetattr).toBe(false);
      expect(result.hasRead).toBe(false);
      expect(result.hasWrite).toBe(false);
    });

    test('should successfully set operation handler', () => {
      const handler = (parent: bigint, name: string, callback: Function) => {
        callback(null, []);
      };

      const result = binding.setOperationHandler('readdir', handler);
      expect(result).toBe(true);

      const status = binding.testOperationsBasic();
      expect(status.hasReaddirInitially).toBe(true);
    });

    test('should successfully remove operation handler', () => {
      const handler = () => {};

      // Set handler first
      binding.setOperationHandler('lookup', handler);
      let status = binding.testOperationsBasic();
      expect(status.hasLookup).toBe(true);

      // Remove handler
      const result = binding.removeOperationHandler('lookup');
      expect(result).toBe(true);

      status = binding.testOperationsBasic();
      expect(status.hasLookup).toBe(false);
    });

    test('should return false when removing non-existent handler', () => {
      const result = binding.removeOperationHandler('nonexistent');
      expect(result).toBe(false);
    });

    test('should handle multiple handlers correctly', () => {
      const readdirHandler = () => {};
      const lookupHandler = () => {};
      const getattrHandler = () => {};

      // Set multiple handlers
      expect(binding.setOperationHandler('readdir', readdirHandler)).toBe(true);
      expect(binding.setOperationHandler('lookup', lookupHandler)).toBe(true);
      expect(binding.setOperationHandler('getattr', getattrHandler)).toBe(true);

      const status = binding.testOperationsBasic();
      expect(status.hasReaddirInitially).toBe(true);
      expect(status.hasLookup).toBe(true);
      expect(status.hasGetattr).toBe(true);
      expect(status.hasRead).toBe(false);
      expect(status.hasWrite).toBe(false);

      // Remove one handler
      expect(binding.removeOperationHandler('lookup')).toBe(true);

      const statusAfter = binding.testOperationsBasic();
      expect(statusAfter.hasReaddirInitially).toBe(true);
      expect(statusAfter.hasLookup).toBe(false);
      expect(statusAfter.hasGetattr).toBe(true);
    });
  });

  describe('Handler Validation', () => {
    test('should validate operation arguments correctly', () => {
      const result = binding.testOperationValidation();

      // All validations should pass with correct arguments
      expect(result.lookupValidation).toBe(true);
      expect(result.getattrValidation).toBe(true);
      expect(result.readValidation).toBe(true);
      expect(result.unknownValidation).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should reject invalid operation name type', () => {
      expect(() => {
        binding.setOperationHandler(123, () => {});
      }).toThrow('Operation name must be a string');
    });

    test('should reject invalid handler type', () => {
      expect(() => {
        binding.setOperationHandler('readdir', 'not a function');
      }).toThrow('Operation handler must be a function');
    });

    test('should reject missing arguments for setOperationHandler', () => {
      expect(() => {
        binding.setOperationHandler();
      }).toThrow('Expected at least 2 arguments');

      expect(() => {
        binding.setOperationHandler('readdir');
      }).toThrow('Expected at least 2 arguments');
    });

    test('should reject missing arguments for removeOperationHandler', () => {
      expect(() => {
        binding.removeOperationHandler();
      }).toThrow('Expected operation name');
    });

    test('should reject invalid operation name type for removal', () => {
      expect(() => {
        binding.removeOperationHandler(null);
      }).toThrow('Operation name must be a string');
    });
  });

  describe('ThreadSafeFunction Integration', () => {
    test('should create ThreadSafeFunction for handlers', () => {
      let callCount = 0;
      const handler = (...args: any[]) => {
        callCount++;
        console.log('Handler called with args:', args);
      };

      // Set handler - should create TSFN internally
      const result = binding.setOperationHandler('getattr', handler);
      expect(result).toBe(true);

      const status = binding.testOperationsBasic();
      expect(status.hasGetattr).toBe(true);

      // Note: Actually calling the TSFN would require a full FUSE context
      // This test just verifies the registration succeeds
    });

    test('should handle handler replacement', () => {
      const handler1 = () => console.log('Handler 1');
      const handler2 = () => console.log('Handler 2');

      // Set first handler
      expect(binding.setOperationHandler('read', handler1)).toBe(true);
      expect(binding.testOperationsBasic().hasRead).toBe(true);

      // Replace with second handler
      expect(binding.setOperationHandler('read', handler2)).toBe(true);
      expect(binding.testOperationsBasic().hasRead).toBe(true);

      // Remove handler
      expect(binding.removeOperationHandler('read')).toBe(true);
      expect(binding.testOperationsBasic().hasRead).toBe(false);
    });
  });

  describe('Memory Management', () => {
    test('should handle rapid set/remove cycles', () => {
      const handler = () => {};

      // Rapid set/remove cycles to test memory management
      for (let i = 0; i < 100; i++) {
        expect(binding.setOperationHandler('write', handler)).toBe(true);
        expect(binding.removeOperationHandler('write')).toBe(true);
      }

      const status = binding.testOperationsBasic();
      expect(status.hasWrite).toBe(false);
    });

    test('should handle multiple handler types simultaneously', () => {
      const handlers = {
        readdir: () => console.log('readdir'),
        lookup: () => console.log('lookup'),
        getattr: () => console.log('getattr'),
        read: () => console.log('read'),
        write: () => console.log('write')
      };

      // Set all handlers
      Object.entries(handlers).forEach(([op, handler]) => {
        expect(binding.setOperationHandler(op, handler)).toBe(true);
      });

      const status = binding.testOperationsBasic();
      expect(status.hasReaddirInitially).toBe(true);
      expect(status.hasLookup).toBe(true);
      expect(status.hasGetattr).toBe(true);
      expect(status.hasRead).toBe(true);
      expect(status.hasWrite).toBe(true);

      // Remove all handlers
      Object.keys(handlers).forEach(op => {
        expect(binding.removeOperationHandler(op)).toBe(true);
      });

      const statusAfter = binding.testOperationsBasic();
      expect(statusAfter.hasReaddirInitially).toBe(false);
      expect(statusAfter.hasLookup).toBe(false);
      expect(statusAfter.hasGetattr).toBe(false);
      expect(statusAfter.hasRead).toBe(false);
      expect(statusAfter.hasWrite).toBe(false);
    });
  });

  describe('Integration with Helper Modules', () => {
    test('should work alongside BigInt helpers', () => {
      const handler = (ino: bigint, offset: bigint, size: number, callback: Function) => {
        // Handler that works with BigInt values
        expect(typeof ino).toBe('bigint');
        expect(typeof offset).toBe('bigint');
        expect(typeof size).toBe('number');
        callback(null, Buffer.alloc(size));
      };

      expect(binding.setOperationHandler('read', handler)).toBe(true);

      // Test BigInt precision alongside operations
      const bigIntTest = binding.testBigIntPrecision(1234567890123456789n);
      expect(bigIntTest.lossless).toBe(true);
      expect(bigIntTest.value).toBe(1234567890123456789n);

      expect(binding.removeOperationHandler('read')).toBe(true);
    });

    test('should work alongside errno mapping', () => {
      const handler = (callback: Function) => {
        // Handler that uses errno constants
        callback(binding.errno.ENOENT); // Should be -2
      };

      expect(binding.setOperationHandler('lookup', handler)).toBe(true);

      // Test errno mapping alongside operations
      const errnoTest = binding.testErrnoMapping(2); // ENOENT
      expect(errnoTest.errno).toBe(2);
      expect(errnoTest.name).toBe('ENOENT');
      expect(errnoTest.isNotFound).toBe(true);

      expect(binding.removeOperationHandler('lookup')).toBe(true);
    });

    test('should work alongside timespec functions', () => {
      const handler = (callback: Function) => {
        // Handler that works with time
        const now = Date.now();
        const stat = {
          ino: 1n,
          mode: 33188, // Regular file
          nlink: 1,
          uid: 1000,
          gid: 1000,
          size: 0n,
          atime: BigInt(now) * 1000000n, // ns since epoch
          mtime: BigInt(now) * 1000000n,
          ctime: BigInt(now) * 1000000n
        };
        callback(null, stat);
      };

      expect(binding.setOperationHandler('getattr', handler)).toBe(true);

      // Test timespec conversion alongside operations
      const timeTest = binding.testCurrentTimeNs();
      expect(typeof timeTest.currentNs).toBe('bigint');
      expect(timeTest.currentNs > 0n).toBe(true);

      expect(binding.removeOperationHandler('getattr')).toBe(true);
    });
  });

  describe('Version and Compatibility', () => {
    test('should provide version information', () => {
      const version = binding.getVersion();
      expect(version).toHaveProperty('fuse');
      expect(version).toHaveProperty('binding');
      expect(version).toHaveProperty('napi');
      expect(version.fuse).toBe('3.17.1');
      expect(version.napi).toBe('8');
    });

    test('should have all expected exports', () => {
      const expectedFunctions = [
        'setOperationHandler',
        'removeOperationHandler',
        'testOperationsBasic',
        'testOperationValidation',
        'testStatvfsToObject',
        'testBigIntPrecision',
        'testErrnoMapping',
        'testTimespecConversion',
        'getVersion'
      ];

      expectedFunctions.forEach(func => {
        expect(typeof binding[func]).toBe('function');
      });

      expect(binding).toHaveProperty('errno');
      expect(typeof binding.errno).toBe('object');
    });
  });
});
