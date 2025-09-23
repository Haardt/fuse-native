# Operation Cancellation and Timeout Handling

This document describes the comprehensive cancellation and timeout support in FUSE Native, including AbortSignal integration, timeout handling, and best practices for robust filesystem operations.

## Overview

FUSE Native provides modern cancellation capabilities through:
- **AbortSignal** support for manual cancellation
- **Automatic timeouts** for long-running operations
- **Combined cancellation** using both signals and timeouts
- **Proper cleanup** and resource management
- **Consistent error handling** with typed exceptions

## AbortOptions Interface

All async operations in FUSE Native accept an optional `AbortOptions` parameter:

```typescript
interface AbortOptions {
  /** AbortSignal to cancel the operation */
  signal?: AbortSignal;
  /** Timeout in milliseconds to automatically cancel the operation */
  timeout?: number;
}
```

## Basic Usage

### Manual Cancellation with AbortSignal

```typescript
import { copyFileRange, AbortError } from '@cocalc/fuse-native';

const controller = new AbortController();

// Start a file copy operation
const copyPromise = copyFileRange(1, 0n, 2, 0n, 1024n, 0, {
  signal: controller.signal
});

// Cancel the operation after 5 seconds
setTimeout(() => {
  controller.abort(new Error('User cancelled operation'));
}, 5000);

try {
  const result = await copyPromise;
  console.log('Copy completed:', result);
} catch (error) {
  if (error instanceof AbortError) {
    console.log('Operation was cancelled:', error.message);
  } else {
    console.error('Operation failed:', error);
  }
}
```

### Automatic Timeouts

```typescript
import { getxattr, TimeoutError } from '@cocalc/fuse-native';

try {
  const result = await getxattr('/slow/file', 'user.metadata', undefined, {
    timeout: 3000  // 3 second timeout
  });
  
  console.log('Attribute retrieved:', result);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Operation timed out after 3000ms');
  }
}
```

### Combined Signal and Timeout

```typescript
import { setxattr } from '@cocalc/fuse-native';

const controller = new AbortController();

// User can cancel, OR operation times out after 10 seconds
const promise = setxattr('/file', 'user.test', Buffer.from('data'), 0, {
  signal: controller.signal,
  timeout: 10000
});

// User decides to cancel
document.getElementById('cancel-btn').addEventListener('click', () => {
  controller.abort();
});

await promise;
```

## Error Types

### AbortError

Thrown when an operation is cancelled via AbortSignal:

```typescript
class AbortError extends Error {
  name: 'AbortError';
  code: 'ABORT_ERR';
  
  constructor(message = 'Operation was aborted');
}
```

### TimeoutError

Thrown when an operation exceeds the specified timeout:

```typescript
class TimeoutError extends AbortError {
  name: 'TimeoutError';
  code: 'TIMEOUT_ERR';
  
  constructor(timeout: number) {
    super(`Operation timed out after ${timeout}ms`);
  }
}
```

## Advanced Usage

### Creating Timeout Signals

```typescript
import { createTimeoutSignal } from '@cocalc/fuse-native';

// Create a signal that will abort after 5 seconds
const timeoutSignal = createTimeoutSignal(5000);

const result = await someOperation({
  signal: timeoutSignal
});
```

### Combining Multiple Signals

```typescript
import { combineAbortSignals } from '@cocalc/fuse-native';

const userController = new AbortController();
const timeoutSignal = createTimeoutSignal(10000);
const networkController = new AbortController();

// Combine multiple cancellation sources
const combinedSignal = combineAbortSignals(
  userController.signal,
  timeoutSignal,
  networkController.signal
);

const result = await complexOperation({
  signal: combinedSignal
});
```

### Wrapping Existing Promises

```typescript
import { withAbort } from '@cocalc/fuse-native';

const controller = new AbortController();

// Wrap any existing promise with abort support
const result = await withAbort(
  existingAsyncOperation(),
  controller.signal
);
```

### Racing with Abort

```typescript
import { raceWithAbort } from '@cocalc/fuse-native';

const controller = new AbortController();

// Race operation against abort signal
const result = await raceWithAbort(
  longRunningOperation(),
  controller.signal
);
```

## Validation and Best Practices

### Input Validation

```typescript
import { validateAbortOptions } from '@cocalc/fuse-native';

function myOperation(options?: AbortOptions) {
  // Validate options before use
  validateAbortOptions(options);
  
  // ... rest of implementation
}
```

### Creating Valid Options

```typescript
import { createAbortOptions } from '@cocalc/fuse-native';

// Helper to create validated options
const options = createAbortOptions(
  userController.signal,
  5000  // 5 second timeout
);
```

## Operation-Specific Examples

### File Operations

```typescript
import { copyFileRange } from '@cocalc/fuse-native';

// Large file copy with progress and cancellation
const controller = new AbortController();

try {
  const result = await copyFileRange(
    sourceFd, 0n,
    destFd, 0n,
    fileSizeBigInt,
    0,
    {
      signal: controller.signal,
      timeout: 60000  // 1 minute timeout for large files
    }
  );
  
  console.log(`Copied ${result} bytes`);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Large file copy timed out');
  } else if (error instanceof AbortError) {
    console.log('Copy was cancelled');
  }
}
```

### Extended Attributes

```typescript
import { getxattr, setxattr, listxattr, removexattr } from '@cocalc/fuse-native';

const controller = new AbortController();
const commonOptions = {
  signal: controller.signal,
  timeout: 2000
};

try {
  // Get attribute with cancellation support
  const value = await getxattr('/file', 'user.metadata', undefined, commonOptions);
  
  // Set new attribute
  await setxattr('/file', 'user.processed', Buffer.from('true'), 0, commonOptions);
  
  // List all attributes
  const attrs = await listxattr('/file', undefined, commonOptions);
  
  // Remove old attribute
  await removexattr('/file', 'user.temp', commonOptions);
  
} catch (error) {
  if (error instanceof AbortError) {
    console.log('Extended attribute operations cancelled');
  }
}
```

### Stats and Management Operations

```typescript
import { 
  getDispatcherStats,
  resetDispatcherStats,
  getShutdownState,
  getShutdownStats
} from '@cocalc/fuse-native';

const adminController = new AbortController();

// Admin operations with timeout
const adminOptions = {
  signal: adminController.signal,
  timeout: 5000
};

try {
  const stats = await getDispatcherStats(adminOptions);
  console.log('Current stats:', stats);
  
  const shutdownState = await getShutdownState(adminOptions);
  console.log('Shutdown state:', shutdownState);
  
  // Reset stats with confirmation
  if (confirm('Reset statistics?')) {
    await resetDispatcherStats(adminOptions);
  }
  
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Admin operation timed out');
  }
}
```

## Error Handling Patterns

### Comprehensive Error Handling

```typescript
import { AbortError, TimeoutError } from '@cocalc/fuse-native';

async function robustOperation(options?: AbortOptions) {
  try {
    const result = await someAsyncOperation(options);
    return result;
    
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.warn(`Operation timed out after ${error.message}`);
      // Maybe retry with longer timeout
      throw error;
      
    } else if (error instanceof AbortError) {
      console.info('Operation was cancelled by user');
      // Clean up resources
      throw error;
      
    } else {
      console.error('Unexpected error:', error);
      throw error;
    }
  }
}
```

### Retry with Exponential Backoff

```typescript
async function retryWithBackoff<T>(
  operation: (options?: AbortOptions) => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  signal?: AbortSignal
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const timeout = baseDelay * Math.pow(2, attempt);
      
      return await operation({
        signal,
        timeout
      });
      
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if cancelled or timed out
      if (error instanceof AbortError) {
        throw error;
      }
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}
```

## Performance Considerations

### Timeout Guidelines

- **Fast operations** (< 100ms expected): 1-5 second timeout
- **Medium operations** (100ms - 1s expected): 5-15 second timeout  
- **Slow operations** (1s+ expected): 30-60 second timeout
- **Background operations**: 300+ second timeout or no timeout

```typescript
// Example timeout strategies
const timeouts = {
  metadata: 2000,      // Quick metadata operations
  smallRead: 5000,     // Small file reads
  largeRead: 30000,    // Large file reads
  write: 15000,        // Write operations
  admin: 10000,        // Administrative operations
  background: 300000   // Background processing
};
```

### Resource Cleanup

```typescript
class FileOperationManager {
  private operations = new Set<AbortController>();
  
  async performOperation<T>(
    operation: (options: AbortOptions) => Promise<T>,
    timeout: number = 10000
  ): Promise<T> {
    const controller = new AbortController();
    this.operations.add(controller);
    
    try {
      return await operation({
        signal: controller.signal,
        timeout
      });
    } finally {
      this.operations.delete(controller);
    }
  }
  
  cancelAllOperations(): void {
    for (const controller of this.operations) {
      controller.abort(new Error('Manager shutdown'));
    }
    this.operations.clear();
  }
}
```

## Testing Patterns

### Testing Cancellation

```typescript
import { createTimeoutSignal } from '@cocalc/fuse-native';

describe('Operation Cancellation', () => {
  it('should cancel long running operation', async () => {
    const controller = new AbortController();
    
    const promise = longRunningOperation({
      signal: controller.signal
    });
    
    // Cancel after 100ms
    setTimeout(() => controller.abort(), 100);
    
    await expect(promise).rejects.toThrow(AbortError);
  });
  
  it('should timeout after specified duration', async () => {
    const promise = slowOperation({
      timeout: 100
    });
    
    await expect(promise).rejects.toThrow(TimeoutError);
    await expect(promise).rejects.toThrow('100ms');
  });
});
```

### Mock Testing with Delays

```typescript
// Mock long-running operations for testing
jest.mock('../build/Release/fuse-native.node', () => ({
  copyFileRange: jest.fn().mockImplementation(() => {
    return new Promise(resolve => setTimeout(() => resolve(1024n), 200));
  })
}));

it('should handle realistic operation timing', async () => {
  const start = Date.now();
  
  try {
    await copyFileRange(1, 0n, 2, 0n, 1024n, 0, {
      timeout: 100  // Shorter than mock delay
    });
  } catch (error) {
    expect(error).toBeInstanceOf(TimeoutError);
    expect(Date.now() - start).toBeGreaterThan(90);
    expect(Date.now() - start).toBeLessThan(150);
  }
});
```

## Summary

FUSE Native's cancellation and timeout system provides:

1. **Consistent API** - All async operations support `AbortOptions`
2. **Multiple cancellation sources** - User signals, timeouts, or combined
3. **Proper error types** - `AbortError` and `TimeoutError` for different scenarios
4. **Resource cleanup** - Automatic cleanup when operations are cancelled
5. **Testing support** - Easy to test cancellation scenarios

This ensures robust, user-friendly filesystem operations that can handle real-world scenarios like slow networks, unresponsive storage, and user interaction requirements.