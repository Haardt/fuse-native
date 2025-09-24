# FUSE Proxy Example

This example demonstrates a complete FUSE filesystem proxy that forwards all operations to a target directory. It serves as both a comprehensive test of the FUSE native module and a practical example of how to implement a full FUSE filesystem.

## Features

The FUSE proxy implements all major filesystem operations:

- **File Operations**: create, open, read, write, close, unlink
- **Directory Operations**: mkdir, rmdir, readdir
- **Buffer Operations**: optimized read_buf and write_buf for better performance
- **Attribute Operations**: getattr, chmod, chown, utimens
- **Link Operations**: symlink, readlink, link
- **Extended Attributes**: setxattr, getxattr, listxattr, removexattr
- **Synchronization**: flush, fsync
- **Access Control**: access checks
- **File System Stats**: statfs

## Quick Start

### 1. Build the Native Module

```bash
cd fuse-native
npm install
```

### 2. Run the Test Script

The easiest way to test the FUSE proxy is with the automated test script:

```bash
./examples/test-proxy.sh
```

This script will:
- Set up a clean test environment
- Start the FUSE proxy
- Test basic file operations
- Run `npx create-react-app todo-app` through the proxy
- Verify that all operations completed successfully

### 3. Manual Usage

You can also run the FUSE proxy manually:

```bash
node examples/fuse-proxy.js [mount_point] [target_directory]
```

Example:
```bash
node examples/fuse-proxy.js /tmp/my-fuse-mount /tmp/my-target-dir
```

## The create-react-app Test

The example automatically runs `npx create-react-app todo-app` to demonstrate that the FUSE proxy can handle complex, real-world operations including:

- **Thousands of file creations** (React app files, node_modules)
- **Directory tree creation** (nested folder structures)
- **Package installation** (npm operations)
- **Symlink handling** (node_modules symlinks)
- **Permission management** (executable files)
- **Large file operations** (bundled JavaScript files)
- **Concurrent I/O** (parallel npm operations)

## How It Works

```
Application (create-react-app)
         ↓
FUSE Kernel Module
         ↓
FUSE Native Library
         ↓  
Node.js FUSE Proxy
         ↓
Target Directory (/tmp/fuse-target)
```

1. **Applications** access files through the mount point (e.g., `/tmp/fuse-proxy`)
2. **FUSE kernel module** intercepts system calls and forwards them
3. **FUSE native library** converts kernel requests to JavaScript calls
4. **Node.js proxy** receives the calls and forwards them to the target directory
5. **Target directory** stores the actual files

## Example Output

When running the test, you'll see detailed logging of all filesystem operations:

```
FUSE Proxy Example
==================
Mount point: /tmp/fuse-proxy-test
Target directory: /tmp/fuse-target-test

✅ FUSE proxy successfully mounted!

Testing with create-react-app...
Command: npx create-react-app /tmp/fuse-proxy-test/todo-app

getattr: /todo-app -> /tmp/fuse-target-test/todo-app
mkdir: /todo-app -> /tmp/fuse-target-test/todo-app (mode: 755)
create: /todo-app/package.json -> /tmp/fuse-target-test/todo-app/package.json (mode: 644)
write_buf: /todo-app/package.json (fd: 23, buf.length: 1024, pos: 0)
...

🎉 SUCCESS! React app created successfully through FUSE proxy!

📁 package.json: ✅
📁 src/: ✅  
📁 public/: ✅
📦 App name: todo-app
📦 React version: ^18.2.0
```

## Error Handling

The proxy includes comprehensive error handling:

- **Filesystem errors** are properly converted to FUSE error codes
- **Permission errors** are forwarded correctly
- **Network timeouts** (during npm install) are handled gracefully
- **Graceful shutdown** on SIGINT/SIGTERM with proper unmounting

## Performance Considerations

- **Buffer operations** (`read_buf`, `write_buf`) are used for optimal performance
- **Minimal copying** - data is forwarded efficiently
- **Asynchronous operations** - all I/O is non-blocking
- **Proper error codes** - applications receive correct filesystem responses

## Troubleshooting

### Mount fails
```bash
# Check if FUSE is installed
fusermount --version

# On Ubuntu/Debian
sudo apt-get install fuse

# On macOS
brew install --cask osxfuse
```

### Permission denied
```bash
# Add user to fuse group (Linux)
sudo usermod -a -G fuse $USER

# Logout and login again
```

### Already mounted
```bash
# Unmount existing mount
fusermount -u /tmp/fuse-proxy-test
# or
umount /tmp/fuse-proxy-test
```

### Module not built
```bash
# Rebuild native module
cd fuse-native
npm run rebuild
```

## Use Cases

This FUSE proxy pattern is useful for:

- **Filesystem virtualization** - Present files from multiple sources as one filesystem
- **Caching layers** - Add caching between applications and storage
- **Monitoring** - Log all filesystem operations for debugging
- **Transformation** - Modify files on-the-fly (compression, encryption)
- **Testing** - Test filesystem behavior with real applications
- **Migration** - Gradually move data while maintaining access

## Architecture Details

The proxy implements the complete FUSE operations interface:

```javascript
const ops = {
  // Core operations
  getattr, readdir, open, create, read, write, release,
  
  // Buffer operations (optimized)
  read_buf, write_buf,
  
  // Directory operations  
  mkdir, rmdir, opendir, releasedir,
  
  // File management
  unlink, rename, link, symlink, readlink,
  
  // Attributes
  chmod, chown, truncate, utimens,
  
  // Extended attributes
  setxattr, getxattr, listxattr, removexattr,
  
  // Synchronization
  flush, fsync, fsyncdir,
  
  // System
  access, statfs
}
```

Each operation:
1. Logs the operation for monitoring
2. Converts the FUSE path to target path
3. Performs the operation on the target filesystem
4. Converts errors to appropriate FUSE error codes
5. Returns results to the FUSE kernel

## Testing Results

After successful completion, you should see:

```
🎉 FUSE PROXY TEST COMPLETED SUCCESSFULLY!

The FUSE proxy correctly handled all file operations needed by create-react-app:
• File creation and writing
• Directory creation  
• File reading
• Permission management
• Symlink operations
• Buffer operations

All operations were transparently forwarded to the target directory.
```

This confirms that the FUSE native module correctly handles all the complex filesystem operations required by modern JavaScript applications.