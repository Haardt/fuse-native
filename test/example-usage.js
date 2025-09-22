#!/usr/bin/env node

/**
 * Example: Using In-Memory Filesystem with FUSE-Native
 *
 * This example demonstrates how to mount an in-memory filesystem
 * using FUSE-Native and the MemoryFileSystem implementation.
 *
 * Usage:
 *   node test/example-usage.js [mount_point]
 *
 * Example:
 *   node test/example-usage.js /tmp/memory-fs
 *
 * Then you can use normal filesystem commands:
 *   ls /tmp/memory-fs
 *   echo "Hello World" > /tmp/memory-fs/test.txt
 *   cat /tmp/memory-fs/test.txt
 *   mkdir /tmp/memory-fs/subdir
 *
 * To unmount:
 *   fusermount -u /tmp/memory-fs
 */

const path = require("path");
const Fuse = require("../index");
const MemoryFileSystem = require("./memory-fs");

// Configuration
const MOUNT_POINT = process.argv[2] || "/tmp/fuse-memory-fs";
const DEBUG = process.env.DEBUG === "1";

// Create memory filesystem instance
const memoryFs = new MemoryFileSystem();

console.log("FUSE In-Memory Filesystem Example");
console.log("================================");
console.log(`Mount point: ${MOUNT_POINT}`);
console.log(`Debug mode: ${DEBUG ? "ON" : "OFF"}`);
console.log("");

// Add some initial files for demonstration
console.log("Creating initial filesystem structure...");

// Create a welcome file
memoryFs._createNode(
  "/README.txt",
  "file",
  0o644,
  Buffer.from(`Welcome to FUSE In-Memory Filesystem!

This filesystem exists only in memory and demonstrates all FUSE operations.

Available features:
- File creation, reading, writing
- Directory operations
- Symbolic links
- Extended attributes
- File permissions
- And much more!

Try these commands:
  ls -la ${MOUNT_POINT}/
  echo "Hello" > ${MOUNT_POINT}/hello.txt
  cat ${MOUNT_POINT}/hello.txt
  mkdir ${MOUNT_POINT}/testdir
  ln -s ${MOUNT_POINT}/README.txt ${MOUNT_POINT}/link-to-readme

To unmount: fusermount -u ${MOUNT_POINT}
`),
);

// Create a sample directory
memoryFs._createNode("/examples", "directory", 0o755);

// Create a sample file in the directory
memoryFs._createNode(
  "/examples/sample.txt",
  "file",
  0o644,
  Buffer.from("This is a sample file in the examples directory.\n"),
);

// Create a symbolic link
memoryFs._createNode(
  "/link-to-examples",
  "symlink",
  0o777,
  Buffer.from("/examples"),
);

console.log("✅ Initial structure created");
console.log("");

// FUSE operations mapping
const fuseOps = {
  // Core operations
  init: (cb) => memoryFs.init(cb),
  error: (cb) => memoryFs.error(cb),
  access: (path, mode, cb) => memoryFs.access(path, mode, cb),
  statfs: (path, cb) => memoryFs.statfs(path, cb),

  // File metadata operations
  getattr: (path, cb) => memoryFs.getattr(path, cb),
  fgetattr: (fd, cb) => memoryFs.fgetattr(fd, cb),
  utimens: (path, atime, mtime, cb) => memoryFs.utimens(path, atime, mtime, cb),
  chmod: (path, mode, cb) => memoryFs.chmod(path, mode, cb),
  chown: (path, uid, gid, cb) => memoryFs.chown(path, uid, gid, cb),

  // File I/O operations
  open: (path, flags, cb) => memoryFs.open(path, flags, cb),
  create: (path, mode, cb) => memoryFs.create(path, mode, cb),
  release: (path, fd, cb) => memoryFs.release(fd, cb),
  read: (fd, buf, len, pos, cb) => memoryFs.read(fd, buf, len, pos, cb),
  write: (path, fd, buf, len, offset, cb) =>
    memoryFs.write(path, fd, buf, len, offset, cb),
  flush: (path, fd, cb) => memoryFs.flush(fd, cb),
  fsync: (path, datasync, fd, cb) => memoryFs.fsync(fd, datasync, cb),
  truncate: (path, size, cb) => memoryFs.truncate(path, size, cb),
  ftruncate: (path, fd, size, cb) => memoryFs.ftruncate(fd, size, cb),

  // Directory operations
  opendir: (path, flags, cb) => memoryFs.opendir(path, flags, cb),
  releasedir: (path, fd, cb) => memoryFs.releasedir(fd, cb),
  readdir: (path, cb) => memoryFs.readdir(path, cb),
  fsyncdir: (path, datasync, fd, cb) => memoryFs.fsyncdir(fd, datasync, cb),
  mkdir: (path, mode, cb) => memoryFs.mkdir(path, mode, cb),
  rmdir: (path, cb) => memoryFs.rmdir(path, cb),

  // File management operations
  unlink: (path, cb) => memoryFs.unlink(path, cb),
  rename: (src, dest, cb) => memoryFs.rename(src, dest, cb),
  link: (src, dest, cb) => memoryFs.link(src, dest, cb),
  symlink: (src, dest, cb) => memoryFs.symlink(src, dest, cb),
  readlink: (path, cb) => memoryFs.readlink(path, cb),
  mknod: (path, mode, dev, cb) => memoryFs.mknod(path, mode, dev, cb),

  // Extended attributes
  setxattr: (path, name, buffer, position, flags, cb) =>
    memoryFs.setxattr(path, name, buffer, position, flags, cb),
  getxattr: (path, name, position, cb) =>
    memoryFs.getxattr(path, name, position, cb),
  listxattr: (path, cb) => memoryFs.listxattr(path, cb),
  removexattr: (path, name, cb) => memoryFs.removexattr(path, name, cb),

  // Advanced operations
  lock: (path, fd, cmd, flock_buffer, cb) => {
    // Handle lock operation with flock buffer
    memoryFs.lock(fd, cmd, flock_buffer, cb);
  },
  bmap: (path, blocksize, idx, cb) => memoryFs.bmap(path, blocksize, idx, cb),
  ioctl: (path, cmd, arg, fd, flags, data, cb) =>
    memoryFs.ioctl(fd, cmd, arg, flags, data, data, cb),
  poll: (path, fd, ph, reventsp, cb) => memoryFs.poll(fd, ph, reventsp, cb),
  // write_buf: (path, fd, buf, offset, cb) =>
  //   memoryFs.write_buf(path, fd, buf, offset, cb),
  read_buf: (path, fd, buffer, length, position, cb) =>
    memoryFs.read_buf(fd, buffer, length, position, cb),
  flock: (path, fd, op, cb) => memoryFs.flock(fd, op, cb),
  fallocate: (path, mode, offset, length, fd, cb) =>
    memoryFs.fallocate(fd, mode, offset, length, cb),
  lseek: (path, offset, whence, fd, cb) =>
    memoryFs.lseek(fd, offset, whence, cb),
  // copy_file_range: Not implemented in MemoryFS - FUSE will use read/write fallback
};

// Create FUSE instance
const fuse = new Fuse(MOUNT_POINT, fuseOps, {
  debug: DEBUG,
  force: true,
  mkdir: true,
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🔄 Received SIGINT, unmounting filesystem...");
  fuse.unmount((err) => {
    if (err) {
      console.error("❌ Error unmounting filesystem:", err);
      process.exit(1);
    }
    console.log("✅ Filesystem unmounted successfully");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n🔄 Received SIGTERM, unmounting filesystem...");
  fuse.unmount((err) => {
    if (err) {
      console.error("❌ Error unmounting filesystem:", err);
      process.exit(1);
    }
    console.log("✅ Filesystem unmounted successfully");
    process.exit(0);
  });
});

// Mount the filesystem
console.log("🔄 Mounting filesystem...");

fuse.mount((err) => {
  if (err) {
    console.error("❌ Failed to mount filesystem:", err.message);
    console.error("\nTroubleshooting tips:");
    console.error(
      "1. Make sure FUSE is installed: sudo apt-get install fuse (Ubuntu/Debian)",
    );
    console.error(
      "2. Make sure you have permissions: sudo usermod -a -G fuse $USER",
    );
    console.error("3. Make sure the mount point exists and is empty");
    console.error(
      "4. Make sure no other filesystem is mounted at this location",
    );
    console.error("5. Try running with sudo if you have permission issues");
    process.exit(1);
  }

  console.log("✅ FUSE In-Memory Filesystem mounted successfully!");
  console.log("");
  console.log("🎉 The filesystem is now available at:", MOUNT_POINT);
  console.log("");
  console.log("📋 Try these commands to test the filesystem:");
  console.log(`   ls -la ${MOUNT_POINT}/`);
  console.log(`   cat ${MOUNT_POINT}/README.txt`);
  console.log(`   echo "Hello World" > ${MOUNT_POINT}/hello.txt`);
  console.log(`   cat ${MOUNT_POINT}/hello.txt`);
  console.log(`   mkdir ${MOUNT_POINT}/newdir`);
  console.log(`   touch ${MOUNT_POINT}/newdir/newfile.txt`);
  console.log(`   ln -s ${MOUNT_POINT}/README.txt ${MOUNT_POINT}/mylink`);
  console.log(`   ls -la ${MOUNT_POINT}/mylink`);
  console.log("");
  console.log("🔍 Extended attributes example:");
  console.log(
    `   setfattr -n user.test -v "hello world" ${MOUNT_POINT}/README.txt`,
  );
  console.log(`   getfattr -n user.test ${MOUNT_POINT}/README.txt`);
  console.log(`   listfattr ${MOUNT_POINT}/README.txt`);
  console.log("");
  console.log("🛑 To unmount the filesystem:");
  console.log(`   fusermount -u ${MOUNT_POINT}`);
  console.log("   or press Ctrl+C in this terminal");
  console.log("");
  console.log("📊 Filesystem stats:");
  memoryFs.statfs("/", (err, stats) => {
    if (err === 0) {
      console.log(`   Total blocks: ${stats.blocks}`);
      console.log(`   Available blocks: ${stats.bavail}`);
      console.log(`   Free blocks: ${stats.bfree}`);
      console.log(`   Total files: ${stats.files}`);
      console.log(`   Free file nodes: ${stats.ffree}`);
    }
  });

  console.log("");
  console.log("⚡ The filesystem is running. Press Ctrl+C to stop.");

  // Keep the process alive
  process.stdin.resume();
});
