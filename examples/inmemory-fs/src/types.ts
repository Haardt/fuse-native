/**
 * @file types.ts
 * @brief TypeScript type definitions for the in-memory filesystem example
 */

import type {
  Ino,
  Mode,
  Uid,
  Gid,
  Timestamp,
  StatResult,
  DirentEntry,
  ReaddirResult,
  RequestContext,
  BaseOperationOptions,
  FileInfo,
  Dev,
} from 'fuse-native';

import { DirentType, createDev, createMode } from 'fuse-native';

/**
 * In-memory filesystem node types
 */
export type InodeType = 'file' | 'directory' | 'symlink';

/**
 * In-memory filesystem node interface
 */
export interface Inode {
  /** Unique inode number */
  id: Ino;
  /** Node type */
  type: InodeType;
  /** File mode */
  mode: Mode;
  /** Owner user ID */
  uid: Uid;
  /** Owner group ID */
  gid: Gid;
  /** File size in bytes */
  size: bigint;
  /** Last access time */
  atime: Timestamp;
  /** Last modification time */
  mtime: Timestamp;
  /** Last status change time */
  ctime: Timestamp;
  /** Number of hard links */
  nlink: number;
  /** Node data (Buffer for files, Map for directories, string for symlinks) */
  data: Buffer | Map<string, Inode> | string | null;
  /** Extended attributes */
  xattrs: Map<string, Buffer>;
}

/**
 * In-memory filesystem configuration
 */
export interface InMemoryFsConfig {
  /** Root directory mode */
  rootMode?: Mode;
  /** Default file mode */
  defaultFileMode?: Mode;
  /** Default directory mode */
  defaultDirMode?: Mode;
  /** Default user ID */
  defaultUid?: Uid;
  /** Default group ID */
  defaultGid?: Gid;
  /** Maximum number of inodes */
  maxInodes?: number;
}

/**
 * In-memory filesystem statistics
 */
export interface InMemoryFsStats {
  /** Total number of inodes */
  totalInodes: number;
  /** Number of files */
  fileCount: number;
  /** Number of directories */
  directoryCount: number;
  /** Number of symbolic links */
  symlinkCount: number;
  /** Total size of all files in bytes */
  totalSize: bigint;
  /** Memory usage in bytes */
  memoryUsage: number;
}

/**
 * Path resolution result
 */
export interface PathResolution {
  /** Resolved inode */
  inode: Inode;
  /** Parent inode */
  parent: Inode;
  /** Name in parent directory */
  name: string;
}

/**
 * Directory entry with full inode information
 */
export interface InMemoryDirent {
  /** Entry name */
  name: string;
  /** Inode */
  inode: Inode;
  /** Entry type */
  type: DirentType;
}

/**
 * File handle for open files
 */
export interface InMemoryFileHandle {
  /** Inode */
  inode: Inode;
  /** Open flags */
  flags: number;
  /** Current position */
  position: bigint;
}

/**
 * Write operation for queued writes
 */
export interface WriteOperation {
  /** File handle */
  fh: Ino;
  /** Data to write */
  data: Buffer;
  /** Offset to write at */
  offset: bigint;
  /** Priority */
  priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
}

/**
 * In-memory filesystem interface
 */
export interface IInMemoryFilesystem {
  /** Get filesystem statistics */
  getStats(): InMemoryFsStats;

  /** Get inode by number */
  getInode(ino: Ino): Inode | null;

  /** Resolve path to inode */
  resolvePath(path: string): Inode;

  /** Get parent directory and name for a path */
  getParentAndName(path: string): { parent: Inode; name: string };

  /** Create a new inode */
  createInode(type: InodeType, mode?: Mode): Inode;

  /** Delete an inode */
  deleteInode(ino: Ino): boolean;

  /** Get root inode */
  getRoot(): Inode;

  /** List directory contents */
  listDirectory(ino: Ino): InMemoryDirent[];

  /** Find free inode number */
  getNextInodeNumber(): Ino;
}

/**
 * Operation context for FUSE operations
 */
export interface OperationContext {
  /** Request context */
  context: RequestContext;
  /** Operation options */
  options?: BaseOperationOptions;
  /** File info (if applicable) */
  fi?: FileInfo;
}

/**
 * Error types specific to in-memory filesystem
 */
export class InMemoryFsError extends Error {
  public readonly code: string;
  public readonly errno: number;
  public readonly path?: string | undefined;

  constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = 'InMemoryFsError';
    this.code = code;
    this.errno = this.getErrnoFromCode(code);
    this.path = path;
  }

  private getErrnoFromCode(code: string): number {
    const codeMap: Record<string, number> = {
      ENOENT: -2,
      EEXIST: -17,
      ENOTDIR: -20,
      EISDIR: -21,
      ENOTEMPTY: -39,
      EACCES: -13,
      EPERM: -1,
      EINVAL: -22,
      ENOSPC: -28,
    };
    return codeMap[code] || -5; // Default to EIO
  }
}

/**
 * Utility functions for type conversion
 */
export const InMemoryFsUtils = {
  /**
   * Convert Inode to StatResult
   */
  inodeToStat(inode: Inode): StatResult {
    let typeBits: number;
    switch (inode.type) {
      case 'directory':
        typeBits = 0o40000; // S_IFDIR
        break;
      case 'file':
        typeBits = 0o100000; // S_IFREG
        break;
      case 'symlink':
        typeBits = 0o120000; // S_IFLNK
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
  },

  /**
   * Convert Inode to DirentEntry
   */
  inodeToDirent(inode: Inode, name: string): DirentEntry {
    let type: DirentType;
    switch (inode.type) {
      case 'directory':
        type = DirentType.Directory;
        break;
      case 'file':
        type = DirentType.RegularFile;
        break;
      case 'symlink':
        type = DirentType.SymbolicLink;
        break;
      default:
        type = DirentType.Unknown;
    }

    return {
      name,
      ino: inode.id,
      type,
    };
  },

  /**
   * Convert InMemoryDirent array to ReaddirResult
   */
  direntsToReaddirResult(dirents: InMemoryDirent[]): ReaddirResult {
    const entries = dirents.map(({ name, inode }) =>
      this.inodeToDirent(inode, name)
    );

    return {
      entries,
      hasMore: false,
    };
  },

  /**
   * Get current timestamp in nanoseconds
   */
  getCurrentTimestamp(): Timestamp {
    return BigInt(Math.floor(Date.now() / 1000)) * 1_000_000_000n;
  },

  /**
   * Convert seconds to nanoseconds
   */
  secondsToNanoseconds(seconds: number): Timestamp {
    return BigInt(Math.floor(seconds)) * 1_000_000_000n;
  },

  /**
   * Convert nanoseconds to seconds
   */
  nanosecondsToSeconds(ns: Timestamp): number {
    return Number(ns / 1_000_000_000n);
  },
};