/**
 * @file fileOperations.ts
 * @brief File operations for in-memory filesystem
 */

import type {
  Ino,
  Mode,
  StatResult,
  RequestContext,
  BaseOperationOptions,
  FileInfo,
  CreateHandler,
  OpenHandler,
  ReadHandler,
  WriteHandler,
  ReleaseHandler,
  TruncateHandler,
} from 'fuse-native';

import {
  createFd,
  createFlags,
  getCurrentTimestamp,
} from 'fuse-native';

import { FuseErrno } from 'fuse-native';

import { InMemoryFilesystemCore } from '../InMemoryFilesystemCore.ts';
import { InMemoryFsUtils } from '../types.ts';

/**
 * File operations implementation
 */
export class FileOperations {
  constructor(private core: InMemoryFilesystemCore) {}

  /**
   * Create a new file
   */
  create: CreateHandler = async (parent, name, mode, context, options) => {
    console.log(`create called: parent=${parent}, name=${name}, mode=${mode}`);

    const parentInode = this.core.getInode(parent);
    if (!parentInode || parentInode.type !== 'directory') {
      throw new FuseErrno('ENOTDIR', 'Not a directory');
    }

    const dirData = parentInode.data as Map<string, any>;
    if (dirData.has(name)) {
      throw new FuseErrno('EEXIST', 'File exists');
    }

    const inode = this.core.createInode('file', mode as Mode);
    dirData.set(name, inode);
    this.core.addInode(inode);

    return {
      attr: InMemoryFsUtils.inodeToStat(inode),
      timeout: 1.0,
      fi: { fh: createFd(Number(inode.id)), flags: createFlags(0) },
    };
  };

  /**
   * Open a file
   */
  open: OpenHandler = async (ino, context, options) => {
    console.log(`open called: ino=${ino}, context=${JSON.stringify(context)}, options=${JSON.stringify(options)}`);
    const inode = this.core.getInode(ino);
    if (!inode || inode.type !== 'file') {
      console.log(`open error: inode ${ino} not found or not file (type: ${inode?.type})`);
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    console.log(`open success: returning fh=${Number(inode.id)} for file inode ${ino}`);
    return { fh: createFd(Number(inode.id)), flags: createFlags(0) };
  };

  /**
   * Read from a file
   */
  read: ReadHandler = async (ino, context, { offset, size, fi }) => {
    console.log(`read called: ino=${ino}, offset=${offset}, size=${size}`);
    const inode = this.core.getInode(ino);
    if (!inode || inode.type !== 'file') {
      throw new FuseErrno('EBADF');
    }

    const data = inode.data as Buffer;
    const start = Number(offset);

    if (start >= data.length) {
      console.log('read: offset beyond file size');
      return Buffer.alloc(0);
    }

    const end = Math.min(start + size, data.length);
    const slice = data.slice(start, end);
    console.log(`read: returning ${slice.length} bytes`);
    return slice;
  };

  /**
   * Write to a file
   */
  write: WriteHandler = async (ino, data, context, options) => {
    const inode = this.core.getInode(ino);
    if (!inode || inode.type !== 'file') {
      throw new FuseErrno('EBADF');
    }

    const buffer = Buffer.from(data);
    const start = Number(options.offset);
    const length = buffer.length;
    const end = start + length;
    let fileData = inode.data as Buffer;

    if (end > fileData.length) {
      const newBuffer = Buffer.alloc(end);
      fileData.copy(newBuffer);
      inode.data = newBuffer;
    }

    buffer.copy(inode.data as Buffer, start);
    if (BigInt(end) > inode.size) {
      inode.size = BigInt(end);
    }
    
    this.core.updateTimestamps(inode, undefined, getCurrentTimestamp());

    return length;
  };

  /**
   * Release a file
   */
  release: ReleaseHandler = async (ino, fi, context, options) => {
    // No special cleanup needed for in-memory filesystem
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
    let fileData = inode.data as Buffer;

    if (newSize < fileData.length) {
      inode.data = fileData.slice(0, newSize);
    } else if (newSize > fileData.length) {
      const newBuffer = Buffer.alloc(newSize);
      fileData.copy(newBuffer);
      inode.data = newBuffer;
    }

    inode.size = size;
    const now = getCurrentTimestamp();
    inode.mtime = now;
    inode.ctime = now;

    return {
      attr: InMemoryFsUtils.inodeToStat(inode),
      timeout: 1.0,
    };
  };
}