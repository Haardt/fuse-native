# Mount Options, Capabilities & Init Bridge

This document describes the FUSE mount options, capabilities system, and init bridge functionality in the fuse-native binding.

## Overview

The init bridge handles the FUSE initialization callback, which is called when a filesystem is first mounted. During this callback, FUSE provides connection information and configuration details that can be used to optimize filesystem behavior.

## Init Bridge API

### Basic Usage

```typescript
import { 
  initializeInitBridge, 
  setInitCallback, 
  getConnectionInfo, 
  getFuseConfig 
} from '@cocalc/fuse-native';

// Initialize the init bridge
await initializeInitBridge();

// Set a callback to receive init information
await setInitCallback((connectionInfo, config) => {
  console.log('FUSE initialized with:', {
    maxWrite: connectionInfo.maxWrite,
    timeGranNs: connectionInfo.timeGranNs,
    capabilities: connectionInfo.caps,
    entryTimeout: config.entryTimeout
  });
});
```

### Connection Information

The `FuseConnectionInfo` interface provides details about the FUSE connection:

```typescript
interface FuseConnectionInfo {
  // Protocol version
  protoMajor: number;        // FUSE protocol major version
  protoMinor: number;        // FUSE protocol minor version
  
  // Capabilities
  capable: number;           // Available capabilities bitmask
  want: number;              // Requested capabilities bitmask
  caps: number[];            // Individual capability flags
  
  // Performance parameters
  maxWrite: number;          // Maximum write size (bytes)
  maxRead: number;           // Maximum read size (bytes)
  maxReadahead: number;      // Maximum readahead (bytes)
  maxBackground: number;     // Maximum background requests
  congestionThreshold: number; // Congestion threshold
  
  // Time precision
  timeGranNs: bigint;        // Time granularity in nanoseconds
}
```

### FUSE Configuration

The `FuseConfig` interface provides FUSE configuration options:

```typescript
interface FuseConfig {
  // User/Group settings
  setGid: number;            // Override GID flag
  gid: number;               // GID value
  setUid: number;            // Override UID flag
  uid: number;               // UID value
  setMode: number;           // Override mode flag
  umask: number;             // Umask value
  
  // Timeout settings
  entryTimeout: number;      // Directory entry cache timeout (seconds)
  negativeTimeout: number;   // Negative lookup cache timeout (seconds)
  attrTimeout: number;       // Attribute cache timeout (seconds)
  acAttrTimeout: number;     // Auto-cache attribute timeout (seconds)
  acAttrTimeoutSet: number;  // Auto-cache timeout set flag
  
  // Cache behavior
  useIno: number;            // Use inode numbers
  readdirIno: number;        // Include inodes in readdir
  directIo: number;          // Direct I/O flag
  kernelCache: number;       // Kernel cache flag
  autoCache: number;         // Auto cache flag
  nullpathOk: number;        // Null path operations allowed
  
  // Debug options
  showHelp: number;          // Show help flag
  debug: number;             // Debug flag
}
```

## Capabilities System

FUSE capabilities control which advanced features are available and enabled.

### Checking Capabilities

```typescript
import { checkCapabilities, getCapabilityNames } from '@cocalc/fuse-native';

// Check if specific capabilities are available
const hasAsyncRead = await checkCapabilities([1]); // FUSE_CAP_ASYNC_READ
const hasMultiple = await checkCapabilities([1, 2, 8]); // Multiple caps

// Get human-readable capability names
const capNames = getCapabilityNames();
console.log('Available capabilities:', capNames);
```

### Standard Capabilities

| Capability | Value | Description |
|------------|-------|-------------|
| ASYNC_READ | 1 | Asynchronous read requests |
| POSIX_LOCKS | 2 | POSIX file locking |
| ATOMIC_O_TRUNC | 8 | Atomic open with truncate |
| EXPORT_SUPPORT | 16 | NFS export support |
| DONT_MASK | 64 | Don't apply umask |
| SPLICE_WRITE | 128 | Splice for writing |
| SPLICE_MOVE | 256 | Splice for moving data |
| SPLICE_READ | 512 | Splice for reading |
| FLOCK_LOCKS | 1024 | BSD flock() locking |
| IOCTL_DIR | 2048 | ioctl on directories |
| AUTO_INVAL_DATA | 4096 | Automatic data invalidation |
| READDIRPLUS | 8192 | readdirplus support |
| READDIRPLUS_AUTO | 16384 | Automatic readdirplus |
| ASYNC_DIO | 32768 | Asynchronous direct I/O |
| WRITEBACK_CACHE | 65536 | Writeback caching |
| NO_OPEN_SUPPORT | 131072 | No open() support |
| PARALLEL_DIROPS | 262144 | Parallel directory operations |
| POSIX_ACL | 524288 | POSIX ACL support |
| HANDLE_KILLPRIV | 1048576 | Handle killpriv |
| CACHE_SYMLINKS | 8388608 | Cache symbolic links |
| NO_OPENDIR_SUPPORT | 16777216 | No opendir() support |
| EXPLICIT_INVAL_DATA | 33554432 | Explicit data invalidation |

## Mount Options

Mount options control how the FUSE filesystem behaves when mounted.

### Getting Available Options

```typescript
import { getMountOptions } from '@cocalc/fuse-native';

const options = getMountOptions();
console.log('Available options:', options.available);
console.log('Recommended defaults:', options.defaults);
```

### Common Mount Options

#### Permission & Security
- `allow_other` - Allow other users to access the filesystem
- `allow_root` - Allow root to access the filesystem
- `default_permissions` - Enable kernel permission checking
- `uid=N` - Set file owner user ID
- `gid=N` - Set file owner group ID
- `umask=OCTAL` - Set umask for file permissions

#### Performance Options
- `max_write=N` - Maximum write size (bytes)
- `max_read=N` - Maximum read size (bytes)
- `max_readahead=N` - Maximum readahead (bytes)
- `async_read` - Enable asynchronous reads
- `sync_read` - Force synchronous reads
- `big_writes` - Enable large write requests
- `atomic_o_trunc` - Atomic open with truncate

#### Caching Behavior
- `auto_cache` - Enable automatic caching decisions
- `noauto_cache` - Disable automatic caching
- `cache_timeout=N` - Cache timeout in seconds
- `entry_timeout=N` - Directory entry cache timeout
- `negative_timeout=N` - Negative lookup cache timeout
- `attr_timeout=N` - Attribute cache timeout
- `ac_attr_timeout=N` - Auto-cache attribute timeout

#### File System Behavior
- `auto_unmount` - Automatically unmount on process exit
- `dev` - Allow device files
- `nodev` - Disallow device files
- `suid` - Allow set-uid/set-gid bits
- `nosuid` - Ignore set-uid/set-gid bits
- `exec` - Allow execution of binaries
- `noexec` - Disallow execution of binaries
- `ro` - Mount read-only
- `rw` - Mount read-write

#### Advanced Options
- `splice_write` - Use splice for writing
- `splice_move` - Use splice for moving data
- `splice_read` - Use splice for reading
- `no_remote_lock` - Disable remote file locking
- `no_remote_flock` - Disable remote flock()
- `no_remote_posix_lock` - Disable remote POSIX locking

## Performance Tuning

### Write Performance

The `maxWrite` value from connection info indicates the maximum size for write operations:

```typescript
const connInfo = getConnectionInfo();
if (connInfo) {
  console.log(`Max write size: ${connInfo.maxWrite} bytes`);
  
  // Optimize buffer sizes based on max write
  const optimalChunkSize = Math.min(connInfo.maxWrite, 1024 * 1024);
}
```

### Time Granularity

The `timeGranNs` field indicates the filesystem's time precision:

```typescript
const connInfo = getConnectionInfo();
if (connInfo) {
  const timeGranMs = Number(connInfo.timeGranNs) / 1000000;
  console.log(`Time granularity: ${timeGranMs}ms`);
  
  // Use appropriate precision for timestamps
  if (connInfo.timeGranNs === 1000000000n) {
    console.log('Second precision timestamps');
  } else if (connInfo.timeGranNs === 1000000n) {
    console.log('Millisecond precision timestamps');
  }
}
```

### Cache Optimization

Use config values to optimize caching behavior:

```typescript
const config = getFuseConfig();
if (config) {
  console.log('Cache settings:', {
    entryTimeout: config.entryTimeout,
    attrTimeout: config.attrTimeout,
    kernelCache: config.kernelCache,
    autoCache: config.autoCache
  });
}
```

## Error Handling

All init bridge functions handle errors gracefully:

```typescript
try {
  await initializeInitBridge();
  await setInitCallback((connInfo, config) => {
    // Handle init
  });
} catch (error) {
  console.error('Init bridge error:', error);
}

// These functions return null/empty on error instead of throwing
const connInfo = getConnectionInfo(); // null on error
const config = getFuseConfig(); // null on error
const capNames = getCapabilityNames(); // [] on error
const options = getMountOptions(); // fallback values on error
```

## Cleanup

Remember to clean up the init bridge when shutting down:

```typescript
// Remove callback and reset state
await removeInitCallback();
await resetInitBridge();
```

## Integration with Session Management

The init bridge integrates with the session manager. The init callback is automatically triggered when a FUSE session is mounted:

```typescript
import { createSession, mount, setInitCallback } from '@cocalc/fuse-native';

// Set up init callback before mounting
await setInitCallback((connInfo, config) => {
  console.log('Filesystem mounted with max write:', connInfo.maxWrite);
});

// Create and mount session
const session = await createSession('/mnt/myfs', operations);
await mount(); // This will trigger the init callback
```

## Best Practices

1. **Initialize Early**: Set up the init bridge and callback before mounting
2. **Use BigInt**: The `timeGranNs` field is a `bigint` for nanosecond precision
3. **Check Capabilities**: Verify required capabilities are available before using features
4. **Optimize Based on Limits**: Use `maxWrite`, `maxRead` values to size buffers
5. **Handle Errors**: Init bridge functions can fail; handle errors appropriately
6. **Clean Up**: Remove callbacks and reset state during shutdown

## Examples

### Simple Init Logging

```typescript
import { setInitCallback } from '@cocalc/fuse-native';

await setInitCallback((connInfo, config) => {
  console.log('FUSE Initialization:', {
    protocol: `${connInfo.protoMajor}.${connInfo.protoMinor}`,
    maxWrite: connInfo.maxWrite,
    timeGranularity: `${Number(connInfo.timeGranNs)}ns`,
    capabilities: connInfo.caps.length,
    entryTimeout: config.entryTimeout,
    debug: config.debug
  });
});
```

### Capability-Based Feature Detection

```typescript
import { checkCapabilities, setInitCallback } from '@cocalc/fuse-native';

let hasAsyncRead = false;
let hasSplice = false;

await setInitCallback(async (connInfo, config) => {
  hasAsyncRead = await checkCapabilities([1]); // FUSE_CAP_ASYNC_READ
  hasSplice = await checkCapabilities([128, 256, 512]); // Splice capabilities
  
  console.log('Features:', { hasAsyncRead, hasSplice });
});
```

### Performance Optimization

```typescript
import { setInitCallback } from '@cocalc/fuse-native';

let optimalBufferSize = 65536; // Default

await setInitCallback((connInfo, config) => {
  // Optimize buffer size based on FUSE limits
  optimalBufferSize = Math.min(
    connInfo.maxWrite,
    1024 * 1024 // Max 1MB
  );
  
  console.log(`Using ${optimalBufferSize} byte buffers`);
});
```
