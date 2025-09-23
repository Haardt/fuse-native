# Error Handling in FUSE Native

This document provides comprehensive documentation for error handling in the FUSE Native binding, including errno codes, error classification, and operation-specific error mappings.

## Overview

FUSE Native follows POSIX errno conventions with a consistent error handling approach:

- **Success**: Return values ≥ 0
- **Errors**: Return negative errno codes (e.g., `-2` for `ENOENT`)
- **JavaScript**: Throw `FuseErrno` instances with proper errno, code, and message

## Core Error Types

### FuseErrno Class

The main error class extends JavaScript's `Error` with POSIX errno support:

```typescript
class FuseErrno extends Error {
  readonly errno: number;        // Negative errno code (e.g., -2)
  readonly code: string;         // Error name (e.g., 'ENOENT')
  readonly syscall?: string;     // Optional syscall name
  readonly path?: string;        // Optional file path
}
```

### Creating Errors

```typescript
import { createFuseError, createENoent, createEAcces } from 'fuse-native';

// Generic error creation
const error1 = createFuseError('ENOENT', 'Custom message', 'open', '/path/file');
const error2 = createFuseError(-13); // EACCES

// Convenience creators
const notFound = createENoent('/missing/file');
const accessDenied = createEAcces('/protected/file');
```

## Common Errno Codes

| Code | Name | Errno | Description | Common Use Cases |
|------|------|-------|-------------|------------------|
| -1 | EPERM | `EPERM` | Operation not permitted | chmod, chown on immutable files |
| -2 | ENOENT | `ENOENT` | No such file or directory | File/directory doesn't exist |
| -5 | EIO | `EIO` | Input/output error | Hardware failures, network issues |
| -9 | EBADF | `EBADF` | Bad file descriptor | Invalid or closed file descriptor |
| -11 | EAGAIN | `EAGAIN` | Resource temporarily unavailable | Retry operations, non-blocking I/O |
| -12 | ENOMEM | `ENOMEM` | Cannot allocate memory | Out of memory conditions |
| -13 | EACCES | `EACCES` | Permission denied | Insufficient permissions |
| -16 | EBUSY | `EBUSY` | Device or resource busy | File in use, mount point busy |
| -17 | EEXIST | `EEXIST` | File exists | Create operation on existing file |
| -19 | ENODEV | `ENODEV` | No such device | Device not available |
| -20 | ENOTDIR | `ENOTDIR` | Not a directory | Path component is not a directory |
| -21 | EISDIR | `EISDIR` | Is a directory | Operation not permitted on directory |
| -22 | EINVAL | `EINVAL` | Invalid argument | Invalid parameters or flags |
| -24 | EMFILE | `EMFILE` | Too many open files | Process file descriptor limit |
| -27 | EFBIG | `EFBIG` | File too large | File size exceeds limits |
| -28 | ENOSPC | `ENOSPC` | No space left on device | Disk full condition |
| -30 | EROFS | `EROFS` | Read-only file system | Write to read-only filesystem |
| -36 | ENAMETOOLONG | `ENAMETOOLONG` | File name too long | Path or filename too long |
| -38 | ENOSYS | `ENOSYS` | Function not implemented | Operation not supported |
| -39 | ENOTEMPTY | `ENOTEMPTY` | Directory not empty | Remove non-empty directory |
| -40 | ELOOP | `ELOOP` | Too many symbolic links | Circular symlink or too deep |

## Error Classification

### Permission Errors
- `EPERM` (-1): Operation not permitted
- `EACCES` (-13): Permission denied

```typescript
import { isPermissionError } from 'fuse-native';

if (isPermissionError(error.errno)) {
  console.log('Permission denied - check file permissions');
}
```

### Not Found Errors
- `ENOENT` (-2): No such file or directory
- `ENOTDIR` (-20): Not a directory

```typescript
import { isNotFoundError } from 'fuse-native';

if (isNotFoundError(error.errno)) {
  console.log('File or directory not found');
}
```

### Temporary Errors (Retry Recommended)
- `EAGAIN` (-11): Resource temporarily unavailable
- `EINTR` (-4): Interrupted system call

```typescript
import { isTemporaryError } from 'fuse-native';

if (isTemporaryError(error.errno)) {
  console.log('Temporary error - retry recommended');
}
```

### I/O Errors
- `EIO` (-5): Input/output error
- `ENOSPC` (-28): No space left on device
- `EDQUOT` (-122): Disk quota exceeded

```typescript
import { isIOError } from 'fuse-native';

if (isIOError(error.errno)) {
  console.log('I/O or storage error occurred');
}
```

## FUSE Operation Error Mapping

### File Operations

#### `lookup` - Look up directory entry

**Common Errors:**
- `ENOENT`: File or directory doesn't exist
- `EACCES`: Permission denied for directory traversal
- `ENOTDIR`: Path component is not a directory
- `ENAMETOOLONG`: Filename too long
- `EIO`: I/O error during lookup

**Example:**
```typescript
const operations = {
  async lookup(parent: Ino, name: string): Promise<{ attr: StatResult; timeout: number }> {
    const file = getFile(parent, name);
    if (!file) {
      throw createENoent(`${getPath(parent)}/${name}`);
    }
    if (!hasPermission(parent, 'execute')) {
      throw createEAcces(getPath(parent));
    }
    return { attr: file.stat, timeout: 1.0 };
  }
};
```

#### `getattr` - Get file attributes

**Common Errors:**
- `ENOENT`: File doesn't exist
- `EACCES`: Permission denied
- `EIO`: I/O error reading attributes

**Example:**
```typescript
async getattr(ino: Ino): Promise<{ attr: StatResult; timeout: number }> {
  const file = getFileByIno(ino);
  if (!file) {
    throw createENoent();
  }
  return { attr: file.stat, timeout: 1.0 };
}
```

#### `setattr` - Set file attributes

**Common Errors:**
- `ENOENT`: File doesn't exist
- `EACCES`: Permission denied
- `EPERM`: Operation not permitted (e.g., chown by non-root)
- `EROFS`: Read-only file system
- `EIO`: I/O error

**Example:**
```typescript
async setattr(ino: Ino, attr: Partial<StatResult>): Promise<{ attr: StatResult; timeout: number }> {
  const file = getFileByIno(ino);
  if (!file) {
    throw createENoent();
  }
  if (isReadOnly()) {
    throw createFuseError('EROFS');
  }
  // Update attributes...
  return { attr: file.stat, timeout: 1.0 };
}
```

### I/O Operations

#### `read` - Read file data

**Common Errors:**
- `ENOENT`: File doesn't exist
- `EACCES`: Permission denied (no read permission)
- `EISDIR`: Attempting to read a directory
- `EIO`: I/O error during read

**Example:**
```typescript
async read(ino: Ino, options: ReadOptions): Promise<ArrayBuffer> {
  const file = getFileByIno(ino);
  if (!file) {
    throw createENoent();
  }
  if (file.isDirectory()) {
    throw createEIsDir();
  }
  if (!hasPermission(file, 'read')) {
    throw createEAcces(file.path);
  }
  // Read and return data...
}
```

#### `write` - Write file data

**Common Errors:**
- `ENOENT`: File doesn't exist
- `EACCES`: Permission denied (no write permission)
- `EPERM`: Operation not permitted
- `EROFS`: Read-only file system
- `ENOSPC`: No space left on device
- `EISDIR`: Attempting to write to a directory
- `EIO`: I/O error during write

**Example:**
```typescript
async write(ino: Ino, data: ArrayBuffer, options: WriteOptions): Promise<number> {
  const file = getFileByIno(ino);
  if (!file) {
    throw createENoent();
  }
  if (file.isDirectory()) {
    throw createEIsDir();
  }
  if (!hasPermission(file, 'write')) {
    throw createEAcces(file.path);
  }
  if (isReadOnly()) {
    throw createFuseError('EROFS');
  }
  if (getDiskSpace() < data.byteLength) {
    throw createENoSpc();
  }
  // Write data...
}
```

### File Management Operations

#### `create` - Create and open file

**Common Errors:**
- `EEXIST`: File already exists (with O_EXCL)
- `EACCES`: Permission denied
- `ENOTDIR`: Parent path component is not a directory
- `EROFS`: Read-only file system
- `ENOSPC`: No space left on device
- `ENAMETOOLONG`: Filename too long
- `EIO`: I/O error

#### `mkdir` - Create directory

**Common Errors:**
- `EEXIST`: Directory already exists
- `EACCES`: Permission denied
- `ENOTDIR`: Parent path component is not a directory
- `EROFS`: Read-only file system
- `ENOSPC`: No space left on device
- `ENAMETOOLONG`: Directory name too long

#### `unlink` - Remove file

**Common Errors:**
- `ENOENT`: File doesn't exist
- `EACCES`: Permission denied
- `EPERM`: Operation not permitted
- `EROFS`: Read-only file system
- `EISDIR`: Attempting to unlink a directory

#### `rmdir` - Remove directory

**Common Errors:**
- `ENOENT`: Directory doesn't exist
- `EACCES`: Permission denied
- `EPERM`: Operation not permitted
- `EROFS`: Read-only file system
- `ENOTDIR`: Not a directory
- `ENOTEMPTY`: Directory not empty

#### `rename` - Rename/move file or directory

**Common Errors:**
- `ENOENT`: Source doesn't exist
- `EACCES`: Permission denied
- `EPERM`: Operation not permitted
- `EROFS`: Read-only file system
- `EXDEV`: Cross-device link (different filesystems)
- `EISDIR`: Target exists and is a directory (when source is file)
- `ENOTDIR`: Target exists and is not a directory (when source is directory)
- `ENOTEMPTY`: Target directory exists and is not empty

### Directory Operations

#### `readdir` - Read directory contents

**Common Errors:**
- `ENOENT`: Directory doesn't exist
- `EACCES`: Permission denied (no read permission on directory)
- `ENOTDIR`: Not a directory
- `EIO`: I/O error

**Example:**
```typescript
async readdir(ino: Ino, offset: bigint): Promise<ReaddirResult> {
  const dir = getFileByIno(ino);
  if (!dir) {
    throw createENoent();
  }
  if (!dir.isDirectory()) {
    throw createENotDir();
  }
  if (!hasPermission(dir, 'read')) {
    throw createEAcces(dir.path);
  }
  // Read directory entries...
}
```

#### `opendir` / `releasedir` - Open/close directory

**Common Errors:**
- `ENOENT`: Directory doesn't exist
- `EACCES`: Permission denied
- `ENOTDIR`: Not a directory
- `EMFILE`: Too many open files

### File System Operations

#### `statfs` - Get file system statistics

**Common Errors:**
- `EACCES`: Permission denied
- `EIO`: I/O error

#### `flush` / `fsync` - Synchronize file data

**Common Errors:**
- `EIO`: I/O error during sync
- `ENOSPC`: No space left on device (for delayed writes)

## Error Handling Best Practices

### 1. Use Specific Error Types

```typescript
// ✅ Good: Specific error
if (!fileExists(path)) {
  throw createENoent(path);
}

// ❌ Bad: Generic error
if (!fileExists(path)) {
  throw new Error('File not found');
}
```

### 2. Include Context Information

```typescript
// ✅ Good: Include syscall and path
throw createFuseError('EACCES', 'Permission denied', 'open', filePath);

// ❌ Bad: No context
throw createFuseError('EACCES');
```

### 3. Handle Error Propagation

```typescript
async function safeOperation(): Promise<Result> {
  try {
    return await riskyOperation();
  } catch (error) {
    if (error instanceof FuseErrno) {
      // Log for debugging but preserve errno for FUSE
      console.debug(`Operation failed: ${error.code} - ${error.message}`);
      throw error;
    }
    // Convert unknown errors to EIO
    throw createEIO(error instanceof Error ? error.message : 'Unknown error');
  }
}
```

### 4. Validate Operation Context

```typescript
async function validateAndExecute(ino: Ino, operation: string): Promise<void> {
  const file = getFileByIno(ino);
  if (!file) {
    throw createENoent();
  }
  
  if (!isValidOperationError(operation as any, 'ENOENT')) {
    console.warn(`Unexpected error ENOENT for operation ${operation}`);
  }
  
  // Continue with operation...
}
```

### 5. Error Recovery Patterns

```typescript
async function robustWrite(ino: Ino, data: ArrayBuffer): Promise<number> {
  for (let retries = 0; retries < 3; retries++) {
    try {
      return await write(ino, data);
    } catch (error) {
      if (error instanceof FuseErrno && isTemporaryError(error.errno)) {
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retries)));
        continue;
      }
      throw error; // Non-temporary error, don't retry
    }
  }
  throw createEIO('Write failed after retries');
}
```

## Debugging Errors

### Error Logging

```typescript
import { errno, errname, errmsg } from 'fuse-native';

function logError(error: FuseErrno): void {
  console.error('FUSE Error:', {
    errno: error.errno,
    code: error.code,
    message: error.message,
    syscall: error.syscall,
    path: error.path,
    humanReadable: errmsg(error.errno),
  });
}
```

### Error Analysis

```typescript
function analyzeError(error: FuseErrno): void {
  console.log(`Error Analysis for ${error.code}:`);
  console.log(`- Permission related: ${isPermissionError(error.errno)}`);
  console.log(`- Not found related: ${isNotFoundError(error.errno)}`);
  console.log(`- Temporary (retry): ${isTemporaryError(error.errno)}`);
  console.log(`- I/O related: ${isIOError(error.errno)}`);
  console.log(`- Invalid argument: ${isInvalidError(error.errno)}`);
}
```

## Testing Error Scenarios

```typescript
describe('Error Handling', () => {
  it('should handle file not found', async () => {
    const fs = createTestFileSystem();
    
    await expect(fs.getattr(999n)).rejects.toThrow(
      expect.objectContaining({
        errno: -2,
        code: 'ENOENT'
      })
    );
  });

  it('should handle permission denied', async () => {
    const fs = createTestFileSystem();
    const protectedIno = fs.createFile('/protected', { mode: 0o000 });
    
    await expect(fs.read(protectedIno, { offset: 0n, size: 100 }))
      .rejects.toThrow(
        expect.objectContaining({
          errno: -13,
          code: 'EACCES'
        })
      );
  });
});
```

## Migration from Other Error Systems

### From Node.js fs Errors

```typescript
// Node.js style
fs.readFile('/path', (err, data) => {
  if (err) {
    if (err.code === 'ENOENT') {
      // Handle not found
    }
  }
});

// FUSE Native style
try {
  const data = await fuseFs.read(ino, options);
} catch (error) {
  if (error instanceof FuseErrno && error.code === 'ENOENT') {
    // Handle not found
  }
}
```

### From Generic Errors

```typescript
// Before
throw new Error('Permission denied');

// After
throw createEAcces(path);
```

## Error Code Reference

For a complete reference of all errno codes and their meanings, see:
- [Linux errno codes](https://man7.org/linux/man-pages/man3/errno.3.html)
- [POSIX errno specification](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/errno.h.html)

## See Also

- [API Reference](api.md) - Complete API documentation with error examples
- [Performance Guide](performance.md) - Error handling performance considerations
- [Types Reference](types.md) - TypeScript type definitions for errors