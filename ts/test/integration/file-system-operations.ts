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
  MkdirResult,
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
  Timeout,
  StatvfsResult,
  FlushHandler,
  SetattrOptions,
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
import {
  DirentType,
  FUSE_SET_ATTR_ATIME,
  FUSE_SET_ATTR_ATIME_NOW,
  FUSE_SET_ATTR_CTIME,
  FUSE_SET_ATTR_GID,
  FUSE_SET_ATTR_MODE,
  FUSE_SET_ATTR_MTIME,
  FUSE_SET_ATTR_MTIME_NOW,
  FUSE_SET_ATTR_SIZE,
  FUSE_SET_ATTR_UID,
} from "../../constants.ts";
import { FileSystem } from "./filesystem.ts";

const shouldLogFuseOps = (() => {
  const level = process.env.FUSE_TS_LOG?.toUpperCase() ?? '';
  return level === 'DEBUG' || level === 'TRACE';
})();

const logFuseOp = (op: string, phase: string, fields?: Record<string, unknown>) => {
  if (!shouldLogFuseOps) {
    return;
  }
  const prefix = `[ts-fuse] ${op} ${phase}`;
  if (fields) {
    console.debug(prefix, fields);
  } else {
    console.debug(prefix);
  }
};

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
  _nextIno = 2n; // Start from 2, as 1 is typically root

  constructor(fs: FileSystem, overrides: OperationOverrides = {}) {
    this._fs = fs;
    this._overrides = overrides;
  }

  public overrideOperationsWith(overrides: OperationOverrides) {
    this._overrides = overrides;
  }

  init: InitHandler = async (connInfo, config, options) => {
    logFuseOp('init', 'start');
    if (this._overrides.init) {
      return this._overrides.init(connInfo, config, options);
    }
    // Default init implementation
    logFuseOp('init', 'default');
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
    logFuseOp('getattr', 'default', { ino: ino.toString() });
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
    logFuseOp('readdir', 'default', { ino: ino.toString(), offset: offset.toString(), size: options?.size });
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
    logFuseOp('lookup', 'default', { parent: parent.toString(), name });
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
    logFuseOp('################ create', 'default', {
      parent: parent.toString(),
      name,
      mode,
      uid: context.uid,
      gid: context.gid,
    });
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
    const incomingFi = (options as (typeof options & { fi?: FileInfo | undefined }))?.fi;
    const fi: FileInfo = {
      fh: fd,
      flags: incomingFi?.flags ?? createFlags(0),
      // direct_io: incomingFi?.direct_io,
      // keep_cache: incomingFi?.keep_cache,
      direct_io: true,
      keep_cache: false,
      flush: incomingFi?.flush,
      nonseekable: incomingFi?.nonseekable,
      cache_readdir: incomingFi?.cache_readdir,
      parallel_direct_writes: incomingFi?.parallel_direct_writes,
    };
    const attr = this._fs.inodeToStat(newInode);
    return {
      ino: newInode.id,
      generation: newInode.generation,
      entry_timeout: 1.0,
      attr_timeout: 1.0,
      attr,
      fi,
    };
  };

  open: OpenHandler = async (ino, context, options) => {
    if (this._overrides.open) {
      return this._overrides.open(ino, context, options);
    }
    logFuseOp('open', 'default', {
      ino: ino.toString(),
      flags: options?.flags,
    });
    const fd = createFd(this._nextFd++);
    return { fh: fd, flags: options?.flags ?? createFlags(0) };
  };

  read: ReadHandler = async (ino, context, options) => {
    if (this._overrides.read) {
      return this._overrides.read(ino, context, options);
    }
    logFuseOp('read', 'default', {
      ino: ino.toString(),
      offset: options.offset.toString(),
      size: options.size,
    });
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
    inode.atime = getCurrentTimestamp();
    return data;
  };

  write: WriteHandler = async (ino, data, context, options) => {
    if (this._overrides.write) {
      return this._overrides.write(ino, data, context, options);
    }
    logFuseOp('write', 'default', {
      ino: ino.toString(),
      offset: options.offset.toString(),
      size: data.byteLength,
    });
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

    const now = getCurrentTimestamp();
    inode.mtime = now;
    inode.ctime = now;

    return newDataLength;
  };

  release: ReleaseHandler = async (ino, fi, context, options) => {
    if (this._overrides.release) {
      return this._overrides.release(ino, fi, context, options);
    }
    logFuseOp('#################### release', 'default', {
      ino: ino.toString(),
      fh: fi.fh.toString(),
    });
    return;
  };

  flush: FlushHandler = async (ino, fi, context, options) => {
    if (this._overrides.flush) {
      return this._overrides.flush(ino, fi, context, options);
    }
    logFuseOp('################## flush', 'default', {
      ino: ino.toString(),
      fh: fi.fh.toString(),
    });
    return;
  };

  mkdir: MkdirHandler = async (parent, name, mode, context, options): Promise<MkdirResult> => {
    if (this._overrides.mkdir) {
      return this._overrides.mkdir(parent, name, mode, context, options);
    }
    logFuseOp('mkdir', 'default', {
      parent: parent.toString(),
      name,
      mode,
      uid: context.uid,
      gid: context.gid,
    });
    const parentInode = this._fs.getInode(parent);
    if (!parentInode || parentInode.type !== 'directory' || !(parentInode.data instanceof Map)) {
      logFuseOp('mkdir', 'error', { error: 'ENOTDIR', parent: parent.toString() });
      throw new FuseErrno('ENOTDIR');
    }

    // Check if directory already exists
    if (parentInode.data.has(name)) {
      logFuseOp('mkdir', 'error', { error: 'EEXIST', name });
      throw new FuseErrno('EEXIST');
    }

    // Create new directory inode
    const now = getCurrentTimestamp();
    const newInode: SimpleInode = {
      id: createIno(this._nextIno++),
      type: 'directory',
      mode: createMode(mode),
      uid: createUid(context.uid),
      gid: createGid(context.gid),
      size: 0n,
      atime: now,
      mtime: now,
      ctime: now,
      nlink: 2, // . and ..
      generation: 0n,
      data: new Map(),
    };

    // Add . and .. entries
    (newInode.data as Map<string, SimpleInode>).set('.', newInode);
    (newInode.data as Map<string, SimpleInode>).set('..', parentInode);

    // Add to parent directory
    (parentInode.data as Map<string, SimpleInode>).set(name, newInode);
    this._fs['inodes'].set(newInode.id, newInode);

    // Update parent timestamps
    const parentNow = getCurrentTimestamp();
    parentInode.mtime = parentNow;
    parentInode.ctime = parentNow;

    const attr = this._fs.inodeToStat(newInode);
    logFuseOp('mkdir', 'success', {
      newIno: newInode.id.toString(),
      parentIno: parent.toString(),
      name
    });
    return {
      ino: newInode.id,
      generation: newInode.generation,
      entry_timeout: 1.0,
      attr_timeout: 1.0,
      attr
    };
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

    const maskFromOptions = options?.valid ?? 0;
    let effectiveMask = maskFromOptions;

    const inferMaskFromAttr = () => {
      let mask = 0;
      if (attr.mode !== undefined) mask |= FUSE_SET_ATTR_MODE;
      if (attr.uid !== undefined) mask |= FUSE_SET_ATTR_UID;
      if (attr.gid !== undefined) mask |= FUSE_SET_ATTR_GID;
      if (attr.size !== undefined) mask |= FUSE_SET_ATTR_SIZE;
      if (attr.atime !== undefined) mask |= FUSE_SET_ATTR_ATIME;
      if (attr.mtime !== undefined) mask |= FUSE_SET_ATTR_MTIME;
      if (attr.ctime !== undefined) mask |= FUSE_SET_ATTR_CTIME;
      return mask;
    };

    if (options?.atimeNow) {
      effectiveMask |= FUSE_SET_ATTR_ATIME_NOW;
    }
    if (options?.mtimeNow) {
      effectiveMask |= FUSE_SET_ATTR_MTIME_NOW;
    }

    if (effectiveMask === 0) {
      effectiveMask = inferMaskFromAttr();
    } else {
      effectiveMask |= inferMaskFromAttr();
    }

    const supportedMask =
      FUSE_SET_ATTR_MODE |
      FUSE_SET_ATTR_UID |
      FUSE_SET_ATTR_GID |
      FUSE_SET_ATTR_SIZE |
      FUSE_SET_ATTR_ATIME |
      FUSE_SET_ATTR_ATIME_NOW |
      FUSE_SET_ATTR_MTIME |
      FUSE_SET_ATTR_MTIME_NOW |
      FUSE_SET_ATTR_CTIME;

    if ((effectiveMask & ~supportedMask) !== 0) {
      throw new FuseErrno('ENOTSUP', 'Unsupported setattr mask');
    }

    logFuseOp('setattr', 'default:start', {
      ino: ino.toString(),
      valid: effectiveMask,
      hasSize: attr.size !== undefined,
      hasMode: attr.mode !== undefined,
      atimeNow: Boolean(effectiveMask & FUSE_SET_ATTR_ATIME_NOW),
      mtimeNow: Boolean(effectiveMask & FUSE_SET_ATTR_MTIME_NOW),
    });

    const now = getCurrentTimestamp();
    let ctimeUpdated = false;

    const requireNumber = (value: number | undefined, name: string): number => {
      if (value === undefined) {
        throw new FuseErrno('EINVAL', `${name} is required for setattr`);
      }
      if (!Number.isInteger(value) || value < 0) {
        throw new FuseErrno('EINVAL', `${name} must be a non-negative integer`);
      }
      return value;
    };

    const requireBigInt = (value: bigint | undefined, name: string): bigint => {
      if (value === undefined) {
        throw new FuseErrno('EINVAL', `${name} is required for setattr`);
      }
      if (value < 0n) {
        throw new FuseErrno('EINVAL', `${name} cannot be negative`);
      }
      return value;
    };

    if ((effectiveMask & FUSE_SET_ATTR_MODE) !== 0) {
      const raw = attr.mode !== undefined ? Number(attr.mode) : undefined;
      const modeValue = requireNumber(raw, 'attr.mode');
      inode.mode = createMode(modeValue);
      ctimeUpdated = true;
    }

    if ((effectiveMask & FUSE_SET_ATTR_UID) !== 0) {
      const raw = attr.uid !== undefined ? Number(attr.uid) : undefined;
      const uidValue = requireNumber(raw, 'attr.uid');
      inode.uid = createUid(uidValue);
      ctimeUpdated = true;
    }

    if ((effectiveMask & FUSE_SET_ATTR_GID) !== 0) {
      const raw = attr.gid !== undefined ? Number(attr.gid) : undefined;
      const gidValue = requireNumber(raw, 'attr.gid');
      inode.gid = createGid(gidValue);
      ctimeUpdated = true;
    }

    if ((effectiveMask & FUSE_SET_ATTR_SIZE) !== 0) {
      const targetSizeBigInt = requireBigInt(attr.size, 'attr.size');
      if (inode.type !== 'file' || !(inode.data instanceof Buffer)) {
        throw new FuseErrno('EISDIR');
      }
      if (targetSizeBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new FuseErrno('EFBIG');
      }

      const targetSize = Number(targetSizeBigInt);
      if (targetSize !== inode.data.length) {
        const resized = Buffer.alloc(targetSize);
        const copyLength = Math.min(targetSize, inode.data.length);
        if (copyLength > 0) {
          inode.data.copy(resized, 0, 0, copyLength);
        }
        inode.data = resized;
      }
      inode.size = BigInt(targetSize);
      ctimeUpdated = true;
    }

    if ((effectiveMask & FUSE_SET_ATTR_ATIME) !== 0) {
      if ((effectiveMask & FUSE_SET_ATTR_ATIME_NOW) !== 0) {
        inode.atime = now;
      } else {
        inode.atime = requireBigInt(attr.atime, 'attr.atime');
      }
    } else if ((effectiveMask & FUSE_SET_ATTR_ATIME_NOW) !== 0) {
      inode.atime = now;
    }

    if ((effectiveMask & FUSE_SET_ATTR_MTIME) !== 0) {
      if ((effectiveMask & FUSE_SET_ATTR_MTIME_NOW) !== 0) {
        inode.mtime = now;
      } else {
        inode.mtime = requireBigInt(attr.mtime, 'attr.mtime');
      }
    } else if ((effectiveMask & FUSE_SET_ATTR_MTIME_NOW) !== 0) {
      inode.mtime = now;
    }

    if ((effectiveMask & FUSE_SET_ATTR_CTIME) !== 0) {
      inode.ctime = requireBigInt(attr.ctime, 'attr.ctime');
    } else if (ctimeUpdated) {
      inode.ctime = now;
    }

    const stat = this._fs.inodeToStat(inode);
    logFuseOp('setattr', 'default:done', {
      ino: ino.toString(),
      size: stat.size.toString(),
      mtime: stat.mtime.toString(),
    });
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
    logFuseOp('fsync', 'default', {
      ino: ino.toString(),
      datasync,
      fh: fi.fh.toString(),
    });
    // Default fsync implementation - treated as a no-op for the in-memory FS
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
