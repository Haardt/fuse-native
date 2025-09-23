/**
 * @file fuse-bridge.test.ts
 * @brief Integration tests for FUSE Bridge module
 *
 * Tests the FUSE bridge functionality including operation type conversion,
 * request context handling, response management, and integration with
 * the operations system.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';

// Import the native binding
const binding = require('../../prebuilds/linux-x64/@cocalc+fuse-native.node');

describe('FUSE Bridge Module Integration', () => {
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

  describe('FuseOpType Conversion', () => {
    test('should convert operation names to FuseOpType enum values', () => {
      const result = binding.testFuseOpTypeConversion();

      // Check that all major operations have valid enum values
      expect(result.lookupOp).toBe(0);
      expect(result.getattrOp).toBe(2);
      expect(result.readOp).toBe(13);
      expect(result.writeOp).toBe(14);
      expect(result.readdirOp).toBe(19);
      expect(result.statfsOp).toBe(22);

      // Invalid operation should return -1
      expect(result.invalidOp).toBe(-1);
    });

    test('should convert FuseOpType enum values back to strings', () => {
      const result = binding.testFuseOpTypeConversion();

      // Check string conversions
      expect(result.lookupName).toBe('lookup');
      expect(result.getattrName).toBe('getattr');
      expect(result.readName).toBe('read');
      expect(result.writeName).toBe('write');
      expect(result.readdirName).toBe('readdir');
      expect(result.statfsName).toBe('statfs');
    });

    test('should handle roundtrip conversion correctly', () => {
      const result = binding.testFuseOpTypeConversion();

      // Test that we can go from string -> enum -> string
      const operations = [
        { name: 'lookup', enum: result.lookupOp, backName: result.lookupName },
        { name: 'getattr', enum: result.getattrOp, backName: result.getattrName },
        { name: 'read', enum: result.readOp, backName: result.readName },
        { name: 'write', enum: result.writeOp, backName: result.writeName },
        { name: 'readdir', enum: result.readdirOp, backName: result.readdirName },
        { name: 'statfs', enum: result.statfsOp, backName: result.statfsName }
      ];

      operations.forEach(op => {
        expect(op.backName).toBe(op.name);
        expect(op.enum).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('FuseRequestContext Handling', () => {
    test('should create and populate request context correctly', () => {
      const result = binding.testFuseRequestContext();

      // Check operation type
      expect(result.opType).toBe(0); // LOOKUP
      expect(result.opName).toBe('lookup');

      // Check inode and path
      expect(result.ino).toBe('42');
      expect(result.path).toBe('test/path.txt');

      // Check file operation parameters
      expect(result.offset).toBe('1024');
      expect(result.size).toBe(4096);
      expect(result.flags).toBe(2); // O_RDWR
      expect(result.mode).toBe(33188); // Regular file, 644 permissions

      // Check user context
      expect(result.uid).toBe(1000);
      expect(result.gid).toBe(1000);

      // Check buffer state
      expect(result.hasBuffer).toBe(false);
      expect(result.bufferOwned).toBe(false);
    });

    test('should handle large file offsets and sizes', () => {
      const result = binding.testFuseRequestContext();

      // Convert string representations back to numbers for validation
      const offset = parseInt(result.offset);
      const ino = parseInt(result.ino);

      expect(offset).toBe(1024);
      expect(ino).toBe(42);
      expect(result.size).toBe(4096);

      // Validate that we can handle large values (represented as strings)
      expect(result.offset).toMatch(/^\d+$/);
      expect(result.ino).toMatch(/^\d+$/);
    });

    test('should handle file permissions and modes correctly', () => {
      const result = binding.testFuseRequestContext();

      // 33188 = S_IFREG | 0644 (regular file with 644 permissions)
      expect(result.mode).toBe(33188);
      expect(result.flags).toBe(2); // O_RDWR

      // Check that the mode represents a regular file
      const S_IFMT = 0o170000;
      const S_IFREG = 0o100000;
      expect((result.mode & S_IFMT)).toBe(S_IFREG);

      // Check permissions (644 = rw-r--r--)
      const permissions = result.mode & 0o777;
      expect(permissions).toBe(0o644);
    });
  });

  describe('FuseResponse Management', () => {
    test('should create default response correctly', () => {
      const result = binding.testFuseResponse();

      // Default response should indicate success
      expect(result.defaultErrno).toBe(0);
      expect(result.defaultHasAttr).toBe(false);
      expect(result.defaultHasData).toBe(false);
      expect(result.defaultHasBuffer).toBe(false);
    });

    test('should handle error responses correctly', () => {
      const result = binding.testFuseResponse();

      // Error response should have errno set
      expect(result.errorErrno).toBe(2); // ENOENT
      expect(result.errorHasAttr).toBe(false);
      expect(result.errorHasData).toBe(false);
    });

    test('should handle data responses correctly', () => {
      const result = binding.testFuseResponse();

      // Data response should have data content
      expect(result.dataErrno).toBe(0); // Success
      expect(result.dataHasData).toBe(true);
      expect(result.dataContent).toBe('Hello, FUSE!');
      expect(result.dataSize).toBe(12);
    });

    test('should handle attribute responses correctly', () => {
      const result = binding.testFuseResponse();

      // Attribute response should have stat info
      expect(result.attrErrno).toBe(0); // Success
      expect(result.attrHasAttr).toBe(true);
      expect(result.attrTimeout).toBe(5.0);

      // Check stat attributes
      expect(result.attrIno).toBe('42');
      expect(result.attrMode).toBe(33188); // Regular file, 644 permissions
      expect(result.attrSize).toBe('1024');
    });

    test('should handle stat attributes with correct types', () => {
      const result = binding.testFuseResponse();

      // Convert string representations for validation
      const ino = parseInt(result.attrIno);
      const size = parseInt(result.attrSize);

      expect(ino).toBe(42);
      expect(size).toBe(1024);
      expect(result.attrMode).toBe(33188);

      // Validate file type and permissions
      const S_IFMT = 0o170000;
      const S_IFREG = 0o100000;
      expect((result.attrMode & S_IFMT)).toBe(S_IFREG);

      const permissions = result.attrMode & 0o777;
      expect(permissions).toBe(0o644);
    });
  });

  describe('Integration with Operations System', () => {
    test('should work alongside operations handlers', () => {
      // Test that bridge functions work with operations system
      const handler = () => console.log('test handler');

      // Set an operation handler
      expect(binding.setOperationHandler('getattr', handler)).toBe(true);

      // Test bridge functionality
      const opResult = binding.testFuseOpTypeConversion();
      expect(opResult.getattrOp).toBe(2);
      expect(opResult.getattrName).toBe('getattr');

      // Test context creation
      const contextResult = binding.testFuseRequestContext();
      expect(contextResult.opType).toBe(0); // LOOKUP, not getattr

      // Clean up
      expect(binding.removeOperationHandler('getattr')).toBe(true);
    });

    test('should maintain consistency with operation validation', () => {
      // Get validation results
      const validation = binding.testOperationValidation();
      expect(validation.lookupValidation).toBe(true);
      expect(validation.getattrValidation).toBe(true);
      expect(validation.readValidation).toBe(true);

      // Get bridge conversion results
      const bridge = binding.testFuseOpTypeConversion();

      // Ensure operation names are consistent
      expect(bridge.lookupName).toBe('lookup');
      expect(bridge.getattrName).toBe('getattr');
      expect(bridge.readName).toBe('read');
    });

    test('should handle multiple bridge operations simultaneously', () => {
      const handlers = {
        lookup: () => console.log('lookup'),
        getattr: () => console.log('getattr'),
        read: () => console.log('read'),
        statfs: () => console.log('statfs')
      };

      // Set multiple handlers
      Object.entries(handlers).forEach(([op, handler]) => {
        expect(binding.setOperationHandler(op, handler)).toBe(true);
      });

      // Test bridge operations while handlers are set
      const opResult = binding.testFuseOpTypeConversion();
      expect(opResult.lookupOp).toBeGreaterThanOrEqual(0);
      expect(opResult.getattrOp).toBeGreaterThanOrEqual(0);
      expect(opResult.readOp).toBeGreaterThanOrEqual(0);
      expect(opResult.statfsOp).toBeGreaterThanOrEqual(0);

      const contextResult = binding.testFuseRequestContext();
      expect(contextResult.opType).toBeGreaterThanOrEqual(0);

      const responseResult = binding.testFuseResponse();
      expect(responseResult.defaultErrno).toBe(0);

      // Clean up all handlers
      Object.keys(handlers).forEach(op => {
        expect(binding.removeOperationHandler(op)).toBe(true);
      });
    });
  });

  describe('Memory and Resource Management', () => {
    test('should handle repeated context creation without leaks', () => {
      // Create many contexts to test memory management
      for (let i = 0; i < 100; i++) {
        const result = binding.testFuseRequestContext();
        expect(result.opType).toBe(0);
        expect(result.ino).toBe('42');
        expect(result.hasBuffer).toBe(false);
      }
    });

    test('should handle repeated response creation without leaks', () => {
      // Create many responses to test memory management
      for (let i = 0; i < 100; i++) {
        const result = binding.testFuseResponse();
        expect(result.defaultErrno).toBe(0);
        expect(result.dataContent).toBe('Hello, FUSE!');
        expect(result.attrIno).toBe('42');
      }
    });

    test('should handle repeated operation type conversions', () => {
      // Test conversion stability
      for (let i = 0; i < 50; i++) {
        const result = binding.testFuseOpTypeConversion();
        expect(result.lookupOp).toBe(0);
        expect(result.lookupName).toBe('lookup');
        expect(result.invalidOp).toBe(-1);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle buffer ownership correctly', () => {
      const result = binding.testFuseRequestContext();

      // Buffer should not be owned initially
      expect(result.hasBuffer).toBe(false);
      expect(result.bufferOwned).toBe(false);
    });

    test('should provide meaningful operation names', () => {
      const result = binding.testFuseOpTypeConversion();

      const expectedOperations = ['lookup', 'getattr', 'read', 'write', 'readdir', 'statfs'];
      const actualOperations = [
        result.lookupName, result.getattrName, result.readName,
        result.writeName, result.readdirName, result.statfsName
      ];

      expectedOperations.forEach((expected, index) => {
        expect(actualOperations[index]).toBe(expected);
      });
    });

    test('should handle invalid operation gracefully', () => {
      const result = binding.testFuseOpTypeConversion();
      expect(result.invalidOp).toBe(-1);
    });

    test('should maintain response consistency', () => {
      const result = binding.testFuseResponse();

      // Error response should not have data or attributes
      expect(result.errorHasAttr).toBe(false);
      expect(result.errorHasData).toBe(false);

      // Data response should have success errno
      expect(result.dataErrno).toBe(0);
      expect(result.dataHasData).toBe(true);

      // Attribute response should have success errno
      expect(result.attrErrno).toBe(0);
      expect(result.attrHasAttr).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle operation type conversion efficiently', () => {
      const startTime = process.hrtime.bigint();

      for (let i = 0; i < 1000; i++) {
        binding.testFuseOpTypeConversion();
      }

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      // Should complete reasonably quickly
      expect(durationMs).toBeLessThan(1000); // 1 second for 1000 operations
    });

    test('should handle context creation efficiently', () => {
      const startTime = process.hrtime.bigint();

      for (let i = 0; i < 500; i++) {
        binding.testFuseRequestContext();
      }

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      // Should complete reasonably quickly
      expect(durationMs).toBeLessThan(1000); // 1 second for 500 operations
    });

    test('should handle response creation efficiently', () => {
      const startTime = process.hrtime.bigint();

      for (let i = 0; i < 500; i++) {
        binding.testFuseResponse();
      }

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      // Should complete reasonably quickly
      expect(durationMs).toBeLessThan(1000); // 1 second for 500 operations
    });
  });

  describe('Integration with Helper Modules', () => {
    test('should work with BigInt helpers', () => {
      // Test bridge functionality alongside BigInt operations
      const contextResult = binding.testFuseRequestContext();
      const bigIntTest = binding.testBigIntPrecision(1234567890123456789n);

      expect(contextResult.ino).toBe('42');
      expect(bigIntTest.lossless).toBe(true);
    });

    test('should work with errno mapping', () => {
      // Test bridge functionality alongside errno operations
      const responseResult = binding.testFuseResponse();
      const errnoTest = binding.testErrnoMapping(2); // ENOENT

      expect(responseResult.errorErrno).toBe(2);
      expect(errnoTest.errno).toBe(2);
      expect(errnoTest.name).toBe('ENOENT');
    });

    test('should work with timespec functions', () => {
      // Test bridge functionality alongside time operations
      const responseResult = binding.testFuseResponse();
      const timeTest = binding.testCurrentTimeNs();

      expect(responseResult.attrTimeout).toBe(5.0);
      expect(typeof timeTest.currentNs).toBe('bigint');
    });
  });
});
