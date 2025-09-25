/**
 * @file InMemoryFilesystemCore.ts
 * @brief Core in-memory filesystem state management and utilities
 */

import type {
  Ino,
  Mode,
  Uid,
  Gid,
  Timestamp,
} from 'fuse-native';

import {
  createIno,
  createMode,
  createUid,
  createGid,
  getCurrentTimestamp,
} from 'fuse-native';

import { FuseErrno } from 'fuse-native';

import type {
  Inode,
  InodeType,
  InMemoryFsConfig,
  InMemoryFsStats,
  InMemoryDirent,
} from './types.ts';

import { InMemoryFsError, InMemoryFsUtils } from './types.ts';

/**
 * Core in-memory filesystem state management
 * Provides shared functionality for all filesystem operations
 */
export class InMemoryFilesystemCore {
  protected readonly inodes: Map<Ino, Inode> = new Map();
  protected readonly root: Inode;
  protected readonly config: Required<InMemoryFsConfig>;
  protected nextInodeNumber: bigint = 2n; // Start from 2, 1 is reserved for root

  constructor(config: InMemoryFsConfig = {}) {
    this.config = {
      rootMode: createMode(0o755),
      defaultFileMode: createMode(0o644),
      defaultDirMode: createMode(0o755),
      defaultUid: createUid(process.getuid?.() || 1000),
      defaultGid: createGid(process.getgid?.() || 1000),
      maxInodes: 1000000,
      ...config,
    };

    // Create root inode
    this.root = this.createInode('directory', this.config.rootMode);
    this.root.id = createIno(1n); // Root always has inode 1
    this.root.data = new Map();
    this.inodes.set(this.root.id, this.root);

    // Add . and .. entries to root
    (this.root.data as Map<string, Inode>).set('.', this.root);
    (this.root.data as Map<string, Inode>).set('..', this.root);

    console.log(`In-memory filesystem core initialized with root inode ${this.root.id}`);
  }

  /**
   * Get filesystem statistics
   */
  getStats(): InMemoryFsStats {
    let fileCount = 0;
    let directoryCount = 0;
    let symlinkCount = 0;
    let totalSize = 0n;

    for (const inode of this.inodes.values()) {
      switch (inode.type) {
        case 'file':
          fileCount++;
          totalSize += inode.size;
          break;
        case 'directory':
          directoryCount++;
          break;
        case 'symlink':
          symlinkCount++;
          break;
      }
    }

    const memoryUsage = this.calculateMemoryUsage();

    return {
      totalInodes: this.inodes.size,
      fileCount,
      directoryCount,
      symlinkCount,
      totalSize,
      memoryUsage,
    };
  }

  /**
   * Get inode by number
   */
  getInode(ino: Ino): Inode | null {
    return this.inodes.get(ino) || null;
  }

  /**
   * Get root inode
   */
  getRoot(): Inode {
    return this.root;
  }

  /**
   * Get next available inode number
   */
  getNextInodeNumber(): Ino {
    if (this.inodes.size >= this.config.maxInodes) {
      throw new InMemoryFsError('ENOSPC', 'Maximum number of inodes reached');
    }
    const ino = createIno(this.nextInodeNumber++);
    return ino;
  }

  /**
   * Create a new inode
   */
  createInode(type: InodeType, mode?: Mode): Inode {
    const now = getCurrentTimestamp();

    const inode: Inode = {
      id: this.getNextInodeNumber(),
      type,
      mode: mode ?? (type === 'directory' ? this.config.defaultDirMode : this.config.defaultFileMode),
      uid: this.config.defaultUid,
      gid: this.config.defaultGid,
      size: 0n,
      atime: now,
      mtime: now,
      ctime: now,
      nlink: 1,
      data: null,
      xattrs: new Map(),
    };

    // Initialize data based on type
    switch (type) {
      case 'directory':
        inode.data = new Map();
        break;
      case 'file':
        inode.data = Buffer.alloc(0);
        break;
      case 'symlink':
        inode.data = '';
        break;
    }

    return inode;
  }

  /**
   * Add an inode to the filesystem
   */
  addInode(inode: Inode): void {
    this.inodes.set(inode.id, inode);
  }

  /**
   * Delete an inode
   */
  deleteInode(ino: Ino): boolean {
    const inode = this.inodes.get(ino);
    if (!inode) {
      return false;
    }

    // Don't delete root
    if (ino === createIno(1n)) {
      return false;
    }

    // Check if inode is still referenced
    if (inode.nlink > 0) {
      return false;
    }

    this.inodes.delete(ino);
    return true;
  }

  /**
   * Resolve path to inode
   */
  resolvePath(path: string): Inode {
    if (!path || path === '/') {
      return this.root;
    }

    const parts = path.split('/').filter(p => p.length > 0);
    let current = this.root;

    for (const part of parts) {
      if (current.type !== 'directory') {
        throw new FuseErrno('ENOTDIR', `Not a directory: ${part}`);
      }

      const dirData = current.data as Map<string, Inode>;
      const next = dirData.get(part);
      if (!next) {
        throw new FuseErrno('ENOENT', `No such file or directory: ${part}`);
      }
      current = next;
    }

    return current;
  }

  /**
   * Get parent directory and name for a path
   */
  getParentAndName(path: string): { parent: Inode; name: string } {
    const normalized = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    const dirname = normalized.substring(0, normalized.lastIndexOf('/')) || '/';
    const basename = normalized.substring(normalized.lastIndexOf('/') + 1);

    if (basename === '.' || basename === '..') {
      throw new FuseErrno('EINVAL', 'Invalid path component');
    }

    const parent = dirname === '/' ? this.root : this.resolvePath(dirname);
    return { parent, name: basename };
  }

  /**
   * List directory contents
   */
  listDirectory(ino: Ino): InMemoryDirent[] {
    console.log(`🔍 listDirectory called: ino=${ino}`);
    const inode = this.inodes.get(ino);
    if (!inode || inode.type !== 'directory') {
      console.log(`❌ listDirectory error: inode ${ino} not found or not directory`);
      throw new FuseErrno('ENOTDIR', 'Not a directory');
    }

    const dirData = inode.data as Map<string, Inode>;
    console.log(`📁 listDirectory: directory has ${dirData.size} entries in data map`);
    console.log(`📁 listDirectory: entries:`, Array.from(dirData.keys()));
    const entries: InMemoryDirent[] = [];

    for (const [name, childInode] of dirData.entries()) {
      console.log(`📁 listDirectory: processing entry '${name}' with inode ${childInode.id} (type: ${childInode.type})`);
      entries.push({
        name,
        inode: childInode,
        type: this.getDirentType(childInode.type),
      });
    }

    console.log(`✅ listDirectory: returning ${entries.length} entries:`, entries.map(e => `${e.name}(${e.type})`));
    return entries;
  }

  /**
   * Convert inode type to DirentType
   */
  private getDirentType(type: InodeType) {
    switch (type) {
      case 'directory':
        return 4; // DT_DIR
      case 'file':
        return 8; // DT_REG
      case 'symlink':
        return 10; // DT_LNK
      default:
        return 0; // DT_UNKNOWN
    }
  }

  /**
   * Calculate memory usage
   */
  private calculateMemoryUsage(): number {
    let total = 0;

    for (const inode of this.inodes.values()) {
      // Base inode size
      total += 128; // Approximate size of inode object

      // Data size
      if (inode.data instanceof Buffer) {
        total += inode.data.length;
      } else if (inode.data instanceof Map) {
        total += inode.data.size * 64; // Approximate size per map entry
      } else if (typeof inode.data === 'string') {
        total += inode.data.length * 2; // UTF-16 characters
      }

      // Extended attributes
      for (const [key, value] of inode.xattrs.entries()) {
        total += key.length * 2 + value.length;
      }
    }

    return total;
  }

  /**
   * Update inode timestamps
   */
  updateTimestamps(inode: Inode, atime?: Timestamp, mtime?: Timestamp): void {
    const now = getCurrentTimestamp();
    if (atime !== undefined) {
      inode.atime = atime;
    }
    if (mtime !== undefined) {
      inode.mtime = mtime;
    }
    inode.ctime = now;
  }

  /**
   * Get configuration
   */
  getConfig(): Required<InMemoryFsConfig> {
    return this.config;
  }

  /**
   * Get all inodes (for debugging)
   */
  getAllInodes(): Map<Ino, Inode> {
    return this.inodes;
  }
}