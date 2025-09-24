# Modular In-Memory Filesystem Example

A complete in-memory filesystem implementation for the FUSE3 Node.js binding, written in TypeScript with full type safety and modular architecture.

## Overview

This example demonstrates a fully functional in-memory filesystem that implements all major FUSE operations. It's designed to showcase the capabilities of the FUSE3 Node.js binding while providing a practical, working filesystem implementation with a clean, modular architecture.

## Features

- **Complete FUSE Implementation**: Supports all major FUSE operations including file I/O, directory operations, permissions, extended attributes, and more
- **TypeScript First**: Full type safety with proper TypeScript interfaces and branded types
- **In-Memory Storage**: All data is stored in memory for fast access
- **Comprehensive Error Handling**: Proper POSIX error codes and error propagation
- **Thread-Safe Operations**: Safe for concurrent access
- **Performance Optimized**: Zero-copy operations where possible
- **Modular Architecture**: Clean separation of concerns with operation-specific modules

## Project Structure

```
src/
├── types.ts                    # TypeScript type definitions and utilities
├── InMemoryFilesystem.ts       # Main filesystem class (composition-based)
├── InMemoryFilesystemCore.ts   # Core state management and utilities
├── operations/                 # Operation-specific modules
│   ├── fileOperations.ts       # File I/O operations
│   ├── directoryOperations.ts  # Directory operations
│   ├── metadataOperations.ts   # Metadata operations
│   ├── linkOperations.ts       # Link operations
│   ├── xattrOperations.ts      # Extended attributes
│   └── advancedOperations.ts   # Advanced operations
├── example.ts                  # Example usage script
└── index.ts                    # Entry point and exports
```

## Installation

1. **Build the main FUSE binding** (from the root directory):
   ```bash
   npm install
   npm run build
   ```

2. **Install dependencies** for the example:
   ```bash
   cd examples/inmemory-fs
   npm install
   ```

3. **Build the example**:
   ```bash
   npm run build
   ```

## Usage

### Basic Usage

```bash
# Mount the filesystem
npm start /tmp/inmemory-fs

# Or specify a custom mount point
npm start /path/to/mount/point
```

### Development

```bash
# Watch mode for development
npm run dev

# Manual build
npm run build

# Clean build artifacts
npm run clean
```

## Testing the Filesystem

Once mounted, you can test the filesystem using standard Unix commands:

```bash
# List contents
ls -la /tmp/inmemory-fs

# Create files
echo "Hello, World!" > /tmp/inmemory-fs/hello.txt
cat /tmp/inmemory-fs/hello.txt

# Create directories
mkdir /tmp/inmemory-fs/testdir
ls /tmp/inmemory-fs/testdir

# Copy files
cp /tmp/inmemory-fs/hello.txt /tmp/inmemory-fs/testdir/copied.txt

# Check file attributes
stat /tmp/inmemory-fs/hello.txt

# Extended attributes
setfattr -n user.comment -v "My test file" /tmp/inmemory-fs/hello.txt
getfattr -n user.comment /tmp/inmemory-fs/hello.txt
```

## Supported Operations

### File Operations
- ✅ `create` - Create new files
- ✅ `open` - Open files for reading/writing
- ✅ `read` - Read file contents
- ✅ `write` - Write to files
- ✅ `truncate` - Truncate files
- ✅ `unlink` - Remove files

### Directory Operations
- ✅ `mkdir` - Create directories
- ✅ `rmdir` - Remove directories
- ✅ `readdir` - List directory contents
- ✅ `rename` - Rename files/directories

### Metadata Operations
- ✅ `getattr` - Get file attributes
- ✅ `setattr` - Set file attributes
- ✅ `chmod` - Change file permissions
- ✅ `chown` - Change file ownership
- ✅ `utimens` - Update timestamps

### Link Operations
- ✅ `symlink` - Create symbolic links
- ✅ `readlink` - Read symbolic links
- ✅ `link` - Create hard links

### Extended Attributes
- ✅ `getxattr` - Get extended attributes
- ✅ `setxattr` - Set extended attributes
- ✅ `listxattr` - List extended attributes
- ✅ `removexattr` - Remove extended attributes

### Advanced Operations
- ✅ `fallocate` - Pre-allocate file space
- ✅ `lseek` - Seek in files
- ✅ `copy_file_range` - Copy file ranges
- ✅ `statfs` - Get filesystem statistics

### Synchronization
- ✅ `fsync` - Synchronize file data
- ✅ `fsyncdir` - Synchronize directory data
- ✅ `flush` - Flush file buffers

## Architecture

### Modular Design

The filesystem uses a modular architecture with clear separation of concerns:

#### Core Layer (`InMemoryFilesystemCore`)
- **State Management**: Manages inodes, path resolution, and filesystem metadata
- **Shared Utilities**: Common operations like timestamp updates, inode creation
- **Configuration**: Handles filesystem configuration and limits

#### Operation Modules (`operations/`)
- **FileOperations**: File I/O operations (create, open, read, write, release, truncate)
- **DirectoryOperations**: Directory management (mkdir, rmdir, readdir, opendir, etc.)
- **MetadataOperations**: File attributes (getattr, chmod, chown, setattr)
- **LinkOperations**: Symbolic and hard links (symlink, readlink, link)
- **XattrOperations**: Extended attributes (getxattr, setxattr, listxattr, removexattr)
- **AdvancedOperations**: Advanced features (fallocate, lseek, copy_file_range, etc.)

#### Main Layer (`InMemoryFilesystem`)
- **Composition**: Combines operation modules into a unified interface
- **FUSE Integration**: Implements the `FuseOperationHandlers` interface
- **Public API**: Provides access to core functionality and statistics

### Inode Management
The filesystem uses a custom `Inode` structure to represent files, directories, and symbolic links:

```typescript
interface Inode {
  id: Ino;              // Unique inode number
  type: InodeType;      // 'file' | 'directory' | 'symlink'
  mode: Mode;           // File permissions
  uid: Uid;             // Owner user ID
  gid: Gid;             // Owner group ID
  size: bigint;         // File size
  atime: Timestamp;     // Access time
  mtime: Timestamp;     // Modification time
  ctime: Timestamp;     // Change time
  nlink: number;        // Number of hard links
  data: Buffer | Map<string, Inode> | string | null; // Node data
  xattrs: Map<string, Buffer>; // Extended attributes
}
```

### Type Safety
The implementation uses branded types from the main FUSE binding for type safety:

- `Ino` - Inode numbers (bigint)
- `Mode` - File modes (number)
- `Uid` - User IDs (number)
- `Gid` - Group IDs (number)
- `Timestamp` - Nanosecond timestamps (bigint)

### Error Handling
All operations use proper POSIX error codes through the `FuseErrno` class:

```typescript
throw new FuseErrno('ENOENT', 'No such file or directory');
throw new FuseErrno('EACCES', 'Permission denied');
throw new FuseErrno('EEXIST', 'File exists');
```

### Benefits of Modular Architecture

1. **Maintainability**: Each operation type is isolated and easier to modify
2. **Testability**: Individual modules can be tested independently
3. **Extensibility**: New operations can be added without affecting existing code
4. **Code Reuse**: Core functionality is shared across all operations
5. **Separation of Concerns**: Clear boundaries between different types of operations

## Performance Characteristics

- **Memory Usage**: O(n) where n is the number of files and directories
- **Lookup Time**: O(1) for direct inode access, O(depth) for path resolution
- **File I/O**: O(1) for small files, O(n) for large files (due to Buffer operations)
- **Directory Operations**: O(1) amortized for most operations

## Configuration

The filesystem can be configured through the `InMemoryFsConfig` interface:

```typescript
const config: InMemoryFsConfig = {
  rootMode: 0o755,           // Root directory permissions
  defaultFileMode: 0o644,    // Default file permissions
  defaultDirMode: 0o755,     // Default directory permissions
  defaultUid: 1000,          // Default owner user ID
  defaultGid: 1000,          // Default owner group ID
  maxInodes: 1000000,        // Maximum number of inodes
};

const fs = new InMemoryFilesystem(config);
```

## Development

### Adding New Operations

To add support for new FUSE operations:

1. Add the handler method to the `InMemoryFilesystem` class
2. Implement the operation logic with proper error handling
3. Add the handler to the `handlers` object in `index.ts`
4. Update this documentation

### Testing

The example includes basic testing in the main function. For comprehensive testing:

1. Mount the filesystem
2. Use standard Unix tools to test operations
3. Check the console output for debug information
4. Verify that all operations complete successfully

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure the mount point is writable and you have FUSE permissions
2. **Module Not Found**: Make sure the main FUSE binding is built and available
3. **TypeScript Errors**: Run `npm run build` to check for compilation errors
4. **Mount Fails**: Check that no other filesystem is mounted at the same point

### Debug Mode

Enable debug output by setting the `debug` option:

```typescript
const session = await createSession(MOUNT_POINT, handlers, {
  debug: true
});
```

## License

MIT License - see the main project for details.