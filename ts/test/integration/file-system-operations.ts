/**
 * @file filesystem-operations.ts
 * @brief FUSE operations implementation using the FileSystem class
 *
 * This class uses the filesystem and has implementations for all FUSE operations.
 * The filesystem class is passed via constructor.
 * Additionally, there's a parameter to override operators for tests.
 * The class serves as a 'shell' for integration tests.
 */

import type {
  FuseOperationHandlers,
  GetattrHandler,
  ReaddirHandler,
  LookupHandler,
  CreateHandler,
  OpenHandler,
  ReadHandler,
  WriteHandler,
  ReleaseHandler,
  MkdirHandler,
  RmdirHandler,
  UnlinkHandler,
  RenameHandler,
  ChmodHandler,
  ChownHandler,
  TruncateHandler,
  SymlinkHandler,
  ReadlinkHandler,
  LinkHandler,
  StatfsHandler,
  GetxattrHandler,
  SetxattrHandler,
  ListxattrHandler,
  RemovexattrHandler,
  AccessHandler,
  CopyFileRangeHandler,
  SetattrHandler,
  UtimensHandler,
  PollHandler,
  FlockHandler,
  FallocateHandler,
  FsyncHandler,
  FsyncdirHandler,
  IoctlHandler,
  LockHandler,
  BmapHandler,
  InitHandler,
  BaseOperationOptions,
  OpenOptions,
  RequestContext,
  FileInfo,
  Ino,
  StatResult,
  DirentEntry,
  ReaddirResult,
  Timeout, StatvfsResult, FlushHandler,
} from "../../index.ts";

import type { SimpleInode } from "./filesystem.ts";

import {
  createIno,
  createMode,
  createUid,
  createGid,
  createDev,
  createFd,
  createFlags,
  getCurrentTimestamp,
} from "../../index.ts";

import { FuseErrno } from "../../errors.ts";
import { DirentType } from "../../constants.ts";
import { FileSystem } from "./filesystem.ts";

/**
 * Partial overrides for operations
 */
export type OperationOverrides = Partial<FuseOperationHandlers>;

/**
 * Filesystem operations class
 */
export class FileSystemOperations implements FuseOperationHandlers {
  _fs: FileSystem;
  _overrides: OperationOverrides;
  _nextFd = 1n;

  constructor(fs: FileSystem, overrides: OperationOverrides = {}) {
    this._fs = fs;
    this._overrides = overrides;
  }

  public overrideOperationsWith(overrides: OperationOverrides) {
    this._overrides = overrides;
  }

  init: InitHandler = async (connInfo, config, options) => {
    if (this._overrides.init) {
      return this._overrides.init(connInfo, config, options);
    }
    // Default init implementation
    return { connectionInfo: {}, config: {} };
  };

  destroy: () => Promise<void> = async () => {
    if (this._overrides.destroy) {
      return this._overrides.destroy();
    }
  };

  getattr: GetattrHandler = async (ino, context, fi, options) => {
    if (this._overrides.getattr) {
      return this._overrides.getattr(ino, context, fi, options)
    }
    const inode = this._fs.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT');
    }

    const stat = this._fs.inodeToStat(inode);
    return { attr: stat, timeout: 1.0 };
  };

  readdir: ReaddirHandler = async (ino, offset, context, fi, options) => {
    if (this._overrides.readdir) {
      return this._overrides.readdir(ino, offset, context, fi, options);
    }
    const dir = this._fs.getInode(ino);
    if (!dir || dir.type !== 'directory' || !(dir.data instanceof Map)) {
      throw new FuseErrno('ENOTDIR');
    }

    const entriesToSend: DirentEntry[] = [];

    // Always include '.' and '..'
    entriesToSend.push({
      name: '.',
      ino: dir.id,
      type: DirentType.Directory,
      nextOffset: 1n, // Offset for the next entry
    });
    entriesToSend.push({
      name: '..',
      ino: dir.id, // For simplicity, '..' of root is root itself in this test FS
      type: DirentType.Directory,
      nextOffset: 2n, // Offset for the next entry
    });

    // Add actual directory contents
    const sortedChildren = Array.from(dir.data.entries()).sort(([a],[b]) => a.localeCompare(b));
    let currentOffset = 3n; // Start offset after '.' and '..'
    for (const [name, child] of sortedChildren) {
      entriesToSend.push({
        name,
        ino: child.id,
        type: child.type === 'directory' ? DirentType.Directory
          : child.type === 'file'     ? DirentType.RegularFile
            : DirentType.Unknown,
        nextOffset: currentOffset++,
      });
    }

    const start = Number(offset); // Convert bigint offset to number for array slicing
    const bufSize = options?.size ?? 0;
    const budget = bufSize > 0 ? Math.max(1, Math.min(entriesToSend.length, Math.floor(bufSize / 80))) : entriesToSend.length; // Adjust budget calculation

    const slice = entriesToSend.slice(start, start + budget);
    const resultEntries = slice.map((entry, idx) => ({
      ...entry,
      nextOffset: BigInt(start + idx + 1), // Update nextOffset based on current slice
    }));

    const lastOffset = resultEntries.length > 0 ? resultEntries[resultEntries.length - 1].nextOffset : offset;
    const hasMore = (start + resultEntries.length) < entriesToSend.length;

    return { entries: resultEntries, hasMore, nextOffset: lastOffset };
  };

  lookup: LookupHandler = async (parent, name, context, options) => {
    if (this._overrides.lookup) {
      return this._overrides.lookup(parent, name, context, options)
    }
    const parentInode = this._fs.getInode(parent);
    if (!parentInode || parentInode.type !== 'directory' || !(parentInode.data instanceof Map)) {
      throw new FuseErrno('ENOTDIR');
    }

    const childInode = parentInode.data.get(name);
    if (!childInode) {
      throw new FuseErrno('ENOENT');
    }

    const stat = this._fs.inodeToStat(childInode);
    return {
      ino: childInode.id,
      generation: childInode.generation,
      entry_timeout: 1.0,
      attr_timeout: 1.0,
      attr: stat,
    };
  };

  // Placeholder implementations for other operations
  // These can be expanded as needed for tests

  create: CreateHandler = async (parent, name, mode, context, options) => {
    if (this._overrides.create) {
      return this._overrides.create(parent, name, mode, context, options);
    }
    const parentInode = this._fs.getInode(parent);
    if (!parentInode || parentInode.type !== 'directory') {
      throw new FuseErrno('ENOTDIR');
    }
    const parentPath = this._fs.getPath(parent);
    if (parentPath === null) {
      throw new FuseErrno('ENOENT');
    }
    const path = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
    const newInode = this._fs.createFile(path, mode, context.uid, context.gid);
    const fd = createFd(this._nextFd++);
    const fi: FileInfo = { fh: fd, flags: createFlags(0) };
    const attr = this._fs.inodeToStat(newInode);
    return { attr, timeout: 1.0, fi };
  };

  open: OpenHandler = async (ino, context, options) => {
    if (this._overrides.open) {
      return this._overrides.open(ino, context, options);
    }
    const fd = createFd(this._nextFd++);
    return { fh: fd, flags: options?.flags ?? createFlags(0), direct_io: true };
  };

  read: ReadHandler = async (ino, context, options) => {
    if (this._overrides.read) {
      return this._overrides.read(ino, context, options);
    }
    const inode = this._fs.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT');
    }
    if (inode.type !== 'file' || !(inode.data instanceof Buffer)) {
      throw new FuseErrno('EISDIR'); // Or EBADF, depending on context
    }

    const start = Number(options.offset);
    const end = start + options.size;
    const data = inode.data.slice(start, end);
    return data;
  };

  write: WriteHandler = async (ino, data, context, options) => {
    if (this._overrides.write) {
      return this._overrides.write(ino, data, context, options);
    }
    const inode = this._fs.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT');
    }
    if (inode.type !== 'file' || !(inode.data instanceof Buffer)) {
      throw new FuseErrno('EISDIR');
    }

    const offset = Number(options.offset);
    const newData = Buffer.from(data);
    const newDataLength = newData.length;

    if (offset + newDataLength > inode.data.length) {
      const newBuffer = Buffer.alloc(offset + newDataLength);
      inode.data.copy(newBuffer);
      inode.data = newBuffer;
    }

    newData.copy(inode.data, offset);
    inode.size = BigInt(inode.data.length);

    return newDataLength;
  };

  release: ReleaseHandler = async (ino, fi, context, options) => {
    console.log('release', ino, fi, context, options);
    if (this._overrides.release) {
      return this._overrides.release(ino, fi, context, options);
    }
    // Default release implementation - no-op
  };

  flush: FlushHandler = async (ino, fi, context, options) => {
    if (this._overrides.flush) {
      return this._overrides.flush(ino, fi, context, options);
    }
    // Default release implementation - no-op
  };

  mkdir: MkdirHandler = async (parent, name, mode, context, options) => {
    if (this._overrides.mkdir) {
      return this._overrides.mkdir(parent, name, mode, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  rmdir: RmdirHandler = async (parent, name, context, options) => {
    if (this._overrides.rmdir) {
      return this._overrides.rmdir(parent, name, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  unlink: UnlinkHandler = async (parent, name, context, options) => {
    if (this._overrides.unlink) {
      return this._overrides.unlink(parent, name, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  rename: RenameHandler = async (parent, name, newparent, newname, flags, context, options) => {
    if (this._overrides.rename) {
      return this._overrides.rename(parent, name, newparent, newname, flags, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  chmod: ChmodHandler = async (ino, mode, context, options) => {
    if (this._overrides.chmod) {
      return this._overrides.chmod(ino, mode, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  chown: ChownHandler = async (ino, uid, gid, context, options) => {
    if (this._overrides.chown) {
      return this._overrides.chown(ino, uid, gid, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  truncate: TruncateHandler = async (ino, size, context, fi, options) => {
    if (this._overrides.truncate) {
      return this._overrides.truncate(ino, size, context, fi, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  symlink: SymlinkHandler = async (target, parent, name, context, options) => {
    if (this._overrides.symlink) {
      return this._overrides.symlink(target, parent, name, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  readlink: ReadlinkHandler = async (ino, context, options) => {
    if (this._overrides.readlink) {
      return this._overrides.readlink(ino, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  link: LinkHandler = async (ino, newparent, newname, context, options) => {
    if (this._overrides.link) {
      return this._overrides.link(ino, newparent, newname, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  statfs: StatfsHandler = async (ino, context, options):Promise<StatvfsResult> => {
    if (this._overrides.statfs) {
      return this._overrides.statfs(ino, context, options);
    }
    return {
      blocks: 1024n * 1024n,   // 1M Blöcke
      bfree:  1024n * 512n,    // 50% frei
      bavail: 1024n * 512n,
      files:  1024n * 1024n,
      ffree:  1024n * 512n,
      bsize:  4096,
      namemax: 255,
      frsize: 4096,
      flag: 0,
      favail: 0n,
      fsid: 1n,
    };
  };

  getxattr: GetxattrHandler = async (ino, name, context, options) => {
    if (this._overrides.getxattr) {
      return this._overrides.getxattr(ino, name, context, options);
    }
    throw new FuseErrno('ENODATA');
  };

  setxattr: SetxattrHandler = async (ino, name, value, flags, context, options) => {
    if (this._overrides.setxattr) {
      return this._overrides.setxattr(ino, name, value, flags, context, options);
    }
    throw new FuseErrno('ENODATA');
  };

  listxattr: ListxattrHandler = async (ino, context, options) => {
    if (this._overrides.listxattr) {
      return this._overrides.listxattr(ino, context, options);
    }
    return { names: [], size:0n };
  };

  removexattr: RemovexattrHandler = async (ino, name, context, options) => {
    if (this._overrides.removexattr) {
      return this._overrides.removexattr(ino, name, context, options);
    }
    throw new FuseErrno('ENODATA');
  };

  access: AccessHandler = async (ino, context, options) => {
    if (this._overrides.access) {
      return this._overrides.access(ino, context, options);
    }
    return
  };

  copy_file_range: CopyFileRangeHandler = async (inoIn, offIn, fiIn, inoOut, offOut, fiOut, len, flags, context, options) => {
    if (this._overrides.copy_file_range) {
      return this._overrides.copy_file_range(inoIn, offIn, fiIn, inoOut, offOut, fiOut, len, flags, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  setattr: SetattrHandler = async (ino, attr, context, options) => {
    if (this._overrides.setattr) {
      return this._overrides.setattr(ino, attr, context, options);
    }
    const inode = this._fs.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT');
    }

    const now = getCurrentTimestamp();
    const touchCtime = () => {
      inode.ctime = now;
    };

    if (attr.mode !== undefined) {
      inode.mode = attr.mode;
      touchCtime();
    }

    if (attr.uid !== undefined) {
      inode.uid = attr.uid;
      touchCtime();
    }

    if (attr.gid !== undefined) {
      inode.gid = attr.gid;
      touchCtime();
    }

    if (attr.size !== undefined) {
      if (attr.size < 0n) {
        throw new FuseErrno('EINVAL');
      }
      if (inode.type !== 'file' || !(inode.data instanceof Buffer)) {
        throw new FuseErrno('EISDIR');
      }

      const newLength = Number(attr.size);
      if (!Number.isSafeInteger(newLength)) {
        throw new FuseErrno('EFBIG');
      }

      if (newLength !== inode.data.length) {
        const resized = Buffer.alloc(newLength);
        const copyLength = Math.min(newLength, inode.data.length);
        if (copyLength > 0) {
          inode.data.copy(resized, 0, 0, copyLength);
        }
        inode.data = resized;
      }
      inode.size = BigInt(newLength);
      touchCtime();
    }

    if (options?.atimeNow) {
      inode.atime = now;
      touchCtime();
    } else if (attr.atime !== undefined) {
      inode.atime = attr.atime;
      touchCtime();
    }

    if (options?.mtimeNow) {
      inode.mtime = now;
      touchCtime();
    } else if (attr.mtime !== undefined) {
      inode.mtime = attr.mtime;
      touchCtime();
    }

    if (attr.ctime !== undefined) {
      inode.ctime = attr.ctime;
    }

    const stat = this._fs.inodeToStat(inode);
    return { attr: stat, timeout: 1.0 };
  };

  // utimens is not in FuseOperationHandlers, so we don't implement it

  poll: PollHandler = async (ino, fi, ph, reventsp, context, options) => {
    if (this._overrides.poll) {
      return this._overrides.poll(ino, fi, ph, reventsp, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  flock: FlockHandler = async (ino, fi, op, context, options) => {
    if (this._overrides.flock) {
      return this._overrides.flock(ino, fi, op, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  fallocate = async (ino: Ino, fi: FileInfo, mode: number, offset: bigint, length: bigint, context: RequestContext, options?: BaseOperationOptions) => {
    if (this._overrides.fallocate) {
      return this._overrides.fallocate(ino, fi, mode, offset, length, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  fsync: FsyncHandler = async (ino, datasync, fi, context, options) => {
    if (this._overrides.fsync) {
      return this._overrides.fsync(ino, datasync, fi, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  fsyncdir: FsyncdirHandler = async (ino, datasync, fi, context, options) => {
    if (this._overrides.fsyncdir) {
      return this._overrides.fsyncdir(ino, datasync, fi, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  ioctl = async (ino: Ino, cmd: number, arg: number | bigint | Buffer | null, fi: FileInfo, flags: number, context: RequestContext, options?: BaseOperationOptions) => {
    if (this._overrides.ioctl) {
      return this._overrides.ioctl(ino, cmd, arg, fi, flags, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  // lock is not in FuseOperationHandlers, so we don't implement it

  bmap: BmapHandler = async (ino, blocksize, idx, context, options) => {
    if (this._overrides.bmap) {
      return this._overrides.bmap(ino, blocksize, idx, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  opendir = async (ino: Ino, context: RequestContext, options?: OpenOptions): Promise<FileInfo> => {
    if (this._overrides.opendir) {
      return this._overrides.opendir(ino, context, options);
    }
    const fd = createFd(this._nextFd++);
    return { fh: fd, flags: createFlags(0), direct_io: true };
  };

  releasedir = async (ino: Ino, fi: FileInfo, context: RequestContext, options?: BaseOperationOptions) => {
    if (this._overrides.releasedir) {
      return this._overrides.releasedir(ino, fi, context, options);
    }
    // Default releasedir implementation - no-op
  };
}
