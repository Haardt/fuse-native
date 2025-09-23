# FUSE Native API Reference

This document provides a comprehensive API reference for the FUSE Native binding, including detailed examples of nanosecond-precision timestamp handling.

## Table of Contents

1. [Core API](#core-api)
2. [Time Handling](#time-handling)
3. [Type Definitions](#type-definitions)
4. [Operation Handlers](#operation-handlers)
5. [Session Management](#session-management)
6. [Error Handling](#error-handling)
7. [Examples](#examples)

## Core API

### `createSession(mountpoint, operations, options?)`

Creates a new FUSE session for mounting a filesystem.

```typescript
import { createSession, FuseOperationHandlers, FuseSessionOptions } from 'fuse-native';

const operations: FuseOperationHandlers = {
  // ... operation handlers
};

const options: FuseSessionOptions = {
  allowOther: true,
  debug: false,
  maxRead: 65536,
};

const session = createSession('/tmp/my-mount', operations, options);
await session.mount();
```

### `getVersion()`

Returns version information for the FUSE library and binding.

```typescript
import { getVersion } from 'fuse-native';

const version = getVersion();
console.log(version);
// {
//   fuse: "3.10.5",
//   binding: "1.0.0", 
//   napi: "8"
// }
```

## Time Handling

FUSE Native provides nanosecond-precision timestamp support using BigInt values. All timestamps represent nanoseconds since the Unix epoch.

### Core Time Types

```typescript
// Nanoseconds since Unix epoch
type Timestamp = bigint;

// TimeSpec structure for C++ interop
interface TimeSpec {
  seconds: number;      // Seconds since epoch
  nanoseconds: number;  // Nanoseconds within the second (0-999999999)
}

// Flexible input formats
type TimeSpecInput = 
  | bigint                                    // ns since epoch
  | Date                                      // JavaScript Date
  | number                                    // ms (if >= 1e10) or seconds (if < 1e10)
  | { sec: number; nsec: number }             // C-style timespec
  | { seconds: number; nanoseconds: number }  // Alternative naming
  | string;                                   // ISO string or "seconds.nanoseconds"
```

### Time Conversion Functions

#### `toTimespec(input: TimeSpecInput): TimeSpec`

The primary conversion function that accepts any time format and returns a normalized TimeSpec structure.

```typescript
import { toTimespec } from 'fuse-native';

// From BigInt nanoseconds
const timespec1 = toTimespec(1672531200123456789n);
// { seconds: 1672531200, nanoseconds: 123456789 }

// From JavaScript Date
const timespec2 = toTimespec(new Date('2023-01-01T00:00:00.123Z'));
// { seconds: 1672531200, nanoseconds: 123000000 }

// From milliseconds (large number)
const timespec3 = toTimespec(1672531200123);
// { seconds: 1672531200, nanoseconds: 123000000 }

// From seconds (small number or fractional)
const timespec4 = toTimespec(1672531200.123456789);
// { seconds: 1672531200, nanoseconds: 123456789 }

// From timespec object
const timespec5 = toTimespec({ sec: 1672531200, nsec: 123456789 });
// { seconds: 1672531200, nanoseconds: 123456789 }

// From ISO string
const timespec6 = toTimespec('2023-01-01T00:00:00.123Z');
// { seconds: 1672531200, nanoseconds: 123000000 }

// From "seconds.nanoseconds" string
const timespec7 = toTimespec('1672531200.123456789');
// { seconds: 1672531200, nanoseconds: 123456789 }
```

#### `toTimestamp(input: TimeSpecInput): Timestamp`

Converts any time format to a nanosecond BigInt timestamp.

```typescript
import { toTimestamp } from 'fuse-native';

const timestamp1 = toTimestamp(new Date('2023-01-01T00:00:00.123Z'));
// 1672531200123000000n

const timestamp2 = toTimestamp({ sec: 1672531200, nsec: 123456789 });
// 1672531200123456789n
```

#### `now(): Timestamp`

Returns the current time as a nanosecond timestamp with high precision when available.

```typescript
import { now } from 'fuse-native';

const currentTime = now();
console.log(currentTime); // 1672531200123456789n
```

### Time Arithmetic

```typescript
import { 
  addNanoseconds, 
  addMilliseconds, 
  addSeconds,
  diffNanoseconds,
  diffMilliseconds,
  diffSeconds 
} from 'fuse-native';

const baseTime = now();

// Add time
const future1 = addNanoseconds(baseTime, 123456789n);
const future2 = addMilliseconds(baseTime, 123);
const future3 = addSeconds(baseTime, 1.5);

// Calculate differences
const diffNs = diffNanoseconds(future3, baseTime);   // 1500000000n
const diffMs = diffMilliseconds(future3, baseTime);  // 1500
const diffSec = diffSeconds(future3, baseTime);      // 1.5
```

### Time Formatting

```typescript
import { toString, toDate, toMilliseconds, toSeconds } from 'fuse-native';

const timestamp = 1672531200123456789n;

// Format as strings
const iso = toString(timestamp, 'iso');          // "2023-01-01T00:00:00.123Z"
const timespec = toString(timestamp, 'timespec'); // "1672531200.123456789"
const unix = toString(timestamp, 'unix');        // "1672531200.123456789"

// Convert to other formats (with precision loss warning)
const date = toDate(timestamp);           // Date object (ms precision)
const ms = toMilliseconds(timestamp);     // 1672531200123 (truncated)
const sec = toSeconds(timestamp);         // 1672531200.123456789 (full precision)
```

### Time Utilities

```typescript
import { compare, isValid, round } from 'fuse-native';

const timestamp1 = 1672531200123456789n;
const timestamp2 = 1672531200987654321n;

// Compare timestamps
const result = compare(timestamp1, timestamp2); // -1 (timestamp1 < timestamp2)

// Validate timestamps
console.log(isValid(timestamp1)); // true
console.log(isValid(-1n));        // false

// Round to different precisions
const rounded1 = round(timestamp1, 'second');      // 1672531200000000000n
const rounded2 = round(timestamp1, 'millisecond'); // 1672531200123000000n
const rounded3 = round(timestamp1, 'microsecond'); // 1672531200123456000n
```

## Type Definitions

### Branded Types

FUSE Native uses branded types for type safety:

```typescript
// File system types
type Fd = number & { readonly __brand: 'Fd' };           // File descriptor
type Ino = bigint & { readonly __brand: 'Ino' };         // Inode number
type Mode = number & { readonly __brand: 'Mode' };       // File mode
type Flags = number & { readonly __brand: 'Flags' };     // File flags
type Uid = number & { readonly __brand: 'Uid' };         // User ID
type Gid = number & { readonly __brand: 'Gid' };         // Group ID
type Dev = bigint & { readonly __brand: 'Dev' };         // Device ID

// Helper functions to create branded types
import { createFd, createIno, createMode } from 'fuse-native';

const fd = createFd(5);
const ino = createIno(12345n);
const mode = createMode(0o644);
```

### File System Structures

#### StatResult

```typescript
interface StatResult {
  ino: Ino;           // Inode number
  mode: Mode;         // File mode and type
  nlink: number;      // Number of hard links
  uid: Uid;           // User ID of owner
  gid: Gid;           // Group ID of owner
  rdev: Dev;          // Device ID (if special file)
  size: bigint;       // File size in bytes
  blksize: number;    // Block size for filesystem I/O
  blocks: bigint;     // Number of 512-byte blocks allocated
  atime: Timestamp;   // Time of last access (nanoseconds)
  mtime: Timestamp;   // Time of last modification (nanoseconds)
  ctime: Timestamp;   // Time of last status change (nanoseconds)
  birthtime?: Timestamp; // Time of creation (nanoseconds, if supported)
}
```

#### FileInfo

```typescript
interface FileInfo {
  fh: Fd;                          // File descriptor
  flags: Flags;                    // Open flags
  direct_io?: boolean;             // Direct I/O flag
  keep_cache?: boolean;            // Keep cache flag
  flush?: boolean;                 // Flush flag
  nonseekable?: boolean;           // Nonseekable flag
  cache_readdir?: boolean;         // Cache readdir flag
  parallel_direct_writes?: boolean; // Parallel direct writes flag
}
```

#### RequestContext

```typescript
interface RequestContext {
  uid: Uid;     // User ID of requesting process
  gid: Gid;     // Group ID of requesting process
  pid: number;  // Process ID of requesting process
  umask: Mode;  // File creation mask
}
```

## Operation Handlers

### File Operations

#### `getattr(ino: Ino, context: RequestContext, fi?: FileInfo): Promise<{ attr: StatResult; timeout: number }>`

Get file attributes with nanosecond-precision timestamps.

```typescript
const operations = {
  async getattr(ino: Ino, context: RequestContext): Promise<{ attr: StatResult; timeout: number }> {
    const currentTime = now();
    
    return {
      attr: {
        ino,
        mode: createMode(0o644),
        nlink: 1,
        uid: context.uid,
        gid: context.gid,
        rdev: createDev(0n),
        size: 1024n,
        blksize: 4096,
        blocks: 1n,
        atime: currentTime,
        mtime: addSeconds(currentTime, -3600), // 1 hour ago
        ctime: currentTime,
        birthtime: addSeconds(currentTime, -86400), // 1 day ago
      },
      timeout: 1.0
    };
  }
};
```

#### `setattr(ino: Ino, attr: Partial<StatResult>, context: RequestContext, options?: SetattrOptions): Promise<{ attr: StatResult; timeout: number }>`

Set file attributes, handling various time input formats.

```typescript
const operations = {
  async setattr(
    ino: Ino, 
    attr: Partial<StatResult>, 
    context: RequestContext,
    options?: SetattrOptions
  ): Promise<{ attr: StatResult; timeout: number }> {
    // Handle timestamp updates from various formats
    let accessTime: Timestamp | undefined;
    let modifyTime: Timestamp | undefined;
    
    if (attr.atime !== undefined) {
      // Convert any time format to nanosecond timestamp
      accessTime = toTimestamp(attr.atime);
    }
    
    if (attr.mtime !== undefined) {
      modifyTime = toTimestamp(attr.mtime);
    }
    
    // Update file attributes
    const updatedAttr: StatResult = {
      // ... existing attributes
      atime: accessTime ?? now(),
      mtime: modifyTime ?? now(),
      ctime: now(), // Status change time is always current
    };
    
    return { attr: updatedAttr, timeout: 1.0 };
  }
};
```

#### `read(ino: Ino, context: RequestContext, options: ReadOptions): Promise<ArrayBuffer>`

Read file data with BigInt offsets.

```typescript
interface ReadOptions {
  offset: bigint;      // Byte offset to start reading from
  size: number;        // Number of bytes to read
  fi?: FileInfo;       // File info structure
  signal?: AbortSignal; // Cancellation signal
  timeout?: number;    // Timeout in milliseconds
}

const operations = {
  async read(ino: Ino, context: RequestContext, options: ReadOptions): Promise<ArrayBuffer> {
    const { offset, size } = options;
    
    // Handle large file offsets with BigInt
    if (offset > 2n ** 53n) {
      console.log('Reading from large offset:', offset.toString());
    }
    
    // Return data as ArrayBuffer
    const buffer = new ArrayBuffer(size);
    // ... populate buffer with file data
    
    return buffer;
  }
};
```

#### `write(ino: Ino, data: ArrayBuffer, context: RequestContext, options: WriteOptions): Promise<number>`

Write file data with BigInt offsets.

```typescript
interface WriteOptions {
  offset: bigint;      // Byte offset to start writing at
  fi?: FileInfo;       // File info structure
  flags?: number;      // Write flags
  signal?: AbortSignal; // Cancellation signal
  timeout?: number;    // Timeout in milliseconds
}

const operations = {
  async write(
    ino: Ino, 
    data: ArrayBuffer, 
    context: RequestContext, 
    options: WriteOptions
  ): Promise<number> {
    const { offset } = options;
    
    // Handle large file offsets
    if (offset > 2n ** 53n) {
      console.log('Writing to large offset:', offset.toString());
    }
    
    // Write data and return number of bytes written
    const bytesWritten = data.byteLength;
    // ... perform actual write operation
    
    return bytesWritten;
  }
};
```

### Directory Operations

#### `readdir(ino: Ino, offset: bigint, context: RequestContext, fi?: FileInfo): Promise<ReaddirResult>`

Read directory entries with pagination support.

```typescript
interface DirentEntry {
  name: string;         // Entry name
  ino: Ino;            // Inode number
  type: DirentType;    // Entry type
  nextOffset?: bigint; // Next offset for pagination
}

interface ReaddirResult {
  entries: DirentEntry[];  // Array of directory entries
  nextOffset?: bigint;     // Next offset for pagination
  hasMore: boolean;        // Whether there are more entries
}

const operations = {
  async readdir(
    ino: Ino, 
    offset: bigint, 
    context: RequestContext, 
    fi?: FileInfo
  ): Promise<ReaddirResult> {
    const entries: DirentEntry[] = [
      {
        name: 'file1.txt',
        ino: createIno(123n),
        type: DirentType.RegularFile,
        nextOffset: 1n,
      },
      {
        name: 'subdir',
        ino: createIno(124n),
        type: DirentType.Directory,
        nextOffset: 2n,
      }
    ];
    
    return {
      entries: entries.slice(Number(offset)),
      nextOffset: offset + BigInt(entries.length),
      hasMore: false
    };
  }
};
```

## Session Management

### Creating and Managing Sessions

```typescript
import { createSession, FuseSessionOptions } from 'fuse-native';

const options: FuseSessionOptions = {
  allowOther: true,           // Allow access from other users
  allowRoot: true,            // Allow access from root
  autoUnmount: true,          // Auto-unmount on process exit
  defaultPermissions: false,  // Use default permission checking
  debug: false,               // Enable debug logging
  singleThreaded: false,      // Multi-threaded operation
  maxRead: 65536,            // Maximum read size
  maxWrite: 65536,           // Maximum write size
  timeout: 30,               // Connection timeout
  mountOptions: ['rw', 'dev'] // Additional mount options
};

const session = createSession('/mnt/my-fs', operations, options);

// Mount the filesystem
await session.mount();

// Check if mounted
console.log('Mounted:', session.mounted);
console.log('Ready:', session.ready);

// Unmount and cleanup
await session.unmount();
await session.destroy();
```

## Error Handling

FUSE Native uses errno-based error handling with negative error codes.

```typescript
import { FuseErrno } from 'fuse-native';

const operations = {
  async getattr(ino: Ino): Promise<{ attr: StatResult; timeout: number }> {
    // File not found
    if (ino === 999n) {
      throw new FuseErrno('ENOENT'); // errno = -2
    }
    
    // Permission denied
    if (ino === 998n) {
      throw new FuseErrno('EACCES'); // errno = -13
    }
    
    // Custom error with message
    if (ino === 997n) {
      throw new FuseErrno('EIO', 'Disk read error'); // errno = -5
    }
    
    // Success case
    return {
      attr: { /* ... */ },
      timeout: 1.0
    };
  }
};
```

## Operation Handlers

### `statfs` - File System Statistics

The `statfs` operation provides filesystem statistics, similar to the `statvfs()` system call. All 64-bit fields use `BigInt` to support large filesystems without precision loss.

#### Handler Signature

```typescript
type StatfsHandler = (
  ino: Ino,
  context: RequestContext,
  options?: BaseOperationOptions
) => Promise<StatvfsResult>;
```

#### Return Type

```typescript
interface StatvfsResult {
  /** File system block size */
  bsize: number;
  /** Fragment size */
  frsize: number;
  /** Total data blocks in filesystem */
  blocks: bigint;
  /** Free blocks in filesystem */
  bfree: bigint;
  /** Free blocks available to unprivileged user */
  bavail: bigint;
  /** Total file nodes in filesystem */
  files: bigint;
  /** Free file nodes in filesystem */
  ffree: bigint;
  /** Free file nodes available to unprivileged user */
  favail: bigint;
  /** File system ID */
  fsid: bigint;
  /** Mount flags */
  flag: number;
  /** Maximum filename length */
  namemax: number;
}
```

#### Example Implementation

```typescript
const operations: FuseOperationHandlers = {
  async statfs(ino, context, options) {
    // Simulate a 1TB filesystem with 4K blocks
    const blockSize = 4096;
    const totalBlocks = BigInt(Math.floor((1024 * 1024 * 1024 * 1024) / blockSize));
    const freeBlocks = BigInt(Math.floor(Number(totalBlocks) * 0.3)); // 30% free
    const availBlocks = BigInt(Math.floor(Number(totalBlocks) * 0.25)); // 25% available
    
    return {
      bsize: blockSize,
      frsize: blockSize,
      blocks: totalBlocks,
      bfree: freeBlocks,
      bavail: availBlocks,
      files: 10000000n,     // 10M inodes
      ffree: 5000000n,      // 5M free
      favail: 4000000n,     // 4M available
      fsid: 0xdeadbeefn,    // Unique filesystem ID
      flag: 0,              // Mount flags
      namemax: 255          // Max filename length
    };
  }
};
```

#### BigInt Precision Support

The `statfs` implementation supports the full range of 64-bit values using BigInt:

```typescript
// Handle filesystems larger than 2^53 bytes
const operations: FuseOperationHandlers = {
  async statfs(ino, context, options) {
    // Example: 16 EB (exabyte) filesystem
    const hugeBlockCount = BigInt('18446744073709551615'); // Near max uint64
    
    return {
      bsize: 4096,
      frsize: 4096,
      blocks: hugeBlockCount,
      bfree: hugeBlockCount - 1000n,
      bavail: hugeBlockCount - 2000n,
      files: BigInt('9223372036854775807'), // Max int64
      ffree: BigInt('9223372036854775000'),
      favail: BigInt('9223372036854774000'),
      fsid: BigInt('0x123456789ABCDEF0'),
      flag: 0,
      namemax: 255
    };
  }
};
```

#### Error Handling

Common errors for the `statfs` operation:

```typescript
const operations: FuseOperationHandlers = {
  async statfs(ino, context, options) {
    try {
      // Check permissions
      if (context.uid !== 0 && !hasReadAccess(context.uid)) {
        throw new FuseErrno('EACCES', 'Permission denied');
      }
      
      // Simulate I/O error
      if (diskFailure()) {
        throw new FuseErrno('EIO', 'Input/output error');
      }
      
      return {
        // ... valid StatvfsResult
      };
      
    } catch (error) {
      if (error instanceof FuseErrno) {
        throw error;
      }
      // Convert other errors to EIO
      throw new FuseErrno('EIO', 'Filesystem error');
    }
  }
};
```

#### Usage with df-like Tools

The returned statistics work correctly with standard tools like `df`:

```bash
# After mounting your filesystem
$ df -h /tmp/my-mount
Filesystem      Size  Used Avail Use% Mounted on
my-fuse-fs      1.0T  700G  250G  74% /tmp/my-mount

$ df -i /tmp/my-mount
Filesystem      Inodes   IUsed   IFree IUse% Mounted on
my-fuse-fs     10000000 5000000 4000000   56% /tmp/my-mount
```

## Examples

### Complete Filesystem Example with Nanosecond Timestamps

```typescript
import { 
  createSession, 
  toTimespec,
  now,
  addSeconds,
  FuseOperationHandlers,
  StatResult,
  createIno,
  createMode,
  createUid,
  createGid,
  createDev,
  DirentType
} from 'fuse-native';

// In-memory filesystem with nanosecond timestamps
class MemoryFS {
  private files = new Map<bigint, {
    data: ArrayBuffer;
    attr: StatResult;
  }>();
  
  private nextIno = 2n; // Start after root inode (1)
  
  constructor() {
    const currentTime = now();
    
    // Create root directory
    this.files.set(1n, {
      data: new ArrayBuffer(0),
      attr: {
        ino: createIno(1n),
        mode: createMode(0o755 | 0x4000), // S_IFDIR
        nlink: 2,
        uid: createUid(1000),
        gid: createGid(1000),
        rdev: createDev(0n),
        size: 0n,
        blksize: 4096,
        blocks: 0n,
        atime: currentTime,
        mtime: currentTime,
        ctime: currentTime,
        birthtime: currentTime,
      }
    });
  }
  
  createFile(name: string, content: string): bigint {
    const ino = this.nextIno++;
    const currentTime = now();
    const data = new TextEncoder().encode(content);
    
    this.files.set(ino, {
      data: data.buffer,
      attr: {
        ino: createIno(ino),
        mode: createMode(0o644 | 0x8000), // S_IFREG
        nlink: 1,
        uid: createUid(1000),
        gid: createGid(1000),
        rdev: createDev(0n),
        size: BigInt(data.byteLength),
        blksize: 4096,
        blocks: BigInt(Math.ceil(data.byteLength / 512)),
        atime: currentTime,
        mtime: currentTime,
        ctime: currentTime,
        birthtime: currentTime,
      }
    });
    
    return ino;
  }
}

const fs = new MemoryFS();
const testFileIno = fs.createFile('test.txt', 'Hello, nanosecond world!');

const operations: FuseOperationHandlers = {
  async getattr(ino, context) {
    const file = fs.files.get(ino);
    if (!file) {
      throw new FuseErrno('ENOENT');
    }
    
    // Update access time with current nanosecond precision
    file.attr.atime = now();
    
    return { attr: file.attr, timeout: 1.0 };
  },
  
  async setattr(ino, attr, context, options) {
    const file = fs.files.get(ino);
    if (!file) {
      throw new FuseErrno('ENOENT');
    }
    
    // Handle time updates with flexible input formats
    if (attr.atime !== undefined) {
      file.attr.atime = toTimestamp(attr.atime);
    }
    
    if (attr.mtime !== undefined) {
      file.attr.mtime = toTimestamp(attr.mtime);
    }
    
    // Always update change time
    file.attr.ctime = now();
    
    return { attr: file.attr, timeout: 1.0 };
  },
  
  async read(ino, context, options) {
    const file = fs.files.get(ino);
    if (!file) {
      throw new FuseErrno('ENOENT');
    }
    
    const { offset, size } = options;
    const start = Number(offset);
    const end = Math.min(start + size, file.data.byteLength);
    
    // Update access time
    file.attr.atime = now();
    
    return file.data.slice(start, end);
  },
  
  async readdir(ino, offset, context) {
    if (ino !== 1n) {
      throw new FuseErrno('ENOTDIR');
    }
    
    const entries = [
      {
        name: 'test.txt',
        ino: createIno(testFileIno),
        type: DirentType.RegularFile,
        nextOffset: 1n,
      }
    ];
    
    return {
      entries: entries.slice(Number(offset)),
      nextOffset: offset + BigInt(entries.length),
      hasMore: false
    };
  }
};

// Create and mount the filesystem
const session = createSession('/tmp/nano-fs', operations, {
  debug: true,
  allowOther: true
});

await session.mount();
console.log('Nanosecond-precision filesystem mounted at /tmp/nano-fs');

// Cleanup on exit
process.on('SIGINT', async () => {
  await session.unmount();
  await session.destroy();
  process.exit(0);
});
```

### Precision Testing Example

```typescript
import { 
  toTimespec, 
  toTimestamp, 
  toString,
  diffNanoseconds,
  NS_PER_SEC 
} from 'fuse-native';

// Test nanosecond precision roundtrip
const testValue = 1234567890123456789n; // Specific test value from AGENTS.md

console.log('Original timestamp:', testValue.toString());

// Convert to TimeSpec and back
const timespec = toTimespec(testValue);
console.log('TimeSpec:', timespec);

const restored = toTimestamp(timespec);
console.log('Restored timestamp:', restored.toString());

// Verify no precision loss
const diff = diffNanoseconds(restored, testValue);
console.log('Precision loss (ns):', diff.toString());

if (diff === 0n) {
  console.log('✅ Perfect nanosecond precision maintained!');
} else {
  console.log('❌ Precision lost during conversion');
}

// Display in human-readable format
console.log('ISO format:', toString(testValue, 'iso'));
console.log('TimeSpec format:', toString(testValue, 'timespec'));
console.log('Unix format:', toString(testValue, 'unix'));
```

## Performance Considerations

- BigInt arithmetic is slower than regular number arithmetic
- For high-frequency timestamp operations, consider caching converted values
- Direct BigInt comparisons are fastest for timestamp ordering
- TimeSpec conversion involves division/modulo operations - cache when possible
- Use `round()` function to reduce precision when nanosecond accuracy isn't needed

## See Also

- [Time Handling Guide](time.md) - Detailed time handling documentation
- [Performance Guide](performance.md) - Optimization tips and benchmarks
- [Error Handling](errors.md) - Complete error code reference