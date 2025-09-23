/**
 * @file constants.ts
 * @brief FUSE constants and enumerations re-export module
 *
 * This module re-exports native constants from the C++ binding and provides
 * TypeScript-friendly enumerations for FUSE operations and flags.
 */
/**
 * File mode constants (re-exported from native binding)
 */
export declare const S_IFMT = 61440;
export declare const S_IFREG = 32768;
export declare const S_IFDIR = 16384;
export declare const S_IFLNK = 40960;
export declare const S_IFBLK = 24576;
export declare const S_IFCHR = 8192;
export declare const S_IFIFO = 4096;
export declare const S_IFSOCK = 49152;
export declare const S_ISUID = 2048;
export declare const S_ISGID = 1024;
export declare const S_ISVTX = 512;
export declare const S_IRWXU = 448;
export declare const S_IRUSR = 256;
export declare const S_IWUSR = 128;
export declare const S_IXUSR = 64;
export declare const S_IRWXG = 56;
export declare const S_IRGRP = 32;
export declare const S_IWGRP = 16;
export declare const S_IXGRP = 8;
export declare const S_IRWXO = 7;
export declare const S_IROTH = 4;
export declare const S_IWOTH = 2;
export declare const S_IXOTH = 1;
/**
 * Open flags constants
 */
export declare const O_RDONLY = 0;
export declare const O_WRONLY = 1;
export declare const O_RDWR = 2;
export declare const O_CREAT = 64;
export declare const O_EXCL = 128;
export declare const O_TRUNC = 512;
export declare const O_APPEND = 1024;
export declare const O_NONBLOCK = 2048;
export declare const O_SYNC = 4096;
export declare const O_DIRECT = 16384;
export declare const O_DIRECTORY = 65536;
export declare const O_NOFOLLOW = 131072;
/**
 * Errno constants (negative values following POSIX convention)
 */
export declare const EPERM = -1;
export declare const ENOENT = -2;
export declare const ESRCH = -3;
export declare const EINTR = -4;
export declare const EIO = -5;
export declare const ENXIO = -6;
export declare const E2BIG = -7;
export declare const ENOEXEC = -8;
export declare const EBADF = -9;
export declare const ECHILD = -10;
export declare const EAGAIN = -11;
export declare const ENOMEM = -12;
export declare const EACCES = -13;
export declare const EFAULT = -14;
export declare const ENOTBLK = -15;
export declare const EBUSY = -16;
export declare const EEXIST = -17;
export declare const EXDEV = -18;
export declare const ENODEV = -19;
export declare const ENOTDIR = -20;
export declare const EISDIR = -21;
export declare const EINVAL = -22;
export declare const ENFILE = -23;
export declare const EMFILE = -24;
export declare const ENOTTY = -25;
export declare const ETXTBSY = -26;
export declare const EFBIG = -27;
export declare const ENOSPC = -28;
export declare const ESPIPE = -29;
export declare const EROFS = -30;
export declare const EMLINK = -31;
export declare const EPIPE = -32;
export declare const EDOM = -33;
export declare const ERANGE = -34;
export declare const EDEADLK = -35;
export declare const ENAMETOOLONG = -36;
export declare const ENOLCK = -37;
export declare const ENOSYS = -38;
export declare const ENOTEMPTY = -39;
export declare const ELOOP = -40;
export declare const EWOULDBLOCK = -11;
export declare const ENOMSG = -42;
export declare const EIDRM = -43;
export declare const ENOTSUP = -95;
export declare const ETIMEDOUT = -110;
/**
 * FUSE-specific setattr valid flags
 */
export declare const FUSE_SET_ATTR_MODE: number;
export declare const FUSE_SET_ATTR_UID: number;
export declare const FUSE_SET_ATTR_GID: number;
export declare const FUSE_SET_ATTR_SIZE: number;
export declare const FUSE_SET_ATTR_ATIME: number;
export declare const FUSE_SET_ATTR_MTIME: number;
export declare const FUSE_SET_ATTR_ATIME_NOW: number;
export declare const FUSE_SET_ATTR_MTIME_NOW: number;
export declare const FUSE_SET_ATTR_CTIME: number;
/**
 * Directory entry types for readdir
 */
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
/**
 * FUSE operation types
 */
export declare enum FuseOpType {
    LOOKUP = "lookup",
    GETATTR = "getattr",
    SETATTR = "setattr",
    READLINK = "readlink",
    MKNOD = "mknod",
    MKDIR = "mkdir",
    UNLINK = "unlink",
    RMDIR = "rmdir",
    SYMLINK = "symlink",
    RENAME = "rename",
    LINK = "link",
    OPEN = "open",
    READ = "read",
    WRITE = "write",
    FLUSH = "flush",
    RELEASE = "release",
    FSYNC = "fsync",
    OPENDIR = "opendir",
    READDIR = "readdir",
    RELEASEDIR = "releasedir",
    FSYNCDIR = "fsyncdir",
    STATFS = "statfs",
    SETXATTR = "setxattr",
    GETXATTR = "getxattr",
    LISTXATTR = "listxattr",
    REMOVEXATTR = "removexattr",
    ACCESS = "access",
    CREATE = "create"
}
/**
 * Default timeouts for FUSE operations (in seconds)
 */
export declare const DEFAULT_ATTR_TIMEOUT = 1;
export declare const DEFAULT_ENTRY_TIMEOUT = 1;
export declare const DEFAULT_NEGATIVE_TIMEOUT = 0;
/**
 * Default limits
 */
export declare const DEFAULT_MAX_READ = 131072;
export declare const DEFAULT_MAX_WRITE = 131072;
export declare const DEFAULT_MAX_READAHEAD = 131072;
/**
 * File handle constants
 */
export declare const INVALID_FH = -1;
export declare const ROOT_INO = 1n;
/**
 * Helper functions for mode checking
 */
export declare const isRegularFile: (mode: number) => boolean;
export declare const isDirectory: (mode: number) => boolean;
export declare const isSymbolicLink: (mode: number) => boolean;
export declare const isBlockDevice: (mode: number) => boolean;
export declare const isCharDevice: (mode: number) => boolean;
export declare const isFifo: (mode: number) => boolean;
export declare const isSocket: (mode: number) => boolean;
/**
 * Helper functions for permission checking
 */
export declare const canRead: (mode: number, uid: number, gid: number, fileUid: number, fileGid: number) => boolean;
export declare const canWrite: (mode: number, uid: number, gid: number, fileUid: number, fileGid: number) => boolean;
export declare const canExecute: (mode: number, uid: number, gid: number, fileUid: number, fileGid: number) => boolean;
/**
 * Default export with all constants
 */
declare const _default: {
    S_IFMT: number;
    S_IFREG: number;
    S_IFDIR: number;
    S_IFLNK: number;
    S_IFBLK: number;
    S_IFCHR: number;
    S_IFIFO: number;
    S_IFSOCK: number;
    S_ISUID: number;
    S_ISGID: number;
    S_ISVTX: number;
    S_IRWXU: number;
    S_IRUSR: number;
    S_IWUSR: number;
    S_IXUSR: number;
    S_IRWXG: number;
    S_IRGRP: number;
    S_IWGRP: number;
    S_IXGRP: number;
    S_IRWXO: number;
    S_IROTH: number;
    S_IWOTH: number;
    S_IXOTH: number;
    O_RDONLY: number;
    O_WRONLY: number;
    O_RDWR: number;
    O_CREAT: number;
    O_EXCL: number;
    O_TRUNC: number;
    O_APPEND: number;
    O_NONBLOCK: number;
    O_SYNC: number;
    O_DIRECT: number;
    O_DIRECTORY: number;
    O_NOFOLLOW: number;
    EPERM: number;
    ENOENT: number;
    ESRCH: number;
    EINTR: number;
    EIO: number;
    ENXIO: number;
    E2BIG: number;
    ENOEXEC: number;
    EBADF: number;
    ECHILD: number;
    EAGAIN: number;
    ENOMEM: number;
    EACCES: number;
    EFAULT: number;
    ENOTBLK: number;
    EBUSY: number;
    EEXIST: number;
    EXDEV: number;
    ENODEV: number;
    ENOTDIR: number;
    EISDIR: number;
    EINVAL: number;
    ENFILE: number;
    EMFILE: number;
    ENOTTY: number;
    ETXTBSY: number;
    EFBIG: number;
    ENOSPC: number;
    ESPIPE: number;
    EROFS: number;
    EMLINK: number;
    EPIPE: number;
    EDOM: number;
    ERANGE: number;
    EDEADLK: number;
    ENAMETOOLONG: number;
    ENOLCK: number;
    ENOSYS: number;
    ENOTEMPTY: number;
    ELOOP: number;
    EWOULDBLOCK: number;
    ENOMSG: number;
    EIDRM: number;
    ENOTSUP: number;
    ETIMEDOUT: number;
    FUSE_SET_ATTR_MODE: number;
    FUSE_SET_ATTR_UID: number;
    FUSE_SET_ATTR_GID: number;
    FUSE_SET_ATTR_SIZE: number;
    FUSE_SET_ATTR_ATIME: number;
    FUSE_SET_ATTR_MTIME: number;
    FUSE_SET_ATTR_ATIME_NOW: number;
    FUSE_SET_ATTR_MTIME_NOW: number;
    FUSE_SET_ATTR_CTIME: number;
    DEFAULT_ATTR_TIMEOUT: number;
    DEFAULT_ENTRY_TIMEOUT: number;
    DEFAULT_NEGATIVE_TIMEOUT: number;
    DEFAULT_MAX_READ: number;
    DEFAULT_MAX_WRITE: number;
    DEFAULT_MAX_READAHEAD: number;
    INVALID_FH: number;
    ROOT_INO: bigint;
    DirentType: typeof DirentType;
    FuseOpType: typeof FuseOpType;
    isRegularFile: (mode: number) => boolean;
    isDirectory: (mode: number) => boolean;
    isSymbolicLink: (mode: number) => boolean;
    isBlockDevice: (mode: number) => boolean;
    isCharDevice: (mode: number) => boolean;
    isFifo: (mode: number) => boolean;
    isSocket: (mode: number) => boolean;
    canRead: (mode: number, uid: number, gid: number, fileUid: number, fileGid: number) => boolean;
    canWrite: (mode: number, uid: number, gid: number, fileUid: number, fileGid: number) => boolean;
    canExecute: (mode: number, uid: number, gid: number, fileUid: number, fileGid: number) => boolean;
};
export default _default;
//# sourceMappingURL=constants.d.ts.map