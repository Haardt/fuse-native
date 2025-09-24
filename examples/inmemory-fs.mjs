#!/usr/bin/env node

/**
 * @file inmemory-fs.cjs
 * @brief Complete in-memory filesystem example for FUSE3 Node.js binding
 *
 * This example demonstrates a full in-memory filesystem implementation
 * using the modern TypeScript API (ESM compatible).
 * It implements all FUSE operations and serves as a comprehensive
 * test of the FUSE native module.
 */

import { createSession } from '../dist/index.js';

import fs from 'fs';
import path from 'path';

// Configuration
const MOUNT_POINT = process.argv[2] || '/tmp/inmemory-fs';

// In-memory filesystem data structures
class Inode {
  constructor(type, mode = 0o644) {
    this.id = Inode.nextId++;
    this.type = type; // 'file', 'directory', 'symlink'
    this.mode = mode;
    this.uid = process.getuid?.() || 1000;
    this.gid = process.getgid?.() || 1000;
    this.size = 0n;
    this.atime = BigInt(Date.now()) * 1000000n; // nanoseconds
    this.mtime = BigInt(Date.now()) * 1000000n;
    this.ctime = BigInt(Date.now()) * 1000000n;
    this.nlink = 1;
    this.data = null; // Buffer for files, Map for directories, string for symlinks
    this.xattrs = new Map(); // Extended attributes
  }

  static nextId = 1n;

  toAttr() {
    return {
      ino: this.id,
      size: this.size,
      blocks: (this.size + 511n) / 512n,
      atime: this.atime,
      mtime: this.mtime,
      ctime: this.ctime,
      mode: this.mode,
      nlink: this.nlink,
      uid: this.uid,
      gid: this.gid,
      rdev: 0n,
      blksize: 4096,
    };
  }
}

class InMemoryFilesystem {
  constructor() {
    this.inodes = new Map();
    this.root = this.createInode('directory', 0o755);
    this.root.data = new Map([['.', this.root], ['..', this.root]]);
    this.inodes.set(this.root.id, this.root);
  }

  createInode(type, mode = 0o644) {
    const inode = new Inode(type, mode);
    if (type === 'directory') {
      inode.data = new Map();
    } else if (type === 'file') {
      inode.data = Buffer.alloc(0);
    }
    return inode;
  }

  resolvePath(fusePath) {
    const parts = fusePath.split('/').filter(p => p.length > 0);
    let current = this.root;

    for (const part of parts) {
      if (current.type !== 'directory') {
        throw { errno: -2 }; // ENOENT
      }

      const next = current.data.get(part);
      if (!next) {
        throw { errno: -2 }; // ENOENT
      }
      current = next;
    }

    return current;
  }

  getParentAndName(fusePath) {
    const normalized = path.normalize(fusePath);
    const dirname = path.dirname(normalized);
    const basename = path.basename(normalized);

    if (basename === '.' || basename === '..') {
      throw { errno: -22 }; // EINVAL
    }

    const parent = dirname === '/' ? this.root : this.resolvePath(dirname);
    return { parent, name: basename };
  }

  // Modern async FUSE operations
  async getattr(fusePath) {
    const inode = this.resolvePath(fusePath);
    return inode.toAttr();
  }

  async readdir(fusePath) {
    const inode = this.resolvePath(fusePath);
    if (inode.type !== 'directory') {
      throw { code: 'ENOTDIR' };
    }
    return Array.from(inode.data.keys());
  }

  async lookup(parentPath, name) {
    const parent = this.resolvePath(parentPath);
    if (parent.type !== 'directory') {
      throw { code: 'ENOTDIR' };
    }

    const inode = parent.data.get(name);
    if (!inode) {
      throw { code: 'ENOENT' };
    }

    return inode.toAttr();
  }

  async create(parentPath, name, mode) {
    const { parent, name: finalName } = this.getParentAndName(path.join(parentPath, name));

    if (parent.type !== 'directory') {
      throw { code: 'ENOTDIR' };
    }

    if (parent.data.has(finalName)) {
      throw { code: 'EEXIST' };
    }

    const inode = this.createInode('file', mode);
    parent.data.set(finalName, inode);
    this.inodes.set(inode.id, inode);

    return { attr: inode.toAttr(), fh: inode.id };
  }

  async open(fusePath, flags) {
    const inode = this.resolvePath(fusePath);
    if (inode.type !== 'file') {
      throw { code: 'ENOENT' };
    }

    return { fh: inode.id };
  }

  async read(fusePath, fh, buffer, length, position) {
    const inode = this.inodes.get(fh);
    if (!inode || inode.type !== 'file') {
      throw { code: 'EBADF' };
    }

    const start = Number(position);
    const end = Math.min(start + length, inode.data.length);
    const bytesRead = Math.max(0, end - start);

    if (bytesRead > 0) {
      inode.data.copy(buffer, 0, start, end);
    }

    return bytesRead;
  }

  async write(fusePath, fh, buffer, length, position) {
    const inode = this.inodes.get(fh);
    if (!inode || inode.type !== 'file') {
      throw { code: 'EBADF' };
    }

    const start = Number(position);
    const end = start + length;
    const requiredSize = end;

    // Extend buffer if necessary
    if (requiredSize > inode.data.length) {
      const newBuffer = Buffer.alloc(requiredSize);
      inode.data.copy(newBuffer);
      inode.data = newBuffer;
      inode.size = BigInt(requiredSize);
    }

    buffer.copy(inode.data, start, 0, length);
    inode.mtime = BigInt(Date.now()) * 1000000n;
    inode.ctime = inode.mtime;

    return length;
  }

  async release(fusePath, fh) {
    // In-memory FS doesn't need to do anything special on release
    return 0;
  }

  async mkdir(parentPath, name, mode) {
    const { parent, name: finalName } = this.getParentAndName(path.join(parentPath, name));

    if (parent.type !== 'directory') {
      throw { code: 'ENOTDIR' };
    }

    if (parent.data.has(finalName)) {
      throw { code: 'EEXIST' };
    }

    const inode = this.createInode('directory', mode | 0o40000); // S_IFDIR
    inode.data = new Map([['.', inode], ['..', parent]]);
    parent.data.set(finalName, inode);
    this.inodes.set(inode.id, inode);

    return inode.toAttr();
  }

  async rmdir(parentPath, name) {
    const { parent, name: finalName } = this.getParentAndName(path.join(parentPath, name));

    if (parent.type !== 'directory') {
      throw { code: 'ENOTDIR' };
    }

    const inode = parent.data.get(finalName);
    if (!inode) {
      throw { code: 'ENOENT' };
    }

    if (inode.type !== 'directory') {
      throw { code: 'ENOTDIR' };
    }

    if (inode.data.size > 2) { // . and ..
      throw { code: 'ENOTEMPTY' };
    }

    parent.data.delete(finalName);
    this.inodes.delete(inode.id);
  }

  async unlink(parentPath, name) {
    const { parent, name: finalName } = this.getParentAndName(path.join(parentPath, name));

    if (parent.type !== 'directory') {
      throw { code: 'ENOTDIR' };
    }

    const inode = parent.data.get(finalName);
    if (!inode) {
      throw { code: 'ENOENT' };
    }

    if (inode.type === 'directory') {
      throw { code: 'EISDIR' };
    }

    parent.data.delete(finalName);
    inode.nlink--;
    if (inode.nlink === 0) {
      this.inodes.delete(inode.id);
    }
  }

  async rename(oldParentPath, oldName, newParentPath, newName) {
    const { parent: oldParent, name: oldFinalName } = this.getParentAndName(path.join(oldParentPath, oldName));
    const { parent: newParent, name: newFinalName } = this.getParentAndName(path.join(newParentPath, newName));

    if (oldParent.type !== 'directory' || newParent.type !== 'directory') {
      throw { code: 'ENOTDIR' };
    }

    const inode = oldParent.data.get(oldFinalName);
    if (!inode) {
      throw { code: 'ENOENT' };
    }

    // Check if target exists
    const existing = newParent.data.get(newFinalName);
    if (existing) {
      if (existing.type === 'directory' && inode.type !== 'directory') {
        throw { code: 'EISDIR' };
      }
      if (existing.type !== 'directory' && inode.type === 'directory') {
        throw { code: 'ENOTDIR' };
      }
      // Remove existing target
      newParent.data.delete(newFinalName);
      existing.nlink--;
      if (existing.nlink === 0) {
        this.inodes.delete(existing.id);
      }
    }

    // Move the inode
    oldParent.data.delete(oldFinalName);
    newParent.data.set(newFinalName, inode);
    inode.ctime = BigInt(Date.now()) * 1000000n;
  }

  async chmod(fusePath, mode) {
    const inode = this.resolvePath(fusePath);
    inode.mode = mode;
    inode.ctime = BigInt(Date.now()) * 1000000n;
  }

  async chown(fusePath, uid, gid) {
    const inode = this.resolvePath(fusePath);
    if (uid !== -1) inode.uid = uid;
    if (gid !== -1) inode.gid = gid;
    inode.ctime = BigInt(Date.now()) * 1000000n;
  }

  async truncate(fusePath, size) {
    const inode = this.resolvePath(fusePath);
    if (inode.type !== 'file') {
      throw { code: 'EISDIR' };
    }

    const newSize = Number(size);
    if (newSize < inode.data.length) {
      inode.data = inode.data.slice(0, newSize);
    } else if (newSize > inode.data.length) {
      const newBuffer = Buffer.alloc(newSize);
      inode.data.copy(newBuffer);
      inode.data = newBuffer;
    }
    inode.size = size;
    inode.mtime = BigInt(Date.now()) * 1000000n;
    inode.ctime = inode.mtime;
  }

  async utimens(fusePath, atime, mtime) {
    const inode = this.resolvePath(fusePath);
    inode.atime = BigInt(atime) * 1000000n;
    inode.mtime = BigInt(mtime) * 1000000n;
    inode.ctime = BigInt(Date.now()) * 1000000n;
  }

  async symlink(link, parentPath, name) {
    const { parent, name: finalName } = this.getParentAndName(path.join(parentPath, name));

    if (parent.type !== 'directory') {
      throw { code: 'ENOTDIR' };
    }

    if (parent.data.has(finalName)) {
      throw { code: 'EEXIST' };
    }

    const inode = this.createInode('symlink', 0o777 | 0o120000); // S_IFLNK
    inode.data = link;
    inode.size = BigInt(Buffer.byteLength(link, 'utf8'));
    parent.data.set(finalName, inode);
    this.inodes.set(inode.id, inode);

    return inode.toAttr();
  }

  async readlink(fusePath) {
    const inode = this.resolvePath(fusePath);
    if (inode.type !== 'symlink') {
      throw { code: 'EINVAL' };
    }
    return inode.data;
  }

  async link(targetPath, linkParentPath, linkName) {
    const target = this.resolvePath(targetPath);
    const { parent, name: finalName } = this.getParentAndName(path.join(linkParentPath, linkName));

    if (parent.type !== 'directory') {
      throw { code: 'ENOTDIR' };
    }

    if (parent.data.has(finalName)) {
      throw { code: 'EEXIST' };
    }

    parent.data.set(finalName, target);
    target.nlink++;
    target.ctime = BigInt(Date.now()) * 1000000n;

    return target.toAttr();
  }

  async statfs(fusePath) {
    // Return basic filesystem stats for in-memory FS
    return {
      bsize: 4096,
      frsize: 4096,
      blocks: 1000000n,
      bfree: 500000n,
      bavail: 500000n,
      files: 100000n,
      ffree: 50000n,
      favail: 50000n,
      fsid: 0n,
      flag: 0,
      namemax: 255,
    };
  }

  // Stub implementations for remaining operations
  async getxattr(fusePath, name) {
    const inode = this.resolvePath(fusePath);
    const value = inode.xattrs.get(name);
    if (value === undefined) {
      throw { code: 'ENODATA' };
    }
    return value;
  }

  async setxattr(fusePath, name, value, flags = 0) {
    const inode = this.resolvePath(fusePath);

    if (flags === 1 && inode.xattrs.has(name)) { // XATTR_CREATE
      throw { code: 'EEXIST' };
    }
    if (flags === 2 && !inode.xattrs.has(name)) { // XATTR_REPLACE
      throw { code: 'ENODATA' };
    }

    inode.xattrs.set(name, value);
  }

  async listxattr(fusePath) {
    const inode = this.resolvePath(fusePath);
    return Array.from(inode.xattrs.keys());
  }

  async removexattr(fusePath, name) {
    const inode = this.resolvePath(fusePath);
    if (!inode.xattrs.has(name)) {
      throw { code: 'ENODATA' };
    }
    inode.xattrs.delete(name);
  }

  async flush(fusePath, fh) {
    // In-memory FS doesn't need flushing
  }

  async fsync(fusePath, datasync, fh) {
    // In-memory FS doesn't need syncing
  }

  async fsyncdir(fusePath, datasync, fh) {
    // In-memory FS doesn't need syncing
  }

  async opendir(fusePath) {
    const inode = this.resolvePath(fusePath);
    if (inode.type !== 'directory') {
      throw { code: 'ENOTDIR' };
    }
    return { fh: inode.id };
  }

  async releasedir(fusePath, fh) {
  }

  async access(fusePath, mask) {
    // In-memory FS allows all access
  }

  // Advanced operations (stub implementations)
  async fallocate(fusePath, mode, offset, length) {
    const inode = this.resolvePath(fusePath);
    if (inode.type !== 'file') {
      throw { code: 'EISDIR' };
    }

    const start = Number(offset);
    const end = start + Number(length);

    if (end > inode.data.length) {
      const newBuffer = Buffer.alloc(end);
      inode.data.copy(newBuffer);
      inode.data = newBuffer;
      inode.size = BigInt(end);
    }

    inode.mtime = BigInt(Date.now()) * 1000000n;
    inode.ctime = inode.mtime;
  }

  async lseek(fusePath, offset, whence) {
    const inode = this.resolvePath(fusePath);
    if (inode.type !== 'file') {
      throw { code: 'EISDIR' };
    }

    let newOffset = Number(offset);
    switch (whence) {
      case 0: // SEEK_SET
        break;
      case 1: // SEEK_CUR
        // For simplicity, assume current position is 0
        newOffset = newOffset;
        break;
      case 2: // SEEK_END
        newOffset = inode.data.length + newOffset;
        break;
      default:
        throw { code: 'EINVAL' };
    }

    if (newOffset < 0) {
      newOffset = 0;
    }

    return BigInt(newOffset);
  }

  async copy_file_range(fusePathIn, fiIn, offsetIn, fusePathOut, fiOut, offsetOut, length, flags) {
    const inodeIn = this.inodes.get(fiIn.fh);
    const inodeOut = this.inodes.get(fiOut.fh);

    if (!inodeIn || !inodeOut || inodeIn.type !== 'file' || inodeOut.type !== 'file') {
      throw { code: 'EBADF' };
    }

    const startIn = Number(offsetIn);
    const startOut = Number(offsetOut);
    const len = Number(length);

    // Ensure output buffer is large enough
    const requiredSize = startOut + len;
    if (requiredSize > inodeOut.data.length) {
      const newBuffer = Buffer.alloc(requiredSize);
      inodeOut.data.copy(newBuffer);
      inodeOut.data = newBuffer;
      inodeOut.size = BigInt(requiredSize);
    }

    // Copy data
    const bytesToCopy = Math.min(len, inodeIn.data.length - startIn);
    if (bytesToCopy > 0) {
      inodeIn.data.copy(inodeOut.data, startOut, startIn, startIn + bytesToCopy);
    }

    inodeOut.mtime = BigInt(Date.now()) * 1000000n;
    inodeOut.ctime = inodeOut.mtime;

    return BigInt(bytesToCopy);
  }

  // Locking operations (basic implementation)
  async flock(fusePath, fh, op) {
    // In-memory FS doesn't implement real locking
  }

  async lock(fusePath, fh, cmd, lock) {
    // In-memory FS doesn't implement real locking
  }

  // Device operations (not supported)
  async ioctl(fusePath, cmd, arg, fi, flags, data) {
    throw { code: 'ENOSYS' };
  }

  async bmap(fusePath, blocksize, idx) {
    throw { code: 'ENOSYS' };
  }

  async poll(fusePath, fi, ph, reventsp) {
    throw { code: 'ENOSYS' };
  }
}

// Main execution
async function main() {
  console.log('🚀 In-Memory Filesystem Example');
  console.log('================================');
  console.log(`Mount point: ${MOUNT_POINT}`);
  console.log('');

  let session = null;

  try {
    // Create mount point if it doesn't exist
    console.log('📁 Creating mount point...');
    if (!fs.existsSync(MOUNT_POINT)) {
      fs.mkdirSync(MOUNT_POINT, { recursive: true });
      console.log(`   Created: ${MOUNT_POINT}`);
    } else {
      console.log(`   Using existing: ${MOUNT_POINT}`);
    }
    console.log('');

    // Create filesystem instance
    console.log('💾 Creating in-memory filesystem instance...');
    const imfs = new InMemoryFilesystem();
    console.log('   Filesystem instance created');
    console.log('');

    // Create FUSE session with operation handlers
    console.log('🔗 Creating FUSE session...');
    session = await createSession(MOUNT_POINT, {
      getattr: imfs.getattr.bind(imfs),
      readdir: imfs.readdir.bind(imfs),
      lookup: imfs.lookup.bind(imfs),
      create: imfs.create.bind(imfs),
      open: imfs.open.bind(imfs),
      read: imfs.read.bind(imfs),
      write: imfs.write.bind(imfs),
      release: imfs.release.bind(imfs),
      mkdir: imfs.mkdir.bind(imfs),
      rmdir: imfs.rmdir.bind(imfs),
      unlink: imfs.unlink.bind(imfs),
      rename: imfs.rename.bind(imfs),
      chmod: imfs.chmod.bind(imfs),
      chown: imfs.chown.bind(imfs),
      truncate: imfs.truncate.bind(imfs),
      utimens: imfs.utimens.bind(imfs),
      symlink: imfs.symlink.bind(imfs),
      readlink: imfs.readlink.bind(imfs),
      link: imfs.link.bind(imfs),
      statfs: imfs.statfs.bind(imfs),
      getxattr: imfs.getxattr.bind(imfs),
      setxattr: imfs.setxattr.bind(imfs),
      listxattr: imfs.listxattr.bind(imfs),
      removexattr: imfs.removexattr.bind(imfs),
      flush: imfs.flush.bind(imfs),
      fsync: imfs.fsync.bind(imfs),
      fsyncdir: imfs.fsyncdir.bind(imfs),
      opendir: imfs.opendir.bind(imfs),
      releasedir: imfs.releasedir.bind(imfs),
      access: imfs.access.bind(imfs),
      fallocate: imfs.fallocate.bind(imfs),
      lseek: imfs.lseek.bind(imfs),
      copy_file_range: imfs.copy_file_range.bind(imfs),
      flock: imfs.flock.bind(imfs),
      lock: imfs.lock.bind(imfs),
      ioctl: imfs.ioctl.bind(imfs),
      bmap: imfs.bmap.bind(imfs),
      poll: imfs.poll.bind(imfs),
    });
    console.log('✅ FUSE session created successfully!');
    console.log('');

    // Mount the filesystem
    console.log('🏔️ Mounting FUSE filesystem...');
    await session.mount();
    console.log('✅ FUSE filesystem mounted successfully!');
    console.log('');

    // Clean up any existing test files first
    console.log('🧪 Testing basic operations...');
    console.log('   Cleaning up existing test files...');

    const cleanupPath = (dirPath) => {
      try {
        if (fs.existsSync(dirPath)) {
          const entries = fs.readdirSync(dirPath);
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              cleanupPath(fullPath);
              fs.rmdirSync(fullPath);
            } else {
              fs.unlinkSync(fullPath);
            }
          }
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    };

    cleanupPath(MOUNT_POINT);
    console.log('   ✓ Cleanup completed');

    console.log('   Creating test directory...');
    const testDir = path.join(MOUNT_POINT, 'testdir');
    fs.mkdirSync(testDir, 0o755);
    console.log(`   ✓ Created: ${testDir}`);

    console.log('   Creating test file...');
    const testFile = path.join(testDir, 'test.txt');
    fs.writeFileSync(testFile, 'Hello, In-Memory Filesystem!');
    console.log(`   ✓ Created: ${testFile}`);

    console.log('   Reading from file...');
    const content = fs.readFileSync(testFile, 'utf8');
    console.log(`   ✓ Read content: "${content}"`);

    console.log('   Listing directory...');
    const entries = fs.readdirSync(testDir);
    console.log(`   ✓ Directory contents: [${entries.join(', ')}]`);

    console.log('   Getting file attributes...');
    const stats = fs.statSync(testFile);
    console.log(`   ✓ File attributes: size=${stats.size}, mode=${stats.mode.toString(8)}, mtime=${stats.mtime.toISOString()}`);

    console.log('');
    console.log('✅ All basic operations completed successfully!');
    console.log('');
    console.log('🎯 The in-memory filesystem is now running.');
    console.log(`   Mount point: ${MOUNT_POINT}`);
    console.log('   You can explore and test all FUSE operations through this mount point.');
    console.log('');
    console.log('💡 Try commands like:');
    console.log(`   • ls -la ${MOUNT_POINT}`);
    console.log(`   • echo "test" > ${MOUNT_POINT}/test.txt`);
    console.log(`   • mkdir ${MOUNT_POINT}/newdir`);
    console.log(`   • cat ${MOUNT_POINT}/testdir/test.txt`);
    console.log('');
    console.log('Press Ctrl+C to unmount and exit.');

    // Keep the process running
    console.log('');
    console.log('🔄 Filesystem is active. Waiting for operations...');

    // Handle graceful shutdown
    const shutdown = async (signal) => {
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
    console.error('Stack trace:', error.stack);

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
  main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}