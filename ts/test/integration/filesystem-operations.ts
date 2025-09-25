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
  Timeout,
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
export class FilesystemOperations implements FuseOperationHandlers {
  private fs: FileSystem;
  private overrides: OperationOverrides;

  constructor(fs: FileSystem, overrides: OperationOverrides = {}) {
    this.fs = fs;
    this.overrides = overrides;
  }

  // FUSE Operation Handlers

  init: InitHandler = async (connInfo, config, options) => {
    if (this.overrides.init) {
      return this.overrides.init(connInfo, config, options);
    }
    // Default init implementation
    return { connectionInfo: {}, config: {} };
  };

  // Note: destroy is not in FuseOperationHandlers, so we don't implement it

  getattr: GetattrHandler = async (ino, context, fi, options) => {
    if (this.overrides.getattr) {
      return this.overrides.getattr(ino, context, fi, options);
    }

    const inode = this.fs.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT');
    }

    const stat = this.fs.inodeToStat(inode);
    return { attr: stat, timeout: 1.0 };
  };

  readdir: ReaddirHandler = async (ino, offset, context, fi, options) => {
    if (this.overrides.readdir) {
      return this.overrides.readdir(ino, offset, context, fi, options);
    }

    const inode = this.fs.getInode(ino);
    if (!inode || inode.type !== 'directory' || !(inode.data instanceof Map)) {
      throw new FuseErrno('ENOTDIR');
    }

    const entries: DirentEntry[] = [];
    for (const [name, childInode] of inode.data) {
      let type: DirentType;
      switch (childInode.type) {
        case 'directory':
          type = DirentType.Directory;
          break;
        case 'file':
          type = DirentType.RegularFile;
          break;
        default:
          type = DirentType.Unknown;
      }
      entries.push({
        name,
        ino: childInode.id,
        type,
      });
    }

    return {
      entries,
      hasMore: false,
    };
  };

  lookup: LookupHandler = async (parent, name, context, options) => {
    if (this.overrides.lookup) {
      return this.overrides.lookup(parent, name, context, options);
    }

    const parentInode = this.fs.getInode(parent);
    if (!parentInode || parentInode.type !== 'directory' || !(parentInode.data instanceof Map)) {
      throw new FuseErrno('ENOTDIR');
    }

    const childInode = parentInode.data.get(name);
    if (!childInode) {
      throw new FuseErrno('ENOENT');
    }

    const stat = this.fs.inodeToStat(childInode);
    return { attr: stat, timeout: 1.0 };
  };

  // Placeholder implementations for other operations
  // These can be expanded as needed for tests

  create: CreateHandler = async (parent, name, mode, context, options) => {
    if (this.overrides.create) {
      return this.overrides.create(parent, name, mode, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  open: OpenHandler = async (ino, context, options) => {
    if (this.overrides.open) {
      return this.overrides.open(ino, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  read: ReadHandler = async (ino, context, options) => {
    if (this.overrides.read) {
      return this.overrides.read(ino, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  write: WriteHandler = async (ino, data, context, options) => {
    if (this.overrides.write) {
      return this.overrides.write(ino, data, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  release: ReleaseHandler = async (ino, fi, context, options) => {
    if (this.overrides.release) {
      return this.overrides.release(ino, fi, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  mkdir: MkdirHandler = async (parent, name, mode, context, options) => {
    if (this.overrides.mkdir) {
      return this.overrides.mkdir(parent, name, mode, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  rmdir: RmdirHandler = async (parent, name, context, options) => {
    if (this.overrides.rmdir) {
      return this.overrides.rmdir(parent, name, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  unlink: UnlinkHandler = async (parent, name, context, options) => {
    if (this.overrides.unlink) {
      return this.overrides.unlink(parent, name, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  rename: RenameHandler = async (parent, name, newparent, newname, flags, context, options) => {
    if (this.overrides.rename) {
      return this.overrides.rename(parent, name, newparent, newname, flags, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  chmod: ChmodHandler = async (ino, mode, context, options) => {
    if (this.overrides.chmod) {
      return this.overrides.chmod(ino, mode, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  chown: ChownHandler = async (ino, uid, gid, context, options) => {
    if (this.overrides.chown) {
      return this.overrides.chown(ino, uid, gid, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  truncate: TruncateHandler = async (ino, size, context, fi, options) => {
    if (this.overrides.truncate) {
      return this.overrides.truncate(ino, size, context, fi, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  symlink: SymlinkHandler = async (target, parent, name, context, options) => {
    if (this.overrides.symlink) {
      return this.overrides.symlink(target, parent, name, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  readlink: ReadlinkHandler = async (ino, context, options) => {
    if (this.overrides.readlink) {
      return this.overrides.readlink(ino, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  link: LinkHandler = async (ino, newparent, newname, context, options) => {
    if (this.overrides.link) {
      return this.overrides.link(ino, newparent, newname, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  statfs: StatfsHandler = async (ino, context, options) => {
    if (this.overrides.statfs) {
      return this.overrides.statfs(ino, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  getxattr: GetxattrHandler = async (ino, name, context, options) => {
    if (this.overrides.getxattr) {
      return this.overrides.getxattr(ino, name, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  setxattr: SetxattrHandler = async (ino, name, value, flags, context, options) => {
    if (this.overrides.setxattr) {
      return this.overrides.setxattr(ino, name, value, flags, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  listxattr: ListxattrHandler = async (ino, context, options) => {
    if (this.overrides.listxattr) {
      return this.overrides.listxattr(ino, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  removexattr: RemovexattrHandler = async (ino, name, context, options) => {
    if (this.overrides.removexattr) {
      return this.overrides.removexattr(ino, name, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  access: AccessHandler = async (ino, context, options) => {
    if (this.overrides.access) {
      return this.overrides.access(ino, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  copy_file_range: CopyFileRangeHandler = async (inoIn, offIn, fiIn, inoOut, offOut, fiOut, len, flags, context, options) => {
    if (this.overrides.copy_file_range) {
      return this.overrides.copy_file_range(inoIn, offIn, fiIn, inoOut, offOut, fiOut, len, flags, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  setattr: SetattrHandler = async (ino, attr, context, options) => {
    if (this.overrides.setattr) {
      return this.overrides.setattr(ino, attr, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  // utimens is not in FuseOperationHandlers, so we don't implement it

  poll: PollHandler = async (ino, fi, ph, reventsp, context, options) => {
    if (this.overrides.poll) {
      return this.overrides.poll(ino, fi, ph, reventsp, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  flock: FlockHandler = async (ino, fi, op, context, options) => {
    if (this.overrides.flock) {
      return this.overrides.flock(ino, fi, op, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  fallocate = async (ino: Ino, fi: FileInfo, mode: number, offset: bigint, length: bigint, context: RequestContext, options?: BaseOperationOptions) => {
    if (this.overrides.fallocate) {
      return this.overrides.fallocate(ino, fi, mode, offset, length, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  fsync: FsyncHandler = async (ino, datasync, fi, context, options) => {
    if (this.overrides.fsync) {
      return this.overrides.fsync(ino, datasync, fi, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  fsyncdir: FsyncdirHandler = async (ino, datasync, fi, context, options) => {
    if (this.overrides.fsyncdir) {
      return this.overrides.fsyncdir(ino, datasync, fi, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  ioctl = async (ino: Ino, cmd: number, arg: number | bigint | Buffer | null, fi: FileInfo, flags: number, context: RequestContext, options?: BaseOperationOptions) => {
    if (this.overrides.ioctl) {
      return this.overrides.ioctl(ino, cmd, arg, fi, flags, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  // lock is not in FuseOperationHandlers, so we don't implement it

  bmap: BmapHandler = async (ino, blocksize, idx, context, options) => {
    if (this.overrides.bmap) {
      return this.overrides.bmap(ino, blocksize, idx, context, options);
    }
    throw new FuseErrno('ENOSYS');
  };

  opendir = async (ino: Ino, context: RequestContext, options?: OpenOptions) => {
    if (this.overrides.opendir) {
      return this.overrides.opendir(ino, context, options);
    }
    // Default opendir implementation - just return a dummy FileInfo
    return { fh: createFd(1), flags: createFlags(0) };
  };

  releasedir = async (ino: Ino, fi: FileInfo, context: RequestContext, options?: BaseOperationOptions) => {
    if (this.overrides.releasedir) {
      return this.overrides.releasedir(ino, fi, context, options);
    }
    // Default releasedir implementation - no-op
  };
}