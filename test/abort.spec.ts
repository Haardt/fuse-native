/**
 * @file abort.spec.ts
 * @brief Tests for AbortSignal and timeout functionality
 */

import {
  AbortError,
  TimeoutError,
  createTimeoutSignal,
  combineAbortSignals,
  createEffectiveSignal,
  throwIfAborted,
  withAbort,
  abortPromise,
  raceWithAbort,
  validateAbortOptions,
  createAbortOptions,
  type AbortOptions,
} from '../ts/abort.js';

describe('AbortSignal and Timeout Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AbortError', () => {
    it('should create AbortError with default message', () => {
      const error = new AbortError();
      expect(error.name).toBe('AbortError');
      expect(error.code).toBe('ABORT_ERR');
      expect(error.message).toBe('Operation was aborted');
      expect(error).toBeInstanceOf(Error);
    });

    it('should create AbortError with custom message', () => {
      const error = new AbortError('Custom abort message');
      expect(error.name).toBe('AbortError');
      expect(error.code).toBe('ABORT_ERR');
      expect(error.message).toBe('Custom abort message');
    });
  });

  describe('TimeoutError', () => {
    it('should create TimeoutError with timeout value', () => {
      const error = new TimeoutError(5000);
      expect(error.name).toBe('TimeoutError');
      expect(error.code).toBe('TIMEOUT_ERR');
      expect(error.message).toBe('Operation timed out after 5000ms');
      expect(error).toBeInstanceOf(AbortError);
    });
  });

  describe('createTimeoutSignal', () => {
    it('should create signal that aborts after timeout', async () => {
      const signal = createTimeoutSignal(50);
      expect(signal.aborted).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBeInstanceOf(TimeoutError);
      expect((signal.reason as TimeoutError).message).toContain('50ms');
    });

    it('should clean up timeout when signal aborts', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const signal = createTimeoutSignal(100);

      // Wait for timeout to trigger
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('combineAbortSignals', () => {
    it('should return never-aborting signal for empty array', () => {
      const signal = combineAbortSignals();
      expect(signal.aborted).toBe(false);
    });

    it('should return single signal unchanged', () => {
      const controller = new AbortController();
      const signal = combineAbortSignals(controller.signal);
      expect(signal).toBe(controller.signal);
    });

    it('should return aborted signal if any input is aborted', () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      controller1.abort(new Error('First abort'));

      const signal = combineAbortSignals(
        controller1.signal,
        controller2.signal
      );
      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBeInstanceOf(Error);
      expect((signal.reason as Error).message).toBe('First abort');
    });

    it('should abort when any input signal aborts', async () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const signal = combineAbortSignals(
        controller1.signal,
        controller2.signal
      );
      expect(signal.aborted).toBe(false);

      controller2.abort(new Error('Second abort'));

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBeInstanceOf(Error);
      expect((signal.reason as Error).message).toBe('Second abort');
    });

    it('should filter out undefined signals', () => {
      const controller = new AbortController();
      const signal = combineAbortSignals(
        undefined,
        controller.signal,
        undefined
      );
      expect(signal).toBe(controller.signal);
    });
  });

  describe('createEffectiveSignal', () => {
    it('should return never-aborting signal for no options', () => {
      const signal = createEffectiveSignal();
      expect(signal.aborted).toBe(false);
    });

    it('should return user signal when no timeout', () => {
      const controller = new AbortController();
      const signal = createEffectiveSignal({ signal: controller.signal });
      expect(signal).toBe(controller.signal);
    });

    it('should combine user signal with timeout signal', async () => {
      const controller = new AbortController();
      const signal = createEffectiveSignal({
        signal: controller.signal,
        timeout: 50,
      });

      expect(signal.aborted).toBe(false);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBeInstanceOf(TimeoutError);
    });

    it('should ignore non-positive timeout', () => {
      const signal1 = createEffectiveSignal({ timeout: 0 });
      const signal2 = createEffectiveSignal({ timeout: -100 });

      expect(signal1.aborted).toBe(false);
      expect(signal2.aborted).toBe(false);
    });
  });

  describe('throwIfAborted', () => {
    it('should not throw for non-aborted signal', () => {
      const signal = new AbortController().signal;
      expect(() => throwIfAborted(signal)).not.toThrow();
    });

    it('should throw AbortError for aborted signal without reason', () => {
      const controller = new AbortController();
      controller.abort();

      expect(() => throwIfAborted(controller.signal)).toThrow(AbortError);
      expect(() => throwIfAborted(controller.signal)).toThrow(
        'This operation was aborted'
      );
    });

    it('should throw original error for aborted signal with error reason', () => {
      const controller = new AbortController();
      const originalError = new Error('Custom error');
      controller.abort(originalError);

      expect(() => throwIfAborted(controller.signal)).toThrow(originalError);
    });

    it('should throw AbortError with string reason', () => {
      const controller = new AbortController();
      controller.abort('String reason');

      expect(() => throwIfAborted(controller.signal)).toThrow(AbortError);
      expect(() => throwIfAborted(controller.signal)).toThrow('String reason');
    });
  });

  describe('withAbort', () => {
    it('should resolve normally when signal is not aborted', async () => {
      const signal = new AbortController().signal;
      const promise = Promise.resolve('success');

      const result = await withAbort(promise, signal);
      expect(result).toBe('success');
    });

    it('should reject with AbortError when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const promise = Promise.resolve('success');

      try {
        await withAbort(promise, controller.signal);
        fail('Expected AbortError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AbortError);
      }
    });

    it('should reject when signal aborts during promise execution', async () => {
      const controller = new AbortController();
      const promise = new Promise(resolve =>
        setTimeout(() => resolve('success'), 100)
      );

      const abortablePromise = withAbort(promise, controller.signal);

      // Abort after 50ms
      setTimeout(
        () => controller.abort(new Error('Aborted during execution')),
        50
      );

      await expect(abortablePromise).rejects.toThrow(
        'Aborted during execution'
      );
    });

    it('should clean up abort listener on successful resolution', async () => {
      const controller = new AbortController();
      const removeEventListenerSpy = jest.spyOn(
        controller.signal,
        'removeEventListener'
      );
      const promise = Promise.resolve('success');

      await withAbort(promise, controller.signal);

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'abort',
        expect.any(Function)
      );
      removeEventListenerSpy.mockRestore();
    });

    it('should clean up abort listener on promise rejection', async () => {
      const controller = new AbortController();
      const removeEventListenerSpy = jest.spyOn(
        controller.signal,
        'removeEventListener'
      );
      const promise = Promise.reject(new Error('Promise error'));

      await expect(withAbort(promise, controller.signal)).rejects.toThrow(
        'Promise error'
      );

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'abort',
        expect.any(Function)
      );
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('abortPromise', () => {
    it('should reject immediately for already aborted signal', async () => {
      const controller = new AbortController();
      controller.abort(new Error('Already aborted'));

      await expect(abortPromise(controller.signal)).rejects.toThrow(
        'Already aborted'
      );
    });

    it('should reject when signal aborts later', async () => {
      const controller = new AbortController();
      const promise = abortPromise(controller.signal);

      setTimeout(() => controller.abort(new Error('Aborted later')), 50);

      await expect(promise).rejects.toThrow('Aborted later');
    });
  });

  describe('raceWithAbort', () => {
    it('should resolve with promise result when promise wins', async () => {
      const controller = new AbortController();
      const promise = Promise.resolve('success');

      const result = await raceWithAbort(promise, controller.signal);
      expect(result).toBe('success');
    });

    it('should reject with abort error when signal wins', async () => {
      const controller = new AbortController();
      const promise = new Promise(resolve =>
        setTimeout(() => resolve('success'), 100)
      );

      setTimeout(() => controller.abort(new Error('Aborted first')), 50);

      await expect(raceWithAbort(promise, controller.signal)).rejects.toThrow(
        'Aborted first'
      );
    });
  });

  describe('validateAbortOptions', () => {
    it('should not throw for valid options', () => {
      expect(() => validateAbortOptions()).not.toThrow();
      expect(() => validateAbortOptions({})).not.toThrow();
      expect(() =>
        validateAbortOptions({
          signal: new AbortController().signal,
          timeout: 5000,
        })
      ).not.toThrow();
    });

    it('should throw for invalid signal', () => {
      expect(() =>
        validateAbortOptions({
          signal: 'not-a-signal' as any,
        })
      ).toThrow(TypeError);
      expect(() =>
        validateAbortOptions({
          signal: 'not-a-signal' as any,
        })
      ).toThrow('options.signal must be an AbortSignal');
    });

    it('should throw for invalid timeout type', () => {
      expect(() =>
        validateAbortOptions({
          timeout: 'not-a-number' as any,
        })
      ).toThrow(TypeError);
      expect(() =>
        validateAbortOptions({
          timeout: 'not-a-number' as any,
        })
      ).toThrow('options.timeout must be a number');
    });

    it('should throw for negative timeout', () => {
      expect(() =>
        validateAbortOptions({
          timeout: -100,
        })
      ).toThrow(RangeError);
      expect(() =>
        validateAbortOptions({
          timeout: -100,
        })
      ).toThrow('options.timeout must be non-negative');
    });

    it('should throw for non-finite timeout', () => {
      expect(() =>
        validateAbortOptions({
          timeout: Infinity,
        })
      ).toThrow(RangeError);
      expect(() =>
        validateAbortOptions({
          timeout: NaN,
        })
      ).toThrow(RangeError);
    });
  });

  describe('createAbortOptions', () => {
    it('should create empty options for no parameters', () => {
      const options = createAbortOptions();
      expect(options).toEqual({});
    });

    it('should create options with signal', () => {
      const signal = new AbortController().signal;
      const options = createAbortOptions(signal);
      expect(options).toEqual({ signal });
    });

    it('should create options with timeout', () => {
      const options = createAbortOptions(undefined, 5000);
      expect(options).toEqual({ timeout: 5000 });
    });

    it('should create options with both signal and timeout', () => {
      const signal = new AbortController().signal;
      const options = createAbortOptions(signal, 5000);
      expect(options).toEqual({ signal, timeout: 5000 });
    });

    it('should validate options during creation', () => {
      expect(() => createAbortOptions(undefined, -100)).toThrow(RangeError);
      expect(() => createAbortOptions('invalid' as any)).toThrow(TypeError);
    });
  });
});

// Mock the binding at the top level
const mockBinding = {
  copyFileRange: jest.fn(),
  getxattr: jest.fn(),
  setxattr: jest.fn(),
  listxattr: jest.fn(),
  removexattr: jest.fn(),
};

jest.mock('../build/Release/fuse-native.node', () => mockBinding);
jest.mock('../prebuilds/linux-x64/@cocalc+fuse-native.node', () => mockBinding);

// Import synchronously after mocking
import * as fuseNative from '../ts/index.js';

// Integration tests with FUSE operations
describe('AbortSignal Integration', () => {
  describe('copyFileRange with AbortSignal', () => {
    beforeEach(() => {
      mockBinding.copyFileRange.mockReset();
    });

    it('should support timeout cancellation', async () => {
      mockBinding.copyFileRange.mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve(1024n), 200));
      });

      const promise = fuseNative.copyFileRange(1, 0n, 2, 0n, 1024n, 0, {
        timeout: 100,
      });

      await expect(promise).rejects.toThrow(TimeoutError);
      await expect(promise).rejects.toThrow('100ms');
    });

    it('should support manual abort', async () => {
      mockBinding.copyFileRange.mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve(1024n), 200));
      });

      const controller = new AbortController();
      const promise = fuseNative.copyFileRange(1, 0n, 2, 0n, 1024n, 0, {
        signal: controller.signal,
      });

      setTimeout(() => controller.abort(new Error('Manual abort')), 50);

      await expect(promise).rejects.toThrow('Manual abort');
    });

    it('should complete normally if not aborted', async () => {
      mockBinding.copyFileRange.mockResolvedValue(1024n);

      const result = await fuseNative.copyFileRange(1, 0n, 2, 0n, 1024n, 0, {
        timeout: 5000,
      });

      expect(result).toBe(1024n);
    });
  });

  describe('xattr operations with AbortSignal', () => {
    beforeEach(() => {
      mockBinding.getxattr.mockReset();
      mockBinding.setxattr.mockReset();
      mockBinding.listxattr.mockReset();
      mockBinding.removexattr.mockReset();
    });

    it('should abort getxattr operation', async () => {
      mockBinding.getxattr.mockImplementation(() => {
        return new Promise(resolve =>
          setTimeout(
            () => resolve({ size: 100n, data: Buffer.alloc(100) }),
            200
          )
        );
      });

      const controller = new AbortController();
      const promise = fuseNative.getxattr('/test', 'user.test', 100n, {
        signal: controller.signal,
      });

      setTimeout(() => controller.abort(), 50);

      await expect(promise).rejects.toThrow(AbortError);
    });

    it('should timeout setxattr operation', async () => {
      mockBinding.setxattr.mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve(0n), 200));
      });

      const promise = fuseNative.setxattr(
        '/test',
        'user.test',
        Buffer.from('value'),
        0,
        {
          timeout: 100,
        }
      );

      await expect(promise).rejects.toThrow(TimeoutError);
    });

    it('should abort listxattr operation', async () => {
      mockBinding.listxattr.mockImplementation(() => {
        return new Promise(resolve =>
          setTimeout(() => resolve({ size: 50n, names: ['user.test'] }), 200)
        );
      });

      const controller = new AbortController();
      const promise = fuseNative.listxattr('/test', 100n, {
        signal: controller.signal,
      });

      setTimeout(() => controller.abort(new Error('List aborted')), 50);

      await expect(promise).rejects.toThrow('List aborted');
    });

    it('should timeout removexattr operation', async () => {
      mockBinding.removexattr.mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve(0n), 200));
      });

      const promise = fuseNative.removexattr('/test', 'user.test', {
        timeout: 100,
      });

      await expect(promise).rejects.toThrow(TimeoutError);
    });
  });
});
