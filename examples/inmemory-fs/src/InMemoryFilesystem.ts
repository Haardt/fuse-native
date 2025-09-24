/**
 * @file InMemoryFilesystem.ts
 * @brief In-memory filesystem implementation for FUSE3 Node.js binding
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
  FuseOperationHandlers,
  GetattrHandler,
  ReaddirHandler,
  LookupHandler,
  CreateHandler,
  OpenHandler,
  ReadHandler,
  WriteHandler,
  ReleaseHandler,
  MkdirHandler,
  RmdirHandler,
  UnlinkHandler,
  RenameHandler,
  ChmodHandler,
  ChownHandler,
  TruncateHandler,
  SymlinkHandler,
  ReadlinkHandler,
  LinkHandler,
  StatfsHandler,
  GetxattrHandler,
  SetxattrHandler,
  ListxattrHandler,
  RemovexattrHandler,
  AccessHandler,
  CopyFileRangeHandler,
  SetattrHandler,
} from 'fuse-native';

import {
  createIno,
  createMode,
  createUid,
  createGid,
  createDev,
  createFlags,
  createFd,
  getCurrentTimestamp,
  DirentType,
} from 'fuse-native';

import { FuseErrno } from 'fuse-native';

import type {
  Inode,
  InodeType,
  InMemoryFsConfig,
  InMemoryFsStats,
  InMemoryDirent,
  OperationContext,
} from './types.js';

import { InMemoryFsUtils, InMemoryFsError } from './types.js';
import { InMemoryFilesystemCore } from './InMemoryFilesystemCore.js';
import { FileOperations } from './operations/fileOperations.js';
import { DirectoryOperations } from './operations/directoryOperations.js';
import { MetadataOperations } from './operations/metadataOperations.js';
import { LinkOperations } from './operations/linkOperations.js';
import { XattrOperations } from './operations/xattrOperations.js';
import { AdvancedOperations } from './operations/advancedOperations.js';

/**
 * In-memory filesystem implementation
 */
export class InMemoryFilesystem implements FuseOperationHandlers {
  private readonly core: InMemoryFilesystemCore;
  private readonly fileOps: FileOperations;
  private readonly dirOps: DirectoryOperations;
  private readonly metaOps: MetadataOperations;
  private readonly linkOps: LinkOperations;
  private readonly xattrOps: XattrOperations;
  private readonly advOps: AdvancedOperations;

  constructor(config: InMemoryFsConfig = {}) {
    // Create core with configuration
    this.core = new InMemoryFilesystemCore(config);

    // Create operation modules
    this.fileOps = new FileOperations(this.core);
    this.dirOps = new DirectoryOperations(this.core);
    this.metaOps = new MetadataOperations(this.core);
    this.linkOps = new LinkOperations(this.core);
    this.xattrOps = new XattrOperations(this.core);
    this.advOps = new AdvancedOperations(this.core);

    // Initialize operation handlers
    this.initializeHandlers();

    console.log(`In-memory filesystem initialized with root inode ${this.core.getRoot().id}`);
  }

  /**
   * Get filesystem statistics
   */
  getStats(): InMemoryFsStats {
    return this.core.getStats();
  }

  /**
   * Get inode by number
   */
  getInode(ino: Ino): Inode | null {
    return this.core.getInode(ino);
  }

  /**
   * Get root inode
   */
  getRoot(): Inode {
    return this.core.getRoot();
  }

  /**
   * Get next available inode number
   */
  getNextInodeNumber(): Ino {
    return this.core.getNextInodeNumber();
  }

  /**
   * Create a new inode
   */
  createInode(type: InodeType, mode?: Mode): Inode {
    return this.core.createInode(type, mode);
  }

  /**
   * Delete an inode
   */
  deleteInode(ino: Ino): boolean {
    return this.core.deleteInode(ino);
  }

  /**
   * Resolve path to inode
   */
  resolvePath(path: string): Inode {
    return this.core.resolvePath(path);
  }

  /**
   * Get parent directory and name for a path
   */
  getParentAndName(path: string): { parent: Inode; name: string } {
    return this.core.getParentAndName(path);
  }

  /**
   * List directory contents
   */
  listDirectory(ino: Ino): InMemoryDirent[] {
    return this.core.listDirectory(ino);
  }

  /**
   * Initialize operation handlers
   */
  private initializeHandlers(): void {

    console.log('🔧 Initializing FUSE operation handlers...');

    // FUSE Operation Handlers - delegated to operation modules
    // Bind handlers to preserve 'this' context
    this.getattr = this.metaOps.getattr.bind(this.metaOps);
    console.log('   ✓ getattr handler bound');

    this.readdir = this.dirOps.readdir.bind(this.dirOps);
    console.log('   ✓ readdir handler bound');

    this.lookup = this.dirOps.lookup.bind(this.dirOps);
    console.log('   ✓ lookup handler bound');

    this.create = this.fileOps.create.bind(this.fileOps);
    console.log('   ✓ create handler bound');

    this.open = this.fileOps.open.bind(this.fileOps);
    console.log('   ✓ open handler bound');

    this.read = this.fileOps.read.bind(this.fileOps);
    console.log('   ✓ read handler bound');

    this.write = this.fileOps.write.bind(this.fileOps);
    console.log('   ✓ write handler bound');

    this.release = this.fileOps.release.bind(this.fileOps);
    console.log('   ✓ release handler bound');

    this.mkdir = this.dirOps.mkdir.bind(this.dirOps);
    console.log('   ✓ mkdir handler bound');

    this.rmdir = this.dirOps.rmdir.bind(this.dirOps);
    console.log('   ✓ rmdir handler bound');

    this.unlink = this.dirOps.unlink.bind(this.dirOps);
    console.log('   ✓ unlink handler bound');

    this.rename = this.dirOps.rename.bind(this.dirOps);
    console.log('   ✓ rename handler bound');

    this.chmod = this.metaOps.chmod.bind(this.metaOps);
    console.log('   ✓ chmod handler bound');

    this.chown = this.metaOps.chown.bind(this.metaOps);
    console.log('   ✓ chown handler bound');

    this.truncate = this.advOps.truncate.bind(this.advOps);
    console.log('   ✓ truncate handler bound');

    this.symlink = this.linkOps.symlink.bind(this.linkOps);
    console.log('   ✓ symlink handler bound');

    this.readlink = this.linkOps.readlink.bind(this.linkOps);
    console.log('   ✓ readlink handler bound');

    this.link = this.linkOps.link.bind(this.linkOps);
    console.log('   ✓ link handler bound');

    this.statfs = this.advOps.statfs.bind(this.advOps);
    console.log('   ✓ statfs handler bound');

    this.getxattr = this.xattrOps.getxattr.bind(this.xattrOps);
    console.log('   ✓ getxattr handler bound');

    this.setxattr = this.xattrOps.setxattr.bind(this.xattrOps);
    console.log('   ✓ setxattr handler bound');

    this.listxattr = this.xattrOps.listxattr.bind(this.xattrOps);
    console.log('   ✓ listxattr handler bound');

    this.removexattr = this.xattrOps.removexattr.bind(this.xattrOps);
    console.log('   ✓ removexattr handler bound');

    this.access = this.advOps.access.bind(this.advOps);
    console.log('   ✓ access handler bound');

    this.setattr = this.advOps.setattr.bind(this.advOps);
    console.log('   ✓ setattr handler bound');

    this.utimens = this.advOps.utimens.bind(this.advOps);
    console.log('   ✓ utimens handler bound');


    this.copy_file_range = this.advOps.copy_file_range.bind(this.advOps);
    console.log('   ✓ copy_file_range handler bound');

    this.opendir = this.dirOps.opendir.bind(this.dirOps);
    console.log('   ✓ opendir handler bound');

    this.releasedir = this.dirOps.releasedir.bind(this.dirOps);
    console.log('   ✓ releasedir handler bound');

    this.init = this.advOps.init.bind(this.advOps);
    console.log('   ✓ init handler bound');

    this.destroy = this.advOps.destroy.bind(this.advOps);
    console.log('   ✓ destroy handler bound');

    console.log('✅ All FUSE operation handlers initialized successfully!');
  }

  // FUSE Operation Handlers - declared but initialized later
  getattr!: GetattrHandler;
  readdir!: ReaddirHandler;
  lookup!: LookupHandler;
  create!: CreateHandler;
  open!: OpenHandler;
  read!: ReadHandler;
  write!: WriteHandler;
  release!: ReleaseHandler;
  mkdir!: MkdirHandler;
  rmdir!: RmdirHandler;
  unlink!: UnlinkHandler;
  rename!: RenameHandler;
  chmod!: ChmodHandler;
  chown!: ChownHandler;
  truncate!: TruncateHandler;
  symlink!: SymlinkHandler;
  readlink!: ReadlinkHandler;
  link!: LinkHandler;
  statfs!: StatfsHandler;
  getxattr!: GetxattrHandler;
  setxattr!: SetxattrHandler;
  listxattr!: ListxattrHandler;
  removexattr!: RemovexattrHandler;
  access!: AccessHandler;
  setattr!: SetattrHandler;
  utimens!: (ino: Ino, atime: Timestamp | null, mtime: Timestamp | null, context: RequestContext, options?: BaseOperationOptions) => Promise<{ attr: StatResult; timeout: number }>;
  copy_file_range!: CopyFileRangeHandler;
  opendir!: OpenHandler;
  releasedir!: ReleaseHandler;
  init!: (conn: any, context: RequestContext) => Promise<void>;
  destroy!: (context: RequestContext) => Promise<void>;
}