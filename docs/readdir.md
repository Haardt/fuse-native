# FUSE Readdir Operation

## Overview

The `readdir` operation is responsible for reading directory contents in FUSE filesystems. This implementation provides modern pagination support, complete `d_type` information, and efficient handling of large directories.

## API Reference

### Basic Signature

```typescript
type ReaddirHandler = (
  ino: Ino,
  offset: bigint,
  context: RequestContext,
  fi?: FileInfo,
  options?: BaseOperationOptions
) => Promise<ReaddirResult>;
```

### Parameters

- **`ino`**: The inode number of the directory to read
- **`offset`**: Starting offset for pagination (0n = start of directory)
- **`context`**: Request context containing user/group/process information
- **`fi`**: Optional file info if directory was opened with `opendir`
- **`options`**: Optional operation options (AbortSignal, timeout)

### Return Type

```typescript
interface ReaddirResult {
  /** Array of directory entries */
  entries: DirentEntry[];
  /** Whether there are more entries available */
  hasMore: boolean;
  /** Next offset for pagination (if hasMore is true) */
  nextOffset?: bigint | undefined;
}
```

### Directory Entry Structure

```typescript
interface DirentEntry {
  /** Entry name (filename) */
  name: string;
  /** Inode number */
  ino: Ino;
  /** File type (d_type) */
  type: DirentType;
  /** Next offset for this entry (FUSE internal use) */
  nextOffset?: bigint | undefined;
}
```

### File Types (d_type)

```typescript
enum DirentType {
  Unknown = 0,          // DT_UNKNOWN
  Fifo = 1,            // DT_FIFO
  CharDevice = 2,      // DT_CHR
  Directory = 4,       // DT_DIR
  BlockDevice = 6,     // DT_BLK
  RegularFile = 8,     // DT_REG
  SymbolicLink = 10,   // DT_LNK
  Socket = 12,         // DT_SOCK
}
```

## Basic Usage

### Simple Directory Reading

```typescript
const handlers: FuseOperationHandlers = {
  readdir: async (ino, offset, context, fi, options) => {
    // Get directory contents from your storage
    const entries = await getDirectoryEntries(ino);
    
    // Apply offset for pagination
    const startIndex = Number(offset);
    const pageEntries = entries.slice(startIndex);
    
    // Create directory entries with proper types
    const direntEntries = pageEntries.map(entry => 
      DirentUtils.create(entry.name, entry.ino, entry.type)
    );
    
    // Return result
    return DirentUtils.createReaddirResult(direntEntries, false);
  }
};
```

### With Pagination Support

```typescript
const PAGE_SIZE = 1000; // Entries per page

const handlers: FuseOperationHandlers = {
  readdir: async (ino, offset, context, fi, options) => {
    const allEntries = await getDirectoryEntries(ino);
    
    const startIndex = Number(offset);
    const endIndex = Math.min(startIndex + PAGE_SIZE, allEntries.length);
    const pageEntries = allEntries.slice(startIndex, endIndex);
    
    const hasMore = endIndex < allEntries.length;
    const nextOffset = hasMore ? BigInt(endIndex) : undefined;
    
    // Set nextOffset on entries for FUSE
    const direntEntries = pageEntries.map((entry, index) => {
      const dirent = DirentUtils.create(entry.name, entry.ino, entry.type);
      if (startIndex + index + 1 < allEntries.length) {
        dirent.nextOffset = BigInt(startIndex + index + 1);
      }
      return dirent;
    });
    
    return DirentUtils.createReaddirResult(direntEntries, hasMore, nextOffset);
  }
};
```

## Helper Functions

### DirentUtils.create()

Creates a directory entry with proper typing:

```typescript
const entry = DirentUtils.create(
  'example.txt',                    // name
  createIno(123n),                 // inode
  DirentType.RegularFile,          // type
  456n                            // nextOffset (optional)
);
```

### DirentUtils.createReaddirResult()

Creates a properly formatted readdir result:

```typescript
const result = DirentUtils.createReaddirResult(
  entries,        // DirentEntry[]
  true,          // hasMore
  1000n          // nextOffset
);
```

### DirentUtils.createStandardEntries()

Creates standard `.` and `..` entries:

```typescript
const standardEntries = DirentUtils.createStandardEntries(
  currentIno,    // Current directory inode
  parentIno      // Parent directory inode (optional, defaults to ROOT_INO)
);
```

## Pagination

### How Pagination Works

1. **Initial Request**: Client calls `readdir` with `offset = 0n`
2. **Partial Response**: Handler returns entries with `hasMore = true` and `nextOffset`
3. **Continuation**: Client calls again with `offset = nextOffset`
4. **Completion**: Handler returns final entries with `hasMore = false`

### Example: Reading Large Directory

```typescript
async function readAllEntries(ino: Ino): Promise<DirentEntry[]> {
  const allEntries: DirentEntry[] = [];
  let offset = 0n;
  
  do {
    const result = await readdirHandler(ino, offset, context);
    allEntries.push(...result.entries);
    
    if (result.hasMore && result.nextOffset !== undefined) {
      offset = result.nextOffset;
    } else {
      break;
    }
  } while (true);
  
  return allEntries;
}
```

### Performance Considerations

- **Page Size**: Balance memory usage vs. number of syscalls (recommended: 500-2000 entries)
- **Caching**: Consider caching directory contents for frequently accessed directories
- **Sorting**: Maintain consistent ordering across pagination requests
- **Memory**: Use streaming for very large directories to avoid loading everything into memory

## Error Handling

### Common Error Conditions

```typescript
readdir: async (ino, offset, context, fi, options) => {
  try {
    // Check if directory exists
    const dir = await getDirectory(ino);
    if (!dir) {
      throw new FuseErrno('ENOENT');
    }
    
    // Check if it's actually a directory
    if (!dir.isDirectory) {
      throw new FuseErrno('ENOTDIR');
    }
    
    // Check permissions
    if (!hasReadPermission(dir, context)) {
      throw new FuseErrno('EACCES');
    }
    
    // Read entries...
    const entries = await dir.getEntries();
    return DirentUtils.createReaddirResult(entries);
    
  } catch (error) {
    // Handle I/O errors
    if (error instanceof IOError) {
      throw new FuseErrno('EIO');
    }
    throw error;
  }
}
```

### Error Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| `ENOENT` | No such file or directory | Directory doesn't exist |
| `ENOTDIR` | Not a directory | Inode is not a directory |
| `EACCES` | Permission denied | No read permission on directory |
| `EIO` | I/O error | Storage/filesystem error |

## Advanced Features

### Timeout and Cancellation

```typescript
readdir: async (ino, offset, context, fi, options) => {
  // Respect abort signal
  if (options?.signal?.aborted) {
    throw new Error('Operation cancelled');
  }
  
  const timeoutPromise = options?.timeout ? 
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), options.timeout)
    ) : null;
  
  const readdirPromise = performReaddir(ino, offset);
  
  const result = timeoutPromise ? 
    await Promise.race([readdirPromise, timeoutPromise]) :
    await readdirPromise;
    
  return result;
}
```

### Efficient File Type Detection

```typescript
function getFileTypeFromStat(stat: StatResult): DirentType {
  return ModeUtils.getFileType(stat.mode);
}

// Or determine type from filename/extension if stat is expensive
function guessFileType(name: string): DirentType {
  if (name.endsWith('/')) return DirentType.Directory;
  if (name.includes('.')) return DirentType.RegularFile;
  return DirentType.Unknown;
}
```

## Performance Optimization

### Batched Operations

```typescript
// Bad: One query per entry
for (const entry of entries) {
  entry.type = await getFileType(entry.ino);
}

// Good: Batch query
const types = await getFileTypes(entries.map(e => e.ino));
entries.forEach((entry, i) => entry.type = types[i]);
```

### Caching Strategy

```typescript
class DirectoryCache {
  private cache = new Map<Ino, { entries: DirentEntry[], expires: number }>();
  
  async getEntries(ino: Ino): Promise<DirentEntry[]> {
    const cached = this.cache.get(ino);
    if (cached && cached.expires > Date.now()) {
      return cached.entries;
    }
    
    const entries = await loadDirectoryEntries(ino);
    this.cache.set(ino, { 
      entries, 
      expires: Date.now() + CACHE_TTL 
    });
    
    return entries;
  }
}
```

## Testing

### Unit Tests

```typescript
describe('readdir operation', () => {
  it('should read directory contents', async () => {
    const result = await handler.readdir(
      createIno(1n), 
      0n, 
      mockContext, 
      mockFileInfo
    );
    
    expect(result.entries).toBeDefined();
    expect(result.hasMore).toBe(false);
    expect(result.entries[0].name).toBe('.');
    expect(result.entries[1].name).toBe('..');
  });
  
  it('should handle pagination', async () => {
    // Test with large directory...
  });
});
```

### Integration Tests

```typescript
describe('readdir pagination', () => {
  it('should handle 10k+ entries', async () => {
    // Create large test directory
    const largeDir = await createTestDirectory(10000);
    
    let totalEntries = 0;
    let offset = 0n;
    
    do {
      const result = await handler.readdir(largeDir, offset, context);
      totalEntries += result.entries.length;
      offset = result.nextOffset || 0n;
    } while (result.hasMore);
    
    expect(totalEntries).toBe(10002); // +2 for . and ..
  });
});
```

## Best Practices

### 1. Always Include Standard Entries
```typescript
const entries = [
  ...DirentUtils.createStandardEntries(currentIno, parentIno),
  ...actualEntries
];
```

### 2. Consistent Ordering
```typescript
// Sort entries to ensure consistent pagination
const sortedEntries = entries.sort((a, b) => a.name.localeCompare(b.name));
```

### 3. Handle Empty Directories
```typescript
if (entries.length === 0) {
  return DirentUtils.createReaddirResult([
    ...DirentUtils.createStandardEntries(ino)
  ]);
}
```

### 4. Validate Parameters
```typescript
ValidationUtils.validateIno(ino);
ValidationUtils.validateOffset(offset);
```

### 5. Use Proper Types
```typescript
// Always specify d_type when known
const type = stat ? ModeUtils.getFileType(stat.mode) : DirentType.Unknown;
```

## Migration from Old APIs

### From Callback-Style

```typescript
// Old callback style
readdir: (path: string, cb: (err: number, names?: string[]) => void) => {
  // ...
}

// New Promise style
readdir: async (ino: Ino, offset: bigint, context: RequestContext) => {
  // ...
  return DirentUtils.createReaddirResult(entries);
}
```

### From String Paths to Inodes

```typescript
// Old: path-based
readdir: async (path: string) => { /* ... */ }

// New: inode-based with context
readdir: async (ino: Ino, offset: bigint, context: RequestContext) => {
  // Convert ino to internal path/identifier if needed
  const internalPath = await inodeToPath(ino);
  // ...
}
```

## Troubleshooting

### Common Issues

1. **Missing Standard Entries**: Always include `.` and `..`
2. **Inconsistent Pagination**: Ensure stable sorting between requests
3. **Memory Issues**: Use streaming for very large directories
4. **Type Errors**: Always set `d_type` when known
5. **Permission Errors**: Check directory read permissions

### Debugging

```typescript
const DEBUG = process.env.FUSE_DEBUG_READDIR === '1';

readdir: async (ino, offset, context) => {
  if (DEBUG) {
    console.log(`[readdir] ino=${ino}, offset=${offset}, uid=${context.uid}`);
  }
  
  const startTime = process.hrtime.bigint();
  const result = await performReaddir(ino, offset, context);
  const duration = process.hrtime.bigint() - startTime;
  
  if (DEBUG) {
    console.log(`[readdir] completed in ${duration / 1_000_000n}ms, ` +
                `returned ${result.entries.length} entries, hasMore=${result.hasMore}`);
  }
  
  return result;
}
```

## See Also

- [Error Handling](./errors.md)
- [Performance Guide](./performance.md)
- [Types Reference](./api.md)
- [Testing Guide](./testing.md)