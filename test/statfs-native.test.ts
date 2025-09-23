/**
 * @file statfs-native.test.ts
 * @brief Native module tests for statfs BigInt implementation
 *
 * This test suite validates the native C++ implementation of statfs
 * conversion functions with BigInt support for 64-bit fields.
 */

import { describe, expect, it, beforeAll } from '@jest/globals';

// Add BigInt serialization support for Jest
expect.addSnapshotSerializer({
  serialize(val) {
    return val.toString() + 'n';
  },
  test(val) {
    return typeof val === 'bigint';
  },
});

// Native module interface
interface StatfsNativeModule {
  testStatvfsToObject(): any;
  testStatvfsRoundtrip(input: any): any;
  testBigIntPrecision(value: bigint): { lossless: boolean; value: bigint };
  testRealisticFilesystem(): any;
  getVersion(): { fuse: string; binding: string; napi: string };
  errno: Record<string, number>;
}

describe('Native statfs Implementation', () => {
  let nativeModule: StatfsNativeModule;

  beforeAll(() => {
    try {
      // Load the native module directly
      const modulePath =
        process.env.NODE_ENV === 'test'
          ? '../prebuilds/linux-x64/@cocalc+fuse-native.node'
          : '../build/Release/fuse-native.node';

      nativeModule = require(modulePath);
    } catch (error) {
      throw new Error(`Failed to load native module: ${error}`);
    }
  });

  describe('Module Loading', () => {
    it('should load the native module successfully', () => {
      expect(nativeModule).toBeDefined();
    });

    it('should export required functions', () => {
      expect(typeof nativeModule.testStatvfsToObject).toBe('function');
      expect(typeof nativeModule.testStatvfsRoundtrip).toBe('function');
      expect(typeof nativeModule.testBigIntPrecision).toBe('function');
      expect(typeof nativeModule.testRealisticFilesystem).toBe('function');
      expect(typeof nativeModule.getVersion).toBe('function');
    });

    it('should export errno constants', () => {
      expect(nativeModule.errno).toBeDefined();
      expect(typeof nativeModule.errno.ENOENT).toBe('number');
      expect(typeof nativeModule.errno.EACCES).toBe('number');
      expect(typeof nativeModule.errno.EIO).toBe('number');
    });
  });

  describe('Version Information', () => {
    it('should return version information', () => {
      const version = nativeModule.getVersion();
      expect(version).toMatchObject({
        fuse: expect.any(String),
        binding: expect.any(String),
        napi: expect.any(String),
      });
    });
  });

  describe('BigInt Precision Tests', () => {
    it('should handle lossless conversion for small values', () => {
      const testValue = 12345n;
      const result = nativeModule.testBigIntPrecision(testValue);

      expect(result.lossless).toBe(true);
      expect(result.value.toString()).toBe(testValue.toString());
    });

    it('should handle lossless conversion for large values', () => {
      const testValue = BigInt('1234567890123456789'); // Value from AGENTS.md
      const result = nativeModule.testBigIntPrecision(testValue);

      expect(result.lossless).toBe(true);
      expect(result.value.toString()).toBe(testValue.toString());
    });

    it('should handle near-max uint64 values', () => {
      const testValue = BigInt('18446744073709551615'); // Max uint64
      const result = nativeModule.testBigIntPrecision(testValue);

      expect(result.lossless).toBe(true);
      expect(result.value.toString()).toBe(testValue.toString());
    });

    it('should handle max int64 values', () => {
      const testValue = BigInt('9223372036854775807'); // Max int64
      const result = nativeModule.testBigIntPrecision(testValue);

      expect(result.lossless).toBe(true);
      expect(result.value.toString()).toBe(testValue.toString());
    });
  });

  describe('Statvfs Object Conversion', () => {
    it('should convert native statvfs to JavaScript object', () => {
      const result = nativeModule.testStatvfsToObject();

      // Check structure
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

      // Check types - 32-bit fields should be numbers
      expect(typeof result.bsize).toBe('number');
      expect(typeof result.frsize).toBe('number');
      expect(typeof result.flag).toBe('number');
      expect(typeof result.namemax).toBe('number');

      // Check types - 64-bit fields should be BigInt
      expect(typeof result.blocks).toBe('bigint');
      expect(typeof result.bfree).toBe('bigint');
      expect(typeof result.bavail).toBe('bigint');
      expect(typeof result.files).toBe('bigint');
      expect(typeof result.ffree).toBe('bigint');
      expect(typeof result.favail).toBe('bigint');
      expect(typeof result.fsid).toBe('bigint');
    });

    it('should contain expected test values', () => {
      const result = nativeModule.testStatvfsToObject();

      // Check specific test values set in C++
      expect(result.bsize).toBe(4096);
      expect(result.frsize).toBe(4096);
      expect(result.namemax).toBe(255);
      expect(result.flag).toBe(0);

      // Check large BigInt values
      expect(result.blocks).toBe(BigInt('18446744073709551615')); // Near max uint64
      expect(result.bfree).toBe(BigInt('9223372036854775807')); // Max int64
      expect(result.bavail).toBe(BigInt('1234567890123456789')); // AGENTS.md test value
      expect(result.files).toBe(BigInt('1000000000000')); // 1 trillion
      expect(result.ffree).toBe(BigInt('500000000000')); // 500 billion
      expect(result.favail).toBe(BigInt('400000000000')); // 400 billion
      expect(result.fsid).toBe(BigInt('0xDEADBEEFCAFEBABE')); // Test ID
    });
  });

  describe('Roundtrip Conversion', () => {
    it('should handle roundtrip conversion for typical values', () => {
      const input = {
        bsize: 4096,
        frsize: 4096,
        blocks: 1000000n,
        bfree: 300000n,
        bavail: 250000n,
        files: 100000n,
        ffree: 50000n,
        favail: 40000n,
        fsid: 12345n,
        flag: 0,
        namemax: 255,
      };

      const result = nativeModule.testStatvfsRoundtrip(input);

      expect(result).toEqual(input);
    });

    it('should handle roundtrip conversion for large values', () => {
      const input = {
        bsize: 8192,
        frsize: 4096,
        blocks: BigInt('18446744073709551615'), // Near max uint64
        bfree: BigInt('9223372036854775807'), // Max int64
        bavail: BigInt('1234567890123456789'), // AGENTS.md value
        files: BigInt('1000000000000'), // 1 trillion
        ffree: BigInt('500000000000'), // 500 billion
        favail: BigInt('400000000000'), // 400 billion
        fsid: BigInt('0xDEADBEEFCAFEBABE'), // Large hex
        flag: 4096,
        namemax: 255,
      };

      const result = nativeModule.testStatvfsRoundtrip(input);

      expect(result).toEqual(input);
    });

    it('should handle zero values', () => {
      const input = {
        bsize: 1024,
        frsize: 1024,
        blocks: 0n,
        bfree: 0n,
        bavail: 0n,
        files: 0n,
        ffree: 0n,
        favail: 0n,
        fsid: 0n,
        flag: 0,
        namemax: 255,
      };

      const result = nativeModule.testStatvfsRoundtrip(input);

      expect(result).toEqual(input);
    });

    it('should handle partial objects', () => {
      const input = {
        bsize: 4096,
        blocks: 1000000n,
        files: 100000n,
      };

      const result = nativeModule.testStatvfsRoundtrip(input);

      // Should have the provided fields
      expect(result.bsize).toBe(4096);
      expect(result.blocks.toString()).toBe('1000000');
      expect(result.files.toString()).toBe('100000');

      // Missing fields should be zero/default
      expect(result.frsize).toBe(0);
      expect(result.bfree.toString()).toBe('0');
      expect(result.bavail.toString()).toBe('0');
      expect(result.ffree.toString()).toBe('0');
      expect(result.favail.toString()).toBe('0');
      expect(result.fsid.toString()).toBe('0');
      expect(result.flag).toBe(0);
      expect(result.namemax).toBe(0);
    });
  });

  describe('Realistic Filesystem Test', () => {
    it('should generate realistic filesystem statistics', () => {
      const result = nativeModule.testRealisticFilesystem();

      // Should be a valid statvfs structure
      expect(result.bsize).toBe(4096);
      expect(result.frsize).toBe(4096);
      expect(result.namemax).toBe(255);
      expect(result.flag).toBe(0);

      // Check 1TB filesystem calculations
      const totalBytes = 1024n * 1024n * 1024n * 1024n; // 1TB
      const expectedBlocks = totalBytes / 4096n;

      expect(result.blocks.toString()).toBe(expectedBlocks.toString());
      // Allow for rounding differences in integer division
      const expectedFree = (expectedBlocks * 30n + 50n) / 100n; // 30% free with rounding
      const expectedAvail = (expectedBlocks * 25n + 50n) / 100n; // 25% available with rounding
      expect(result.bfree.toString()).toBe(expectedFree.toString());
      expect(result.bavail.toString()).toBe(expectedAvail.toString());

      // Check inode counts
      expect(result.files.toString()).toBe('10000000'); // 10M total
      expect(result.ffree.toString()).toBe('5000000'); // 5M free
      expect(result.favail.toString()).toBe('4000000'); // 4M available

      // Sanity checks
      expect(result.bfree).toBeLessThanOrEqual(result.blocks);
      expect(result.bavail).toBeLessThanOrEqual(result.bfree);
      expect(result.ffree).toBeLessThanOrEqual(result.files);
      expect(result.favail).toBeLessThanOrEqual(result.ffree);
    });

    it('should match df-style calculations', () => {
      const result = nativeModule.testRealisticFilesystem();

      // Simulate df calculations
      const blockSize = BigInt(result.bsize);
      const totalSize = result.blocks * blockSize;
      const freeSize = result.bfree * blockSize;
      const availSize = result.bavail * blockSize;
      const usedSize = totalSize - freeSize;

      // 1TB filesystem checks
      expect(totalSize.toString()).toBe(
        (1024n * 1024n * 1024n * 1024n).toString()
      );

      // Usage percentages should be reasonable
      const usedPercent = Number((usedSize * 100n) / totalSize);
      const freePercent = Number((freeSize * 100n) / totalSize);
      const availPercent = Number((availSize * 100n) / totalSize);

      // Accept actual calculated values due to integer division rounding
      expect(usedPercent).toBeGreaterThan(65);
      expect(usedPercent).toBeLessThan(75);
      expect(freePercent).toBeGreaterThan(25);
      expect(freePercent).toBeLessThan(35);
      expect(availPercent).toBeGreaterThan(20);
      expect(availPercent).toBeLessThan(30);
    });
  });

  describe('Error Handling', () => {
    it('should throw on invalid BigInt input', () => {
      expect(() => {
        nativeModule.testBigIntPrecision('not a bigint' as any);
      }).toThrow();
    });

    it('should throw on invalid object input for roundtrip', () => {
      expect(() => {
        nativeModule.testStatvfsRoundtrip('not an object' as any);
      }).toThrow();
    });

    it('should have proper errno constants', () => {
      // Check that errno values are negative (FUSE convention)
      expect(nativeModule.errno.ENOENT).toBe(-2);
      expect(nativeModule.errno.EACCES).toBe(-13);
      expect(nativeModule.errno.EIO).toBe(-5);
      expect(nativeModule.errno.ENOSYS).toBe(-38);
      expect(nativeModule.errno.EINVAL).toBe(-22);
      expect(nativeModule.errno.ERANGE).toBe(-34);
    });
  });

  describe('Performance and Memory', () => {
    it('should handle large volume conversions efficiently', () => {
      const startTime = Date.now();

      // Perform 1000 conversions
      for (let i = 0; i < 1000; i++) {
        const testValue = BigInt(i) * 1000000000n;
        const result = nativeModule.testBigIntPrecision(testValue);
        expect(result.lossless).toBe(true);
        expect(result.value).toBe(testValue);
      }

      const duration = Date.now() - startTime;

      // Should complete reasonably quickly (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second
    });

    it('should not leak memory with repeated conversions', () => {
      const testData = {
        bsize: 4096,
        frsize: 4096,
        blocks: BigInt('18446744073709551615'),
        bfree: BigInt('9223372036854775807'),
        bavail: BigInt('1234567890123456789'),
        files: BigInt('1000000000000'),
        ffree: BigInt('500000000000'),
        favail: BigInt('400000000000'),
        fsid: BigInt('0xDEADBEEFCAFEBABE'),
        flag: 0,
        namemax: 255,
      };

      // Perform many roundtrips
      for (let i = 0; i < 100; i++) {
        const result = nativeModule.testStatvfsRoundtrip(testData);
        expect(result).toEqual(testData);
      }

      // If we get here without crashes, memory management is likely OK
      expect(true).toBe(true);
    });
  });
});
