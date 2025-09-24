# FUSE3 Node.js Examples

This directory contains examples demonstrating the FUSE3 Node.js binding capabilities.

## In-Memory Filesystem Example (`inmemory-fs.mjs`)

A complete in-memory filesystem implementation that demonstrates all FUSE operations.

### Features

- **Complete FUSE Operation Coverage**: Implements all 40+ FUSE operations including:
  - File operations (create, open, read, write, release)
  - Directory operations (mkdir, rmdir, readdir, opendir, releasedir)
  - Attribute operations (getattr, chmod, chown, truncate, utimens)
  - Link operations (symlink, readlink, link, unlink)
  - Extended attributes (getxattr, setxattr, listxattr, removexattr)
  - Synchronization (flush, fsync, fsyncdir)
  - Advanced operations (fallocate, lseek, copy_file_range)
  - Locking operations (flock, lock)
  - Device operations (ioctl, bmap, poll)
  - System operations (access, statfs, rename)

- **In-Memory Storage**: All data is stored in memory using JavaScript Maps and Buffers
- **Proper Error Handling**: Comprehensive error handling with appropriate errno codes
- **TypeScript-Compatible**: Uses BigInt for 64-bit values, proper type safety
- **Performance Optimized**: Zero-copy operations where possible

### Architecture

The example implements a complete inode-based filesystem:

```javascript
class Inode {
  // id, type, mode, uid, gid, size, timestamps, nlink, data, xattrs
}

class InMemoryFilesystem {
  // Root inode, inode map, path resolution, all FUSE operations
}
```

### Usage


#### Quick Start (Recommended)

```bash
# Use the start script with all options
./examples/start-inmemory-fs.sh --help

# Start with default settings
./examples/start-inmemory-fs.sh

# Start with custom mount point and debug mode
./examples/start-inmemory-fs.sh --mount-point /tmp/my-inmemory-fs --debug

# Start in foreground mode
./examples/start-inmemory-fs.sh --foreground
```

#### Manual Start

```bash
# Build the native module first
npm run build

# Run the in-memory filesystem directly
node examples/inmemory-fs.mjs /tmp/inmemory-mount

# The filesystem will be mounted and you can interact with it
ls -la /tmp/inmemory-mount
echo "test" > /tmp/inmemory-mount/test.txt
mkdir /tmp/inmemory-mount/testdir
# ... all standard filesystem operations work
```

#### Start Script Options

The `start-inmemory-fs.sh` script provides comprehensive configuration:

```bash
# Command line options
./examples/start-inmemory-fs.sh [OPTIONS]

Options:
  -m, --mount-point PATH    Mount point (default: /tmp/inmemory-fs-test)
  -l, --log-level LEVEL     Log level: error, warn, info, debug (default: info)
  --debug                   Enable debug mode
  -f, --foreground          Run in foreground
  --no-auto-unmount         Disable automatic unmounting
  -h, --help                Show help

# Environment variables
MOUNT_POINT=/tmp/custom-mount ./examples/start-inmemory-fs.sh
DEBUG=true ./examples/start-inmemory-fs.sh
FOREGROUND=true ./examples/start-inmemory-fs.sh
```

### Operations Implemented

#### Core Operations
- `getattr` - Get file attributes
- `readdir` - Read directory contents
- `lookup` - Look up file by name
- `create` - Create and open file
- `open` - Open existing file
- `read` - Read from file
- `write` - Write to file
- `release` - Close file

#### Directory Operations
- `mkdir` - Create directory
- `rmdir` - Remove directory
- `opendir` - Open directory
- `releasedir` - Close directory

#### Attribute Operations
- `chmod` - Change permissions
- `chown` - Change ownership
- `truncate` - Truncate file
- `utimens` - Update timestamps

#### Link Operations
- `symlink` - Create symbolic link
- `readlink` - Read symbolic link
- `link` - Create hard link
- `unlink` - Remove file/directory

#### Advanced Operations
- `fallocate` - Preallocate space
- `lseek` - Seek in file
- `copy_file_range` - Copy data between files
- `flock` - File locking
- `lock` - POSIX locking

#### System Operations
- `access` - Check permissions
- `statfs` - Get filesystem statistics
- `rename` - Rename/move files

### Error Handling

The example demonstrates proper FUSE error handling:

```javascript
// Convert exceptions to FUSE errno codes
try {
  // operation logic
  cb(0, result); // Success
} catch (error) {
  cb(error.errno || -5, null); // Error with errno
}
```

Common errno codes used:
- `-2` (ENOENT): No such file or directory
- `-17` (EEXIST): File exists
- `-20` (ENOTDIR): Not a directory
- `-21` (EISDIR): Is a directory
- `-22` (EINVAL): Invalid argument
- `-39` (ENOTEMPTY): Directory not empty

### Performance Considerations

- **In-Memory Storage**: No disk I/O, demonstrates FUSE overhead
- **BigInt Timestamps**: Nanosecond precision timestamps
- **Buffer Operations**: Efficient data transfer
- **Reference Counting**: Proper inode lifecycle management

### Testing

The example includes built-in testing that:
1. Creates directories and files
2. Performs read/write operations
3. Tests attribute operations
4. Verifies directory operations
5. Demonstrates error conditions

### Comparison with Other Examples

| Feature | In-Memory FS | FUSE Proxy | Passthrough |
|---------|-------------|------------|------------|
| Storage | Memory | Disk | Disk |
| Operations | All 40+ | All 40+ | Core only |
| Complexity | High | Medium | Low |
| Performance | Fast | Medium | Fast |
| Use Case | Testing | Proxy | Simple |

### Integration with TypeScript API

While this example uses the callback-based API, it demonstrates patterns that work with the modern TypeScript API:

```typescript
// Modern async/await version would look like:
async getattr(path: string): Promise<Attr> {
  const inode = this.resolvePath(path);
  return inode.toAttr();
}
```

### Future Enhancements

Potential improvements:
- Persistence to disk
- Compression
- Encryption
- Snapshots
- Multi-threading support
- Performance benchmarking

This example serves as a comprehensive reference for implementing full-featured FUSE filesystems in Node.js.