/**
 * @file advancedOperations.ts
 * @brief Advanced operations for in-memory filesystem
 */

import type {
  Ino,
  Mode,
  Uid,
  Gid,
  StatResult,
  RequestContext,
  BaseOperationOptions,
  FileInfo,
  StatfsHandler,
  TruncateHandler,
  AccessHandler,
  SetattrHandler,
  CopyFileRangeHandler,
  Timestamp,
  FileLock,
  PollHandle,
} from 'fuse-native';

import { FuseErrno } from 'fuse-native';

import { InMemoryFilesystemCore } from '../InMemoryFilesystemCore.ts';
import { InMemoryFsUtils } from '../types.ts';

/**
 * Advanced operations implementation
 */
export class AdvancedOperations {
  constructor(private core: InMemoryFilesystemCore) {}

  /**
   * Get filesystem statistics
   */
  statfs: StatfsHandler = async (ino, context, options) => {
    console.log(`statfs called: ino=${ino}`);
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
  };

  /**
   * Truncate a file
   */
  truncate: TruncateHandler = async (ino, size, context, fi, options) => {
    const inode = this.core.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    if (inode.type !== 'file') {
      throw new FuseErrno('EISDIR', 'Is a directory');
    }

    const newSize = Number(size);
    if (inode.data instanceof Buffer) {
      let fileData = inode.data;

      if (newSize < fileData.length) {
        inode.data = fileData.slice(0, newSize);
      } else if (newSize > fileData.length) {
        const newBuffer = Buffer.alloc(newSize);
        fileData.copy(newBuffer);
        inode.data = newBuffer;
      }
    } else {
      // Handle other data types if needed
      throw new FuseErrno('EINVAL', 'Invalid file data type');
    }

    inode.size = size;
    this.core.updateTimestamps(inode);

    return {
      attr: InMemoryFsUtils.inodeToStat(inode),
      timeout: 1.0,
    };
  };

  /**
   * Update file timestamps
   */
  utimens = async (ino: Ino, atime: Timestamp | null, mtime: Timestamp | null, context: RequestContext, options?: BaseOperationOptions) => {
    const inode = this.core.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    // Update timestamps
    if (atime !== null && atime !== undefined) {
      inode.atime = atime;
    }
    if (mtime !== null && mtime !== undefined) {
      inode.mtime = mtime;
    }

    // Always update ctime when attributes change
    this.core.updateTimestamps(inode);

    // Return current attributes
    return {
      attr: InMemoryFsUtils.inodeToStat(inode),
      timeout: 1.0,
    };
  };

  /**
   * Allocate file space
   */
  fallocate = async (ino: Ino, mode: number, offset: bigint, length: bigint, context: RequestContext, fi: FileInfo, options?: BaseOperationOptions) => {
    const inode = this.core.getInode(ino);
    if (!inode || inode.type !== 'file') {
      throw new FuseErrno('EISDIR', 'Is a directory');
    }

    const start = Number(offset);
    const end = start + Number(length);

    if (inode.data instanceof Buffer && end > inode.data.length) {
      const newBuffer = Buffer.alloc(end);
      inode.data.copy(newBuffer);
      inode.data = newBuffer;
      inode.size = BigInt(end);
    }

    this.core.updateTimestamps(inode);
  };

  /**
   * Seek in file
   */
  lseek = async (ino: Ino, offset: bigint, whence: number, context: RequestContext, fi: FileInfo, options?: BaseOperationOptions) => {
    const inode = this.core.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    if (inode.type !== 'file') {
      throw new FuseErrno('EISDIR', 'Is a directory');
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
        newOffset = (inode.data instanceof Buffer ? inode.data.length : 0) + newOffset;
        break;
      default:
        throw new FuseErrno('EINVAL', 'Invalid argument');
    }

    if (newOffset < 0) {
      newOffset = 0;
    }

    return BigInt(newOffset);
  };

  /**
   * Copy file range
   */
  copy_file_range: CopyFileRangeHandler = async (
    inoIn,
    fiIn,
    offsetIn,
    inoOut,
    fiOut,
    offsetOut,
    length,
    flags,
    context,
    options
  ) => {
    const inodeIn = this.core.getInode(inoIn);
    const inodeOut = this.core.getInode(inoOut);

    if (
      !inodeIn ||
      !inodeOut ||
      inodeIn.type !== 'file' ||
      inodeOut.type !== 'file'
    ) {
      throw new FuseErrno('EBADF', 'Bad file descriptor');
    }

    const startIn = Number(offsetIn);
    const startOut = Number(offsetOut);
    const len = Number(length);

    // Ensure output buffer is large enough
    const requiredSize = startOut + len;
    if (inodeOut.data instanceof Buffer && requiredSize > inodeOut.data.length) {
      const newBuffer = Buffer.alloc(requiredSize);
      inodeOut.data.copy(newBuffer);
      inodeOut.data = newBuffer;
      inodeOut.size = BigInt(requiredSize);
    }

    // Copy data
    const bytesToCopy = Math.min(len, (inodeIn.data instanceof Buffer ? inodeIn.data.length : 0) - startIn);
    if (bytesToCopy > 0 && inodeIn.data instanceof Buffer && inodeOut.data instanceof Buffer) {
      inodeIn.data.copy(
        inodeOut.data,
        startOut,
        startIn,
        startIn + bytesToCopy
      );
    }

    this.core.updateTimestamps(inodeOut);

    return BigInt(bytesToCopy);
  };

  /**
   * File locking (stub implementation)
   */
  flock = async (ino: Ino, fi: FileInfo, op: number, context: RequestContext, options?: BaseOperationOptions) => {
    // In-memory FS doesn't implement real locking
  };

  /**
   * POSIX record locking (stub implementation)
   */
  lock = async (ino: Ino, fi: FileInfo, cmd: number, lock: FileLock, context: RequestContext, options?: BaseOperationOptions) => {
    // In-memory FS doesn't implement real locking
  };

  /**
   * I/O control (not supported)
   */
  ioctl = async (ino: Ino, cmd: number, arg: number | bigint | Buffer | null, fi: FileInfo, flags: number, data: ArrayBuffer | null, context: RequestContext, options?: BaseOperationOptions) => {
    throw new FuseErrno('ENOSYS', 'Function not implemented');
  };

  /**
   * Block map (not supported)
   */
  bmap = async (ino: Ino, blocksize: number, idx: bigint, context: RequestContext, options?: BaseOperationOptions) => {
    throw new FuseErrno('ENOSYS', 'Function not implemented');
  };

  /**
   * Poll for events (not supported)
   */
  poll = async (ino: Ino, fi: FileInfo, ph: PollHandle, reventsp: number, context: RequestContext, options?: BaseOperationOptions) => {
    throw new FuseErrno('ENOSYS', 'Function not implemented');
  };

  /**
   * Flush data (no-op for in-memory)
   */
  flush = async (ino: Ino, fi: FileInfo, context: RequestContext, options?: BaseOperationOptions) => {
    // In-memory FS doesn't need flushing
  };

  /**
   * Sync file (no-op for in-memory)
   */
  fsync = async (ino: Ino, datasync: boolean, fi: FileInfo, context: RequestContext, options?: BaseOperationOptions) => {
    // In-memory FS doesn't need syncing
  };

  /**
   * Sync directory (no-op for in-memory)
   */
  fsyncdir = async (ino: Ino, datasync: boolean, fi: FileInfo, context: RequestContext, options?: BaseOperationOptions) => {
    // In-memory FS doesn't need syncing
  };

  /**
   * Initialize filesystem
   */
  init: (conn: any, context: RequestContext) => Promise<void> = async (conn_info: any, context: any) => {
    console.log(`init called: conn_info=${JSON.stringify(conn_info)}`);
    // No return value expected for init
  };

  /**
   * Check access permissions
   */
  access: AccessHandler = async (ino: Ino, context: RequestContext, options: { mask: number } & BaseOperationOptions) => {
    console.log(`access called: ino=${ino}, mask=${options.mask}`);
    // In-memory FS allows all access
  };

  /**
   * Set file attributes
   */
  setattr: SetattrHandler = async (ino, attr, context, options) => {
    const inode = this.core.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    // Just update ctime to current time
    this.core.updateTimestamps(inode);

    // Return current attributes
    return {
      attr: InMemoryFsUtils.inodeToStat(inode),
      timeout: 1.0,
    };
  };
  destroy: (context: RequestContext) => Promise<void> = async (context) => {
    console.log('destroy called');
  };
}