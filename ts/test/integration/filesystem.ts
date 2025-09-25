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
  children?: { [name: string]: SeedingEntry };
}

/**
 * Simplified filesystem class
 */
export class FileSystem {
  private inodes: Map<bigint, SimpleInode> = new Map();
  private nextIno: bigint = 1n;
  private root: SimpleInode;

  constructor(seeding: SeedingFilesystem = {}) {
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
      data: type === 'directory' ? new Map() : null,
    };
    return inode;
  }

  /**
   * Seed the filesystem with initial structure
   */
  private seedFilesystem(seeding: SeedingFilesystem): void {
    for (const [path, entry] of Object.entries(seeding)) {
      this.createEntry(path, entry);
    }
  }

  /**
   * Create an entry at the given path
   */
  private createEntry(path: string, entry: SeedingEntry): void {
    const parts = path.split('/').filter(p => p.length > 0);
    let current = this.root;

    // Navigate to parent directory
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current.type !== 'directory' || !(current.data instanceof Map)) {
        throw new Error(`ENOTDIR: ${path}`);
      }
      let child = current.data.get(part);
      if (!child) {
        child = this.createInodeInternal('directory', S_IFDIR | 0o755);
        current.data.set(part, child);
        this.inodes.set(child.id, child);
      }
      current = child;
    }

    // Create the final entry
    const name = parts[parts.length - 1];
    if (current.type !== 'directory' || !(current.data instanceof Map)) {
      throw new Error(`ENOTDIR: ${path}`);
    }

    const inode = this.createInodeInternal(entry.type, (entry.type === 'directory' ? S_IFDIR : S_IFREG) | (entry.mode || 0o644));
    inode.uid = createUid(entry.uid || 1000);
    inode.gid = createGid(entry.gid || 1000);

    if (entry.type === 'file' && entry.content) {
      const content = typeof entry.content === 'string' ? Buffer.from(entry.content) : entry.content;
      inode.data = content;
      inode.size = BigInt(content.length);
    } else if (entry.type === 'directory' && entry.children) {
      inode.data = new Map();
      for (const [childName, childEntry] of Object.entries(entry.children)) {
        const childInode = this.createInodeInternal(childEntry.type, (childEntry.type === 'directory' ? S_IFDIR : S_IFREG) | (childEntry.mode || 0o644));
        childInode.uid = createUid(childEntry.uid || 1000);
        childInode.gid = createGid(childEntry.gid || 1000);
        if (childEntry.type === 'file' && childEntry.content) {
          const content = typeof childEntry.content === 'string' ? Buffer.from(childEntry.content) : childEntry.content;
          childInode.data = content;
          childInode.size = BigInt(content.length);
        } else if (childEntry.type === 'directory') {
          childInode.data = new Map();
        }
        (inode.data as Map<string, SimpleInode>).set(childName, childInode);
        this.inodes.set(childInode.id, childInode);
      }
    }

    current.data.set(name, inode);
    this.inodes.set(inode.id, inode);
  }
}