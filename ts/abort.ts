/**
 * @file abort.ts
 * @brief AbortSignal and timeout utilities for FUSE operations
 *
 * This module provides helpers for handling operation cancellation and timeouts
 * in FUSE operations using modern AbortSignal APIs.
 */

/**
 * Options interface for operations that support cancellation
 */
export interface AbortOptions {
  /** AbortSignal to cancel the operation */
  signal?: AbortSignal;
  /** Timeout in milliseconds to automatically cancel the operation */
  timeout?: number;
}

/**
 * Error thrown when an operation is aborted
 */
export class AbortError extends Error {
  public override readonly name: string = 'AbortError';
  public readonly code: string = 'ABORT_ERR';

  constructor(message = 'Operation was aborted') {
    super(message);
  }
}

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends AbortError {
  public override readonly name: string = 'TimeoutError';
  public override readonly code: string = 'TIMEOUT_ERR';

  constructor(timeout: number) {
    super(`Operation timed out after ${timeout}ms`);
  }
}

/**
 * Creates an AbortSignal that will be aborted after the specified timeout
 */
export function createTimeoutSignal(timeout: number): AbortSignal {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort(new TimeoutError(timeout));
  }, timeout);

  // Clean up timeout if signal is aborted from elsewhere
  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timeoutId);
    },
    { once: true }
  );

  return controller.signal;
}

/**
 * Combines multiple AbortSignals into one that will abort when any of them abort
 */
export function combineAbortSignals(
  ...signals: (AbortSignal | undefined)[]
): AbortSignal {
  const validSignals = signals.filter((s): s is AbortSignal => s !== undefined);

  if (validSignals.length === 0) {
    // Return a signal that never aborts
    return new AbortController().signal;
  }

  if (validSignals.length === 1) {
    return validSignals[0]!;
  }

  // Check if any signal is already aborted
  const abortedSignal = validSignals.find(s => s.aborted);
  if (abortedSignal) {
    const controller = new AbortController();
    controller.abort(abortedSignal.reason);
    return controller.signal;
  }

  const controller = new AbortController();

  const abortHandler = (event: Event) => {
    const target = event.target as AbortSignal;
    controller.abort(target.reason);
  };

  // Listen for abort on all signals
  validSignals.forEach(signal => {
    signal.addEventListener('abort', abortHandler, { once: true });
  });

  // Clean up listeners when combined signal is aborted
  controller.signal.addEventListener(
    'abort',
    () => {
      validSignals.forEach(signal => {
        signal.removeEventListener('abort', abortHandler);
      });
    },
    { once: true }
  );

  return controller.signal;
}

/**
 * Creates an effective AbortSignal from abort options
 * Combines user signal with timeout signal if specified
 */
export function createEffectiveSignal(options?: AbortOptions): AbortSignal {
  if (!options) {
    return new AbortController().signal;
  }

  const { signal, timeout } = options;
  const signals: (AbortSignal | undefined)[] = [signal];

  if (timeout !== undefined && timeout > 0) {
    signals.push(createTimeoutSignal(timeout));
  }

  return combineAbortSignals(...signals);
}

/**
 * Throws an appropriate error if the signal is aborted
 */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const reason = signal.reason;

    if (reason instanceof Error) {
      throw reason;
    }

    throw new AbortError(reason?.toString() || 'Operation was aborted');
  }
}

/**
 * Wraps a Promise to be cancellable with an AbortSignal
 */
export function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (!signal || signal.aborted) {
    throwIfAborted(signal);
  }

  return new Promise<T>((resolve, reject) => {
    // Check if already aborted
    if (signal.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new AbortError());
      return;
    }

    // Set up abort listener
    const abortHandler = () => {
      reject(signal.reason instanceof Error ? signal.reason : new AbortError());
    };

    signal.addEventListener('abort', abortHandler, { once: true });

    // Handle the actual promise
    promise
      .then(result => {
        signal.removeEventListener('abort', abortHandler);
        resolve(result);
      })
      .catch(error => {
        signal.removeEventListener('abort', abortHandler);
        reject(error);
      });
  });
}

/**
 * Creates a Promise that rejects when the signal is aborted
 */
export function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new AbortError());
      return;
    }

    signal.addEventListener(
      'abort',
      () => {
        reject(
          signal.reason instanceof Error ? signal.reason : new AbortError()
        );
      },
      { once: true }
    );
  });
}

/**
 * Utility to race a promise against an abort signal
 */
export async function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  return Promise.race([promise, abortPromise(signal)]);
}

/**
 * Validates abort options and throws if invalid
 */
export function validateAbortOptions(options?: AbortOptions): void {
  if (!options) {
    return;
  }

  const { signal, timeout } = options;

  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new TypeError('options.signal must be an AbortSignal');
  }

  if (timeout !== undefined) {
    if (typeof timeout !== 'number') {
      throw new TypeError('options.timeout must be a number');
    }
    if (timeout < 0) {
      throw new RangeError('options.timeout must be non-negative');
    }
    if (!Number.isFinite(timeout)) {
      throw new RangeError('options.timeout must be finite');
    }
  }
}

/**
 * Helper to create abort options with validation
 */
export function createAbortOptions(
  signal?: AbortSignal,
  timeout?: number
): AbortOptions {
  const options: AbortOptions = {};

  if (signal !== undefined) {
    options.signal = signal;
  }

  if (timeout !== undefined) {
    options.timeout = timeout;
  }

  validateAbortOptions(options);
  return options;
}
