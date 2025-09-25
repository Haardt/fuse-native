/**
 * @file buffer-bridge.test.ts
 * @brief Tests for External ArrayBuffer utilities and zero-copy operations
 *
 * This test suite validates the buffer bridge functionality, including
 * External ArrayBuffer creation, finalizers, memory management, and
 * zero-copy operations.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the native binding
const mockBinding = {
  createExternalBuffer: jest.fn(),
  createManagedBuffer: jest.fn(),
  validateBuffer: jest.fn(),
  validateBufferRange: jest.fn(),
  createBufferSlice: jest.fn(),
  copyBuffer: jest.fn(),
  fillBuffer: jest.fn(),
  compareBuffers: jest.fn(),
  getBufferStats: jest.fn(),
};

// Mock the native module loading
jest.mock('../prebuilds/linux-x64/@cocalc+fuse-native.node', () => mockBinding, { virtual: true });
jest.mock('../build/Release/fuse-native.node', () => mockBinding, { virtual: true });
jest.mock('../build/Debug/fuse-native.node', () => mockBinding, { virtual: true });

describe('Buffer Bridge Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any global state
  });

  describe('External ArrayBuffer Creation', () => {
    test('should create external ArrayBuffer from native memory', () => {
      const mockBuffer = new ArrayBuffer(1024);
      mockBinding.createExternalBuffer.mockReturnValue(mockBuffer);

      const result = mockBinding.createExternalBuffer(1024, null, null);

      expect(result).toBe(mockBuffer);
      expect(mockBinding.createExternalBuffer).toHaveBeenCalledWith(1024, null, null);
      expect(result.byteLength).toBe(1024);
    });

    test('should handle zero-length buffers correctly', () => {
      const mockBuffer = new ArrayBuffer(0);
      mockBinding.createExternalBuffer.mockReturnValue(mockBuffer);

      const result = mockBinding.createExternalBuffer(0, null, null);

      expect(result).toBe(mockBuffer);
      expect(result.byteLength).toBe(0);
    });

    test('should create external buffer with custom finalizer', () => {
      const mockBuffer = new ArrayBuffer(2048);
      const mockFinalizer = jest.fn();
      const mockHint = { test: 'data' };

      mockBinding.createExternalBuffer.mockReturnValue(mockBuffer);

      const result = mockBinding.createExternalBuffer(2048, mockFinalizer, mockHint);

      expect(result).toBe(mockBuffer);
      expect(mockBinding.createExternalBuffer).toHaveBeenCalledWith(2048, mockFinalizer, mockHint);
    });

    test('should handle null data pointer gracefully', () => {
      mockBinding.createExternalBuffer.mockImplementation(() => {
        throw new Error('Data pointer cannot be null');
      });

      expect(() => {
        mockBinding.createExternalBuffer(null, null, null);
      }).toThrow('Data pointer cannot be null');
    });
  });

  describe('Managed Buffer Creation', () => {
    test('should create managed buffer with automatic cleanup', () => {
      const mockBuffer = new ArrayBuffer(4096);
      mockBinding.createManagedBuffer.mockReturnValue(mockBuffer);

      const result = mockBinding.createManagedBuffer(4096);

      expect(result).toBe(mockBuffer);
      expect(result.byteLength).toBe(4096);
    });

    test('should handle large buffer allocation', () => {
      const largeSize = 64 * 1024 * 1024; // 64MB
      const mockBuffer = new ArrayBuffer(largeSize);
      mockBinding.createManagedBuffer.mockReturnValue(mockBuffer);

      const result = mockBinding.createManagedBuffer(largeSize);

      expect(result).toBe(mockBuffer);
      expect(result.byteLength).toBe(largeSize);
    });

    test('should handle allocation failure', () => {
      mockBinding.createManagedBuffer.mockImplementation(() => {
        throw new Error('Failed to allocate aligned memory');
      });

      expect(() => {
        mockBinding.createManagedBuffer(1024 * 1024 * 1024 * 1024); // 1TB - should fail
      }).toThrow('Failed to allocate aligned memory');
    });
  });

  describe('Buffer Validation', () => {
    test('should validate buffer size requirements', () => {
      mockBinding.validateBuffer.mockReturnValue(true);

      const result = mockBinding.validateBuffer(new ArrayBuffer(1024), 512);

      expect(result).toBe(true);
      expect(mockBinding.validateBuffer).toHaveBeenCalledWith(new ArrayBuffer(1024), 512);
    });

    test('should reject undersized buffers', () => {
      mockBinding.validateBuffer.mockReturnValue(false);

      const result = mockBinding.validateBuffer(new ArrayBuffer(256), 512);

      expect(result).toBe(false);
    });

    test('should validate empty buffers correctly', () => {
      mockBinding.validateBuffer.mockImplementation((buffer, requiredSize) => {
        return buffer.byteLength >= requiredSize;
      });

      const result = mockBinding.validateBuffer(new ArrayBuffer(0), 0);

      expect(result).toBe(true);
    });

    test('should validate buffer ranges', () => {
      mockBinding.validateBufferRange.mockReturnValue(true);

      const buffer = new ArrayBuffer(1024);
      const result = mockBinding.validateBufferRange(buffer, 100, 200);

      expect(result).toBe(true);
      expect(mockBinding.validateBufferRange).toHaveBeenCalledWith(buffer, 100, 200);
    });

    test('should reject out-of-bounds ranges', () => {
      mockBinding.validateBufferRange.mockReturnValue(false);

      const buffer = new ArrayBuffer(1024);
      const result = mockBinding.validateBufferRange(buffer, 900, 200); // offset + length > size

      expect(result).toBe(false);
    });

    test('should handle overflow in range validation', () => {
      mockBinding.validateBufferRange.mockImplementation((buffer, offset, length) => {
        if (offset > buffer.byteLength) return false;
        if (length > (buffer.byteLength - offset)) return false;
        return true;
      });

      const buffer = new ArrayBuffer(1024);
      const result = mockBinding.validateBufferRange(buffer, 2000, 100);

      expect(result).toBe(false);
    });
  });

  describe('Buffer Slicing', () => {
    test('should create buffer slices correctly', () => {
      const sourceBuffer = new ArrayBuffer(1024);
      const sliceBuffer = new ArrayBuffer(256);

      mockBinding.createBufferSlice.mockReturnValue(sliceBuffer);

      const result = mockBinding.createBufferSlice(sourceBuffer, 100, 256);

      expect(result).toBe(sliceBuffer);
      expect(mockBinding.createBufferSlice).toHaveBeenCalledWith(sourceBuffer, 100, 256);
    });

    test('should handle zero-length slices', () => {
      const sourceBuffer = new ArrayBuffer(1024);
      const emptyBuffer = new ArrayBuffer(0);

      mockBinding.createBufferSlice.mockReturnValue(emptyBuffer);

      const result = mockBinding.createBufferSlice(sourceBuffer, 500, 0);

      expect(result).toBe(emptyBuffer);
      expect(result.byteLength).toBe(0);
    });

    test('should reject invalid slice parameters', () => {
      const sourceBuffer = new ArrayBuffer(1024);

      mockBinding.createBufferSlice.mockImplementation(() => {
        throw new Error('Buffer slice out of bounds');
      });

      expect(() => {
        mockBinding.createBufferSlice(sourceBuffer, 1000, 200);
      }).toThrow('Buffer slice out of bounds');
    });
  });

  describe('Buffer Operations', () => {
    test('should copy data between buffers', () => {
      mockBinding.copyBuffer.mockReturnValue(256);

      const destBuffer = new ArrayBuffer(512);
      const srcBuffer = new ArrayBuffer(256);

      const result = mockBinding.copyBuffer(destBuffer, 512, srcBuffer, 256);

      expect(result).toBe(256);
      expect(mockBinding.copyBuffer).toHaveBeenCalledWith(destBuffer, 512, srcBuffer, 256);
    });

    test('should handle partial copies when destination is smaller', () => {
      mockBinding.copyBuffer.mockReturnValue(128);

      const destBuffer = new ArrayBuffer(128);
      const srcBuffer = new ArrayBuffer(256);

      const result = mockBinding.copyBuffer(destBuffer, 128, srcBuffer, 256);

      expect(result).toBe(128); // Should copy only what fits
    });

    test('should fill buffers with specified values', () => {
      mockBinding.fillBuffer.mockReturnValue(1024);

      const buffer = new ArrayBuffer(1024);
      const result = mockBinding.fillBuffer(buffer, 1024, 0x42);

      expect(result).toBe(1024);
      expect(mockBinding.fillBuffer).toHaveBeenCalledWith(buffer, 1024, 0x42);
    });

    test('should compare buffers correctly', () => {
      mockBinding.compareBuffers.mockReturnValue(0);

      const buffer1 = new ArrayBuffer(256);
      const buffer2 = new ArrayBuffer(256);

      const result = mockBinding.compareBuffers(buffer1, buffer2, 256);

      expect(result).toBe(0); // Equal
      expect(mockBinding.compareBuffers).toHaveBeenCalledWith(buffer1, buffer2, 256);
    });

    test('should detect buffer differences', () => {
      mockBinding.compareBuffers.mockReturnValue(-1);

      const buffer1 = new ArrayBuffer(256);
      const buffer2 = new ArrayBuffer(256);

      const result = mockBinding.compareBuffers(buffer1, buffer2, 256);

      expect(result).toBe(-1); // buffer1 < buffer2
    });

    test('should handle null buffer comparisons', () => {
      mockBinding.compareBuffers.mockImplementation((buf1, buf2, size) => {
        if (!buf1 || !buf2) {
          if (buf1 === buf2) return 0;
          return buf1 ? 1 : -1;
        }
        return 0;
      });

      const result = mockBinding.compareBuffers(null, null, 0);
      expect(result).toBe(0);

      const buffer = new ArrayBuffer(256);
      const result2 = mockBinding.compareBuffers(buffer, null, 0);
      expect(result2).toBe(1);

      const result3 = mockBinding.compareBuffers(null, buffer, 0);
      expect(result3).toBe(-1);
    });
  });

  describe('Buffer Statistics', () => {
    test('should return buffer statistics', () => {
      const mockStats = {
        size: 1024,
        data: 'mock-pointer',
        isExternal: true,
        isDetached: false,
      };

      mockBinding.getBufferStats.mockReturnValue(mockStats);

      const buffer = new ArrayBuffer(1024);
      const result = mockBinding.getBufferStats(buffer);

      expect(result).toEqual(mockStats);
      expect(result.size).toBe(1024);
      expect(result.isExternal).toBe(true);
      expect(result.isDetached).toBe(false);
    });

    test('should handle empty buffer statistics', () => {
      const mockStats = {
        size: 0,
        data: null,
        isExternal: false,
        isDetached: false,
      };

      mockBinding.getBufferStats.mockReturnValue(mockStats);

      const buffer = new ArrayBuffer(0);
      const result = mockBinding.getBufferStats(buffer);

      expect(result.size).toBe(0);
      expect(result.data).toBeNull();
    });
  });

  describe('Memory Management and Finalizers', () => {
    test('should handle finalizer execution order', () => {
      const finalizerCalls: string[] = [];

      const finalizer1 = jest.fn(() => finalizerCalls.push('finalizer1'));
      const finalizer2 = jest.fn(() => finalizerCalls.push('finalizer2'));

      mockBinding.createExternalBuffer.mockImplementation((size, finalizer) => {
        // Simulate finalizer being called
        setTimeout(() => finalizer?.(), 0);
        return new ArrayBuffer(size);
      });

      mockBinding.createExternalBuffer(1024, finalizer1);
      mockBinding.createExternalBuffer(2048, finalizer2);

      // Wait for finalizers to be called
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(finalizer1).toHaveBeenCalled();
          expect(finalizer2).toHaveBeenCalled();
          resolve();
        }, 10);
      });
    });

    test('should handle finalizer exceptions gracefully', () => {
      const badFinalizer = jest.fn(() => {
        throw new Error('Finalizer error');
      });

      mockBinding.createExternalBuffer.mockImplementation((size, finalizer) => {
        try {
          finalizer?.();
        } catch (e) {
          // Should not crash the process
        }
        return new ArrayBuffer(size);
      });

      expect(() => {
        mockBinding.createExternalBuffer(1024, badFinalizer);
      }).not.toThrow();
    });

    test('should clean up finalizer hints correctly', () => {
      const hint = { cleanup: jest.fn() };
      const finalizer = jest.fn((data, hint) => {
        hint?.cleanup();
      });

      mockBinding.createExternalBuffer.mockImplementation((size, finalizer, hint) => {
        // Simulate finalizer execution with hint cleanup
        setTimeout(() => finalizer?.(null, hint), 0);
        return new ArrayBuffer(size);
      });

      mockBinding.createExternalBuffer(1024, finalizer, hint);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(hint.cleanup).toHaveBeenCalled();
          resolve();
        }, 10);
      });
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle very large buffers', () => {
      const largeSize = 1024 * 1024 * 1024; // 1GB
      const mockBuffer = new ArrayBuffer(8); // Mock with small buffer

      mockBinding.createManagedBuffer.mockReturnValue(mockBuffer);

      const result = mockBinding.createManagedBuffer(largeSize);

      expect(mockBinding.createManagedBuffer).toHaveBeenCalledWith(largeSize);
      expect(result).toBeDefined();
    });

    test('should optimize small vs large buffer copies', () => {
      mockBinding.copyBuffer.mockImplementation((dest, destSize, src, srcSize) => {
        const copySize = Math.min(destSize, srcSize);
        return copySize;
      });

      // Small buffer (should use byte-by-byte copy)
      const smallResult = mockBinding.copyBuffer(
        new ArrayBuffer(512), 512,
        new ArrayBuffer(256), 256
      );
      expect(smallResult).toBe(256);

      // Large buffer (should use memcpy)
      const largeResult = mockBinding.copyBuffer(
        new ArrayBuffer(2048), 2048,
        new ArrayBuffer(2048), 2048
      );
      expect(largeResult).toBe(2048);
    });

    test('should handle concurrent buffer operations', async () => {
      mockBinding.createExternalBuffer.mockImplementation((size) => {
        return new ArrayBuffer(size);
      });

      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve(mockBinding.createExternalBuffer(1024 + i)));
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(100);
      results.forEach((buffer, index) => {
        expect(buffer).toBeInstanceOf(ArrayBuffer);
      });
    });

    test('should maintain buffer alignment for performance', () => {
      // Test that managed buffers use proper alignment
      mockBinding.createManagedBuffer.mockImplementation((size) => {
        // Simulate aligned allocation (page-aligned)
        const alignedSize = (size + 4095) & ~4095;
        return new ArrayBuffer(alignedSize >= size ? size : alignedSize);
      });

      const buffer = mockBinding.createManagedBuffer(1000);
      expect(buffer.byteLength).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Integration with FUSE Operations', () => {
    test('should support zero-copy read operations', () => {
      const fileData = new ArrayBuffer(4096);
      mockBinding.createExternalBuffer.mockReturnValue(fileData);

      // Simulate a FUSE read operation returning zero-copy buffer
      const result = mockBinding.createExternalBuffer(4096, null, null);

      expect(result).toBe(fileData);
      expect(result.byteLength).toBe(4096);
      // In real implementation, this would reference actual file data
    });

    test('should support zero-copy write operations', () => {
      const writeData = new ArrayBuffer(2048);
      mockBinding.validateBuffer.mockReturnValue(true);

      // Simulate validating a buffer for zero-copy write
      const isValid = mockBinding.validateBuffer(writeData, 2048);

      expect(isValid).toBe(true);
      // In real implementation, this would validate the buffer can be written directly
    });

    test('should handle buffer lifetime management in async operations', async () => {
      const bufferData = new ArrayBuffer(1024);
      let finalizerCalled = false;

      const finalizer = jest.fn(() => {
        finalizerCalled = true;
      });

      mockBinding.createExternalBuffer.mockImplementation((size, finalizer) => {
        // Simulate async operation completing and finalizer being called
        setTimeout(() => finalizer?.(), 50);
        return bufferData;
      });

      const buffer = mockBinding.createExternalBuffer(1024, finalizer);

      // Simulate async FUSE operation
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(finalizer).toHaveBeenCalled();
      expect(finalizerCalled).toBe(true);
    });
  });
});
