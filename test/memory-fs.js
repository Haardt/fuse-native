/**
 * In-Memory Filesystem for FUSE Testing
 *
 * A simple in-memory filesystem that implements all FUSE operations
 * for testing purposes. This filesystem stores all data in memory
 * and provides a complete implementation of FUSE callbacks.
 */

const fs = require("fs");
const path = require("path");

class MemoryFileSystem {
  constructor() {
    // File system state
    this.files = new Map(); // path -> FileNode
    this.fileDescriptors = new Map(); // fd -> {path, flags, pos}
    this.dirDescriptors = new Map(); // fd -> {path}
    this.nextFd = 1;
    this.stats = {
      blocks: 1000,
      bavail: 900,
      bfree: 900,
      files: 0,
      ffree: 1000000,
    };

    // Create root directory
    this.files.set("/", new FileNode("/", "directory", 0o755));
  }

  // Helper methods
  _getNextFd() {
    return this.nextFd++;
  }

  _normalizePath(path) {
    if (!path.startsWith("/")) path = "/" + path;
    return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  }

  _getParentPath(filePath) {
    const normalized = this._normalizePath(filePath);
    if (normalized === "/") return null;
    return path.dirname(normalized);
  }

  _getBasename(filePath) {
    const normalized = this._normalizePath(filePath);
    if (normalized === "/") return "/";
    return path.basename(normalized);
  }

  _pathExists(filePath) {
    return this.files.has(this._normalizePath(filePath));
  }

  _getNode(filePath) {
    return this.files.get(this._normalizePath(filePath));
  }

  _createNode(filePath, type, mode, content = Buffer.alloc(0)) {
    const normalized = this._normalizePath(filePath);
    const node = new FileNode(normalized, type, mode, content);
    this.files.set(normalized, node);
    this.stats.files++;
    return node;
  }

  _deleteNode(filePath) {
    const normalized = this._normalizePath(filePath);
    if (this.files.delete(normalized)) {
      this.stats.files--;
      return true;
    }
    return false;
  }

  // FUSE Operations Implementation

  init(cb) {
    console.log("MemoryFS: init");
    process.nextTick(() => cb(0));
  }

  error(cb) {
    console.log("MemoryFS: error");
    process.nextTick(() => cb(0));
  }

  access(path, mode, cb) {
    console.log(`MemoryFS: access ${path} mode=${mode}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    // Simple permission check - in real implementation would check user/group/other
    if (mode & 4 && !(node.mode & 0o444)) {
      // Read
      return process.nextTick(() => cb(-13)); // EACCES
    }
    if (mode & 2 && !(node.mode & 0o222)) {
      // Write
      return process.nextTick(() => cb(-13)); // EACCES
    }
    if (mode & 1 && !(node.mode & 0o111)) {
      // Execute
      return process.nextTick(() => cb(-13)); // EACCES
    }

    process.nextTick(() => cb(0));
  }

  statfs(path, cb) {
    console.log(`MemoryFS: statfs ${path}`);
    process.nextTick(() => cb(0, this.stats));
  }

  getattr(path, cb) {
    console.log(`MemoryFS: getattr ${path}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }
    process.nextTick(() => cb(0, node.getStat()));
  }

  fgetattr(fd, cb) {
    console.log(`MemoryFS: fgetattr fd=${fd}`);
    const descriptor = this.fileDescriptors.get(fd);
    if (!descriptor) {
      return process.nextTick(() => cb(-9)); // EBADF
    }

    const node = this._getNode(descriptor.path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    process.nextTick(() => cb(0, node.getStat()));
  }

  flush(fd, cb) {
    console.log(`MemoryFS: flush fd=${fd}`);
    const descriptor = this.fileDescriptors.get(fd);
    if (!descriptor) {
      return process.nextTick(() => cb(-9)); // EBADF
    }
    process.nextTick(() => cb(0));
  }

  fsync(fd, datasync, cb) {
    console.log(`MemoryFS: fsync fd=${fd} datasync=${datasync}`);
    const descriptor = this.fileDescriptors.get(fd);
    if (!descriptor) {
      return process.nextTick(() => cb(-9)); // EBADF
    }
    process.nextTick(() => cb(0));
  }

  fsyncdir(fd, datasync, cb) {
    console.log(`MemoryFS: fsyncdir fd=${fd} datasync=${datasync}`);
    const descriptor = this.dirDescriptors.get(fd);
    if (!descriptor) {
      return process.nextTick(() => cb(-9)); // EBADF
    }
    process.nextTick(() => cb(0));
  }

  readdir(path, cb) {
    console.log(`MemoryFS: readdir ${path}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }
    if (node.type !== "directory") {
      return process.nextTick(() => cb(-20)); // ENOTDIR
    }

    const entries = [".", ".."];
    const normalized = this._normalizePath(path);

    for (const [filePath] of this.files) {
      const parent = this._getParentPath(filePath);
      if (parent === normalized) {
        entries.push(this._getBasename(filePath));
      }
    }

    process.nextTick(() => cb(0, entries));
  }

  truncate(path, size, cb) {
    console.log(`MemoryFS: truncate ${path} size=${size}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }
    if (node.type !== "file") {
      return process.nextTick(() => cb(-21)); // EISDIR
    }

    node.truncate(size);
    process.nextTick(() => cb(0));
  }

  ftruncate(fd, size, cb) {
    console.log(`MemoryFS: ftruncate fd=${fd} size=${size}`);
    const descriptor = this.fileDescriptors.get(fd);
    if (!descriptor) {
      return process.nextTick(() => cb(-9)); // EBADF
    }

    const node = this._getNode(descriptor.path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    node.truncate(size);
    process.nextTick(() => cb(0));
  }

  utimens(path, atime, mtime, cb) {
    console.log(`MemoryFS: utimens ${path} atime=${atime} mtime=${mtime}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    node.atime = new Date(atime * 1000);
    node.mtime = new Date(mtime * 1000);
    process.nextTick(() => cb(0));
  }

  readlink(path, cb) {
    console.log(`MemoryFS: readlink ${path}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }
    if (node.type !== "symlink") {
      return process.nextTick(() => cb(-22)); // EINVAL
    }

    process.nextTick(() => cb(0, node.content.toString()));
  }

  chown(path, uid, gid, cb) {
    console.log(`MemoryFS: chown ${path} uid=${uid} gid=${gid}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    node.uid = uid;
    node.gid = gid;
    process.nextTick(() => cb(0));
  }

  chmod(path, mode, cb) {
    console.log(`MemoryFS: chmod ${path} mode=${mode.toString(8)}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    node.mode = mode;
    process.nextTick(() => cb(0));
  }

  mknod(path, mode, dev, cb) {
    console.log(`MemoryFS: mknod ${path} mode=${mode.toString(8)} dev=${dev}`);
    if (this._pathExists(path)) {
      return process.nextTick(() => cb(-17)); // EEXIST
    }

    const parent = this._getParentPath(path);
    if (parent && !this._pathExists(parent)) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    const type = (mode & 0o170000) === 0o100000 ? "file" : "special";
    this._createNode(path, type, mode & 0o777);
    process.nextTick(() => cb(0));
  }

  setxattr(path, name, buffer, position, flags, cb) {
    console.log(`MemoryFS: setxattr ${path} name=${name} flags=${flags}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    if (flags === 1 && node.xattrs.has(name)) {
      // XATTR_CREATE
      return process.nextTick(() => cb(-17)); // EEXIST
    }
    if (flags === 2 && !node.xattrs.has(name)) {
      // XATTR_REPLACE
      return process.nextTick(() => cb(-61)); // ENODATA
    }

    node.xattrs.set(name, Buffer.from(buffer));
    process.nextTick(() => cb(0));
  }

  getxattr(path, name, position, cb) {
    console.log(`MemoryFS: getxattr ${path} name=${name}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    const value = node.xattrs.get(name);
    if (!value) {
      return process.nextTick(() => cb(-61)); // ENODATA
    }

    process.nextTick(() => cb(0, value));
  }

  listxattr(path, cb) {
    console.log(`MemoryFS: listxattr ${path}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    const names = Array.from(node.xattrs.keys());
    process.nextTick(() => cb(0, names));
  }

  removexattr(path, name, cb) {
    console.log(`MemoryFS: removexattr ${path} name=${name}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    if (!node.xattrs.delete(name)) {
      return process.nextTick(() => cb(-61)); // ENODATA
    }

    process.nextTick(() => cb(0));
  }

  open(path, flags, cb) {
    console.log(`MemoryFS: open ${path} flags=${flags}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }
    if (node.type === "directory") {
      return process.nextTick(() => cb(-21)); // EISDIR
    }

    const fd = this._getNextFd();
    this.fileDescriptors.set(fd, {
      path: this._normalizePath(path),
      flags: flags,
      pos: 0,
    });

    process.nextTick(() => cb(0, fd));
  }

  opendir(path, flags, cb) {
    console.log(`MemoryFS: opendir ${path} flags=${flags}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }
    if (node.type !== "directory") {
      return process.nextTick(() => cb(-20)); // ENOTDIR
    }

    const fd = this._getNextFd();
    this.dirDescriptors.set(fd, {
      path: this._normalizePath(path),
    });

    process.nextTick(() => cb(0, fd));
  }

  read(fd, buffer, length, position, cb) {
    console.log(
      `MemoryFS: read fd=${fd} length=${length} position=${position}`,
    );
    const descriptor = this.fileDescriptors.get(fd);
    if (!descriptor) {
      return process.nextTick(() => cb(-9)); // EBADF
    }

    const node = this._getNode(descriptor.path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    const bytesRead = node.read(buffer, length, position);
    process.nextTick(() => cb(bytesRead));
  }

  write(fd, buffer, length, position, cb) {
    console.log(
      `MemoryFS: write fd=${fd} length=${length} position=${position}`,
    );
    const descriptor = this.fileDescriptors.get(fd);
    if (!descriptor) {
      return process.nextTick(() => cb(-9)); // EBADF
    }

    const node = this._getNode(descriptor.path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    const bytesWritten = node.write(buffer, length, position);
    process.nextTick(() => cb(bytesWritten));
  }

  release(fd, cb) {
    console.log(`MemoryFS: release fd=${fd}`);
    if (!this.fileDescriptors.delete(fd)) {
      return process.nextTick(() => cb(-9)); // EBADF
    }
    process.nextTick(() => cb(0));
  }

  releasedir(fd, cb) {
    console.log(`MemoryFS: releasedir fd=${fd}`);
    if (!this.dirDescriptors.delete(fd)) {
      return process.nextTick(() => cb(-9)); // EBADF
    }
    process.nextTick(() => cb(0));
  }

  create(path, mode, cb) {
    console.log(`MemoryFS: create ${path} mode=${mode.toString(8)}`);
    if (this._pathExists(path)) {
      return process.nextTick(() => cb(-17)); // EEXIST
    }

    const parent = this._getParentPath(path);
    if (parent && !this._pathExists(parent)) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    this._createNode(path, "file", mode);
    const fd = this._getNextFd();
    this.fileDescriptors.set(fd, {
      path: this._normalizePath(path),
      flags: 2, // O_RDWR
      pos: 0,
    });

    process.nextTick(() => cb(0, fd));
  }

  unlink(path, cb) {
    console.log(`MemoryFS: unlink ${path}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }
    if (node.type === "directory") {
      return process.nextTick(() => cb(-21)); // EISDIR
    }

    this._deleteNode(path);
    process.nextTick(() => cb(0));
  }

  rename(src, dest, cb) {
    console.log(`MemoryFS: rename ${src} -> ${dest}`);
    const srcNode = this._getNode(src);
    if (!srcNode) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    // Remove from old location
    this._deleteNode(src);

    // Add to new location
    const newNode = srcNode.clone();
    newNode.path = this._normalizePath(dest);
    this.files.set(newNode.path, newNode);
    this.stats.files++;

    process.nextTick(() => cb(0));
  }

  link(src, dest, cb) {
    console.log(`MemoryFS: link ${src} -> ${dest}`);
    const srcNode = this._getNode(src);
    if (!srcNode) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }
    if (this._pathExists(dest)) {
      return process.nextTick(() => cb(-17)); // EEXIST
    }

    const linkNode = srcNode.clone();
    linkNode.path = this._normalizePath(dest);
    linkNode.nlink++;
    this.files.set(linkNode.path, linkNode);
    srcNode.nlink++;
    this.stats.files++;

    process.nextTick(() => cb(0));
  }

  symlink(src, dest, cb) {
    console.log(`MemoryFS: symlink ${src} -> ${dest}`);
    if (this._pathExists(dest)) {
      return process.nextTick(() => cb(-17)); // EEXIST
    }

    const parent = this._getParentPath(dest);
    if (parent && !this._pathExists(parent)) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    this._createNode(dest, "symlink", 0o777, Buffer.from(src));
    process.nextTick(() => cb(0));
  }

  mkdir(path, mode, cb) {
    console.log(`MemoryFS: mkdir ${path} mode=${mode.toString(8)}`);
    if (this._pathExists(path)) {
      return process.nextTick(() => cb(-17)); // EEXIST
    }

    const parent = this._getParentPath(path);
    if (parent && !this._pathExists(parent)) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    this._createNode(path, "directory", mode);
    process.nextTick(() => cb(0));
  }

  rmdir(path, cb) {
    console.log(`MemoryFS: rmdir ${path}`);
    const node = this._getNode(path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }
    if (node.type !== "directory") {
      return process.nextTick(() => cb(-20)); // ENOTDIR
    }

    // Check if directory is empty
    const normalized = this._normalizePath(path);
    for (const [filePath] of this.files) {
      if (this._getParentPath(filePath) === normalized) {
        return process.nextTick(() => cb(-39)); // ENOTEMPTY
      }
    }

    this._deleteNode(path);
    process.nextTick(() => cb(0));
  }

  // Advanced operations with minimal implementations
  lock(fd, cmd, flock, cb) {
    console.log(`MemoryFS: lock fd=${fd} cmd=${cmd}`);
    process.nextTick(() => cb(0));
  }

  bmap(path, blocksize, idx, cb) {
    console.log(`MemoryFS: bmap ${path} blocksize=${blocksize} idx=${idx}`);
    process.nextTick(() => cb(0, idx)); // Return same block index
  }

  ioctl(fd, cmd, arg, flags, in_buf, out_buf, cb) {
    console.log(`MemoryFS: ioctl fd=${fd} cmd=${cmd}`);
    process.nextTick(() => cb(-25)); // ENOTTY - not a terminal
  }

  poll(fd, ph, reventsp, cb) {
    console.log(`MemoryFS: poll fd=${fd}`);
    process.nextTick(() => cb(0, 1)); // POLLIN - ready for reading
  }

  write_buf(fd, buffer, length, position, cb) {
    console.log(
      `MemoryFS: write_buf fd=${fd} length=${length} position=${position}`,
    );
    return this.write(fd, buffer, length, position, cb);
  }

  read_buf(fd, buffer, length, position, cb) {
    console.log(
      `MemoryFS: read_buf fd=${fd} length=${length} position=${position}`,
    );
    return this.read(fd, buffer, length, position, cb);
  }

  flock(fd, op, cb) {
    console.log(`MemoryFS: flock fd=${fd} op=${op}`);
    process.nextTick(() => cb(0));
  }

  fallocate(fd, mode, offset, length, cb) {
    console.log(
      `MemoryFS: fallocate fd=${fd} mode=${mode} offset=${offset} length=${length}`,
    );
    const descriptor = this.fileDescriptors.get(fd);
    if (!descriptor) {
      return process.nextTick(() => cb(-9)); // EBADF
    }

    const node = this._getNode(descriptor.path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    // Simple implementation - just extend file if needed
    const requiredSize = offset + length;
    if (node.content.length < requiredSize) {
      const newBuffer = Buffer.alloc(requiredSize);
      node.content.copy(newBuffer);
      node.content = newBuffer;
    }

    process.nextTick(() => cb(0));
  }

  lseek(fd, offset, whence, cb) {
    console.log(`MemoryFS: lseek fd=${fd} offset=${offset} whence=${whence}`);
    const descriptor = this.fileDescriptors.get(fd);
    if (!descriptor) {
      return process.nextTick(() => cb(-9)); // EBADF
    }

    const node = this._getNode(descriptor.path);
    if (!node) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    let newPos;
    switch (whence) {
      case 0: // SEEK_SET
        newPos = offset;
        break;
      case 1: // SEEK_CUR
        newPos = descriptor.pos + offset;
        break;
      case 2: // SEEK_END
        newPos = node.content.length + offset;
        break;
      default:
        return process.nextTick(() => cb(-22)); // EINVAL
    }

    if (newPos < 0) {
      return process.nextTick(() => cb(-22)); // EINVAL
    }

    descriptor.pos = newPos;
    process.nextTick(() => cb(0, newPos));
  }

  copy_file_range(fd_in, offset_in, fd_out, offset_out, len, flags, cb) {
    console.log(
      `MemoryFS: copy_file_range fd_in=${fd_in} fd_out=${fd_out} len=${len}`,
    );

    const inDesc = this.fileDescriptors.get(fd_in);
    const outDesc = this.fileDescriptors.get(fd_out);

    if (!inDesc || !outDesc) {
      return process.nextTick(() => cb(-9)); // EBADF
    }

    const inNode = this._getNode(inDesc.path);
    const outNode = this._getNode(outDesc.path);

    if (!inNode || !outNode) {
      return process.nextTick(() => cb(-2)); // ENOENT
    }

    const actualLen = Math.min(len, inNode.content.length - offset_in);
    if (actualLen <= 0) {
      return process.nextTick(() => cb(0, 0));
    }

    const chunk = inNode.content.slice(offset_in, offset_in + actualLen);
    const bytesWritten = outNode.write(chunk, actualLen, offset_out);

    process.nextTick(() => cb(0, bytesWritten));
  }
}

class FileNode {
  constructor(path, type = "file", mode = 0o644, content = Buffer.alloc(0)) {
    this.path = path;
    this.type = type; // 'file', 'directory', 'symlink', 'special'
    this.mode = mode;
    this.content = content;
    this.uid = process.getuid ? process.getuid() : 1000;
    this.gid = process.getgid ? process.getgid() : 1000;
    this.nlink = 1;
    this.size = type === "file" ? content.length : 0;
    this.atime = new Date();
    this.mtime = new Date();
    this.ctime = new Date();
    this.xattrs = new Map();
  }

  getStat() {
    return {
      mode:
        this.mode |
        (this.type === "directory"
          ? 0o40000
          : this.type === "symlink"
            ? 0o120000
            : 0o100000),
      uid: this.uid,
      gid: this.gid,
      size: this.type === "file" ? this.content.length : 0,
      atime: this.atime,
      mtime: this.mtime,
      ctime: this.ctime,
      nlink: this.nlink,
    };
  }

  read(buffer, length, position) {
    if (this.type !== "file") return 0;

    const start = Math.min(position, this.content.length);
    const end = Math.min(position + length, this.content.length);
    const actualLength = Math.max(0, end - start);

    if (actualLength > 0) {
      this.content.copy(buffer, 0, start, end);
    }

    this.atime = new Date();
    return actualLength;
  }

  write(buffer, length, position) {
    if (this.type !== "file") return 0;

    const requiredSize = position + length;
    if (this.content.length < requiredSize) {
      const newBuffer = Buffer.alloc(requiredSize);
      this.content.copy(newBuffer);
      this.content = newBuffer;
    }

    buffer.copy(this.content, position, 0, length);
    this.mtime = new Date();
    return length;
  }

  truncate(size) {
    if (this.type !== "file") return;

    if (size === 0) {
      this.content = Buffer.alloc(0);
    } else if (size < this.content.length) {
      this.content = this.content.slice(0, size);
    } else if (size > this.content.length) {
      const newBuffer = Buffer.alloc(size);
      this.content.copy(newBuffer);
      this.content = newBuffer;
    }

    this.mtime = new Date();
  }

  clone() {
    const clone = new FileNode(
      this.path,
      this.type,
      this.mode,
      Buffer.from(this.content),
    );
    clone.uid = this.uid;
    clone.gid = this.gid;
    clone.nlink = this.nlink;
    clone.atime = new Date(this.atime);
    clone.mtime = new Date(this.mtime);
    clone.ctime = new Date(this.ctime);
    clone.xattrs = new Map(this.xattrs);
    return clone;
  }
}

module.exports = MemoryFileSystem;
