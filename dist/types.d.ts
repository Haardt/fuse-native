/**
 * @file types.ts
 * @brief Comprehensive TypeScript type definitions for FUSE3 Node.js binding
 *
 * This module defines all TypeScript types used throughout the FUSE binding,
 * including branded types for type safety, BigInt support for 64-bit values,
 * and complete FUSE operation interfaces.
 */
/** Branded type for file descriptors */
export type Fd = number & {
    readonly __brand: 'Fd';
};
/** Branded type for inode numbers */
export type Ino = bigint & {
    readonly __brand: 'Ino';
};
/** Branded type for file mode */
export type Mode = number & {
    readonly __brand: 'Mode';
};
/** Branded type for file flags */
export type Flags = number & {
    readonly __brand: 'Flags';
};
/** Branded type for user ID */
export type Uid = number & {
    readonly __brand: 'Uid';
};
/** Branded type for group ID */
export type Gid = number & {
    readonly __brand: 'Gid';
};
/** Branded type for device ID */
export type Dev = bigint & {
    readonly __brand: 'Dev';
};
export declare const createFd: (value: number) => Fd;
export declare const createIno: (value: bigint) => Ino;
export declare const createMode: (value: number) => Mode;
export declare const createFlags: (value: number) => Flags;
export declare const createUid: (value: number) => Uid;
export declare const createGid: (value: number) => Gid;
export declare const createDev: (value: bigint) => Dev;
/** Timestamp in nanoseconds since Unix epoch (BigInt for ns precision) */
export type Timestamp = bigint;
/** Timeout values in seconds (floating point for sub-second precision) */
export type Timeout = number;
/** Helper to create timestamp from Date */
export declare const timestampFromDate: (date: Date) => Timestamp;
/** Helper to create Date from timestamp */
export declare const dateFromTimestamp: (timestamp: Timestamp) => Date;
/** Helper to get current timestamp */
export declare const getCurrentTimestamp: () => Timestamp;
/** File system statistics result */
export interface StatResult {
    /** Inode number */
    ino: Ino;
    /** File mode and type */
    mode: Mode;
    /** Number of hard links */
    nlink: number;
    /** User ID of owner */
    uid: Uid;
    /** Group ID of owner */
    gid: Gid;
    /** Device ID (if special file) */
    rdev: Dev;
    /** File size in bytes */
    size: bigint;
    /** Block size for filesystem I/O */
    blksize: number;
    /** Number of 512-byte blocks allocated */
    blocks: bigint;
    /** Time of last access */
    atime: Timestamp;
    /** Time of last modification */
    mtime: Timestamp;
    /** Time of last status change */
    ctime: Timestamp;
    /** Time of creation (if supported) */
    birthtime?: Timestamp;
}
/** File system statistics (statvfs) result */
export interface StatvfsResult {
    /** File system block size */
    bsize: number;
    /** Fragment size */
    frsize: number;
    /** Total data blocks in filesystem */
    blocks: bigint;
    /** Free blocks in filesystem */
    bfree: bigint;
    /** Free blocks available to unprivileged user */
    bavail: bigint;
    /** Total file nodes in filesystem */
    files: bigint;
    /** Free file nodes in filesystem */
    ffree: bigint;
    /** Free file nodes available to unprivileged user */
    favail: bigint;
    /** File system ID */
    fsid: bigint;
    /** Mount flags */
    flag: number;
    /** Maximum filename length */
    namemax: number;
}
/** Directory entry type */
export declare enum DirentType {
    Unknown = 0,
    Fifo = 1,
    CharDevice = 2,
    Directory = 4,
    BlockDevice = 6,
    RegularFile = 8,
    SymbolicLink = 10,
    Socket = 12
}
/** Directory entry */
export interface DirentEntry {
    /** Entry name */
    name: string;
    /** Inode number */
    ino: Ino;
    /** Entry type */
    type: DirentType;
    /** Next offset for pagination */
    nextOffset?: bigint | undefined;
}
/** Directory listing result */
export interface ReaddirResult {
    /** Array of directory entries */
    entries: DirentEntry[];
    /** Next offset for pagination (if more entries available) */
    nextOffset?: bigint | undefined;
    /** Whether there are more entries */
    hasMore: boolean;
}
/** File information structure */
export interface FileInfo {
    /** File descriptor */
    fh: Fd;
    /** Open flags */
    flags: Flags;
    /** Direct I/O flag */
    direct_io?: boolean;
    /** Keep cache flag */
    keep_cache?: boolean;
    /** Flush flag */
    flush?: boolean;
    /** Nonseekable flag */
    nonseekable?: boolean;
    /** Cache readdir flag */
    cache_readdir?: boolean;
    /** Parallel direct writes flag */
    parallel_direct_writes?: boolean;
}
/** Request context information */
export interface RequestContext {
    /** User ID */
    uid: Uid;
    /** Group ID */
    gid: Gid;
    /** Process ID */
    pid: number;
    /** Umask */
    umask: Mode;
}
/** Base options for operations */
export interface BaseOperationOptions {
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Timeout in milliseconds */
    timeout?: number;
}
/** Options for read operations */
export interface ReadOptions extends BaseOperationOptions {
    /** Offset to start reading from */
    offset: bigint;
    /** Number of bytes to read */
    size: number;
    /** File info */
    fi?: FileInfo;
}
/** Options for write operations */
export interface WriteOptions extends BaseOperationOptions {
    /** Offset to start writing from */
    offset: bigint;
    /** File info */
    fi?: FileInfo;
    /** Write flags */
    flags?: number;
}
/** Options for attribute operations */
export interface SetattrOptions extends BaseOperationOptions {
    /** Fields to set (bitmask) */
    valid: number;
    /** File info (if called during file operation) */
    fi?: FileInfo;
}
/** Options for extended attributes */
export interface XattrOptions extends BaseOperationOptions {
    /** Flags for setxattr */
    flags?: number;
    /** Size for getxattr/listxattr */
    size?: number;
}
/** Lookup operation handler */
export type LookupHandler = (parent: Ino, name: string, context: RequestContext, options?: BaseOperationOptions) => Promise<{
    attr: StatResult;
    timeout: Timeout;
}>;
/** Getattr operation handler */
export type GetattrHandler = (ino: Ino, context: RequestContext, fi?: FileInfo, options?: BaseOperationOptions) => Promise<{
    attr: StatResult;
    timeout: Timeout;
}>;
/** Setattr operation handler */
export type SetattrHandler = (ino: Ino, attr: Partial<StatResult>, context: RequestContext, options?: SetattrOptions) => Promise<{
    attr: StatResult;
    timeout: Timeout;
}>;
/** Read operation handler */
export type ReadHandler = (ino: Ino, context: RequestContext, options: ReadOptions) => Promise<ArrayBuffer>;
/** Write operation handler */
export type WriteHandler = (ino: Ino, data: ArrayBuffer, context: RequestContext, options: WriteOptions) => Promise<number>;
/** Open operation handler */
export type OpenHandler = (ino: Ino, flags: Flags, context: RequestContext, options?: BaseOperationOptions) => Promise<FileInfo>;
/** Release operation handler */
export type ReleaseHandler = (ino: Ino, fi: FileInfo, context: RequestContext, options?: BaseOperationOptions) => Promise<void>;
/** Readdir operation handler */
export type ReaddirHandler = (ino: Ino, offset: bigint, context: RequestContext, fi?: FileInfo, options?: BaseOperationOptions) => Promise<ReaddirResult>;
/** Mkdir operation handler */
export type MkdirHandler = (parent: Ino, name: string, mode: Mode, context: RequestContext, options?: BaseOperationOptions) => Promise<{
    attr: StatResult;
    timeout: Timeout;
}>;
/** Create operation handler */
export type CreateHandler = (parent: Ino, name: string, mode: Mode, flags: Flags, context: RequestContext, options?: BaseOperationOptions) => Promise<{
    attr: StatResult;
    fi: FileInfo;
    timeout: Timeout;
}>;
/** Unlink operation handler */
export type UnlinkHandler = (parent: Ino, name: string, context: RequestContext, options?: BaseOperationOptions) => Promise<void>;
/** Rmdir operation handler */
export type RmdirHandler = (parent: Ino, name: string, context: RequestContext, options?: BaseOperationOptions) => Promise<void>;
/** Rename operation handler */
export type RenameHandler = (parent: Ino, name: string, newparent: Ino, newname: string, flags: number, context: RequestContext, options?: BaseOperationOptions) => Promise<void>;
/** Statfs operation handler */
export type StatfsHandler = (ino: Ino, context: RequestContext, options?: BaseOperationOptions) => Promise<StatvfsResult>;
/** Complete FUSE operation handlers */
export interface FuseOperationHandlers {
    /** Lookup a directory entry */
    lookup?: LookupHandler;
    /** Get file attributes */
    getattr?: GetattrHandler;
    /** Set file attributes */
    setattr?: SetattrHandler;
    /** Read data from file */
    read?: ReadHandler;
    /** Write data to file */
    write?: WriteHandler;
    /** Open a file */
    open?: OpenHandler;
    /** Release a file */
    release?: ReleaseHandler;
    /** Read directory contents */
    readdir?: ReaddirHandler;
    /** Create a directory */
    mkdir?: MkdirHandler;
    /** Create and open a file */
    create?: CreateHandler;
    /** Remove a file */
    unlink?: UnlinkHandler;
    /** Remove a directory */
    rmdir?: RmdirHandler;
    /** Rename a file or directory */
    rename?: RenameHandler;
    /** Get filesystem statistics */
    statfs?: StatfsHandler;
    /** Flush file data */
    flush?: ReleaseHandler;
    /** Synchronize file contents */
    fsync?: (ino: Ino, datasync: boolean, fi: FileInfo, context: RequestContext, options?: BaseOperationOptions) => Promise<void>;
    /** Open a directory */
    opendir?: OpenHandler;
    /** Release a directory */
    releasedir?: ReleaseHandler;
    /** Synchronize directory contents */
    fsyncdir?: (ino: Ino, datasync: boolean, fi: FileInfo, context: RequestContext, options?: BaseOperationOptions) => Promise<void>;
    /** Check file access permissions */
    access?: (ino: Ino, mask: number, context: RequestContext, options?: BaseOperationOptions) => Promise<void>;
}
/** FUSE session options */
export interface FuseSessionOptions {
    /** Allow access from other users */
    allowOther?: boolean;
    /** Allow access from root */
    allowRoot?: boolean;
    /** Automatically unmount on process exit */
    autoUnmount?: boolean;
    /** Use default permissions */
    defaultPermissions?: boolean;
    /** Additional mount options */
    mountOptions?: string[];
    /** Debug mode */
    debug?: boolean;
    /** Single-threaded mode */
    singleThreaded?: boolean;
    /** Maximum read size */
    maxRead?: number;
    /** Maximum write size */
    maxWrite?: number;
    /** Connection timeout */
    timeout?: number;
}
/** Mount options */
export interface MountOptions extends BaseOperationOptions {
    /** Force mount even if already mounted */
    force?: boolean;
    /** Lazy unmount */
    lazy?: boolean;
}
/** Unmount options */
export interface UnmountOptions extends BaseOperationOptions {
    /** Force unmount */
    force?: boolean;
    /** Lazy unmount */
    lazy?: boolean;
}
/** FUSE session interface */
export interface FuseSession {
    /** Mount point path */
    readonly mountpoint: string;
    /** Whether the session is mounted */
    readonly mounted: boolean;
    /** Whether the session is ready to handle operations */
    readonly ready: boolean;
    /** Mount the filesystem */
    mount(options?: MountOptions): Promise<void>;
    /** Unmount the filesystem */
    unmount(options?: UnmountOptions): Promise<void>;
    /** Destroy the session and cleanup resources */
    destroy(): Promise<void>;
}
/** Union type for all possible FUSE operation names */
export type FuseOperationName = keyof FuseOperationHandlers;
/** Extract handler type for a specific operation */
export type HandlerFor<T extends FuseOperationName> = NonNullable<FuseOperationHandlers[T]>;
/** Promise return type for a specific operation handler */
export type HandlerResult<T extends FuseOperationName> = HandlerFor<T> extends (...args: any[]) => Promise<infer R> ? R : never;
/** Callback priority levels for operation ordering */
export type CallbackPriority = 'HIGH' | 'NORMAL' | 'LOW';
/** TSFN dispatcher options */
export interface TSFNDispatcherOptions {
    /** Maximum queue size (0 = unlimited) */
    maxQueueSize?: number;
    /** Number of worker threads for callback processing */
    workerThreads?: number;
    /** Enable priority ordering */
    priorityOrdering?: boolean;
}
/** TSFN dispatcher statistics */
export interface DispatcherStats {
    /** Total number of dispatched operations */
    totalDispatched: bigint;
    /** Total number of completed operations */
    totalCompleted: bigint;
    /** Total number of errors */
    totalErrors: bigint;
    /** Current queue size */
    queueSize: bigint;
    /** Maximum queue size reached */
    maxQueueSize: bigint;
    /** Average latency in milliseconds */
    avgLatencyMs: number;
    /** Uptime in milliseconds */
    uptimeMs: number;
}
/** TSFN dispatcher configuration */
export interface DispatcherConfig {
    /** Maximum queue size */
    maxQueueSize?: number;
    /** Enable or disable priority ordering */
    priorityOrdering?: boolean;
}
/** Write operation priority levels */
export type WriteOperationPriority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
/** Write queue statistics for a single FD or aggregate */
export interface WriteQueueStats {
    /** File descriptor (only present for FD-specific stats) */
    fd?: bigint;
    /** Total number of operations */
    totalOperations: bigint;
    /** Number of completed operations */
    completedOperations: bigint;
    /** Number of failed operations */
    failedOperations: bigint;
    /** Total bytes written */
    bytesWritten: bigint;
    /** Current queue size */
    queueSize: bigint;
    /** Maximum queue size reached */
    maxQueueSize: bigint;
    /** Average latency in milliseconds */
    avgLatencyMs: number;
    /** Active file descriptors (only for aggregate stats) */
    activeFDs?: bigint[];
}
/** Write queue configuration */
export interface FDWriteQueueConfig {
    /** Default maximum queue size for new FDs */
    defaultMaxQueueSize?: number;
    /** Per-FD maximum queue sizes */
    fdMaxQueueSize?: Record<string, number>;
}
/** Write operation completion callback */
export type WriteCompletionCallback = (result: number) => void;
/** Shutdown state enumeration */
export type ShutdownState = 'RUNNING' | 'DRAINING' | 'UNMOUNTING' | 'CLOSED';
/** Shutdown phase duration information */
export interface ShutdownPhaseDuration {
    /** Shutdown state/phase */
    state: ShutdownState;
    /** Duration in milliseconds */
    durationMs: number;
}
/** Shutdown statistics */
export interface ShutdownStats {
    /** Final shutdown state reached */
    finalState: ShutdownState;
    /** Whether shutdown completed gracefully */
    gracefulCompletion: boolean;
    /** Failure reason (if not graceful) */
    failureReason: string;
    /** Duration of each shutdown phase */
    phaseDurations: ShutdownPhaseDuration[];
    /** Total shutdown duration in milliseconds (if completed) */
    totalDurationMs?: number;
}
/** Shutdown timeout configuration */
export interface ShutdownTimeouts {
    /** Draining phase timeout in milliseconds */
    draining?: number;
    /** Unmounting phase timeout in milliseconds */
    unmounting?: number;
}
/** Shutdown callback interface */
export interface ShutdownCallback {
    /** Called when shutdown begins */
    onShutdownBegin?: (reason: string) => void;
    /** Called when entering each shutdown phase */
    onShutdownPhase?: (phase: {
        state: ShutdownState;
        description: string;
    }) => void;
    /** Called when shutdown completes */
    onShutdownComplete?: (stats: ShutdownStats) => void;
    /** Called if shutdown fails or times out */
    onShutdownFailed?: (state: ShutdownState, reason: string) => void;
}
/** Initialize TSFN dispatcher */
export type InitializeDispatcher = (options?: TSFNDispatcherOptions) => Promise<boolean>;
/** Shutdown TSFN dispatcher */
export type ShutdownDispatcher = (timeout?: number) => Promise<boolean>;
/** Get TSFN dispatcher statistics */
export type GetDispatcherStats = () => Promise<DispatcherStats>;
/** Reset TSFN dispatcher statistics */
export type ResetDispatcherStats = () => Promise<boolean>;
/** Set TSFN dispatcher configuration */
export type SetDispatcherConfig = (config: DispatcherConfig) => Promise<boolean>;
/** Set operation handler */
export type SetOperationHandler = (operation: FuseOperationName, handler: Function) => Promise<boolean>;
/** Remove operation handler */
export type RemoveOperationHandler = (operation: FuseOperationName) => Promise<boolean>;
/** Enqueue write operation */
export type EnqueueWrite = (fd: bigint, offset: bigint, size: bigint, buffer: ArrayBuffer | ArrayBufferView, priority?: WriteOperationPriority, callback?: WriteCompletionCallback) => Promise<bigint>;
/** Process write queues with executor function */
export type ProcessWriteQueues = (executor: (operation: {
    fd: bigint;
    offset: bigint;
    size: bigint;
    buffer: ArrayBuffer;
    priority: WriteOperationPriority;
}) => number) => Promise<number>;
/** Flush write queue for specific FD */
export type FlushWriteQueue = (fd: bigint, timeout?: number) => Promise<boolean>;
/** Flush all write queues */
export type FlushAllWriteQueues = (timeout?: number) => Promise<boolean>;
/** Get write queue statistics */
export type GetWriteQueueStats = (fd?: bigint) => Promise<WriteQueueStats | null>;
/** Reset write queue statistics */
export type ResetWriteQueueStats = () => Promise<boolean>;
/** Configure write queues */
export type ConfigureWriteQueues = (config: FDWriteQueueConfig) => Promise<boolean>;
/** Initialize shutdown manager */
export type InitializeShutdownManager = () => Promise<boolean>;
/** Initiate graceful shutdown */
export type InitiateGracefulShutdown = (reason?: string, timeout?: number) => Promise<boolean>;
/** Force immediate shutdown */
export type ForceImmediateShutdown = (reason?: string) => Promise<boolean>;
/** Get current shutdown state */
export type GetShutdownState = () => Promise<ShutdownState>;
/** Get shutdown statistics */
export type GetShutdownStats = () => Promise<ShutdownStats>;
/** Register shutdown callback */
export type RegisterShutdownCallback = (callback: ShutdownCallback) => Promise<boolean>;
/** Wait for shutdown completion */
export type WaitForShutdownCompletion = (timeout?: number) => Promise<boolean>;
/** Configure shutdown timeouts */
export type ConfigureShutdownTimeouts = (timeouts: ShutdownTimeouts) => Promise<boolean>;
//# sourceMappingURL=types.d.ts.map