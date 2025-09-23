import { jest } from '@jest/globals';
import type {
  ShutdownState,
  ShutdownStats,
  ShutdownTimeouts,
  ShutdownCallback,
} from '../ts/types.js';

// Mock the native binding
const mockBinding = {
  initializeShutdownManager: jest.fn(),
  initiateGracefulShutdown: jest.fn(),
  forceImmediateShutdown: jest.fn(),
  getShutdownState: jest.fn(),
  getShutdownStats: jest.fn(),
  registerShutdownCallback: jest.fn(),
  waitForShutdownCompletion: jest.fn(),
  configureShutdownTimeouts: jest.fn(),
};

jest.mock('../build/Release/fuse-native.node', () => mockBinding);
jest.mock('../prebuilds/linux-x64/@cocalc+fuse-native.node', () => mockBinding);

// Import after mocking
import {
  initializeShutdownManager,
  initiateGracefulShutdown,
  forceImmediateShutdown,
  getShutdownState,
  getShutdownStats,
  registerShutdownCallback,
  waitForShutdownCompletion,
  configureShutdownTimeouts,
} from '../ts/index.js';

describe('Shutdown Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize shutdown manager', async () => {
      mockBinding.initializeShutdownManager.mockReturnValue(true);

      const result = initializeShutdownManager();

      await expect(result).resolves.toBe(true);
      expect(mockBinding.initializeShutdownManager).toHaveBeenCalled();
    });

    test('should handle initialization failure', async () => {
      mockBinding.initializeShutdownManager.mockReturnValue(false);

      const result = initializeShutdownManager();

      await expect(result).resolves.toBe(false);
    });

    test('should prevent double initialization', async () => {
      mockBinding.initializeShutdownManager
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const result1 = initializeShutdownManager();
      const result2 = initializeShutdownManager();

      await expect(result1).resolves.toBe(true);
      await expect(result2).resolves.toBe(false);
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      mockBinding.initializeShutdownManager.mockReturnValue(true);
    });

    test('should get initial shutdown state', async () => {
      mockBinding.getShutdownState.mockReturnValue(0); // RUNNING

      const state = getShutdownState();

      await expect(state).resolves.toBe('RUNNING');
      expect(mockBinding.getShutdownState).toHaveBeenCalled();
    });

    test('should track state transitions', async () => {
      const states = [
        { value: 0, name: 'RUNNING' as ShutdownState },
        { value: 1, name: 'DRAINING' as ShutdownState },
        { value: 2, name: 'UNMOUNTING' as ShutdownState },
        { value: 3, name: 'CLOSED' as ShutdownState },
      ];

      for (const state of states) {
        mockBinding.getShutdownState.mockReturnValue(state.value);
        const result = getShutdownState();
        await expect(result).resolves.toBe(state.name);
      }
    });

    test('should handle invalid state values', async () => {
      mockBinding.getShutdownState.mockReturnValue(999);

      const state = getShutdownState();

      await expect(state).resolves.toBe('RUNNING'); // Default fallback
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(() => {
      mockBinding.initializeShutdownManager.mockReturnValue(true);
    });

    test('should initiate graceful shutdown with default parameters', async () => {
      mockBinding.initiateGracefulShutdown.mockReturnValue(true);

      const result = initiateGracefulShutdown();

      await expect(result).resolves.toBe(true);
      expect(mockBinding.initiateGracefulShutdown).toHaveBeenCalledWith(
        'Manual shutdown',
        15000
      );
    });

    test('should initiate graceful shutdown with custom reason', async () => {
      mockBinding.initiateGracefulShutdown.mockReturnValue(true);

      const reason = 'Application exit';
      const result = initiateGracefulShutdown(reason);

      await expect(result).resolves.toBe(true);
      expect(mockBinding.initiateGracefulShutdown).toHaveBeenCalledWith(
        reason,
        15000
      );
    });

    test('should initiate graceful shutdown with custom timeout', async () => {
      mockBinding.initiateGracefulShutdown.mockReturnValue(true);

      const reason = 'Test shutdown';
      const timeout = 30000;
      const result = initiateGracefulShutdown(reason, timeout);

      await expect(result).resolves.toBe(true);
      expect(mockBinding.initiateGracefulShutdown).toHaveBeenCalledWith(
        reason,
        timeout
      );
    });

    test('should handle graceful shutdown failure', async () => {
      mockBinding.initiateGracefulShutdown.mockReturnValue(false);

      const result = initiateGracefulShutdown();

      await expect(result).resolves.toBe(false);
    });

    test('should prevent duplicate shutdown initiation', async () => {
      mockBinding.initiateGracefulShutdown
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const result1 = initiateGracefulShutdown('First attempt');
      const result2 = initiateGracefulShutdown('Second attempt');

      await expect(result1).resolves.toBe(true);
      await expect(result2).resolves.toBe(false);
    });
  });

  describe('Force Shutdown', () => {
    beforeEach(() => {
      mockBinding.initializeShutdownManager.mockReturnValue(true);
    });

    test('should force immediate shutdown with default reason', async () => {
      mockBinding.forceImmediateShutdown.mockReturnValue(true);

      const result = forceImmediateShutdown();

      await expect(result).resolves.toBe(true);
      expect(mockBinding.forceImmediateShutdown).toHaveBeenCalledWith(
        'Forced shutdown'
      );
    });

    test('should force immediate shutdown with custom reason', async () => {
      mockBinding.forceImmediateShutdown.mockReturnValue(true);

      const reason = 'Emergency stop';
      const result = forceImmediateShutdown(reason);

      await expect(result).resolves.toBe(true);
      expect(mockBinding.forceImmediateShutdown).toHaveBeenCalledWith(reason);
    });

    test('should always succeed for force shutdown', async () => {
      mockBinding.forceImmediateShutdown.mockReturnValue(true);

      const result = forceImmediateShutdown('Critical error');

      await expect(result).resolves.toBe(true);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      mockBinding.initializeShutdownManager.mockReturnValue(true);
    });

    test('should get shutdown statistics', async () => {
      const mockStats: ShutdownStats = {
        finalState: 'CLOSED',
        gracefulCompletion: true,
        failureReason: '',
        phaseDurations: [
          { state: 'DRAINING', durationMs: 2500 },
          { state: 'UNMOUNTING', durationMs: 3000 },
        ],
        totalDurationMs: 5500,
      };

      mockBinding.getShutdownStats.mockReturnValue(mockStats);

      const stats = getShutdownStats();

      await expect(stats).resolves.toEqual(mockStats);
      expect(mockBinding.getShutdownStats).toHaveBeenCalled();
    });

    test('should handle statistics for failed shutdown', async () => {
      const mockStats: ShutdownStats = {
        finalState: 'UNMOUNTING',
        gracefulCompletion: false,
        failureReason: 'Phase UNMOUNTING failed or timed out',
        phaseDurations: [{ state: 'DRAINING', durationMs: 5000 }],
        totalDurationMs: 8000,
      };

      mockBinding.getShutdownStats.mockReturnValue(mockStats);

      const stats = getShutdownStats();

      await expect(stats).resolves.toMatchObject({
        gracefulCompletion: false,
        failureReason: 'Phase UNMOUNTING failed or timed out',
      });
    });

    test('should handle statistics for force shutdown', async () => {
      const mockStats: ShutdownStats = {
        finalState: 'CLOSED',
        gracefulCompletion: false,
        failureReason: 'Force shutdown: Emergency',
        phaseDurations: [],
        totalDurationMs: 50,
      };

      mockBinding.getShutdownStats.mockReturnValue(mockStats);

      const stats = getShutdownStats();

      await expect(stats).resolves.toMatchObject({
        gracefulCompletion: false,
        failureReason: expect.stringContaining('Force shutdown'),
        phaseDurations: [],
      });
    });

    test('should calculate derived statistics', async () => {
      const mockStats: ShutdownStats = {
        finalState: 'CLOSED',
        gracefulCompletion: true,
        failureReason: '',
        phaseDurations: [
          { state: 'DRAINING', durationMs: 3000 },
          { state: 'UNMOUNTING', durationMs: 5000 },
        ],
        totalDurationMs: 8000,
      };

      mockBinding.getShutdownStats.mockReturnValue(mockStats);

      const stats = await getShutdownStats();

      // Calculate phase percentages
      const drainingPercent =
        (stats.phaseDurations[0].durationMs / stats.totalDurationMs!) * 100;
      const unmountingPercent =
        (stats.phaseDurations[1].durationMs / stats.totalDurationMs!) * 100;

      expect(drainingPercent).toBeCloseTo(37.5, 1);
      expect(unmountingPercent).toBeCloseTo(62.5, 1);
    });
  });

  describe('Callbacks', () => {
    beforeEach(() => {
      mockBinding.initializeShutdownManager.mockReturnValue(true);
    });

    test('should register shutdown callback', async () => {
      mockBinding.registerShutdownCallback.mockReturnValue(true);

      const callback: ShutdownCallback = {
        onShutdownBegin: jest.fn(),
        onShutdownPhase: jest.fn(),
        onShutdownComplete: jest.fn(),
        onShutdownFailed: jest.fn(),
      };

      const result = registerShutdownCallback(callback);

      await expect(result).resolves.toBe(true);
      expect(mockBinding.registerShutdownCallback).toHaveBeenCalledWith(
        callback
      );
    });

    test('should handle partial callback objects', async () => {
      mockBinding.registerShutdownCallback.mockReturnValue(true);

      const callback: Partial<ShutdownCallback> = {
        onShutdownComplete: jest.fn(),
      };

      const result = registerShutdownCallback(callback);

      await expect(result).resolves.toBe(true);
    });

    test('should validate callback object', async () => {
      await expect(registerShutdownCallback(null as any)).rejects.toThrow(
        'Callback must be an object'
      );

      await expect(registerShutdownCallback('invalid' as any)).rejects.toThrow(
        'Callback must be an object'
      );
    });

    test('should validate callback functions', async () => {
      const invalidCallback = {
        onShutdownBegin: 'not a function',
      };

      await expect(
        registerShutdownCallback(invalidCallback as any)
      ).rejects.toThrow('Callback methods must be functions');
    });
  });

  describe('Wait for Completion', () => {
    beforeEach(() => {
      mockBinding.initializeShutdownManager.mockReturnValue(true);
    });

    test('should wait for shutdown completion with default timeout', async () => {
      mockBinding.waitForShutdownCompletion.mockReturnValue(true);

      const result = waitForShutdownCompletion();

      await expect(result).resolves.toBe(true);
      expect(mockBinding.waitForShutdownCompletion).toHaveBeenCalledWith(30000);
    });

    test('should wait for shutdown completion with custom timeout', async () => {
      mockBinding.waitForShutdownCompletion.mockReturnValue(true);

      const timeout = 60000;
      const result = waitForShutdownCompletion(timeout);

      await expect(result).resolves.toBe(true);
      expect(mockBinding.waitForShutdownCompletion).toHaveBeenCalledWith(
        timeout
      );
    });

    test('should handle timeout waiting for completion', async () => {
      mockBinding.waitForShutdownCompletion.mockReturnValue(false);

      const result = waitForShutdownCompletion(5000);

      await expect(result).resolves.toBe(false);
    });

    test('should return immediately if already complete', async () => {
      mockBinding.getShutdownState.mockReturnValue(3); // CLOSED
      mockBinding.waitForShutdownCompletion.mockReturnValue(true);

      const result = waitForShutdownCompletion();

      await expect(result).resolves.toBe(true);
    });
  });

  describe('Configuration', () => {
    beforeEach(() => {
      mockBinding.initializeShutdownManager.mockReturnValue(true);
    });

    test('should configure shutdown timeouts', async () => {
      mockBinding.configureShutdownTimeouts.mockReturnValue(true);

      const timeouts: ShutdownTimeouts = {
        draining: 8000,
        unmounting: 12000,
      };

      const result = configureShutdownTimeouts(timeouts);

      await expect(result).resolves.toBe(true);
      expect(mockBinding.configureShutdownTimeouts).toHaveBeenCalledWith(
        timeouts
      );
    });

    test('should configure partial timeouts', async () => {
      mockBinding.configureShutdownTimeouts.mockReturnValue(true);

      const timeouts: Partial<ShutdownTimeouts> = {
        draining: 10000,
      };

      const result = configureShutdownTimeouts(timeouts);

      await expect(result).resolves.toBe(true);
    });

    test('should validate timeout values', async () => {
      await expect(configureShutdownTimeouts({ draining: -1 })).rejects.toThrow(
        'Invalid timeout value'
      );

      await expect(
        configureShutdownTimeouts({ unmounting: 0 })
      ).rejects.toThrow('Invalid timeout value');
    });

    test('should handle configuration failure', async () => {
      mockBinding.configureShutdownTimeouts.mockReturnValue(false);

      const timeouts: ShutdownTimeouts = {
        draining: 5000,
        unmounting: 8000,
      };

      const result = configureShutdownTimeouts(timeouts);

      await expect(result).resolves.toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle uninitialized shutdown manager', async () => {
      mockBinding.initiateGracefulShutdown.mockImplementation(() => {
        throw new Error('Shutdown manager not initialized');
      });

      await expect(initiateGracefulShutdown()).rejects.toThrow(
        'Shutdown manager not initialized'
      );
    });

    test('should handle native binding errors', async () => {
      mockBinding.getShutdownState.mockImplementation(() => {
        throw new Error('Native binding error');
      });

      await expect(getShutdownState()).rejects.toThrow('Native binding error');
    });

    test('should handle invalid arguments', async () => {
      await expect(initiateGracefulShutdown('', -1)).rejects.toThrow(
        'Invalid timeout'
      );
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete shutdown lifecycle', async () => {
      // Initialize
      mockBinding.initializeShutdownManager.mockReturnValue(true);
      const initResult = initializeShutdownManager();
      await expect(initResult).resolves.toBe(true);

      // Configure timeouts
      mockBinding.configureShutdownTimeouts.mockReturnValue(true);
      const configResult = configureShutdownTimeouts({
        draining: 5000,
        unmounting: 8000,
      });
      await expect(configResult).resolves.toBe(true);

      // Register callback
      mockBinding.registerShutdownCallback.mockReturnValue(true);
      const callback = {
        onShutdownBegin: jest.fn(),
        onShutdownComplete: jest.fn(),
      };
      const callbackResult = registerShutdownCallback(callback);
      await expect(callbackResult).resolves.toBe(true);

      // Initiate shutdown
      mockBinding.initiateGracefulShutdown.mockReturnValue(true);
      const shutdownResult = initiateGracefulShutdown('Test shutdown');
      await expect(shutdownResult).resolves.toBe(true);

      // Check final statistics
      mockBinding.getShutdownStats.mockReturnValue({
        finalState: 'CLOSED',
        gracefulCompletion: true,
        failureReason: '',
        phaseDurations: [
          { state: 'DRAINING', durationMs: 3000 },
          { state: 'UNMOUNTING', durationMs: 5000 },
        ],
        totalDurationMs: 8000,
      });

      const stats = getShutdownStats();
      await expect(stats).resolves.toMatchObject({
        gracefulCompletion: true,
        finalState: 'CLOSED',
      });
    });

    test('should handle shutdown failure scenario', async () => {
      // Initialize and start shutdown
      mockBinding.initializeShutdownManager.mockReturnValue(true);
      const initResult = initializeShutdownManager();
      await expect(initResult).resolves.toBe(true);

      mockBinding.initiateGracefulShutdown.mockReturnValue(true);
      const shutdownResult = initiateGracefulShutdown('Test failure');
      await expect(shutdownResult).resolves.toBe(true);

      // Force shutdown as fallback
      mockBinding.forceImmediateShutdown.mockReturnValue(true);
      const forceResult = forceImmediateShutdown('Timeout fallback');
      await expect(forceResult).resolves.toBe(true);

      // Check final statistics show failure
      mockBinding.getShutdownStats.mockReturnValue({
        finalState: 'CLOSED',
        gracefulCompletion: false,
        failureReason: 'Force shutdown: Timeout fallback',
        phaseDurations: [{ state: 'DRAINING', durationMs: 5000 }],
        totalDurationMs: 5050,
      });

      const stats = getShutdownStats();
      await expect(stats).resolves.toMatchObject({
        gracefulCompletion: false,
        failureReason: expect.stringContaining('Force shutdown'),
      });
    });
  });
});
