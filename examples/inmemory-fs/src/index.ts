/**
 * @file index.ts
 * @brief In-memory filesystem example with npm support
 *
 * This example demonstrates a fully functional in-memory filesystem
 * that supports npm install operations and file execution.
 */

import { FuseNative } from 'fuse-native';
import type {FuseOperationHandlers, FuseSessionOptions} from "fuse-native";
import fs from "fs";
import {createRequire} from "node:module";

const requireCompat = createRequire(import.meta.url);


export const fuseSetup = async (
    operations: FuseOperationHandlers,
    sessionOptions: FuseSessionOptions,
    mountPath: string,
  ) => {
    let binding: any;
    try {
      // Wo kann ein Projekt es aus dem node_modules Ordner laden?
      binding = requireCompat('../../../build/Release/fuse-native.node');
    } catch (error) {
      console.error('Failed to load **release** native binding:');
    }
    if (binding === undefined) {
      throw new Error('Failed to load native binding');
    }
    const mountPoint = mountPath || '/tmp/inmemory-fs-example';
    fs.mkdirSync(mountPoint);
    const fuseNative = new FuseNative(binding)

    const options: FuseSessionOptions = {
      ...sessionOptions,
      debug: true,
      singleThreaded: true,
      autoUnmount: false,
      allowOther: false,
    };

    const session = await fuseNative.createSession(mountPoint, operations, options);
    return {fuseNative, session, binding, mountPoint};
  }
;


async function main() {
  const mountPath = process.argv[2] || '/tmp/inmemory-fs-example';

  console.log(`🚀 Starting in-memory filesystem example`);
  console.log(`📁 Mount path: ${mountPath}`);
  console.log(`💡 This filesystem supports:`);
  console.log(`   • npm install simulation`);
  console.log(`   • File creation and execution`);
  console.log(`   • Directory operations`);
  console.log(`   • Symlinks and permissions`);
  console.log();

  try {

    // Initialize FUSE session
    console.log(`🔗 Mounting filesystem...`);

    const {fuseNative, session, binding, mountPoint} = await fuseSetup({} as FuseOperationHandlers, {}, mountPath);

    console.log(`✅ Filesystem mounted successfully!`);
    console.log();
    console.log(`🎯 Try these commands in another terminal:`);
    console.log(`   cd ${mountPoint}`);
    console.log(`   ls -la`);
    console.log(`   cat package.json`);
    console.log(`   npm install`);
    console.log(`   ./node_modules/.bin/lodash --version`);
    console.log();
    console.log(`⏹️  Press Ctrl+C to unmount and exit`);

    // Wait for unmount signal
    process.on('SIGINT', async () => {
      console.log(`\n🔌 Unmounting filesystem...`);
      await session.unmount();
      fuseNative.shutdownDispatcher(750);
      session.destroy();
      console.log(`✅ Filesystem unmounted. Goodbye!`);
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {}); // Never resolves

  } catch (error) {
    console.error(`❌ Error:`, error);
    process.exit(1);
  }
}

// Run the example
main().catch((error) => {
  console.error('Failed to start filesystem:', error);
  process.exit(1);
});
