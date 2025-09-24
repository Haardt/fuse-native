#!/usr/bin/env node

/**
 * @file example.ts
 * @brief Example usage of the modular in-memory filesystem
 *
 * This example demonstrates how to use the refactored InMemoryFilesystem
 * with its modular operation structure.
 */

import { createSession, createMode, createUid, createGid } from 'fuse-native';
import { InMemoryFilesystem } from './InMemoryFilesystem.js';
import { InMemoryFsUtils } from './types.js';

import fs from 'fs';
import path from 'path';

// Configuration
const MOUNT_POINT = process.argv[2] || '/tmp/inmemory-fs-modular';

/**
 * Example demonstrating the modular in-memory filesystem
 */
async function main() {
  console.log('🚀 Modular In-Memory Filesystem Example');
  console.log('=====================================');
  console.log(`Mount point: ${MOUNT_POINT}`);
  console.log('');

  let session: any = null;

  try {
    // Create mount point if it doesn't exist
    console.log('📁 Creating mount point...');
    try {
      if (!fs.existsSync(MOUNT_POINT)) {
        fs.mkdirSync(MOUNT_POINT, { recursive: true });
        console.log(`   ✓ Created: ${MOUNT_POINT}`);
      } else {
        console.log(`   ✓ Using existing: ${MOUNT_POINT}`);
      }

      // Check if mountpoint is writable
      try {
        fs.accessSync(MOUNT_POINT, fs.constants.W_OK);
        console.log(`   ✓ Mountpoint is writable`);
      } catch (error) {
        console.log(`   ⚠️ Mountpoint may not be writable: ${(error as Error).message}`);
      }
    } catch (error) {
      console.error(
        `   ❌ Failed to create/access mountpoint: ${(error as Error).message}`
      );
      throw error;
    }
    console.log('');

    // Create filesystem instance
    console.log('💾 Creating modular in-memory filesystem instance...');
    const imfs = new InMemoryFilesystem({
      rootMode: createMode(0o755),
      defaultFileMode: createMode(0o644),
      defaultDirMode: createMode(0o755),
      defaultUid: createUid(process.getuid?.() || 1000),
      defaultGid: createGid(process.getgid?.() || 1000),
      maxInodes: 1000000,
    });
    console.log('   ✓ Filesystem instance created');
    console.log('');

    // Test native binding
    console.log('🔧 Testing native binding...');
    try {
      const version = await import('fuse-native').then(m =>
        m.getVersion()
      );
      console.log(
        `   ✓ Native binding loaded: FUSE ${version.fuse}, Binding ${version.binding}, N-API ${version.napi}`
      );
    } catch (error) {
      console.error('   ❌ Native binding test failed:', (error as Error).message);
      throw error;
    }
    console.log('');

    // Create FUSE session with operation handlers
    console.log('🔗 Creating FUSE session...');
    console.log('   ✓ Using modular operation handlers...');

    try {
      session = await createSession(MOUNT_POINT, imfs);
      console.log('✅ FUSE session created successfully!');
    } catch (error) {
      console.error('❌ Failed to create FUSE session:', error);
      console.error('Stack trace:', (error as Error).stack);
      throw error;
    }
    console.log('');

    // Mount the filesystem
    console.log('🏔️ Mounting FUSE filesystem...');

    await session.mount();
    console.log('✅ FUSE filesystem mounted successfully!');

    console.log('');
    console.log('🎯 The modular in-memory filesystem is now running.');
    console.log(`   Mount point: ${MOUNT_POINT}`);
    console.log(
      '   You can explore and test all FUSE operations through this mount point.'
    );
    console.log('');
    console.log('💡 Try commands like:');
    console.log(`   • ls -la ${MOUNT_POINT}`);
    console.log(`   • echo "test" > ${MOUNT_POINT}/test.txt`);
    console.log(`   • mkdir ${MOUNT_POINT}/newdir`);
    console.log(`   • cat ${MOUNT_POINT}/test.txt`);
    console.log('');
    console.log('📊 Filesystem statistics:');
    const stats = imfs.getStats();
    console.log(`   • Total inodes: ${stats.totalInodes}`);
    console.log(`   • Files: ${stats.fileCount}`);
    console.log(`   • Directories: ${stats.directoryCount}`);
    console.log(`   • Symlinks: ${stats.symlinkCount}`);
    console.log(`   • Total size: ${stats.totalSize} bytes`);
    console.log(`   • Memory usage: ~${stats.memoryUsage} bytes`);
    console.log('');
    console.log('Press Ctrl+C to unmount and exit.');

    // Keep the process running
    console.log('');
    console.log('🔄 Filesystem is active. Waiting for operations...');

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

      try {
        if (session) {
          console.log('   Unmounting FUSE filesystem...');
          await session.unmount();
          console.log('   ✓ Filesystem unmounted');
        }

        console.log('   Cleanup completed');
        console.log('👋 Goodbye!');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Keep the event loop running
    setInterval(() => {
      // Periodic check - filesystem is still running
    }, 10000);
  } catch (error) {
    console.error('💥 Fatal error:', error);
    console.error('Stack trace:', (error as Error).stack);

    // Attempt cleanup on error
    try {
      if (session) {
        console.log('Attempting emergency unmount...');
        await session.unmount();
      }
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }

    process.exit(1);
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}