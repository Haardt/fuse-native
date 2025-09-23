/**
 * @file smoke-simple.test.ts
 * @brief Simple smoke tests using direct native binding calls
 *
 * This test suite validates the basic functionality of the native binding
 * without going through the TypeScript wrapper layer to avoid BigInt
 * serialization issues in Jest.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

describe('FUSE Native Simple Smoke Tests', () => {
  let binding: any;

  beforeAll(() => {
    try {
      // Load the native binding directly
      binding = require('../prebuilds/linux-x64/@cocalc+fuse-native.node');
    } catch (error) {
      throw new Error(`Failed to load native binding: ${error}`);
    }
  });

  describe('Native Binding Loading', () => {
    test('should load native binding successfully', () => {
      expect(binding).toBeDefined();
      expect(typeof binding).toBe('object');
    });

    test('should export core functions', () => {
      expect(typeof binding.getVersion).toBe('function');
      expect(typeof binding.setOperationHandler).toBe('function');
      expect(typeof binding.removeOperationHandler).toBe('function');
    });

    test('should export test functions', () => {
      expect(typeof binding.testStatvfsToObject).toBe('function');
      expect(typeof binding.testBigIntPrecision).toBe('function');
      expect(typeof binding.testErrnoMapping).toBe('function');
      expect(typeof binding.testTimespecConversion).toBe('function');
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
      expect(version.fuse).toBe('3.17.1');
      expect(version.napi).toBe('8');
      expect(version.binding).toMatch(/statfs-test/);
    });
  });

  describe('BigInt Basic Operations', () => {
    test('should handle small BigInt values', () => {
      const testValue = 12345n;
      const result = binding.testBigIntPrecision(testValue);
      expect(result.lossless).toBe(true);
      expect(result.value.toString()).toBe(testValue.toString());
    });

    test('should handle large BigInt values', () => {
      const testValue = 1234567890123456789n;
      const result = binding.testBigIntPrecision(testValue);
      expect(result.lossless).toBe(true);
      expect(result.value.toString()).toBe(testValue.toString());
    });
  });

  describe('Errno Integration', () => {
    test('should map errno values correctly', () => {
      const result = binding.testErrnoMapping(2); // ENOENT
      expect(result.errno).toBe(2);
      expect(result.name).toBe('ENOENT');
      expect(result.isValid).toBe(true);
      expect(result.isNotFound).toBe(true);
    });

    test('should have consistent errno constants', () => {
      expect(binding.errno.ENOENT).toBe(-2);
      expect(binding.errno.EACCES).toBe(-13);
      expect(binding.errno.EIO).toBe(-5);
    });
  });

  describe('Operations Handler Management', () => {
    test('should initially have no handlers', () => {
      const status = binding.testOperationsBasic();
      expect(status.hasReaddirInitially).toBe(false);
      expect(status.hasLookup).toBe(false);
      expect(status.hasGetattr).toBe(false);
      expect(status.hasRead).toBe(false);
      expect(status.hasWrite).toBe(false);
    });

    test('should set and remove handlers correctly', () => {
      const handler = () => console.log('test handler');

      // Set handler
      const setResult = binding.setOperationHandler('readdir', handler);
      expect(setResult).toBe(true);

      // Check handler exists
      const status = binding.testOperationsBasic();
      expect(status.hasReaddirInitially).toBe(true);

      // Remove handler
      const removeResult = binding.removeOperationHandler('readdir');
      expect(removeResult).toBe(true);

      // Check handler is gone
      const finalStatus = binding.testOperationsBasic();
      expect(finalStatus.hasReaddirInitially).toBe(false);
    });

    test('should validate operation arguments', () => {
      const validation = binding.testOperationValidation();
      expect(validation.lookupValidation).toBe(true);
      expect(validation.getattrValidation).toBe(true);
      expect(validation.readValidation).toBe(true);
      expect(validation.unknownValidation).toBe(true);
    });
  });

  describe('Timespec Operations', () => {
    test('should handle current time conversion', () => {
      const timeResult = binding.testCurrentTimeNs();
      expect(typeof timeResult.currentNs).toBe('bigint');
      expect(timeResult.currentNs > 0n).toBe(true);
      expect(typeof timeResult.currentSeconds).toBe('number');
      expect(typeof timeResult.currentNanoseconds).toBe('number');
      expect(typeof timeResult.asString).toBe('string');
    });

    test('should handle timespec roundtrip conversion', () => {
      const testNs = 1234567890123456789n;
      const result = binding.testTimespecConversion(testNs);
      expect(result.original.toString()).toBe(testNs.toString());
      expect(typeof result.converted).toBe('bigint');
      expect(typeof result.seconds).toBe('number');
      expect(typeof result.nanoseconds).toBe('number');
      expect(result.isValid).toBe(true);
      expect(typeof result.asString).toBe('string');
    });
  });

  describe('StatFS Integration', () => {
    test('should convert statvfs to object', () => {
      const result = binding.testStatvfsToObject();
      expect(result).toHaveProperty('bsize');
      expect(result).toHaveProperty('frsize');
      expect(result).toHaveProperty('blocks');
      expect(result).toHaveProperty('bfree');
      expect(result).toHaveProperty('bavail');
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('ffree');
      expect(result).toHaveProperty('favail');
      expect(result).toHaveProperty('fsid');
      expect(result).toHaveProperty('flag');
      expect(result).toHaveProperty('namemax');
    });

    test('should handle realistic filesystem values', () => {
      const result = binding.testRealisticFilesystem();
      expect(result.bsize).toBe(4096);
      expect(result.frsize).toBe(4096);
      expect(typeof result.blocks).toBe('bigint');
      expect(typeof result.bfree).toBe('bigint');
      expect(typeof result.bavail).toBe('bigint');
      expect(result.namemax).toBe(255);
    });
  });

  describe('Integration Stability', () => {
    test('should handle multiple operations without crashes', () => {
      // Test multiple different operations in sequence
      binding.getVersion();
      binding.testStatvfsToObject();
      binding.testBigIntPrecision(12345n);
      binding.testErrnoMapping(2);
      binding.testCurrentTimeNs();
      binding.testOperationsBasic();
      binding.testOperationValidation();
      binding.testRealisticFilesystem();

      // If we get here, no crashes occurred
      expect(true).toBe(true);
    });

    test('should maintain consistent state across calls', () => {
      const version1 = binding.getVersion();
      const version2 = binding.getVersion();
      expect(version1).toEqual(version2);

      const status1 = binding.testOperationsBasic();
      const status2 = binding.testOperationsBasic();
      expect(status1).toEqual(status2);
    });
  });
});
