/**
 * @file linkOperations.ts
 * @brief Link operations for in-memory filesystem
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
  SymlinkHandler,
  ReadlinkHandler,
  LinkHandler,
} from 'fuse-native';

import { FuseErrno, createMode } from 'fuse-native';

import { InMemoryFilesystemCore } from '../InMemoryFilesystemCore.ts';
import { InMemoryFsUtils } from '../types.ts';

/**
 * Link operations implementation
 */
export class LinkOperations {
  constructor(private core: InMemoryFilesystemCore) {}

  /**
   * Create a symbolic link
   */
  symlink: SymlinkHandler = async (link, parent, name, context, options) => {
    const parentInode = this.core.getInode(parent);
    if (!parentInode || parentInode.type !== 'directory') {
      throw new FuseErrno('ENOTDIR', 'Not a directory');
    }

    const dirData = parentInode.data as Map<string, any>;
    if (dirData.has(name)) {
      throw new FuseErrno('EEXIST', 'File exists');
    }

    const inode = this.core.createInode('symlink', createMode(0o777 | 0o120000));
    inode.data = link;
    inode.size = BigInt(Buffer.byteLength(link, 'utf8'));
    dirData.set(name, inode);
    this.core.addInode(inode);

    return {
      attr: InMemoryFsUtils.inodeToStat(inode),
      timeout: 1.0,
    };
  };

  /**
   * Read a symbolic link
   */
  readlink: ReadlinkHandler = async (ino, context, options) => {
    const inode = this.core.getInode(ino);
    if (!inode || inode.type !== 'symlink') {
      throw new FuseErrno('EINVAL', 'Invalid argument');
    }
    return inode.data as string;
  };

  /**
   * Create a hard link
   */
  link: LinkHandler = async (ino, newparent, newname, context, options) => {
    const target = this.core.getInode(ino);
    if (!target) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    const parent = this.core.getInode(newparent);
    if (!parent || parent.type !== 'directory') {
      throw new FuseErrno('ENOTDIR', 'Not a directory');
    }

    const dirData = parent.data as Map<string, any>;
    if (dirData.has(newname)) {
      throw new FuseErrno('EEXIST', 'File exists');
    }

    dirData.set(newname, target);
    target.nlink++;
    this.core.updateTimestamps(target);

    return {
      attr: InMemoryFsUtils.inodeToStat(target),
      timeout: 1.0,
    };
  };
}