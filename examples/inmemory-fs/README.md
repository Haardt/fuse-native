# In-Memory Filesystem Example

This example demonstrates a fully functional in-memory filesystem using the FUSE3 Node.js binding. The filesystem supports npm install simulation, file execution, and provides a complete development environment within the mounted directory.

## Features

- 🚀 **Complete FUSE filesystem implementation** with all standard operations
- 📦 **npm install simulation** - creates realistic node_modules structure
- 🔗 **Dependency management** - simulates lodash, chalk, and other packages
- ⚡ **File execution** - executable scripts in node_modules/.bin
- 📁 **Directory operations** - mkdir, rmdir, readdir, etc.
- 📝 **File operations** - read, write, create, delete, rename
- 🔒 **Permissions and ownership** - proper Unix-style permissions
- 🔗 **Symlinks and hard links** - full symlink support
- ⏰ **Timestamps** - atime, mtime, ctime tracking

## Project Structure

```
/
├── src/
│   ├── index.js          # Main application file
│   └── example-script.js # Executable script
├── bin/
│   └── example-script.js # Binary script (defined in package.json)
├── node_modules/         # Auto-generated during npm install
│   ├── .bin/
│   │   ├── lodash        # Executable shim
│   │   └── chalk         # Executable shim
│   ├── lodash/
│   │   ├── package.json
│   │   └── index.js
│   └── chalk/
│       ├── package.json
│       └── index.js
└── package.json          # Project configuration
```

## Usage

### Build the Example

```bash
cd examples/inmemory-fs
npm install
npm run build
```

### Mount the Filesystem

```bash
# Mount to a directory (will be created if it doesn't exist)
npm start /tmp/my-inmemory-fs

# Or use the default mount point
npm start
```

### Use the Filesystem

Once mounted, you can interact with the filesystem like any other directory:

```bash
# Navigate to the mount point
cd /tmp/my-inmemory-fs

# List files
ls -la

# View package.json
cat package.json

# Simulate npm install (creates node_modules)
npm install

# Execute the example script
./node_modules/.bin/lodash --version
./node_modules/.bin/chalk --help

# Run the main application
node src/index.js

# Execute the binary script (defined in package.json)
npm run start
```

## Key Components

### Filesystem Class (`src/filesystem.ts`)

The core filesystem implementation that manages:

- **Inode management** - tracks all files, directories, and metadata
- **npm simulation** - creates realistic package structures
- **Package installation** - simulates `npm install` behavior
- **Path resolution** - converts paths to inode references

### Operations Class (`src/operations.ts`)

Implements all FUSE operations:

- **File operations** - read, write, create, delete
- **Directory operations** - mkdir, rmdir, readdir, lookup
- **Metadata operations** - getattr, setattr, chmod, chown
- **Link operations** - symlink, readlink, link
- **Extended attributes** - getxattr, setxattr, listxattr

### Main Application (`src/index.ts`)

- Initializes the FUSE session
- Creates filesystem and operations instances
- Handles mounting and unmounting
- Provides user feedback and instructions

## Supported Operations

This example implements all standard FUSE operations:

| Operation | Status | Description |
|-----------|--------|-------------|
| `getattr` | ✅ | Get file attributes |
| `readdir` | ✅ | Read directory contents |
| `lookup` | ✅ | Lookup file in directory |
| `create` | ✅ | Create new file |
| `open` | ✅ | Open file for access |
| `read` | ✅ | Read file contents |
| `write` | ✅ | Write file contents |
| `release` | ✅ | Release file handle |
| `mkdir` | ✅ | Create directory |
| `rmdir` | ✅ | Remove directory |
| `unlink` | ✅ | Remove file |
| `rename` | ✅ | Rename/move file |
| `chmod` | ✅ | Change file mode |
| `chown` | ✅ | Change file ownership |
| `truncate` | ✅ | Truncate file size |
| `statfs` | ✅ | Get filesystem statistics |
| `access` | ✅ | Check file access permissions |
| `setattr` | ✅ | Set file attributes |
| `fsync` | ✅ | Synchronize file |
| `fsyncdir` | ✅ | Synchronize directory |

## Development

### Adding New Features

1. **Add filesystem functionality** in `src/filesystem.ts`
2. **Implement FUSE operations** in `src/operations.ts`
3. **Update types** in `src/types.ts` if needed
4. **Test changes** by mounting and using the filesystem

### Debugging

Enable debug logging:

```bash
FUSE_LOG=DEBUG npm start /tmp/debug-fs
```

### Customizing the Example

Modify the initial filesystem structure in `src/filesystem.ts`:

```typescript
// In initializeExampleProject()
const customFile = this.createInodeInternal('file', S_IFREG | 0o644);
// Add your custom files and directories
```

## Performance Characteristics

- **Memory-based** - all data stored in RAM
- **Fast operations** - no disk I/O overhead
- **Volatile** - data lost on unmount
- **Thread-safe** - proper locking for concurrent access

## Use Cases

This example is perfect for:

- **Testing FUSE applications** - isolated, predictable environment
- **Development workflows** - temporary filesystems for builds
- **Learning FUSE** - understand filesystem operations
- **Debugging** - inspect filesystem behavior in detail
- **Demos** - showcase filesystem concepts

## Troubleshooting

### Mount Point Issues

```bash
# Ensure mount point doesn't already exist
rmdir /tmp/my-inmemory-fs

# Or use a different location
npm start /tmp/fuse-example
```

### Permission Errors

```bash
# Run with appropriate permissions
sudo npm start /tmp/my-inmemory-fs
```

### Build Issues

```bash
# Clean and rebuild
npm run clean
npm run build
```

## Related Examples

- **Basic FUSE** - minimal filesystem implementation
- **Read-only** - filesystem with read-only operations
- **Network FS** - filesystem backed by remote storage
- **Compressed FS** - on-the-fly compression/decompression

## Contributing

When extending this example:

1. Follow the existing code patterns
2. Add comprehensive error handling
3. Update this README with new features
4. Test thoroughly before submitting

## License

MIT - see main project LICENSE file.
