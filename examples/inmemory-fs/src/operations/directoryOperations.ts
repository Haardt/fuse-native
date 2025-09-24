/**
 * @file directoryOperations.ts
 * @brief Directory operations for in-memory filesystem
 */

import type {
  Ino,
  Mode,
  StatResult,
  RequestContext,
  BaseOperationOptions,
  FileInfo,
  MkdirHandler,
  RmdirHandler,
  ReaddirHandler,
  LookupHandler,
  UnlinkHandler,
  RenameHandler,
  OpenHandler,
  ReleaseHandler,
} from 'fuse-native';
import type { Inode } from '../types.js';
import { FuseErrno, createFd, createFlags } from 'fuse-native';

import { InMemoryFilesystemCore } from '../InMemoryFilesystemCore.js';
import { InMemoryFsUtils } from '../types.js';

/**
 * Directory operations implementation
 */
export class DirectoryOperations {
  constructor(private core: InMemoryFilesystemCore) {}

  /**
   * Create a directory
   */
  mkdir: MkdirHandler = async (parent, name, mode, context, options) => {
    const { parent: parentInode, name: finalName } = this.core.getParentAndName(
      `/${name}` // Add leading slash for proper path handling
    );

    if (parentInode.type !== 'directory') {
      throw new FuseErrno('ENOTDIR', 'Not a directory');
    }

    const dirData = parentInode.data as Map<string, any>;
    if (dirData.has(finalName)) {
      throw new FuseErrno('EEXIST', 'Directory exists');
    }

    const inode = this.core.createInode('directory', mode);
    const inodeData = inode.data as Map<string, any>;

    // Add . and .. entries
    inodeData.set('.', inode);
    inodeData.set('..', parentInode);

    dirData.set(finalName, inode);
    this.core.addInode(inode);

    return {
      attr: InMemoryFsUtils.inodeToStat(inode),
      timeout: 1.0,
    };
  };

  /**
   * Remove a directory
   */
  rmdir: RmdirHandler = async (parent, name, context, options) => {
    const { parent: parentInode, name: finalName } = this.core.getParentAndName(
      `/${name}`
    );

    if (parentInode.type !== 'directory') {
      throw new FuseErrno('ENOTDIR', 'Not a directory');
    }

    const dirData = parentInode.data as Map<string, any>;
    const inode = dirData.get(finalName);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    if (inode.type !== 'directory') {
      throw new FuseErrno('ENOTDIR', 'Not a directory');
    }

    const inodeData = inode.data as Map<string, any>;
    if (inodeData.size > 2) { // . and ..
      throw new FuseErrno('ENOTEMPTY', 'Directory not empty');
    }

    dirData.delete(finalName);
    this.core.deleteInode(inode.id);
  };

  /**
   * Read directory contents
   */
  readdir: ReaddirHandler = async (ino, offset, context, fi, options) => {
    console.log(`readdir(ino=${ino}, offset=${offset})`);
    const inode = this.core.getInode(ino);
    if (!inode || inode.type !== 'directory') {
        console.error(`readdir failed: inode ${ino} is not a directory.`);
        throw new FuseErrno('ENOTDIR');
    }

    const allDirents = this.core.listDirectory(ino);
    
    // Slice the directory entries based on the offset
    const dirents = allDirents.slice(Number(offset));

    const entries = dirents.map((d, index) => ({
        name: d.name,
        ino: d.inode.id,
        type: d.type,
        // The next offset is the original offset + index + 1
        nextOffset: BigInt(Number(offset) + index + 1),
    }));
      return {
          entries: entries,
          hasMore: false, // In-memory fs always returns all entries
      };
  };

  /**
   * Open a directory
   */
  opendir: OpenHandler = async (ino, context, options) => {
    console.log(`opendir(ino=${ino})`);
    const inode = this.core.getInode(ino);
    if (!inode || inode.type !== 'directory') {
        console.error(`opendir failed: inode ${ino} is not a directory.`);
        throw new FuseErrno('ENOTDIR');
    }
      return {
          fh: createFd(Number(ino)),
          flags: createFlags(0),
      };
  };

  /**
   * Release a directory
   */
  releasedir: ReleaseHandler = async (ino, fi, context, options) => {
    // No special cleanup needed
  };

  /**
   * Lookup a directory entry
   */
  lookup: LookupHandler = async (parent: Ino, name: string, context: RequestContext) => {
    console.log(`lookup(parent=${parent}, name=${name})`);
    const parentInode = this.core.getInode(parent);
    if (!parentInode || parentInode.type !== 'directory') {
      console.error(`lookup failed: parent inode ${parent} is not a directory.`);
      throw new FuseErrno('ENOTDIR');
    }

    const dirData = parentInode.data as Map<string, Inode>;
    const inode = dirData.get(name);

    if (!inode) {
      console.log(`lookup: entry '${name}' not found in parent ${parent}.`);
      throw new FuseErrno('ENOENT');
    }

    const attr = InMemoryFsUtils.inodeToStat(inode);
      return {
          attr: attr,
          timeout: 1.0,
      };
  };

  /**
   * Remove a file
   */
  unlink: UnlinkHandler = async (parent, name, context, options) => {
    const parentInode = this.core.getInode(parent);
    if (!parentInode || parentInode.type !== 'directory') {
      throw new FuseErrno('ENOTDIR', 'Not a directory');
    }

    const dirData = parentInode.data as Map<string, any>;
    const inode = dirData.get(name);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    if (inode.type === 'directory') {
      throw new FuseErrno('EISDIR', 'Is a directory');
    }

    dirData.delete(name);
    inode.nlink--;
    if (inode.nlink === 0) {
      this.core.deleteInode(inode.id);
    }
  };

  /**
   * Rename a file or directory
   */
  rename: RenameHandler = async (parent, name, newparent, newname, flags, context, options) => {
    const oldParent = this.core.getInode(parent);
    const newParent = this.core.getInode(newparent);

    if (!oldParent || !newParent || oldParent.type !== 'directory' || newParent.type !== 'directory') {
      throw new FuseErrno('ENOTDIR', 'Not a directory');
    }

    const oldDirData = oldParent.data as Map<string, any>;
    const newDirData = newParent.data as Map<string, any>;

    const inode = oldDirData.get(name);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    // Check if target exists
    const existing = newDirData.get(newname);
    if (existing) {
      if (existing.type === 'directory' && inode.type !== 'directory') {
        throw new FuseErrno('EISDIR', 'Is a directory');
      }
      if (existing.type !== 'directory' && inode.type === 'directory') {
        throw new FuseErrno('ENOTDIR', 'Not a directory');
      }
      // Remove existing target
      newDirData.delete(newname);
      existing.nlink--;
      if (existing.nlink === 0) {
        this.core.deleteInode(existing.id);
      }
    }

    // Move the inode
    oldDirData.delete(name);
    newDirData.set(newname, inode);
    this.core.updateTimestamps(inode);
  };
}