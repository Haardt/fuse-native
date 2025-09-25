/**
 * @file xattrOperations.ts
 * @brief Extended attributes operations for in-memory filesystem
 */

import type {
  Ino,
  RequestContext,
  BaseOperationOptions,
  GetxattrHandler,
  SetxattrHandler,
  ListxattrHandler,
  RemovexattrHandler,
} from 'fuse-native';

import { FuseErrno } from 'fuse-native';

import { InMemoryFilesystemCore } from '../InMemoryFilesystemCore.ts';

/**
 * Extended attributes operations implementation
 */
export class XattrOperations {
  constructor(private core: InMemoryFilesystemCore) {}

  /**
   * Get extended attribute
   */
  getxattr: GetxattrHandler = async (ino, name, context, options) => {
    const inode = this.core.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    const value = inode.xattrs.get(name);
    if (value === undefined) {
      throw new FuseErrno('ENODATA', 'Attribute not found');
    }
    return { data: value, size: BigInt(value.length) };
  };

  /**
   * Set extended attribute
   */
  setxattr: SetxattrHandler = async (ino, name, value, flags, context, options) => {
    const inode = this.core.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    if (flags === 1 && inode.xattrs.has(name)) {
      // XATTR_CREATE
      throw new FuseErrno('EEXIST', 'Attribute already exists');
    }
    if (flags === 2 && !inode.xattrs.has(name)) {
      // XATTR_REPLACE
      throw new FuseErrno('ENODATA', 'Attribute not found');
    }

    inode.xattrs.set(name, value);
  };

  /**
   * List extended attributes
   */
  listxattr: ListxattrHandler = async (ino, context, options) => {
    const inode = this.core.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    const names = Array.from(inode.xattrs.keys());
    const size = names.reduce((sum, name) => sum + name.length + 1, 0);

    return { names, size: BigInt(size) };
  };

  /**
   * Remove extended attribute
   */
  removexattr: RemovexattrHandler = async (ino, name, context, options) => {
    const inode = this.core.getInode(ino);
    if (!inode) {
      throw new FuseErrno('ENOENT', 'No such file or directory');
    }

    if (!inode.xattrs.has(name)) {
      throw new FuseErrno('ENODATA', 'Attribute not found');
    }
    inode.xattrs.delete(name);
  };
}