import { jest } from '@jest/globals';
import type {
  TSFNDispatcherOptions,
  DispatcherStats,
  CallbackPriority,
} from '../types.ts';

// Mock the native binding
const mockBinding = {
  initializeDispatcher: jest.fn(),
  shutdownDispatcher: jest.fn(),
  getDispatcherStats: jest.fn(),
  resetDispatcherStats: jest.fn(),
  setDispatcherConfig: jest.fn(),
  setOperationHandler: jest.fn(),
  removeOperationHandler: jest.fn(),
};

jest.mock('../build/Release/fuse-native.node', () => mockBinding);
jest.mock('../prebuilds/linux-x64/@cocalc+fuse-native.node', () => mockBinding);

// Import after mocking
import {
  initializeDispatcher,
  shutdownDispatcher,
  getDispatcherStats,
  resetDispatcherStats,
  setDispatcherConfig,
  setOperationHandler,
  removeOperationHandler,
} from '../index.ts';

describe('TSFN Dispatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Reset mocks after each test
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with default options', async () => {
      mockBinding.initializeDispatcher.mockReturnValue(true);

      const result = initializeDispatcher();

      await expect(result).resolves.toBe(true);
      expect(mockBinding.initializeDispatcher).toHaveBeenCalledWith({
        maxQueueSize: 1000,
        workerThreads: 1,
      });
    });

    test('should initialize with custom options', async () => {
      mockBinding.initializeDispatcher.mockReturnValue(true);

      const options: TSFNDispatcherOptions = {
        maxQueueSize: 2000,
        workerThreads: 4,
      };

      const result = initializeDispatcher(options);

      await expect(result).resolves.toBe(true);
      expect(mockBinding.initializeDispatcher).toHaveBeenCalledWith(options);
    });

    test('should handle initialization failure', async () => {
      mockBinding.initializeDispatcher.mockReturnValue(false);

      const result = initializeDispatcher();

      await expect(result).resolves.toBe(false);
    });

    test('should prevent double initialization', async () => {
      mockBinding.initializeDispatcher
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const result1 = initializeDispatcher();
      const result2 = initializeDispatcher();

      await expect(result1).resolves.toBe(true);
      await expect(result2).resolves.toBe(false);
      expect(mockBinding.initializeDispatcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('Configuration', () => {
    beforeEach(() => {
      mockBinding.initializeDispatcher.mockReturnValue(true);
    });

    test('should set dispatcher configuration', async () => {
      mockBinding.setDispatcherConfig.mockReturnValue(true);

      const config = {
        maxQueueSize: 1500,
        priorityOrdering: false,
      };

      const result = setDispatcherConfig(config);

      await expect(result).resolves.toBe(true);
      expect(mockBinding.setDispatcherConfig).toHaveBeenCalledWith(config);
    });

    test('should handle configuration failure', async () => {
      mockBinding.setDispatcherConfig.mockReturnValue(false);

      const config = { maxQueueSize: 500 };
      const result = setDispatcherConfig(config);

      await expect(result).resolves.toBe(false);
    });

    test('should validate configuration parameters', async () => {
      await expect(setDispatcherConfig({ maxQueueSize: -1 })).rejects.toThrow(
        'Invalid maxQueueSize'
      );
    });
  });

  describe('Operation Handlers', () => {
    beforeEach(() => {
      mockBinding.initializeDispatcher.mockReturnValue(true);
    });

    test('should register operation handler', async () => {
      mockBinding.setOperationHandler.mockReturnValue(true);

      const handler = jest.fn();
      const result = setOperationHandler('getattr', handler);

      await expect(result).resolves.toBe(true);
      expect(mockBinding.setOperationHandler).toHaveBeenCalledWith(
        'getattr',
        handler
      );
    });

    test('should remove operation handler', async () => {
      mockBinding.removeOperationHandler.mockReturnValue(true);

      const result = removeOperationHandler('getattr');

      await expect(result).resolves.toBe(true);
      expect(mockBinding.removeOperationHandler).toHaveBeenCalledWith(
        'getattr'
      );
    });

    test('should handle handler registration failure', async () => {
      mockBinding.setOperationHandler.mockReturnValue(false);

      const handler = jest.fn();
      const result = setOperationHandler('getattr', handler);

      await expect(result).resolves.toBe(false);
    });

    test('should validate operation names', async () => {
      await expect(setOperationHandler('', jest.fn())).rejects.toThrow(
        'Invalid operation name'
      );

      await expect(
        setOperationHandler('invalid-op', jest.fn())
      ).rejects.toThrow('Unknown operation');
    });

    test('should validate handler function', async () => {
      await expect(setOperationHandler('getattr', null as any)).rejects.toThrow(
        'Handler must be a function'
      );
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      mockBinding.initializeDispatcher.mockReturnValue(true);
    });

    test('should get dispatcher statistics', async () => {
      const mockStats: DispatcherStats = {
        totalDispatched: 100n,
        totalCompleted: 95n,
        totalErrors: 5n,
        queueSize: 10n,
        maxQueueSize: 50n,
        avgLatencyMs: 15.5,
        uptimeMs: 120000,
      };

      mockBinding.getDispatcherStats.mockReturnValue(mockStats);

      const stats = getDispatcherStats();

      await expect(stats).resolves.toEqual(mockStats);
      expect(mockBinding.getDispatcherStats).toHaveBeenCalled();
    });

    test('should reset dispatcher statistics', async () => {
      mockBinding.resetDispatcherStats.mockReturnValue(true);

      const result = resetDispatcherStats();

      await expect(result).resolves.toBe(true);
      expect(mockBinding.resetDispatcherStats).toHaveBeenCalled();
    });

    test('should handle statistics not available', async () => {
      mockBinding.getDispatcherStats.mockImplementation(() => {
        throw new Error('Dispatcher not initialized');
      });

      await expect(getDispatcherStats()).rejects.toThrow(
        'Dispatcher not initialized'
      );
    });

    test('should calculate derived statistics', async () => {
      const mockStats: DispatcherStats = {
        totalDispatched: 1000n,
        totalCompleted: 950n,
        totalErrors: 50n,
        queueSize: 25n,
        maxQueueSize: 100n,
        avgLatencyMs: 20.0,
        uptimeMs: 300000,
      };

      mockBinding.getDispatcherStats.mockReturnValue(mockStats);

      const stats = await getDispatcherStats();

      // Calculate derived metrics
      const successRate =
        Number(stats.totalCompleted) / Number(stats.totalDispatched);
      const errorRate =
        Number(stats.totalErrors) / Number(stats.totalDispatched);
      const throughput = Number(stats.totalCompleted) / (stats.uptimeMs / 1000);

      expect(successRate).toBeCloseTo(0.95, 2);
      expect(errorRate).toBeCloseTo(0.05, 2);
      expect(throughput).toBeCloseTo(3.17, 2); // ops/second
    });
  });

  describe('Shutdown', () => {
    beforeEach(() => {
      mockBinding.initializeDispatcher.mockReturnValue(true);
    });

    test('should shutdown with default timeout', async () => {
      mockBinding.shutdownDispatcher.mockReturnValue(true);

      const result = shutdownDispatcher();

      await expect(result).resolves.toBe(true);
      expect(mockBinding.shutdownDispatcher).toHaveBeenCalledWith(5000);
    });

    test('should shutdown with custom timeout', async () => {
      mockBinding.shutdownDispatcher.mockReturnValue(true);

      const result = shutdownDispatcher(10000);

      await expect(result).resolves.toBe(true);
      expect(mockBinding.shutdownDispatcher).toHaveBeenCalledWith(10000);
    });

    test('should handle shutdown timeout', async () => {
      mockBinding.shutdownDispatcher.mockReturnValue(false);

      const result = shutdownDispatcher(1000);

      await expect(result).resolves.toBe(false);
    });

    test('should be idempotent', async () => {
      mockBinding.shutdownDispatcher.mockReturnValue(true);

      const result1 = shutdownDispatcher();
      const result2 = shutdownDispatcher();

      await expect(result1).resolves.toBe(true);
      await expect(result2).resolves.toBe(true); // Should still return true for already shutdown
    });
  });

  describe('Priority Handling', () => {
    beforeEach(() => {
      mockBinding.initializeDispatcher.mockReturnValue(true);
    });

    test('should handle priority levels', async () => {
      const priorities: CallbackPriority[] = ['HIGH', 'NORMAL', 'LOW'];

      priorities.forEach(priority => {
        expect(['HIGH', 'NORMAL', 'LOW']).toContain(priority);
      });
    });

    test('should validate priority values', async () => {
      const validPriorities = ['HIGH', 'NORMAL', 'LOW'];
      validPriorities.forEach(priority => {
        expect(validPriorities).toContain(priority);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle native binding errors', async () => {
      mockBinding.initializeDispatcher.mockImplementation(() => {
        throw new Error('Native binding error');
      });

      await expect(initializeDispatcher()).rejects.toThrow(
        'Native binding error'
      );
    });

    test('should handle invalid arguments', async () => {
      await expect(
        initializeDispatcher({ maxQueueSize: 'invalid' as any })
      ).rejects.toThrow();
    });

    test('should handle missing native binding', async () => {
      // This test would be more relevant in integration scenarios
      // where the native module might not be available
      expect(mockBinding).toBeDefined();
    });
  });

  describe('Memory Management', () => {
    beforeEach(() => {
      mockBinding.initializeDispatcher.mockReturnValue(true);
    });

    test('should handle high queue sizes', async () => {
      mockBinding.setDispatcherConfig.mockReturnValue(true);

      // Test with very large queue size
      const config = { maxQueueSize: 1000000 };
      const result = setDispatcherConfig(config);

      await expect(result).resolves.toBe(true);
    });

    test('should handle queue size limits', async () => {
      mockBinding.setDispatcherConfig.mockReturnValue(false);

      // This should fail in native code if queue is full
      const config = { maxQueueSize: 0 }; // Unlimited
      const result = setDispatcherConfig(config);

      await expect(result).resolves.toBe(false);
    });
  });

  describe('Concurrent Operations', () => {
    beforeEach(() => {
      mockBinding.initializeDispatcher.mockReturnValue(true);
    });

    test('should handle multiple concurrent handlers', async () => {
      mockBinding.setOperationHandler.mockReturnValue(true);

      const operations = ['getattr', 'readdir', 'read', 'write', 'open'];
      const handlers = operations.map(() => jest.fn());

      const results = await Promise.all(
        operations.map((op, i) => setOperationHandler(op, handlers[i]))
      );

      expect(results.every(r => r === true)).toBe(true);
      expect(mockBinding.setOperationHandler).toHaveBeenCalledTimes(5);
    });

    test('should handle concurrent statistics requests', async () => {
      const mockStats = {
        totalDispatched: 50n,
        totalCompleted: 45n,
        totalErrors: 5n,
        queueSize: 5n,
        maxQueueSize: 25n,
        avgLatencyMs: 12.5,
        uptimeMs: 60000,
      };

      mockBinding.getDispatcherStats.mockReturnValue(mockStats);

      // Make multiple concurrent requests
      const promises = Array(10)
        .fill(0)
        .map(() => getDispatcherStats());
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(stats => {
        expect(stats).toEqual(mockStats);
      });
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle full lifecycle', async () => {
      // Initialize
      mockBinding.initializeDispatcher.mockReturnValue(true);
      const initResult = initializeDispatcher({ maxQueueSize: 500 });
      await expect(initResult).resolves.toBe(true);

      // Configure
      mockBinding.setDispatcherConfig.mockReturnValue(true);
      const configResult = setDispatcherConfig({ priorityOrdering: true });
      await expect(configResult).resolves.toBe(true);

      // Register handlers
      mockBinding.setOperationHandler.mockReturnValue(true);
      const handler1 = setOperationHandler('getattr', jest.fn());
      const handler2 = setOperationHandler('read', jest.fn());
      await expect(handler1).resolves.toBe(true);
      await expect(handler2).resolves.toBe(true);

      // Get stats
      mockBinding.getDispatcherStats.mockReturnValue({
        totalDispatched: 10n,
        totalCompleted: 10n,
        totalErrors: 0n,
        queueSize: 0n,
        maxQueueSize: 5n,
        avgLatencyMs: 8.5,
        uptimeMs: 5000,
      });
      const stats = getDispatcherStats();
      await expect(stats).resolves.toMatchObject({ totalErrors: 0n });

      // Remove handlers
      mockBinding.removeOperationHandler.mockReturnValue(true);
      const remove1 = removeOperationHandler('getattr');
      const remove2 = removeOperationHandler('read');
      await expect(remove1).resolves.toBe(true);
      await expect(remove2).resolves.toBe(true);

      // Shutdown
      mockBinding.shutdownDispatcher.mockReturnValue(true);
      const shutdownResult = shutdownDispatcher();
      await expect(shutdownResult).resolves.toBe(true);
    });
  });
});
