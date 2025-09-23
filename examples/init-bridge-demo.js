#!/usr/bin/env node
/**
 * @file init-bridge-demo.js
 * @brief Demo of FUSE init bridge functionality and mount options
 *
 * This example demonstrates how to use the init bridge to capture FUSE
 * connection info and configuration during filesystem initialization.
 * It shows capability checking, mount options, and performance tuning.
 */

const {
  initializeInitBridge,
  setInitCallback,
  removeInitCallback,
  getConnectionInfo,
  getFuseConfig,
  getMountOptions,
  checkCapabilities,
  getCapabilityNames,
  resetInitBridge,
  createSession,
  mount,
  unmount,
  setOperationHandler,
} = require('../dist/index.js');

const path = require('path');
const fs = require('fs');

// Global state
let mountPoint = null;
let optimalBufferSize = 65536; // Will be updated based on FUSE limits
let hasAsyncRead = false;
let hasSplice = false;

/**
 * Demo filesystem operations
 */
const operations = {
  async getattr(path) {
    console.log(`[FS] getattr: ${path}`);

    if (path === '/') {
      return {
        mode: 0o755 | 0o040000, // Directory
        size: 4096,
        atime: Date.now(),
        mtime: Date.now(),
        ctime: Date.now(),
      };
    }

    if (path === '/hello.txt') {
      return {
        mode: 0o644 | 0o100000, // Regular file
        size: 13,
        atime: Date.now(),
        mtime: Date.now(),
        ctime: Date.now(),
      };
    }

    throw { code: 'ENOENT' };
  },

  async readdir(path) {
    console.log(`[FS] readdir: ${path}`);

    if (path === '/') {
      return ['hello.txt'];
    }

    throw { code: 'ENOTDIR' };
  },

  async read(path, fd, buffer, length, position) {
    console.log(`[FS] read: ${path}, pos=${position}, len=${length}`);

    if (path === '/hello.txt') {
      const content = 'Hello, World!';
      const start = Math.min(position, content.length);
      const end = Math.min(position + length, content.length);
      const data = content.slice(start, end);

      // Use optimal buffer size for performance
      const chunkSize = Math.min(data.length, optimalBufferSize);
      buffer.write(data.slice(0, chunkSize), 0);

      return chunkSize;
    }

    throw { code: 'ENOENT' };
  },

  async open(path, flags) {
    console.log(`[FS] open: ${path}, flags=${flags}`);

    if (path === '/hello.txt') {
      return 42; // Dummy file descriptor
    }

    throw { code: 'ENOENT' };
  },

  async release(path, fd) {
    console.log(`[FS] release: ${path}, fd=${fd}`);
    return 0;
  }
};

/**
 * Initialize the init bridge and set up callbacks
 */
async function setupInitBridge() {
  console.log('\n📋 Setting up init bridge...');

  try {
    await initializeInitBridge();
    console.log('✅ Init bridge initialized');

    // Set up the init callback to capture connection info
    await setInitCallback((connectionInfo, config) => {
      console.log('\n🚀 FUSE filesystem initialized!');
      console.log('\n📊 Connection Information:');
      console.log(`  Protocol: v${connectionInfo.protoMajor}.${connectionInfo.protoMinor}`);
      console.log(`  Max Write: ${connectionInfo.maxWrite} bytes`);
      console.log(`  Max Read: ${connectionInfo.maxRead} bytes`);
      console.log(`  Max Readahead: ${connectionInfo.maxReadahead} bytes`);
      console.log(`  Time Granularity: ${connectionInfo.timeGranNs}ns`);
      console.log(`  Available Capabilities: ${connectionInfo.caps.length}`);

      // Update optimal buffer size based on FUSE limits
      optimalBufferSize = Math.min(
        connectionInfo.maxWrite,
        1024 * 1024 // Cap at 1MB
      );
      console.log(`  Optimal Buffer Size: ${optimalBufferSize} bytes`);

      console.log('\n⚙️  Configuration:');
      console.log(`  Entry Timeout: ${config.entryTimeout}s`);
      console.log(`  Attr Timeout: ${config.attrTimeout}s`);
      console.log(`  Kernel Cache: ${config.kernelCache ? 'enabled' : 'disabled'}`);
      console.log(`  Auto Cache: ${config.autoCache ? 'enabled' : 'disabled'}`);
      console.log(`  Debug Mode: ${config.debug ? 'enabled' : 'disabled'}`);

      // Check for specific capabilities asynchronously
      setTimeout(async () => {
        try {
          hasAsyncRead = await checkCapabilities([1]); // FUSE_CAP_ASYNC_READ
          hasSplice = await checkCapabilities([128, 256, 512]); // Splice capabilities

          console.log('\n🔧 Feature Detection:');
          console.log(`  Async Read: ${hasAsyncRead ? '✅' : '❌'}`);
          console.log(`  Splice Support: ${hasSplice ? '✅' : '❌'}`);

          if (hasAsyncRead) {
            console.log('  → Can use asynchronous read operations for better performance');
          }
          if (hasSplice) {
            console.log('  → Can use splice for efficient data movement');
          }
        } catch (error) {
          console.warn('  ⚠️  Could not check capabilities:', error.message);
        }
      }, 100);
    });

    console.log('✅ Init callback registered');
  } catch (error) {
    console.error('❌ Failed to setup init bridge:', error);
    throw error;
  }
}

/**
 * Display available mount options
 */
function showMountOptions() {
  console.log('\n🗂️  Mount Options:');

  try {
    const options = getMountOptions();

    console.log('\n📋 Available Options:');
    options.available.forEach(option => {
      const isDefault = options.defaults.includes(option);
      console.log(`  ${isDefault ? '✅' : '  '} ${option}`);
    });

    console.log('\n🎯 Recommended Defaults:');
    options.defaults.forEach(option => {
      console.log(`  • ${option}`);
    });

    console.log('\n💡 Tip: Use default options for optimal performance and compatibility');
  } catch (error) {
    console.warn('⚠️  Could not get mount options:', error.message);
  }
}

/**
 * Display capability information
 */
async function showCapabilities() {
  console.log('\n🔍 FUSE Capabilities:');

  try {
    const capNames = getCapabilityNames();

    if (capNames.length === 0) {
      console.log('  ℹ️  No capability information available (mount the filesystem first)');
      return;
    }

    console.log('\n📊 Available Capabilities:');
    capNames.forEach(cap => {
      console.log(`  • ${cap}`);
    });

    // Test some common capabilities
    const commonCaps = [
      { name: 'ASYNC_READ', flag: 1 },
      { name: 'POSIX_LOCKS', flag: 2 },
      { name: 'ATOMIC_O_TRUNC', flag: 8 },
      { name: 'SPLICE_WRITE', flag: 128 },
      { name: 'WRITEBACK_CACHE', flag: 65536 }
    ];

    console.log('\n🧪 Testing Common Capabilities:');
    for (const cap of commonCaps) {
      try {
        const supported = await checkCapabilities([cap.flag]);
        console.log(`  ${supported ? '✅' : '❌'} ${cap.name}`);
      } catch (error) {
        console.log(`  ❓ ${cap.name} (test failed)`);
      }
    }
  } catch (error) {
    console.warn('⚠️  Could not get capabilities:', error.message);
  }
}

/**
 * Create and mount the demo filesystem
 */
async function mountFilesystem() {
  console.log('\n🏔️  Mounting filesystem...');

  try {
    // Create a temporary mount point
    mountPoint = path.join(__dirname, 'demo-mount');

    // Ensure mount point exists
    if (!fs.existsSync(mountPoint)) {
      fs.mkdirSync(mountPoint, { recursive: true });
    }

    console.log(`📁 Mount point: ${mountPoint}`);

    // Create FUSE session
    const session = await createSession(mountPoint, operations);
    console.log('✅ FUSE session created');

    // Set up operation handlers
    for (const [opName, handler] of Object.entries(operations)) {
      await setOperationHandler(opName, handler);
    }
    console.log('✅ Operation handlers registered');

    // Mount the filesystem (this will trigger the init callback)
    await mount();
    console.log('🎉 Filesystem mounted successfully!');

    // Give the init callback time to execute
    await new Promise(resolve => setTimeout(resolve, 200));

  } catch (error) {
    console.error('❌ Failed to mount filesystem:', error);
    throw error;
  }
}

/**
 * Demonstrate runtime connection info access
 */
function showRuntimeInfo() {
  console.log('\n📈 Runtime Information:');

  const connInfo = getConnectionInfo();
  const config = getFuseConfig();

  if (connInfo) {
    console.log('\n🔗 Current Connection Info:');
    console.log(`  Max Write: ${connInfo.maxWrite} bytes`);
    console.log(`  Time Granularity: ${Number(connInfo.timeGranNs)}ns`);
    console.log(`  Capabilities: ${connInfo.caps.length} available`);

    // Check time precision
    if (connInfo.timeGranNs === 1000000000n) {
      console.log('  ⏰ Second-precision timestamps');
    } else if (connInfo.timeGranNs === 1000000n) {
      console.log('  ⏰ Millisecond-precision timestamps');
    } else if (connInfo.timeGranNs === 1000n) {
      console.log('  ⏰ Microsecond-precision timestamps');
    } else if (connInfo.timeGranNs === 1n) {
      console.log('  ⏰ Nanosecond-precision timestamps');
    }
  } else {
    console.log('  ℹ️  Connection info not available');
  }

  if (config) {
    console.log('\n⚙️  Current Configuration:');
    console.log(`  Entry Cache: ${config.entryTimeout}s`);
    console.log(`  Attribute Cache: ${config.attrTimeout}s`);
    console.log(`  Umask: 0${config.umask.toString(8)}`);
  } else {
    console.log('  ℹ️  Configuration not available');
  }
}

/**
 * Test filesystem operations
 */
async function testFilesystem() {
  console.log('\n🧪 Testing filesystem operations...');

  try {
    const testFile = path.join(mountPoint, 'hello.txt');

    // Test file existence
    if (fs.existsSync(testFile)) {
      console.log('✅ Test file exists');

      // Read file content
      const content = fs.readFileSync(testFile, 'utf8');
      console.log(`📖 File content: "${content}"`);

      // Get file stats
      const stats = fs.statSync(testFile);
      console.log(`📊 File size: ${stats.size} bytes`);
    } else {
      console.log('❌ Test file not found');
    }

    // List directory contents
    const files = fs.readdirSync(mountPoint);
    console.log(`📁 Directory contents: ${files.join(', ')}`);

  } catch (error) {
    console.error('❌ Filesystem test failed:', error.message);
  }
}

/**
 * Clean up and unmount
 */
async function cleanup() {
  console.log('\n🧹 Cleaning up...');

  try {
    if (mountPoint) {
      await unmount();
      console.log('✅ Filesystem unmounted');

      // Clean up mount point
      if (fs.existsSync(mountPoint)) {
        fs.rmSync(mountPoint, { recursive: true, force: true });
        console.log('✅ Mount point cleaned up');
      }
    }

    await removeInitCallback();
    await resetInitBridge();
    console.log('✅ Init bridge cleaned up');

  } catch (error) {
    console.warn('⚠️  Cleanup warning:', error.message);
  }
}

/**
 * Main demo function
 */
async function runDemo() {
  console.log('🚀 FUSE Init Bridge Demo');
  console.log('========================');

  try {
    // Setup
    await setupInitBridge();
    showMountOptions();

    // Mount and test
    await mountFilesystem();
    await showCapabilities();
    showRuntimeInfo();
    await testFilesystem();

    // Interactive pause
    console.log('\n⏸️  Filesystem is mounted. Press Ctrl+C to unmount and exit.');
    console.log(`   You can explore the filesystem at: ${mountPoint}`);

    // Handle graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`\n\n🛑 Received ${signal}, shutting down...`);
        await cleanup();
        process.exit(0);
      });
    });

    // Keep the process running
    process.stdin.setRawMode(true);
    process.stdin.resume();

  } catch (error) {
    console.error('\n💥 Demo failed:', error);
    await cleanup();
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  await cleanup();
  process.exit(1);
});

// Run the demo
if (require.main === module) {
  runDemo().catch(async (error) => {
    console.error('💥 Fatal error:', error);
    await cleanup();
    process.exit(1);
  });
}

module.exports = {
  runDemo,
  setupInitBridge,
  showMountOptions,
  showCapabilities,
  cleanup
};
