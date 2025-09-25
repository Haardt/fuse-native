/**
 * @file xattr-debug.test.ts
 * @brief Simple debug test to understand xattr behavior
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
  },
  xattr: {
    XATTR_CREATE: 1,
    XATTR_REPLACE: 2,
  },
};

jest.mock('../build/Release/fuse-native.node', () => mockBinding);
jest.mock('../prebuilds/linux-x64/@cocalc+fuse-native.node', () => mockBinding);

import { getxattr } from '../index.ts';

describe('FUSE xattr Debug', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle positive BigInt without error', async () => {
    console.log('=== Starting debug test ===');

    // Mock returns positive BigInt (success case)
    mockBinding.getxattr.mockReturnValue(42n);
    console.log('Mock configured to return:', 42n);
    console.log(
      'mockBinding.getxattr mock implementation:',
      mockBinding.getxattr.getMockImplementation()
    );
    console.log(
      'mockBinding.getxattr call count before:',
      mockBinding.getxattr.mock.calls.length
    );

    try {
      console.log('About to call getxattr...');
      const result = await getxattr('/test/file', 'user.test');
      console.log('getxattr returned:', result);
      console.log(
        'mockBinding.getxattr call count after:',
        mockBinding.getxattr.mock.calls.length
      );
      console.log(
        'mockBinding.getxattr calls:',
        mockBinding.getxattr.mock.calls
      );

      expect(result).toEqual({ size: 42n });
      console.log('Test passed successfully');
    } catch (error) {
      console.error('Test failed with error:', error);
      console.error('Error stack:', error.stack);
      console.error(
        'mockBinding.getxattr calls after error:',
        mockBinding.getxattr.mock.calls
      );
      throw error;
    }
  });

  it('should handle negative BigInt as error', async () => {
    console.log('=== Starting negative test ===');

    // Mock returns negative BigInt (error case like real binding)
    mockBinding.getxattr.mockReturnValue(-2n);
    console.log('Mock configured to return:', -2n);
    console.log(
      'mockBinding.getxattr call count before:',
      mockBinding.getxattr.mock.calls.length
    );

    try {
      console.log('About to call getxattr expecting error...');
      await getxattr('/test/file', 'user.test');
      console.log('ERROR: Should have thrown!');
      fail('Should have thrown an error');
    } catch (error) {
      console.log('Successfully caught expected error:', error.message);
      console.log('Error errno:', error.errno);
      console.log('Error code:', error.code);
      console.log(
        'mockBinding.getxattr calls:',
        mockBinding.getxattr.mock.calls
      );
      expect(error.code).toBe('ENOENT');
    }
  });
});
