# FUSE Native 3.0 - Modern FUSE3 Bindings for Node.js

[![CI Status](https://github.com/sagemathinc/fuse-native/workflows/CI/badge.svg)](https://github.com/sagemathinc/fuse-native/actions)
[![npm version](https://badge.fury.io/js/@cocalc%2Ffuse-native.svg)](https://www.npmjs.com/package/@cocalc/fuse-native)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, high-performance **FUSE3** binding for Node.js built with **N-API** and **TypeScript**. This library provides a complete, type-safe interface to FUSE (Filesystem in Userspace) with focus on correctness, performance, and developer experience.

## ✨ Features

- **🚀 Modern Architecture**: Built on stable N-API with TypeScript-first design
- **📊 BigInt Support**: Native 64-bit file sizes, offsets, and timestamps
- **⚡ High Performance**: Zero-copy data paths and optimized I/O operations
- **🛡️ Type Safety**: Comprehensive TypeScript types with branded types for safety
- **🔄 Promise-Based**: Clean async/await API with AbortSignal and timeout support
- **📈 Observability**: Built-in structured logging and metrics
- **🧪 Well Tested**: Comprehensive test suite with mock testing capabilities
- **🔧 POSIX Compliant**: Consistent errno error handling and POSIX semantics

## 🎯 Use Cases

- **Custom Filesystems**: Build filesystems backed by databases, cloud storage, or APIs
- **Virtual Filesystems**: Create overlay, union, or transformation filesystems  
- **Development Tools**: Build debugging tools, profilers, or development utilities
- **Data Processing**: Stream processing with filesystem interfaces
- **Distributed Systems**: Network-attached or distributed filesystem implementations

## 📋 Requirements

- **Node.js**: >= 18.0.0
- **Operating System**: Linux (FUSE3 support required)
- **Build Tools**: C++ compiler (GCC/Clang), CMake >= 3.18, pkg-config
- **System Libraries**: libfuse3-dev

### System Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install libfuse3-dev build-essential cmake pkg-config
```

**Fedora/CentOS/RHEL:**
```bash
sudo dnf install fuse3-devel gcc-c++ cmake pkg-config
# or on older systems:
sudo yum install fuse3-devel gcc-c++ cmake pkg-config
```

**Arch Linux:**
```bash
sudo pacman -S fuse3 base-devel cmake pkgconf
```

## 🚀 Quick Start

### Installation

```bash
# Using pnpm (recommended)
pnpm add @cocalc/fuse-native

# Using npm
npm install @cocalc/fuse-native

# Using yarn
yarn add @cocalc/fuse-native
```

### Basic Example

```typescript
import { createSession, mode, errno } from '@cocalc/fuse-native';
import type { FuseOperationHandlers, StatResult } from '@cocalc/fuse-native';

// Simple in-memory filesystem
const files = new Map<bigint, { name: string; content: Buffer; stat: StatResult }>();
let nextIno = 2n; // Start after root inode (1)

const operations: FuseOperationHandlers = {
  async lookup(parent, name, context) {
    // Find file in parent directory
    for (const [ino, file] of files) {
      if (file.name === name) {
        return {
          attr: file.stat,
          timeout: 1.0
        };
      }
    }
    
    throw new Error('ENOENT');
  },

  async getattr(ino, context) {
    if (ino === 1n) {
      // Root directory
      return {
        attr: {
          ino: 1n,
          mode: mode.S_IFDIR | 0o755,
          nlink: 2n,
          size: 0n,
          blocks: 0n,
          atime: BigInt(Date.now()) * 1000000n,
          mtime: BigInt(Date.now()) * 1000000n,
          ctime: BigInt(Date.now()) * 1000000n,
        }
      };
    }
    
    const file = files.get(ino);
    if (file) {
      return { attr: file.stat };
    }
    
    throw new Error('ENOENT');
  },

  async readdir(ino, context) {
    if (ino !== 1n) throw new Error('ENOTDIR');
    
    const entries = [];
    for (const [fileIno, file] of files) {
      entries.push({
        name: file.name,
        ino: fileIno,
        type: mode.S_IFREG
      });
    }
    
    return entries;
  }
};

// Create and mount session
const session = createSession('/tmp/my-fuse-fs', operations, {
  debug: true,
  allowOther: false
});

try {
  await session.mount();
  console.log('Filesystem mounted successfully');
  
  // Keep running until interrupted
  process.on('SIGINT', async () => {
    console.log('Unmounting filesystem...');
    await session.unmount();
    process.exit(0);
  });
  
} catch (error) {
  console.error('Failed to mount filesystem:', error);
}
```

### AbortSignal and Timeout Examples

All async operations support cancellation and timeouts:

```typescript
import { 
  copyFileRange, 
  getxattr, 
  setxattr,
  AbortError,
  TimeoutError 
} from '@cocalc/fuse-native';

// Example 1: Manual cancellation
const controller = new AbortController();

const copyPromise = copyFileRange(1, 0n, 2, 0n, 1024n, 0, {
  signal: controller.signal
});

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  const bytesCopied = await copyPromise;
  console.log(`Copied ${bytesCopied} bytes`);
} catch (error) {
  if (error instanceof AbortError) {
    console.log('Copy operation was cancelled');
  }
}

// Example 2: Timeout
try {
  const result = await getxattr('/slow/file', 'user.metadata', undefined, {
    timeout: 3000  // 3 second timeout
  });
  console.log('Attribute value:', result);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Operation timed out after 3 seconds');
  }
}

// Example 3: Combined signal and timeout
const userController = new AbortController();

try {
  await setxattr('/file', 'user.test', Buffer.from('value'), 0, {
    signal: userController.signal,  // Can be cancelled by user
    timeout: 10000                  // Or times out after 10 seconds
  });
  console.log('Attribute set successfully');
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Setting attribute timed out');
  } else if (error instanceof AbortError) {
    console.log('Operation was cancelled by user');
  }
}
          mode: mode.S_IFDIR | 0o755,
          nlink: 2,
          uid: context.uid,
          gid: context.gid,
          size: 0n,
          blocks: 0n,
          atime: BigInt(Date.now()) * 1_000_000n,
          mtime: BigInt(Date.now()) * 1_000_000n,
          ctime: BigInt(Date.now()) * 1_000_000n
        },
        timeout: 1.0
      };
    }

    const file = files.get(ino);
    if (!file) {
      throw new Error('ENOENT');
    }

    return {
      attr: file.stat,
      timeout: 1.0
    };
  },

  async read(ino, context, options) {
    const file = files.get(ino);
    if (!file) {
      throw new Error('ENOENT');
    }

    const start = Number(options.offset);
    const end = Math.min(start + options.size, file.content.length);
    const slice = file.content.subarray(start, end);
    
    return slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
  }
};

// Create and mount the filesystem
const session = createSession('/tmp/my-fs', operations, {
  debug: true,
  allowOther: true
});

await session.mount();
console.log('Filesystem mounted at /tmp/my-fs');

// Handle cleanup
process.on('SIGINT', async () => {
  await session.unmount();
  await session.destroy();
  console.log('Filesystem unmounted');
  process.exit(0);
});
```

## 🏗️ Local Development

### Prerequisites

Ensure you have the system dependencies installed (see Requirements section above).

### Building from Source

```bash
# Clone the repository
git clone https://github.com/sagemathinc/fuse-native.git
cd fuse-native

# Install dependencies
pnpm install

# Build native and TypeScript components
pnpm run build

# Run tests
pnpm test

# Run with coverage
pnpm run test:coverage
```

### Development Scripts

```bash
# Clean build artifacts
pnpm run clean

# Build only native module
pnpm run build:native

# Build only TypeScript
pnpm run build:ts

# Watch mode for TypeScript
pnpm run dev

# Linting and formatting
pnpm run lint
pnpm run format

# Type checking
pnpm run typecheck
```

### Testing Without FUSE

The test suite includes comprehensive mock tests that don't require FUSE capabilities:

```bash
# Run mock tests (no mount required)
pnpm test test/smoke.test.ts

# Run specific operation tests
pnpm test test/readdir.test.ts      # Readdir with pagination & d_type
pnpm test test/helpers-dirent.test.ts  # Directory entry utilities
pnpm test test/readdir-errors.test.ts  # Error handling & FUSE compliance

# Run all tests
pnpm test

# Watch mode
pnpm run test:watch
```

#### Comprehensive Test Coverage

The test suite includes extensive coverage for all FUSE operations:

- **📁 Readdir Operations**: Pagination, large directories (10k+ entries), `d_type` support
- **🔧 Helper Functions**: DirentUtils, error handling, type safety
- **⚡ Performance Tests**: Concurrent operations, memory efficiency
- **❌ Error Scenarios**: All documented errno conditions with FUSE specification compliance

## 📖 API Documentation

### Core Types

All file sizes, offsets, and inode numbers use `BigInt` for proper 64-bit support:

```typescript
import type { 
  Ino,        // Branded BigInt for inode numbers
  Fd,         // Branded number for file descriptors  
  Mode,       // Branded number for file modes
  Flags,      // Branded number for file flags
  Timestamp   // BigInt nanoseconds since epoch
} from '@cocalc/fuse-native';
```

### Operation Handlers

Implement the operations your filesystem needs:

```typescript
interface FuseOperationHandlers {
  lookup?: (parent: Ino, name: string, context: RequestContext) => Promise<LookupResult>;
  getattr?: (ino: Ino, context: RequestContext, fi?: FileInfo) => Promise<GetattrResult>;
  setattr?: (ino: Ino, attr: Partial<StatResult>, context: RequestContext) => Promise<SetattrResult>;
  read?: (ino: Ino, context: RequestContext, options: ReadOptions) => Promise<ArrayBuffer>;
  write?: (ino: Ino, data: ArrayBuffer, context: RequestContext, options: WriteOptions) => Promise<number>;
  // ... and many more
}
```

### Error Handling

Use standard POSIX errno codes:

```typescript
import { errno } from '@cocalc/fuse-native';

// Throw errors with proper errno codes
throw new FuseErrno('ENOENT');  // File not found
throw new FuseErrno('EACCES');  // Permission denied
throw new FuseErrno('EEXIST');  // File exists

// Or use errno constants directly
if (someCondition) {
  throw new Error(`ERRNO:${errno.EINVAL}`);
}
```

### Session Management

```typescript
const session = createSession(mountpoint, operations, options);

// Mount the filesystem
await session.mount({
  timeout: 30000  // 30 second timeout
});

// Check status
console.log('Mounted:', session.mounted);
console.log('Ready:', session.ready);

// Unmount gracefully
await session.unmount({
  force: false,  // Graceful unmount
  lazy: false    // Not lazy
});

// Clean up resources
await session.destroy();
```

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
pnpm test

# Run specific test files  
pnpm test test/smoke.test.ts

# Run with verbose output
pnpm test --verbose

# Watch mode
pnpm run test:watch
```

### Integration Tests

Integration tests require FUSE capabilities and mount permissions:

```bash
# Run integration tests (requires mount permissions)
sudo pnpm test test/integration/

# Or use user namespaces (if available)
unshare -rm pnpm test test/integration/
```

### Mock Testing

The library includes comprehensive mocking utilities:

```typescript
import { createMockStat, createMockContext, createMockFileInfo } from '../test/setup.ts';

const mockStat = createMockStat();
const mockContext = createMockContext();
const mockFileInfo = createMockFileInfo();
```

## ⚡ Performance

### Optimization Guidelines

1. **Use BigInt for 64-bit values**: Proper handling prevents precision loss
2. **Implement Zero-Copy patterns**: Return ArrayBuffer directly when possible  
3. **Batch operations**: Group related filesystem operations
4. **Use appropriate timeouts**: Balance cache efficiency with data freshness
5. **Handle AbortSignal**: Support cancellation for long-running operations

### Benchmarking

```bash
# Run performance benchmarks
pnpm run bench

# Profile memory usage
pnpm run bench:memory

# I/O performance tests
pnpm run bench:io
```

## 🔧 Configuration

### Session Options

```typescript
const options: FuseSessionOptions = {
  // Access control
  allowOther: false,          // Allow other users to access
  allowRoot: false,           // Allow root access
  defaultPermissions: true,   // Use default permission checking

  // Performance
  maxRead: 131072,           // Maximum read size (128KB)  
  maxWrite: 131072,          // Maximum write size (128KB)
  timeout: 1.0,              // Attribute/entry cache timeout

  // Behavior
  debug: false,              // Enable debug logging
  singleThreaded: false,     // Force single-threaded mode
  autoUnmount: true,         // Auto-unmount on exit

  // Custom mount options
  mountOptions: [
    'default_permissions',
    'allow_other'
  ]
};
```

## 🚨 Troubleshooting

### Common Issues

**Build Failures:**
```bash
# Ensure FUSE3 development headers are installed
sudo apt-get install libfuse3-dev

# Clear build cache
pnpm run clean
pnpm install --force
pnpm run build
```

**Permission Errors:**
```bash
# Add user to fuse group
sudo usermod -a -G fuse $USER

# Or run with appropriate permissions
sudo node your-app.js
```

**Mount Issues:**
```bash
# Check if mountpoint is already in use
mountpoint /tmp/my-fs

# Force unmount if needed
sudo fusermount -u /tmp/my-fs

# Check FUSE is available
ls -la /dev/fuse
```

### Debug Mode

Enable debug logging for detailed operation traces:

```typescript
const session = createSession('/tmp/debug-fs', operations, {
  debug: true
});
```

### Logging

The library uses structured logging. Configure your log level:

```bash
export DEBUG=fuse-native:*
node your-app.js
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following the coding standards
4. Add tests for new functionality
5. Ensure all tests pass: `pnpm test`
6. Commit with conventional commits: `feat: add amazing feature`
7. Push and create a Pull Request

### Code Style

- **TypeScript**: Strict mode with comprehensive type annotations
- **C++**: C++17 with RAII patterns and proper error handling
- **Testing**: Jest with comprehensive mock and integration tests
- **Documentation**: JSDoc for all public APIs

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- **FUSE Project**: For the excellent filesystem framework
- **Node.js Team**: For the stable N-API
- **TypeScript Team**: For the amazing type system
- **Original fuse-bindings**: Inspiration for the API design

## 📚 Related Projects

- [libfuse](https://github.com/libfuse/libfuse) - The original FUSE library
- [node-fuse-bindings](https://github.com/mafintosh/fuse-bindings) - Original Node.js FUSE bindings  
- [go-fuse](https://github.com/hanwen/go-fuse) - FUSE bindings for Go
- [python-fuse](https://github.com/libfuse/python-fuse) - FUSE bindings for Python

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/sagemathinc/fuse-native/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sagemathinc/fuse-native/discussions)
- **Security**: Report security issues to security@sagemathinc.com

---

**Built with ❤️ by the FUSE Native team**