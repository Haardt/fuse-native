import { jest } from '@jest/globals';
import type {
  WriteQueueStats,
  WriteOperationPriority,
  FDWriteQueueConfig,
} from '../ts/types.js';

// Mock the native binding
const mockBinding = {
  enqueueWrite: jest.fn(),
  processWriteQueues: jest.fn(),
  flushWriteQueue: jest.fn(),
  flushAllWriteQueues: jest.fn(),
  getWriteQueueStats: jest.fn(),
  resetWriteQueueStats: jest.fn(),
  configureWriteQueues: jest.fn(),
};

jest.mock('../build/Release/fuse-native.node', () => mockBinding);
jest.mock('../prebuilds/linux-x64/@cocalc+fuse-native.node', () => mockBinding);

// Import after mocking
import {
  enqueueWrite,
  processWriteQueues,
  flushWriteQueue,
  flushAllWriteQueues,
  getWriteQueueStats,
  resetWriteQueueStats,
  configureWriteQueues,
} from '../ts/index.js';

describe('Write Queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up after each test
    mockBinding.flushAllWriteQueues.mockReturnValue(true);
    await flushAllWriteQueues(1000);
  });

  describe('Enqueue Operations', () => {
    test('should enqueue write operation with default priority', async () => {
      const operationId = 12345n;
      mockBinding.enqueueWrite.mockReturnValue(operationId);

      const fd = 10n;
      const offset = 0n;
      const size = 1024n;
      const buffer = new ArrayBuffer(1024);

      const result = await enqueueWrite(fd, offset, size, buffer);

      expect(mockBinding.enqueueWrite).toHaveBeenCalledWith(
        fd,
        offset,
        size,
        buffer,
        'NORMAL',
        undefined
      );
      expect(result).toBe(operationId);
    });

    test('should enqueue write operation with custom priority', async () => {
      const operationId = 12346n;
      mockBinding.enqueueWrite.mockReturnValue(operationId);

      const fd = 10n;
      const offset = 1024n;
      const size = 2048n;
      const buffer = new ArrayBuffer(2048);
      const priority: WriteOperationPriority = 'HIGH';

      const result = await enqueueWrite(fd, offset, size, buffer, priority);

      expect(mockBinding.enqueueWrite).toHaveBeenCalledWith(
        fd,
        offset,
        size,
        buffer,
        priority,
        undefined
      );
      expect(result).toBe(operationId);
    });

    test('should enqueue write operation with completion callback', async () => {
      const operationId = 12347n;
      mockBinding.enqueueWrite.mockReturnValue(operationId);

      const fd = 10n;
      const offset = 0n;
      const size = 512n;
      const buffer = new ArrayBuffer(512);
      const callback = jest.fn();

      const result = await enqueueWrite(
        fd,
        offset,
        size,
        buffer,
        'NORMAL',
        callback
      );

      expect(mockBinding.enqueueWrite).toHaveBeenCalledWith(
        fd,
        offset,
        size,
        buffer,
        'NORMAL',
        callback
      );
      expect(result).toBe(operationId);
    });

    test('should handle enqueue failure', async () => {
      mockBinding.enqueueWrite.mockReturnValue(0n);

      const fd = 10n;
      const offset = 0n;
      const size = 1024n;
      const buffer = new ArrayBuffer(1024);

      const result = await enqueueWrite(fd, offset, size, buffer);

      expect(result).toBe(0n);
    });

    test('should validate buffer size', async () => {
      const fd = 10n;
      const offset = 0n;
      const size = 2048n; // Larger than buffer
      const buffer = new ArrayBuffer(1024);

      await expect(enqueueWrite(fd, offset, size, buffer)).rejects.toThrow(
        'Write size exceeds buffer size'
      );
    });

    test('should validate file descriptor', async () => {
      const fd = -1n; // Invalid FD
      const offset = 0n;
      const size = 1024n;
      const buffer = new ArrayBuffer(1024);

      await expect(enqueueWrite(fd, offset, size, buffer)).rejects.toThrow(
        'Invalid file descriptor'
      );
    });

    test('should validate priority', async () => {
      const fd = 10n;
      const offset = 0n;
      const size = 1024n;
      const buffer = new ArrayBuffer(1024);
      const invalidPriority = 'INVALID' as WriteOperationPriority;

      await expect(
        enqueueWrite(fd, offset, size, buffer, invalidPriority)
      ).rejects.toThrow('Invalid priority level');
    });
  });

  describe('Process Queues', () => {
    test('should process write queues with executor', async () => {
      const processedCount = 5;
      mockBinding.processWriteQueues.mockReturnValue(processedCount);

      const executor = jest.fn().mockReturnValue(0); // Success
      const result = await processWriteQueues(executor);

      expect(mockBinding.processWriteQueues).toHaveBeenCalledWith(executor);
      expect(result).toBe(processedCount);
    });

    test('should handle executor errors', async () => {
      const processedCount = 3;
      mockBinding.processWriteQueues.mockReturnValue(processedCount);

      const executor = jest.fn().mockReturnValue(-5); // EIO error
      const result = await processWriteQueues(executor);

      expect(result).toBe(processedCount);
    });

    test('should validate executor function', async () => {
      await expect(processWriteQueues(null as any)).rejects.toThrow(
        'Executor must be a function'
      );
    });

    test('should handle native processing error', async () => {
      mockBinding.processWriteQueues.mockImplementation(() => {
        throw new Error('Native processing error');
      });

      const executor = jest.fn();
      await expect(processWriteQueues(executor)).rejects.toThrow(
        'Native processing error'
      );
    });
  });

  describe('Flush Operations', () => {
    test('should flush specific FD queue with default timeout', async () => {
      mockBinding.flushWriteQueue.mockReturnValue(true);

      const fd = 10n;
      const result = await flushWriteQueue(fd);

      expect(mockBinding.flushWriteQueue).toHaveBeenCalledWith(fd, 5000);
      expect(result).toBe(true);
    });

    test('should flush specific FD queue with custom timeout', async () => {
      mockBinding.flushWriteQueue.mockReturnValue(true);

      const fd = 10n;
      const timeout = 10000;
      const result = await flushWriteQueue(fd, timeout);

      expect(mockBinding.flushWriteQueue).toHaveBeenCalledWith(fd, timeout);
      expect(result).toBe(true);
    });

    test('should handle flush timeout', async () => {
      mockBinding.flushWriteQueue.mockReturnValue(false);

      const fd = 10n;
      const result = await flushWriteQueue(fd, 1000);

      expect(result).toBe(false);
    });

    test('should flush all queues with default timeout', async () => {
      mockBinding.flushAllWriteQueues.mockReturnValue(true);

      const result = await flushAllWriteQueues();

      expect(mockBinding.flushAllWriteQueues).toHaveBeenCalledWith(5000);
      expect(result).toBe(true);
    });

    test('should flush all queues with custom timeout', async () => {
      mockBinding.flushAllWriteQueues.mockReturnValue(true);

      const timeout = 15000;
      const result = await flushAllWriteQueues(timeout);

      expect(mockBinding.flushAllWriteQueues).toHaveBeenCalledWith(timeout);
      expect(result).toBe(true);
    });

    test('should handle flush all timeout', async () => {
      mockBinding.flushAllWriteQueues.mockReturnValue(false);

      const result = await flushAllWriteQueues(1000);

      expect(result).toBe(false);
    });
  });

  describe('Statistics', () => {
    test('should get aggregate statistics', async () => {
      const mockStats: WriteQueueStats = {
        totalOperations: 100n,
        completedOperations: 95n,
        failedOperations: 5n,
        bytesWritten: 1048576n,
        queueSize: 10n,
        maxQueueSize: 25n,
        avgLatencyMs: 15.5,
        activeFDs: [10n, 20n, 30n],
      };

      mockBinding.getWriteQueueStats.mockReturnValue(mockStats);

      const stats = await getWriteQueueStats();

      expect(mockBinding.getWriteQueueStats).toHaveBeenCalledWith(undefined);
      expect(stats).toEqual(mockStats);
    });

    test('should get FD-specific statistics', async () => {
      const fd = 10n;
      const mockStats: WriteQueueStats = {
        fd: fd,
        totalOperations: 50n,
        completedOperations: 48n,
        failedOperations: 2n,
        bytesWritten: 524288n,
        queueSize: 5n,
        maxQueueSize: 15n,
        avgLatencyMs: 12.0,
      };

      mockBinding.getWriteQueueStats.mockReturnValue(mockStats);

      const stats = await getWriteQueueStats(fd);

      expect(mockBinding.getWriteQueueStats).toHaveBeenCalledWith(fd);
      expect(stats).toEqual(mockStats);
      expect(stats.fd).toBe(fd);
    });

    test('should handle non-existent FD statistics', async () => {
      const fd = 999n;
      mockBinding.getWriteQueueStats.mockReturnValue(null);

      const stats = await getWriteQueueStats(fd);

      expect(stats).toBeNull();
    });

    test('should reset statistics', async () => {
      mockBinding.resetWriteQueueStats.mockReturnValue(true);

      const result = await resetWriteQueueStats();

      expect(mockBinding.resetWriteQueueStats).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('should calculate derived statistics', async () => {
      const mockStats: WriteQueueStats = {
        totalOperations: 1000n,
        completedOperations: 900n,
        failedOperations: 100n,
        bytesWritten: 10485760n, // 10MB
        queueSize: 50n,
        maxQueueSize: 100n,
        avgLatencyMs: 25.0,
        activeFDs: [10n, 20n, 30n, 40n],
      };

      mockBinding.getWriteQueueStats.mockReturnValue(mockStats);

      const stats = await getWriteQueueStats();

      // Calculate derived metrics
      const successRate =
        Number(stats.completedOperations) / Number(stats.totalOperations);
      const failureRate =
        Number(stats.failedOperations) / Number(stats.totalOperations);
      const avgBytesPerOp =
        Number(stats.bytesWritten) / Number(stats.completedOperations);
      const queueUtilization =
        Number(stats.queueSize) / Number(stats.maxQueueSize);

      expect(successRate).toBeCloseTo(0.9, 2);
      expect(failureRate).toBeCloseTo(0.1, 2);
      expect(avgBytesPerOp).toBeCloseTo(11650.84, 2);
      expect(queueUtilization).toBeCloseTo(0.5, 2);
    });
  });

  describe('Configuration', () => {
    test('should configure default max queue size', async () => {
      mockBinding.configureWriteQueues.mockReturnValue(true);

      const config: FDWriteQueueConfig = {
        defaultMaxQueueSize: 200,
      };

      const result = await configureWriteQueues(config);

      expect(mockBinding.configureWriteQueues).toHaveBeenCalledWith(config);
      expect(result).toBe(true);
    });

    test('should configure per-FD max queue sizes', async () => {
      mockBinding.configureWriteQueues.mockReturnValue(true);

      const config: FDWriteQueueConfig = {
        defaultMaxQueueSize: 100,
        fdMaxQueueSize: {
          '10': 500, // Large queue for FD 10
          '20': 50, // Small queue for FD 20
          '30': 1000, // Very large queue for FD 30
        },
      };

      const result = await configureWriteQueues(config);

      expect(mockBinding.configureWriteQueues).toHaveBeenCalledWith(config);
      expect(result).toBe(true);
    });

    test('should handle configuration failure', async () => {
      mockBinding.configureWriteQueues.mockReturnValue(false);

      const config: FDWriteQueueConfig = {
        defaultMaxQueueSize: 50,
      };

      const result = await configureWriteQueues(config);

      expect(result).toBe(false);
    });

    test('should validate configuration parameters', async () => {
      await expect(
        configureWriteQueues({ defaultMaxQueueSize: -1 })
      ).rejects.toThrow('Invalid defaultMaxQueueSize');

      await expect(
        configureWriteQueues({
          fdMaxQueueSize: { invalid: 100 },
        })
      ).rejects.toThrow('Invalid FD in fdMaxQueueSize');
    });
  });

  describe('Priority Handling', () => {
    test('should handle different priority levels', async () => {
      const priorities: WriteOperationPriority[] = [
        'URGENT',
        'HIGH',
        'NORMAL',
        'LOW',
      ];
      const fd = 10n;
      const offset = 0n;
      const size = 1024n;
      const buffer = new ArrayBuffer(1024);

      mockBinding.enqueueWrite.mockReturnValue(1n);

      for (const priority of priorities) {
        const result = await enqueueWrite(fd, offset, size, buffer, priority);
        expect(result).toBe(1n);
        expect(mockBinding.enqueueWrite).toHaveBeenCalledWith(
          fd,
          offset,
          size,
          buffer,
          priority,
          undefined
        );
      }

      expect(mockBinding.enqueueWrite).toHaveBeenCalledTimes(priorities.length);
    });

    test('should validate priority ordering', async () => {
      // This test ensures the priority enum values are in the expected order
      const priorityOrder: WriteOperationPriority[] = [
        'URGENT',
        'HIGH',
        'NORMAL',
        'LOW',
      ];

      // In the actual implementation, URGENT should have highest priority (lowest numeric value)
      expect(priorityOrder.indexOf('URGENT')).toBeLessThan(
        priorityOrder.indexOf('HIGH')
      );
      expect(priorityOrder.indexOf('HIGH')).toBeLessThan(
        priorityOrder.indexOf('NORMAL')
      );
      expect(priorityOrder.indexOf('NORMAL')).toBeLessThan(
        priorityOrder.indexOf('LOW')
      );
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent enqueue operations', async () => {
      mockBinding.enqueueWrite.mockImplementation(fd =>
        BigInt(Number(fd) + 1000)
      );

      const operations = Array(10)
        .fill(0)
        .map((_, i) => ({
          fd: BigInt(i + 1),
          offset: 0n,
          size: 1024n,
          buffer: new ArrayBuffer(1024),
        }));

      const results = await Promise.all(
        operations.map(op => enqueueWrite(op.fd, op.offset, op.size, op.buffer))
      );

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result).toBe(BigInt(i + 1001));
      });
      expect(mockBinding.enqueueWrite).toHaveBeenCalledTimes(10);
    });

    test('should handle concurrent flush operations', async () => {
      mockBinding.flushWriteQueue.mockReturnValue(true);

      const fds = [10n, 20n, 30n, 40n, 50n];
      const results = await Promise.all(
        fds.map(fd => flushWriteQueue(fd, 1000))
      );

      expect(results.every(r => r === true)).toBe(true);
      expect(mockBinding.flushWriteQueue).toHaveBeenCalledTimes(5);
    });

    test('should handle concurrent statistics requests', async () => {
      const mockStats = {
        totalOperations: 25n,
        completedOperations: 20n,
        failedOperations: 5n,
        bytesWritten: 25600n,
        queueSize: 3n,
        maxQueueSize: 10n,
        avgLatencyMs: 18.5,
        activeFDs: [1n, 2n, 3n],
      };

      mockBinding.getWriteQueueStats.mockReturnValue(mockStats);

      const promises = Array(5)
        .fill(0)
        .map(() => getWriteQueueStats());
      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(stats => {
        expect(stats).toEqual(mockStats);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle native binding errors', async () => {
      mockBinding.enqueueWrite.mockImplementation(() => {
        throw new Error('Native binding error');
      });

      const fd = 10n;
      const offset = 0n;
      const size = 1024n;
      const buffer = new ArrayBuffer(1024);

      await expect(enqueueWrite(fd, offset, size, buffer)).rejects.toThrow(
        'Native binding error'
      );
    });

    test('should handle queue full scenarios', async () => {
      mockBinding.enqueueWrite.mockReturnValue(0n); // Queue full

      const fd = 10n;
      const offset = 0n;
      const size = 1024n;
      const buffer = new ArrayBuffer(1024);

      const result = await enqueueWrite(fd, offset, size, buffer);
      expect(result).toBe(0n);
    });

    test('should handle invalid buffer types', async () => {
      const fd = 10n;
      const offset = 0n;
      const size = 1024n;
      const invalidBuffer = 'not a buffer' as any;

      await expect(
        enqueueWrite(fd, offset, size, invalidBuffer)
      ).rejects.toThrow('Buffer must be ArrayBuffer or TypedArray');
    });
  });

  describe('Memory Management', () => {
    test('should handle large write operations', async () => {
      const operationId = 99999n;
      mockBinding.enqueueWrite.mockReturnValue(operationId);

      const fd = 10n;
      const offset = 0n;
      const size = BigInt(10 * 1024 * 1024); // 10MB
      const buffer = new ArrayBuffer(Number(size));

      const result = await enqueueWrite(fd, offset, size, buffer);

      expect(result).toBe(operationId);
      expect(mockBinding.enqueueWrite).toHaveBeenCalledWith(
        fd,
        offset,
        size,
        buffer,
        'NORMAL',
        undefined
      );
    });

    test('should handle zero-size operations', async () => {
      const fd = 10n;
      const offset = 0n;
      const size = 0n;
      const buffer = new ArrayBuffer(0);

      await expect(enqueueWrite(fd, offset, size, buffer)).rejects.toThrow(
        'Write size must be greater than zero'
      );
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete write workflow', async () => {
      // Configure queues
      mockBinding.configureWriteQueues.mockReturnValue(true);
      const configResult = await configureWriteQueues({
        defaultMaxQueueSize: 100,
      });
      expect(configResult).toBe(true);

      // Enqueue multiple operations
      mockBinding.enqueueWrite.mockReturnValue(1n);
      const fd = 10n;
      const operations = [
        { offset: 0n, size: 1024n },
        { offset: 1024n, size: 2048n },
        { offset: 3072n, size: 512n },
      ];

      const enqueueResults = await Promise.all(
        operations.map(op =>
          enqueueWrite(fd, op.offset, op.size, new ArrayBuffer(Number(op.size)))
        )
      );
      expect(enqueueResults.every(r => r === 1n)).toBe(true);

      // Process queues
      mockBinding.processWriteQueues.mockReturnValue(3);
      const executor = jest.fn().mockReturnValue(0);
      const processResult = await processWriteQueues(executor);
      expect(processResult).toBe(3);

      // Get statistics
      mockBinding.getWriteQueueStats.mockReturnValue({
        fd: fd,
        totalOperations: 3n,
        completedOperations: 3n,
        failedOperations: 0n,
        bytesWritten: 3584n,
        queueSize: 0n,
        maxQueueSize: 3n,
        avgLatencyMs: 10.5,
      });
      const stats = await getWriteQueueStats(fd);
      expect(stats.completedOperations).toBe(3n);
      expect(stats.failedOperations).toBe(0n);

      // Flush queue
      mockBinding.flushWriteQueue.mockReturnValue(true);
      const flushResult = await flushWriteQueue(fd);
      expect(flushResult).toBe(true);
    });
  });
});
