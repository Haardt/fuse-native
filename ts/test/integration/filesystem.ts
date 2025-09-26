/**
 * @file filesystem.ts
 * @brief Simplified filesystem class for integration tests
 *
 * Contains all data structures for a simulated filesystem.
 * Constructor accepts a small seeding filesystem (simplified).
 */

import type {
  Ino,
  Mode,
  Uid,
  Gid,
  Timestamp,
  StatResult,
} from "../../index.ts";

import {
  createIno,
  createMode,
  createUid,
  createGid,
  createDev,
  getCurrentTimestamp,
} from "../../index.ts";

import { S_IFDIR, S_IFREG } from "../../constants.ts";

/**
 * Simplified inode type for test filesystem
 */
export type SimpleInodeType = 'file' | 'directory';

/**
 * Simplified inode interface
 */
export interface SimpleInode {
  id: Ino;
  type: SimpleInodeType;
  mode: Mode;
  uid: Uid;
  gid: Gid;
  size: bigint;
  atime: Timestamp;
  mtime: Timestamp;
  ctime: Timestamp;
  nlink: number;
  generation: bigint;
  data: Buffer | Map<string, SimpleInode> | null;
}

/**
 * Seeding filesystem structure
 */
export interface SeedingFilesystem {
  [path: string]: SeedingEntry;
}

/**
 * Seeding entry
 */
export interface SeedingEntry {
  type: SimpleInodeType;
  mode?: number;
  uid?: number;
  gid?: number;
  content?: string | Buffer;
  size?: bigint | number;
  generation?: bigint | number;
  nlink?: number;
  timestamps?: {
    atime?: Timestamp;
    mtime?: Timestamp;
    ctime?: Timestamp;
  };
  children?: { [name: string]: SeedingEntry };
}

const DEFAULT_ROOT_TIMESTAMP = 1609459200000000000n as Timestamp;
const DEFAULT_FILE_ATIME = 1609459201000000000n as Timestamp;
const DEFAULT_FILE_MTIME = 1609459202000000000n as Timestamp;
const DEFAULT_FILE_CTIME = 1609459203000000000n as Timestamp;
const DEFAULT_DIR_TIMESTAMP = 1609459204000000000n as Timestamp;

export const DEFAULT_FILESYSTEM_SEED: SeedingFilesystem = {
  '/': {
    type: 'directory',
    mode: 0o755,
    uid: 1000,
    gid: 1000,
    timestamps: {
      atime: DEFAULT_ROOT_TIMESTAMP,
      mtime: DEFAULT_ROOT_TIMESTAMP,
      ctime: DEFAULT_ROOT_TIMESTAMP,
    },
    children: {
      'test-file': {
        type: 'file',
        mode: 0o644,
        uid: 1001,
        gid: 1002,
        size: 1234n,
        generation: 7n,
        timestamps: {
          atime: DEFAULT_FILE_ATIME,
          mtime: DEFAULT_FILE_MTIME,
          ctime: DEFAULT_FILE_CTIME,
        },
      },
      notes: {
        type: 'directory',
        mode: 0o755,
        uid: 1000,
        gid: 1000,
        timestamps: {
          atime: DEFAULT_DIR_TIMESTAMP,
          mtime: DEFAULT_DIR_TIMESTAMP,
          ctime: DEFAULT_DIR_TIMESTAMP,
        },
        children: {
          'readme.md': {
            type: 'file',
            mode: 0o600,
            uid: 1000,
            gid: 1000,
            size: 512n,
            generation: 11n,
          },
        },
      },
    },
  },
};

/**
 * Simplified filesystem class
 */
export class FileSystem {
  private inodes: Map<bigint, SimpleInode> = new Map();
  private nextIno: bigint = 1n;
  private root: SimpleInode;

  constructor(seeding: SeedingFilesystem = DEFAULT_FILESYSTEM_SEED) {
    // Create root inode
    this.root = this.createInodeInternal('directory', S_IFDIR | 0o755);
    this.inodes.set(this.root.id, this.root);

    // Seed the filesystem
    this.seedFilesystem(seeding);
  }

  /**
   * Get inode by number
   */
  getInode(ino: Ino): SimpleInode | null {
    return this.inodes.get(ino) || null;
  }

  /**
   * Get root inode
   */
  getRoot(): SimpleInode {
    return this.root;
  }

  /**
   * Resolve path to inode
   */
  resolvePath(path: string): SimpleInode {
    if (path === '/' || path === '') {
      return this.root;
    }

    const parts = path.split('/').filter(p => p.length > 0);
    let current = this.root;

    for (const part of parts) {
      if (current.type !== 'directory' || !(current.data instanceof Map)) {
        throw new Error(`ENOTDIR: ${path}`);
      }
      const child = current.data.get(part);
      if (!child) {
        throw new Error(`ENOENT: ${path}`);
      }
      current = child;
    }

    return current;
  }

  /**
   * Convert inode to StatResult
   */
  inodeToStat(inode: SimpleInode): StatResult {
    let typeBits: number;
    switch (inode.type) {
      case 'directory':
        typeBits = S_IFDIR;
        break;
      case 'file':
        typeBits = S_IFREG;
        break;
      default:
        typeBits = 0;
    }

    return {
      ino: inode.id,
      mode: createMode(typeBits | Number(inode.mode)),
      nlink: inode.nlink,
      uid: inode.uid,
      gid: inode.gid,
      rdev: createDev(0n),
      size: inode.size,
      blksize: 4096,
      blocks: (inode.size + 511n) / 512n,
      atime: inode.atime,
      mtime: inode.mtime,
      ctime: inode.ctime,
    };
  }

  /**
   * Create a new inode
   */
  private createInodeInternal(type: SimpleInodeType, mode: number): SimpleInode {
    const now = getCurrentTimestamp();
    const inode: SimpleInode = {
      id: createIno(this.nextIno++),
      type,
      mode: createMode(mode),
      uid: createUid(1000),
      gid: createGid(1000),
      size: 0n,
      atime: now,
      mtime: now,
      ctime: now,
      nlink: type === 'directory' ? 2 : 1,
      generation: 0n,
      data: type === 'directory' ? new Map() : null,
    };
    return inode;
  }

  /**
   * Seed the filesystem with initial structure
   */
  private seedFilesystem(seeding: SeedingFilesystem): void {
    const entries = Object.entries(seeding).sort(([a], [b]) => a.localeCompare(b));
    for (const [path, entry] of entries) {
      this.createEntry(path, entry);
    }
  }

  /**
   * Create an entry at the given path
   */
  private createEntry(path: string, entry: SeedingEntry): void {
    const parts = path.split('/').filter(p => p.length > 0);
    if (parts.length === 0) {
      if (entry.type !== 'directory') {
        throw new Error('Root entry must be a directory');
      }

      this.applyEntryMetadata(this.root, entry);

      if (entry.children) {
        this.seedDirectoryChildren(this.root, entry.children);
      }
      return;
    }

    let current = this.root;

    // Navigate to parent directory
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current.type !== 'directory' || !(current.data instanceof Map)) {
        throw new Error(`ENOTDIR: ${path}`);
      }
      let child = current.data.get(part);
      if (!child) {
        child = this.createInodeInternal('directory', this.computeMode('directory'));
        (current.data as Map<string, SimpleInode>).set(part, child);
        this.inodes.set(child.id, child);
      }
      current = child;
    }

    // Create the final entry
    const name = parts[parts.length - 1];
    if (current.type !== 'directory' || !(current.data instanceof Map)) {
      throw new Error(`ENOTDIR: ${path}`);
    }

    const inode = this.createInodeInternal(entry.type, this.computeMode(entry.type, entry.mode));
    this.applyEntryMetadata(inode, entry);

    if (entry.type === 'directory' && entry.children) {
      this.seedDirectoryChildren(inode, entry.children);
    }

    (current.data as Map<string, SimpleInode>).set(name, inode);
    this.inodes.set(inode.id, inode);
  }

  private computeMode(type: SimpleInodeType, mode?: number): number {
    const permissions = mode ?? (type === 'directory' ? 0o755 : 0o644);
    const typeBits = type === 'directory' ? S_IFDIR : S_IFREG;
    return typeBits | permissions;
  }

  private applyEntryMetadata(inode: SimpleInode, entry: SeedingEntry): void {
    if (entry.mode !== undefined) {
      inode.mode = createMode(this.computeMode(entry.type, entry.mode));
    }

    inode.uid = createUid(entry.uid ?? 1000);
    inode.gid = createGid(entry.gid ?? 1000);

    if (entry.nlink !== undefined) {
      inode.nlink = entry.nlink;
    }

    if (entry.generation !== undefined) {
      inode.generation = typeof entry.generation === 'bigint'
        ? entry.generation
        : BigInt(entry.generation);
    }

    if (entry.timestamps) {
      if (entry.timestamps.atime !== undefined) {
        inode.atime = entry.timestamps.atime;
      }
      if (entry.timestamps.mtime !== undefined) {
        inode.mtime = entry.timestamps.mtime;
      }
      if (entry.timestamps.ctime !== undefined) {
        inode.ctime = entry.timestamps.ctime;
      }
    }

    if (entry.type === 'file') {
      if (entry.content !== undefined) {
        const content = typeof entry.content === 'string'
          ? Buffer.from(entry.content)
          : entry.content;
        inode.data = content;
        inode.size = BigInt(content.length);
      }
      if (entry.size !== undefined) {
        inode.size = typeof entry.size === 'bigint'
          ? entry.size
          : BigInt(entry.size);
      }
    } else if (entry.type === 'directory') {
      if (!(inode.data instanceof Map)) {
        inode.data = new Map();
      }
      if (entry.size !== undefined) {
        inode.size = typeof entry.size === 'bigint'
          ? entry.size
          : BigInt(entry.size);
      }
    }
  }

  private seedDirectoryChildren(parent: SimpleInode, children: { [name: string]: SeedingEntry }): void {
    if (parent.type !== 'directory') {
      throw new Error('Cannot add children to non-directory inode');
    }
    if (!(parent.data instanceof Map)) {
      parent.data = new Map();
    }

    const sortedChildren = Object.entries(children).sort(([a], [b]) => a.localeCompare(b));
    for (const [childName, childEntry] of sortedChildren) {
      const childInode = this.createInodeInternal(
        childEntry.type,
        this.computeMode(childEntry.type, childEntry.mode)
      );
      this.applyEntryMetadata(childInode, childEntry);

      if (childEntry.type === 'directory' && childEntry.children) {
        this.seedDirectoryChildren(childInode, childEntry.children);
      }

      (parent.data as Map<string, SimpleInode>).set(childName, childInode);
      this.inodes.set(childInode.id, childInode);
    }
  }
}
