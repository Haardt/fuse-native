/**
 * @file init-bridge.test.ts
 * @brief Tests for FUSE init bridge functionality
 *
 * Tests the init bridge module that handles FUSE init callbacks and exposes
 * connection info, config, and capabilities to the TypeScript layer.
 */

// Mock the native binding BEFORE importing the module
const mockBinding = {
  initializeInitBridge: jest.fn(),
  setInitCallback: jest.fn(),
  removeInitCallback: jest.fn(),
  getConnectionInfo: jest.fn(),
  getFuseConfig: jest.fn(),
  getAvailableMountOptions: jest.fn(),
  checkCapabilities: jest.fn(),
  getCapabilityNames: jest.fn(),
  resetInitBridge: jest.fn(),
};

jest.mock('../build/Release/fuse-native.node', () => mockBinding);
jest.mock('../prebuilds/linux-x64/@cocalc+fuse-native.node', () => mockBinding);

import {
  initializeInitBridge,
  setInitCallback,
  removeInitCallback,
  getConnectionInfo,
  getFuseConfig,
  getMountOptions,
  checkCapabilities,
  getCapabilityNames,
  resetInitBridge,
  type InitCallback,
  type FuseConnectionInfo,
  type FuseConfig,
  type MountOptions,
} from '../index.ts';

describe('Init Bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeInitBridge', () => {
    it('should initialize the init bridge successfully', async () => {
      mockBinding.initializeInitBridge.mockReturnValue(undefined);

      await expect(initializeInitBridge()).resolves.toBeUndefined();
      expect(mockBinding.initializeInitBridge).toHaveBeenCalledTimes(1);
    });

    it('should reject on native error', async () => {
      const error = new Error('Init bridge initialization failed');
      mockBinding.initializeInitBridge.mockImplementation(() => {
        throw error;
      });

      await expect(initializeInitBridge()).rejects.toBe(error);
    });
  });

  describe('setInitCallback', () => {
    it('should set init callback successfully', async () => {
      mockBinding.setInitCallback.mockReturnValue(undefined);

      const callback: InitCallback = jest.fn();
      await expect(setInitCallback(callback)).resolves.toBeUndefined();
      expect(mockBinding.setInitCallback).toHaveBeenCalledTimes(1);

      // Check that the callback was wrapped
      const wrappedCallback = mockBinding.setInitCallback.mock.calls[0][0];
      expect(typeof wrappedCallback).toBe('function');
    });

    it('should handle callback errors gracefully', async () => {
      mockBinding.setInitCallback.mockReturnValue(undefined);

      const callback: InitCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      // Mock console.error to capture error logging
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await setInitCallback(callback);
      const wrappedCallback = mockBinding.setInitCallback.mock.calls[0][0];

      // Simulate calling the wrapped callback
      const mockConnInfo: FuseConnectionInfo = {
        protoMajor: 7,
        protoMinor: 31,
        capable: 0x1fff,
        want: 0x1fff,
        maxWrite: 65536,
        maxRead: 65536,
        maxReadahead: 131072,
        maxBackground: 12,
        congestionThreshold: 10,
        timeGranNs: 1000000000n,
        caps: [1, 2, 8],
      };

      const mockConfig: FuseConfig = {
        setGid: 0,
        gid: 0,
        setUid: 0,
        uid: 0,
        setMode: 0,
        umask: 0o022,
        entryTimeout: 1.0,
        negativeTimeout: 0.0,
        attrTimeout: 1.0,
        useIno: 0,
        readdirIno: 0,
        directIo: 0,
        kernelCache: 1,
        autoCache: 1,
        acAttrTimeoutSet: 0,
        acAttrTimeout: 0.0,
        nullpathOk: 0,
        showHelp: 0,
        debug: 0,
      };

      expect(() => wrappedCallback(mockConnInfo, mockConfig)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Init callback error:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle async callback errors', async () => {
      mockBinding.setInitCallback.mockReturnValue(undefined);

      const callback: InitCallback = jest
        .fn()
        .mockRejectedValue(new Error('Async callback error'));

      await setInitCallback(callback);
      // The wrapped callback should not throw even if the inner callback rejects
      expect(mockBinding.setInitCallback).toHaveBeenCalledTimes(1);
    });

    it('should reject on native error', async () => {
      const error = new Error('Failed to set init callback');
      mockBinding.setInitCallback.mockImplementation(() => {
        throw error;
      });

      const callback: InitCallback = jest.fn();
      await expect(setInitCallback(callback)).rejects.toBe(error);
    });
  });

  describe('removeInitCallback', () => {
    it('should remove init callback successfully', async () => {
      mockBinding.removeInitCallback.mockReturnValue(undefined);

      await expect(removeInitCallback()).resolves.toBeUndefined();
      expect(mockBinding.removeInitCallback).toHaveBeenCalledTimes(1);
    });

    it('should reject on native error', async () => {
      const error = new Error('Failed to remove init callback');
      mockBinding.removeInitCallback.mockImplementation(() => {
        throw error;
      });

      await expect(removeInitCallback()).rejects.toBe(error);
    });
  });

  describe('getConnectionInfo', () => {
    it('should return connection info when available', () => {
      const mockInfo: FuseConnectionInfo = {
        protoMajor: 7,
        protoMinor: 31,
        capable: 0x1fff,
        want: 0x1fff,
        maxWrite: 65536,
        maxRead: 65536,
        maxReadahead: 131072,
        maxBackground: 12,
        congestionThreshold: 10,
        timeGranNs: 1000000000n,
        caps: [1, 2, 8],
      };

      mockBinding.getConnectionInfo.mockReturnValue(mockInfo);

      const result = getConnectionInfo();
      expect(result).toEqual(mockInfo);
      expect(mockBinding.getConnectionInfo).toHaveBeenCalledTimes(1);
    });

    it('should return null when no connection info available', () => {
      mockBinding.getConnectionInfo.mockReturnValue(null);

      const result = getConnectionInfo();
      expect(result).toBeNull();
    });

    it('should return null on native error', () => {
      mockBinding.getConnectionInfo.mockImplementation(() => {
        throw new Error('Native error');
      });

      const result = getConnectionInfo();
      expect(result).toBeNull();
    });

    it('should validate BigInt fields', () => {
      const mockInfo: FuseConnectionInfo = {
        protoMajor: 7,
        protoMinor: 31,
        capable: 0x1fff,
        want: 0x1fff,
        maxWrite: 131072,
        maxRead: 131072,
        maxReadahead: 131072,
        maxBackground: 12,
        congestionThreshold: 10,
        timeGranNs: 1000000000n, // BigInt nanosecond precision
        caps: [1, 2, 8],
      };

      mockBinding.getConnectionInfo.mockReturnValue(mockInfo);

      const result = getConnectionInfo();
      expect(result?.timeGranNs).toBe(1000000000n);
      expect(typeof result?.timeGranNs).toBe('bigint');
    });
  });

  describe('getFuseConfig', () => {
    it('should return FUSE config when available', () => {
      const mockConfig: FuseConfig = {
        setGid: 0,
        gid: 0,
        setUid: 0,
        uid: 0,
        setMode: 0,
        umask: 0o022,
        entryTimeout: 1.0,
        negativeTimeout: 0.0,
        attrTimeout: 1.0,
        useIno: 0,
        readdirIno: 0,
        directIo: 0,
        kernelCache: 1,
        autoCache: 1,
        acAttrTimeoutSet: 0,
        acAttrTimeout: 0.0,
        nullpathOk: 0,
        showHelp: 0,
        debug: 0,
      };

      mockBinding.getFuseConfig.mockReturnValue(mockConfig);

      const result = getFuseConfig();
      expect(result).toEqual(mockConfig);
      expect(mockBinding.getFuseConfig).toHaveBeenCalledTimes(1);
    });

    it('should return null when no config available', () => {
      mockBinding.getFuseConfig.mockReturnValue(null);

      const result = getFuseConfig();
      expect(result).toBeNull();
    });

    it('should return null on native error', () => {
      mockBinding.getFuseConfig.mockImplementation(() => {
        throw new Error('Native error');
      });

      const result = getFuseConfig();
      expect(result).toBeNull();
    });
  });

  describe('getMountOptions', () => {
    it('should return mount options from native binding', () => {
      const mockOptions: MountOptions = {
        available: [
          'allow_other',
          'allow_root',
          'auto_unmount',
          'default_permissions',
          'max_write',
          'async_read',
        ],
        defaults: ['default_permissions', 'auto_unmount', 'async_read'],
      };

      mockBinding.getAvailableMountOptions.mockReturnValue(mockOptions);

      const result = getMountOptions();
      expect(result).toEqual(mockOptions);
      expect(mockBinding.getAvailableMountOptions).toHaveBeenCalledTimes(1);
    });

    it('should return fallback options on native error', () => {
      mockBinding.getAvailableMountOptions.mockImplementation(() => {
        throw new Error('Native error');
      });

      const result = getMountOptions();
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('defaults');
      expect(Array.isArray(result.available)).toBe(true);
      expect(Array.isArray(result.defaults)).toBe(true);
      expect(result.available.length).toBeGreaterThan(0);
    });

    it('should include expected mount options in fallback', () => {
      mockBinding.getAvailableMountOptions.mockImplementation(() => {
        throw new Error('Native error');
      });

      const result = getMountOptions();
      expect(result.available).toContain('allow_other');
      expect(result.available).toContain('default_permissions');
      expect(result.available).toContain('auto_unmount');
      expect(result.defaults).toContain('default_permissions');
      expect(result.defaults).toContain('auto_unmount');
    });
  });

  describe('checkCapabilities', () => {
    it('should return true when no capabilities specified', async () => {
      const result = await checkCapabilities();
      expect(result).toBe(true);
      expect(mockBinding.checkCapabilities).not.toHaveBeenCalled();
    });

    it('should return true when empty array specified', async () => {
      const result = await checkCapabilities([]);
      expect(result).toBe(true);
      expect(mockBinding.checkCapabilities).not.toHaveBeenCalled();
    });

    it('should check specific capabilities', async () => {
      mockBinding.checkCapabilities.mockReturnValue(true);

      const caps = [1, 2, 8]; // ASYNC_READ, POSIX_LOCKS, SPLICE_MOVE
      const result = await checkCapabilities(caps);

      expect(result).toBe(true);
      expect(mockBinding.checkCapabilities).toHaveBeenCalledWith(caps);
    });

    it('should return false when capabilities not supported', async () => {
      mockBinding.checkCapabilities.mockReturnValue(false);

      const caps = [0x80000000]; // Non-existent capability
      const result = await checkCapabilities(caps);

      expect(result).toBe(false);
      expect(mockBinding.checkCapabilities).toHaveBeenCalledWith(caps);
    });

    it('should reject on native error', async () => {
      const error = new Error('Failed to check capabilities');
      mockBinding.checkCapabilities.mockImplementation(() => {
        throw error;
      });

      const caps = [1, 2];
      await expect(checkCapabilities(caps)).rejects.toBe(error);
    });
  });

  describe('getCapabilityNames', () => {
    it('should return capability names', () => {
      const mockNames = ['ASYNC_READ', 'POSIX_LOCKS', 'ATOMIC_O_TRUNC'];
      mockBinding.getCapabilityNames.mockReturnValue(mockNames);

      const result = getCapabilityNames();
      expect(result).toEqual(mockNames);
      expect(mockBinding.getCapabilityNames).toHaveBeenCalledTimes(1);
    });

    it('should return empty array on native error', () => {
      mockBinding.getCapabilityNames.mockImplementation(() => {
        throw new Error('Native error');
      });

      const result = getCapabilityNames();
      expect(result).toEqual([]);
    });
  });

  describe('resetInitBridge', () => {
    it('should reset the init bridge successfully', async () => {
      mockBinding.resetInitBridge.mockReturnValue(undefined);

      await expect(resetInitBridge()).resolves.toBeUndefined();
      expect(mockBinding.resetInitBridge).toHaveBeenCalledTimes(1);
    });

    it('should reject on native error', async () => {
      const error = new Error('Failed to reset init bridge');
      mockBinding.resetInitBridge.mockImplementation(() => {
        throw error;
      });

      await expect(resetInitBridge()).rejects.toBe(error);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete init workflow', async () => {
      // Setup mocks for complete workflow
      mockBinding.initializeInitBridge.mockReturnValue(undefined);
      mockBinding.setInitCallback.mockReturnValue(undefined);
      mockBinding.getConnectionInfo.mockReturnValue({
        protoMajor: 7,
        protoMinor: 31,
        capable: 0x1fff,
        want: 0x1fff,
        maxWrite: 65536,
        maxRead: 65536,
        maxReadahead: 131072,
        maxBackground: 12,
        congestionThreshold: 10,
        timeGranNs: 1000000000n,
        caps: [1, 2, 8],
      });
      mockBinding.getFuseConfig.mockReturnValue({
        setGid: 0,
        gid: 0,
        setUid: 0,
        uid: 0,
        setMode: 0,
        umask: 0o022,
        entryTimeout: 1.0,
        negativeTimeout: 0.0,
        attrTimeout: 1.0,
        useIno: 0,
        readdirIno: 0,
        directIo: 0,
        kernelCache: 1,
        autoCache: 1,
        acAttrTimeoutSet: 0,
        acAttrTimeout: 0.0,
        nullpathOk: 0,
        showHelp: 0,
        debug: 0,
      });
      mockBinding.removeInitCallback.mockReturnValue(undefined);
      mockBinding.resetInitBridge.mockReturnValue(undefined);

      // Complete workflow
      await initializeInitBridge();

      const callback: InitCallback = jest.fn();
      await setInitCallback(callback);

      const connInfo = getConnectionInfo();
      expect(connInfo).not.toBeNull();
      expect(connInfo?.maxWrite).toBe(65536);
      expect(connInfo?.timeGranNs).toBe(1000000000n);

      const config = getFuseConfig();
      expect(config).not.toBeNull();
      expect(config?.entryTimeout).toBe(1.0);

      await removeInitCallback();
      await resetInitBridge();

      // Verify all calls were made
      expect(mockBinding.initializeInitBridge).toHaveBeenCalledTimes(1);
      expect(mockBinding.setInitCallback).toHaveBeenCalledTimes(1);
      expect(mockBinding.getConnectionInfo).toHaveBeenCalledTimes(1);
      expect(mockBinding.getFuseConfig).toHaveBeenCalledTimes(1);
      expect(mockBinding.removeInitCallback).toHaveBeenCalledTimes(1);
      expect(mockBinding.resetInitBridge).toHaveBeenCalledTimes(1);
    });

    it('should validate BigInt precision for large values', () => {
      const largeTimeGran = 9223372036854775807n; // Max safe BigInt

      mockBinding.getConnectionInfo.mockReturnValue({
        protoMajor: 7,
        protoMinor: 31,
        capable: 0x1fff,
        want: 0x1fff,
        maxWrite: 1048576,
        maxRead: 1048576,
        maxReadahead: 131072,
        maxBackground: 12,
        congestionThreshold: 10,
        timeGranNs: largeTimeGran,
        caps: [],
      });

      const result = getConnectionInfo();
      expect(result?.timeGranNs).toBe(largeTimeGran);
      expect(typeof result?.timeGranNs).toBe('bigint');
    });
  });

  describe('Error Handling', () => {
    it('should handle all functions gracefully when native binding fails', async () => {
      // Make all native functions throw
      Object.keys(mockBinding).forEach(key => {
        (mockBinding as any)[key].mockImplementation(() => {
          throw new Error(`Native ${key} failed`);
        });
      });

      // These should not throw but return safe defaults
      expect(getConnectionInfo()).toBeNull();
      expect(getFuseConfig()).toBeNull();
      expect(getCapabilityNames()).toEqual([]);

      const mountOptions = getMountOptions();
      expect(mountOptions).toHaveProperty('available');
      expect(mountOptions).toHaveProperty('defaults');

      // These should reject
      await expect(initializeInitBridge()).rejects.toThrow();
      await expect(setInitCallback(jest.fn())).rejects.toThrow();
      await expect(removeInitCallback()).rejects.toThrow();
      await expect(resetInitBridge()).rejects.toThrow();
      await expect(checkCapabilities([1, 2])).rejects.toThrow();
    });
  });
});
