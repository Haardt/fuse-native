/**
 * @file metadataOperations.ts
 * @brief Metadata operations for in-memory filesystem
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
  GetattrHandler,
  ChmodHandler,
  ChownHandler,
} from 'fuse-native';

import { FuseErrno } from 'fuse-native';

import { InMemoryFilesystemCore } from '../InMemoryFilesystemCore.js';
import { InMemoryFsUtils } from '../types.js';

/**
 * Metadata operations implementation
 */
export class MetadataOperations {
  constructor(private core: InMemoryFilesystemCore) {}

  /**
   * Get file attributes
   */
  getattr: GetattrHandler = async (ino, context, fi?, options?) => {
    console.log(`getattr(ino=${ino})`);
    const inode = this.core.getInode(ino);
    if (!inode) {
        console.error(`getattr failed: inode ${ino} not found.`);
        throw new FuseErrno('ENOENT');
    }
    const result = {
        attr: InMemoryFsUtils.inodeToStat(inode),
        timeout: 1.0,
    };
    return result;
  };

  /**
   * Change file mode
   */
  chmod: ChmodHandler = async (ino, mode, context, options) => {
    const inode = this.core.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    inode.mode = mode as Mode;
    this.core.updateTimestamps(inode);

    return {
      attr: InMemoryFsUtils.inodeToStat(inode),
      timeout: 1.0,
    };
  };

  /**
   * Change file ownership
   */
  chown: ChownHandler = async (ino, uid, gid, context, options) => {
    const inode = this.core.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    if (uid !== null && uid !== undefined) {
      inode.uid = uid;
    }
    if (gid !== null && gid !== undefined) {
      inode.gid = gid;
    }
    this.core.updateTimestamps(inode);

    return {
      attr: InMemoryFsUtils.inodeToStat(inode),
      timeout: 1.0,
    };
  };
}