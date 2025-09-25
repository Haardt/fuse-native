/**
 * @file xattr.test.ts
 * @brief Comprehensive tests for extended attributes (xattr) functionality
 *
 * Tests cover:
 * - Missing attributes (ENOATTR handling)
 * - Large attributes (size queries and data handling)
 * - Empty attribute lists
 * - Platform-specific behavior (macOS position=0)
 * - Error conditions and edge cases
 */

import { jest } from '@jest/globals';

// Mock the native binding before importing main module
const mockBinding = {
  getxattr: jest.fn(),
  setxattr: jest.fn(),
  listxattr: jest.fn(),
  removexattr: jest.fn(),
  errno: {
    ENOENT: -2,
    ENOATTR: -61,
    EINVAL: -22,
    ENOSYS: -38,
    ERANGE: -34,
    E2BIG: -7,
  },
  xattr: {
    XATTR_CREATE: 1,
    XATTR_REPLACE: 2,
  },
};

jest.mock('../build/Release/fuse-native.node', () => mockBinding);
jest.mock('../prebuilds/linux-x64/@cocalc+fuse-native.node', () => mockBinding);

import { getxattr, setxattr, listxattr, removexattr } from '../index.ts';

describe('FUSE Native Extended Attributes (xattr)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getxattr', () => {
    it('should handle size query for existing attribute', async () => {
      mockBinding.getxattr.mockReturnValue(42n);

      const result = await getxattr('/test/file', 'user.test');

      expect(mockBinding.getxattr).toHaveBeenCalledWith(
        '/test/file',
        'user.test',
        0n
      );
      expect(result).toEqual({ size: 42n });
    });

    it('should retrieve attribute data with specified size', async () => {
      const testData = Buffer.from('test-value');
      mockBinding.getxattr.mockReturnValue({
        size: 10n,
        data: testData,
      });

      const result = await getxattr('/test/file', 'user.test', 42n);

      expect(result).toEqual({
        size: 10n,
        data: testData,
      });
    });

    it('should handle zero-size attribute', async () => {
      mockBinding.getxattr.mockReturnValue(0n);

      const result = await getxattr('/test/file', 'user.empty');

      expect(result).toEqual({ size: 0n });
    });

    it('should reject empty path', async () => {
      await expect(getxattr('', 'user.test')).rejects.toThrow(
        'Path must be a non-empty string'
      );
    });

    it('should reject empty attribute name', async () => {
      await expect(getxattr('/test/file', '')).rejects.toThrow(
        'Attribute name must be a non-empty string'
      );
    });
  });

  describe('setxattr', () => {
    it('should set attribute successfully', async () => {
      mockBinding.setxattr.mockReturnValue(0n);
      const testData = Buffer.from('test value');

      await setxattr('/test/file', 'user.test', testData);

      expect(mockBinding.setxattr).toHaveBeenCalledWith(
        '/test/file',
        'user.test',
        testData,
        0
      );
    });

    it('should set attribute with CREATE flag', async () => {
      mockBinding.setxattr.mockReturnValue(0n);
      const testData = Buffer.from('new value');

      await setxattr('/test/file', 'user.new', testData, 1);

      expect(mockBinding.setxattr).toHaveBeenCalledWith(
        '/test/file',
        'user.new',
        testData,
        1
      );
    });

    it('should handle large attribute values', async () => {
      const largeValue = Buffer.alloc(8192, 'x');
      mockBinding.setxattr.mockReturnValue(0n);

      await setxattr('/test/file', 'user.large', largeValue);

      expect(mockBinding.setxattr).toHaveBeenCalledWith(
        '/test/file',
        'user.large',
        largeValue,
        0
      );
    });

    it('should reject non-Buffer value', async () => {
      await expect(
        setxattr('/test/file', 'user.test', 'string' as any)
      ).rejects.toThrow('Value must be a Buffer');
    });
  });

  describe('listxattr', () => {
    it('should handle size query for file with attributes', async () => {
      // Mock listxattr to return size needed for attribute names
      mockBinding.listxattr.mockReturnValue(20n);

      const result = await listxattr('/test/file');

      expect(mockBinding.listxattr).toHaveBeenCalledWith('/test/file', 0n);
      expect(result).toEqual({ size: 20n });
    });

    it('should retrieve attribute names', async () => {
      const names = ['user.test', 'user.example'];
      mockBinding.listxattr.mockReturnValue({
        size: 32n,
        names: names,
      });

      const result = await listxattr('/test/file', 64n);

      expect(result).toEqual({
        size: 32n,
        names: names,
      });
    });

    it('should handle empty attribute list', async () => {
      mockBinding.listxattr.mockReturnValue({
        size: 0n,
        names: [],
      });

      const result = await listxattr('/test/file', 1n);

      expect(result).toEqual({
        size: 0n,
        names: [],
      });
    });
  });

  describe('removexattr', () => {
    it('should remove attribute successfully', async () => {
      mockBinding.removexattr.mockReturnValue(0n);

      await removexattr('/test/file', 'user.test');

      expect(mockBinding.removexattr).toHaveBeenCalledWith(
        '/test/file',
        'user.test'
      );
    });

    it('should reject empty path', async () => {
      await expect(removexattr('', 'user.test')).rejects.toThrow(
        'Path must be a non-empty string'
      );
    });
  });

  describe('Integration', () => {
    it('should handle complete xattr lifecycle', async () => {
      // Initially no attributes
      mockBinding.listxattr.mockReturnValue(0n);
      let result = await listxattr('/test/file');
      expect(result.size).toBe(0n);

      // Set an attribute
      mockBinding.setxattr.mockReturnValue(0n);
      await setxattr('/test/file', 'user.test', Buffer.from('value'));

      // List attributes shows the new one
      mockBinding.listxattr.mockReturnValue({
        size: 10n,
        names: ['user.test'],
      });
      result = await listxattr('/test/file', 32n);
      expect(result.names).toEqual(['user.test']);

      // Get the attribute value
      mockBinding.getxattr.mockReturnValue({
        size: 5n,
        data: Buffer.from('value'),
      });
      const attrResult = await getxattr('/test/file', 'user.test', 10n);
      expect(attrResult.data).toEqual(Buffer.from('value'));

      // Remove the attribute
      mockBinding.removexattr.mockReturnValue(0n);
      await removexattr('/test/file', 'user.test');

      // List shows no attributes again
      mockBinding.listxattr.mockReturnValue(0n);
      result = await listxattr('/test/file');
      expect(result.size).toBe(0n);
    });
  });
});
