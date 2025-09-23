/**
 * @file constants.ts
 * @brief FUSE constants and enumerations re-export module
 *
 * This module re-exports native constants from the C++ binding and provides
 * TypeScript-friendly enumerations for FUSE operations and flags.
 */

// TODO: Import native constants when binding is available
// For now, provide fallback constants for development

/**
 * File mode constants (re-exported from native binding)
 */
export const S_IFMT = 0o170000;   // File type mask
export const S_IFREG = 0o100000;  // Regular file
export const S_IFDIR = 0o040000;  // Directory
export const S_IFLNK = 0o120000;  // Symbolic link
export const S_IFBLK = 0o060000;  // Block device
export const S_IFCHR = 0o020000;  // Character device
export const S_IFIFO = 0o010000;  // FIFO/pipe
export const S_IFSOCK = 0o140000; // Socket

// Permission bits
export const S_ISUID = 0o004000;  // Set UID bit
export const S_ISGID = 0o002000;  // Set GID bit
export const S_ISVTX = 0o001000;  // Sticky bit

// Owner permissions
export const S_IRWXU = 0o000700;  // Owner read, write, execute
export const S_IRUSR = 0o000400;  // Owner read
export const S_IWUSR = 0o000200;  // Owner write
export const S_IXUSR = 0o000100;  // Owner execute

// Group permissions
export const S_IRWXG = 0o000070;  // Group read, write, execute
export const S_IRGRP = 0o000040;  // Group read
export const S_IWGRP = 0o000020;  // Group write
export const S_IXGRP = 0o000010;  // Group execute

// Other permissions
export const S_IRWXO = 0o000007;  // Other read, write, execute
export const S_IROTH = 0o000004;  // Other read
export const S_IWOTH = 0o000002;  // Other write
export const S_IXOTH = 0o000001;  // Other execute

/**
 * Open flags constants
 */
export const O_RDONLY = 0;        // Open for reading only
export const O_WRONLY = 1;        // Open for writing only
export const O_RDWR = 2;          // Open for reading and writing
export const O_CREAT = 0o100;     // Create file if it doesn't exist
export const O_EXCL = 0o200;      // Fail if file exists
export const O_TRUNC = 0o1000;    // Truncate file to zero length
export const O_APPEND = 0o2000;   // Append mode
export const O_NONBLOCK = 0o4000; // Non-blocking mode
export const O_SYNC = 0o10000;    // Synchronous writes
export const O_DIRECT = 0o40000;  // Direct I/O
export const O_DIRECTORY = 0o200000; // Must be a directory
export const O_NOFOLLOW = 0o400000;  // Don't follow symlinks

/**
 * Errno constants (negative values following POSIX convention)
 */
export const EPERM = -1;          // Operation not permitted
export const ENOENT = -2;         // No such file or directory
export const ESRCH = -3;          // No such process
export const EINTR = -4;          // Interrupted system call
export const EIO = -5;            // I/O error
export const ENXIO = -6;          // No such device or address
export const E2BIG = -7;          // Argument list too long
export const ENOEXEC = -8;        // Exec format error
export const EBADF = -9;          // Bad file number
export const ECHILD = -10;        // No child processes
export const EAGAIN = -11;        // Try again
export const ENOMEM = -12;        // Out of memory
export const EACCES = -13;        // Permission denied
export const EFAULT = -14;        // Bad address
export const ENOTBLK = -15;       // Block device required
export const EBUSY = -16;         // Device or resource busy
export const EEXIST = -17;        // File exists
export const EXDEV = -18;         // Cross-device link
export const ENODEV = -19;        // No such device
export const ENOTDIR = -20;       // Not a directory
export const EISDIR = -21;        // Is a directory
export const EINVAL = -22;        // Invalid argument
export const ENFILE = -23;        // File table overflow
export const EMFILE = -24;        // Too many open files
export const ENOTTY = -25;        // Not a typewriter
export const ETXTBSY = -26;       // Text file busy
export const EFBIG = -27;         // File too large
export const ENOSPC = -28;        // No space left on device
export const ESPIPE = -29;        // Illegal seek
export const EROFS = -30;         // Read-only file system
export const EMLINK = -31;        // Too many links
export const EPIPE = -32;         // Broken pipe
export const EDOM = -33;          // Math argument out of domain
export const ERANGE = -34;        // Math result not representable
export const EDEADLK = -35;       // Resource deadlock would occur
export const ENAMETOOLONG = -36;  // File name too long
export const ENOLCK = -37;        // No record locks available
export const ENOSYS = -38;        // Function not implemented
export const ENOTEMPTY = -39;     // Directory not empty
export const ELOOP = -40;         // Too many symbolic links encountered
export const EWOULDBLOCK = -11;   // Operation would block (same as EAGAIN)
export const ENOMSG = -42;        // No message of desired type
export const EIDRM = -43;         // Identifier removed
export const ENOTSUP = -95;       // Operation not supported
export const ETIMEDOUT = -110;    // Connection timed out

/**
 * FUSE-specific setattr valid flags
 */
export const FUSE_SET_ATTR_MODE = (1 << 0);
export const FUSE_SET_ATTR_UID = (1 << 1);
export const FUSE_SET_ATTR_GID = (1 << 2);
export const FUSE_SET_ATTR_SIZE = (1 << 3);
export const FUSE_SET_ATTR_ATIME = (1 << 4);
export const FUSE_SET_ATTR_MTIME = (1 << 5);
export const FUSE_SET_ATTR_ATIME_NOW = (1 << 7);
export const FUSE_SET_ATTR_MTIME_NOW = (1 << 8);
export const FUSE_SET_ATTR_CTIME = (1 << 10);

/**
 * Directory entry types for readdir
 */
export enum DirentType {
  Unknown = 0,
  Fifo = 1,
  CharDevice = 2,
  Directory = 4,
  BlockDevice = 6,
  RegularFile = 8,
  SymbolicLink = 10,
  Socket = 12,
}

/**
 * FUSE operation types
 */
export enum FuseOpType {
  LOOKUP = 'lookup',
  GETATTR = 'getattr',
  SETATTR = 'setattr',
  READLINK = 'readlink',
  MKNOD = 'mknod',
  MKDIR = 'mkdir',
  UNLINK = 'unlink',
  RMDIR = 'rmdir',
  SYMLINK = 'symlink',
  RENAME = 'rename',
  LINK = 'link',
  OPEN = 'open',
  READ = 'read',
  WRITE = 'write',
  FLUSH = 'flush',
  RELEASE = 'release',
  FSYNC = 'fsync',
  OPENDIR = 'opendir',
  READDIR = 'readdir',
  RELEASEDIR = 'releasedir',
  FSYNCDIR = 'fsyncdir',
  STATFS = 'statfs',
  SETXATTR = 'setxattr',
  GETXATTR = 'getxattr',
  LISTXATTR = 'listxattr',
  REMOVEXATTR = 'removexattr',
  ACCESS = 'access',
  CREATE = 'create',
}

/**
 * Default timeouts for FUSE operations (in seconds)
 */
export const DEFAULT_ATTR_TIMEOUT = 1.0;
export const DEFAULT_ENTRY_TIMEOUT = 1.0;
export const DEFAULT_NEGATIVE_TIMEOUT = 0.0;

/**
 * Default limits
 */
export const DEFAULT_MAX_READ = 131072;     // 128KB
export const DEFAULT_MAX_WRITE = 131072;    // 128KB
export const DEFAULT_MAX_READAHEAD = 131072; // 128KB

/**
 * File handle constants
 */
export const INVALID_FH = -1;
export const ROOT_INO = 1n;

/**
 * Helper functions for mode checking
 */
export const isRegularFile = (mode: number): boolean => (mode & S_IFMT) === S_IFREG;
export const isDirectory = (mode: number): boolean => (mode & S_IFMT) === S_IFDIR;
export const isSymbolicLink = (mode: number): boolean => (mode & S_IFMT) === S_IFLNK;
export const isBlockDevice = (mode: number): boolean => (mode & S_IFMT) === S_IFBLK;
export const isCharDevice = (mode: number): boolean => (mode & S_IFMT) === S_IFCHR;
export const isFifo = (mode: number): boolean => (mode & S_IFMT) === S_IFIFO;
export const isSocket = (mode: number): boolean => (mode & S_IFMT) === S_IFSOCK;

/**
 * Helper functions for permission checking
 */
export const canRead = (mode: number, uid: number, gid: number, fileUid: number, fileGid: number): boolean => {
  if (uid === 0) return true; // Root can read everything
  if (uid === fileUid) return (mode & S_IRUSR) !== 0;
  if (gid === fileGid) return (mode & S_IRGRP) !== 0;
  return (mode & S_IROTH) !== 0;
};

export const canWrite = (mode: number, uid: number, gid: number, fileUid: number, fileGid: number): boolean => {
  if (uid === 0) return true; // Root can write everything
  if (uid === fileUid) return (mode & S_IWUSR) !== 0;
  if (gid === fileGid) return (mode & S_IWGRP) !== 0;
  return (mode & S_IWOTH) !== 0;
};

export const canExecute = (mode: number, uid: number, gid: number, fileUid: number, fileGid: number): boolean => {
  if (uid === 0) return (mode & (S_IXUSR | S_IXGRP | S_IXOTH)) !== 0; // Root needs at least one execute bit
  if (uid === fileUid) return (mode & S_IXUSR) !== 0;
  if (gid === fileGid) return (mode & S_IXGRP) !== 0;
  return (mode & S_IXOTH) !== 0;
};

/**
 * Default export with all constants
 */
export default {
  // File modes
  S_IFMT, S_IFREG, S_IFDIR, S_IFLNK, S_IFBLK, S_IFCHR, S_IFIFO, S_IFSOCK,
  S_ISUID, S_ISGID, S_ISVTX,
  S_IRWXU, S_IRUSR, S_IWUSR, S_IXUSR,
  S_IRWXG, S_IRGRP, S_IWGRP, S_IXGRP,
  S_IRWXO, S_IROTH, S_IWOTH, S_IXOTH,

  // Open flags
  O_RDONLY, O_WRONLY, O_RDWR, O_CREAT, O_EXCL, O_TRUNC, O_APPEND,
  O_NONBLOCK, O_SYNC, O_DIRECT, O_DIRECTORY, O_NOFOLLOW,

  // Errno codes
  EPERM, ENOENT, ESRCH, EINTR, EIO, ENXIO, E2BIG, ENOEXEC, EBADF, ECHILD,
  EAGAIN, ENOMEM, EACCES, EFAULT, ENOTBLK, EBUSY, EEXIST, EXDEV, ENODEV,
  ENOTDIR, EISDIR, EINVAL, ENFILE, EMFILE, ENOTTY, ETXTBSY, EFBIG, ENOSPC,
  ESPIPE, EROFS, EMLINK, EPIPE, EDOM, ERANGE, EDEADLK, ENAMETOOLONG, ENOLCK,
  ENOSYS, ENOTEMPTY, ELOOP, EWOULDBLOCK, ENOMSG, EIDRM, ENOTSUP, ETIMEDOUT,

  // FUSE constants
  FUSE_SET_ATTR_MODE, FUSE_SET_ATTR_UID, FUSE_SET_ATTR_GID, FUSE_SET_ATTR_SIZE,
  FUSE_SET_ATTR_ATIME, FUSE_SET_ATTR_MTIME, FUSE_SET_ATTR_ATIME_NOW,
  FUSE_SET_ATTR_MTIME_NOW, FUSE_SET_ATTR_CTIME,

  // Defaults
  DEFAULT_ATTR_TIMEOUT, DEFAULT_ENTRY_TIMEOUT, DEFAULT_NEGATIVE_TIMEOUT,
  DEFAULT_MAX_READ, DEFAULT_MAX_WRITE, DEFAULT_MAX_READAHEAD,

  // Special values
  INVALID_FH, ROOT_INO,

  // Enums
  DirentType, FuseOpType,

  // Helper functions
  isRegularFile, isDirectory, isSymbolicLink, isBlockDevice, isCharDevice, isFifo, isSocket,
  canRead, canWrite, canExecute,
};
