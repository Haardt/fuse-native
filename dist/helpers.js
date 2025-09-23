/**
 * @file helpers.ts
 * @brief Utility functions and type conversions for FUSE3 Node.js binding
 *
 * This module provides helper functions for common operations, type conversions,
 * path utilities, and other convenience functions used throughout the FUSE binding.
 */
import { createMode, createUid, createGid, createDev, timestampFromDate, dateFromTimestamp, getCurrentTimestamp, } from './types.js';
import { S_IFMT, S_IFREG, S_IFDIR, S_IFLNK, S_IFBLK, S_IFCHR, S_IFIFO, S_IFSOCK, S_IRUSR, S_IWUSR, S_IXUSR, S_IRGRP, S_IWGRP, S_IXGRP, S_IROTH, S_IWOTH, S_IXOTH, DirentType, ROOT_INO, } from './constants.js';
import { FuseErrno } from './errors.js';
/**
 * Path utility functions
 */
export class PathUtils {
    /**
     * Normalize a file path
     */
    static normalize(path) {
        if (typeof path !== 'string') {
            throw new FuseErrno('EINVAL', 'Path must be a string');
        }
        // Handle empty path
        if (path === '') {
            return '/';
        }
        // Ensure path starts with /
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        // Remove duplicate slashes
        path = path.replace(/\/+/g, '/');
        // Remove trailing slash (except for root)
        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }
        return path;
    }
    /**
     * Join path components
     */
    static join(...components) {
        if (components.length === 0) {
            return '/';
        }
        const joined = components
            .filter(component => component && component.length > 0)
            .join('/')
            .replace(/\/+/g, '/');
        return this.normalize(joined);
    }
    /**
     * Get directory name from path
     */
    static dirname(path) {
        const normalized = this.normalize(path);
        if (normalized === '/') {
            return '/';
        }
        const lastSlash = normalized.lastIndexOf('/');
        if (lastSlash === 0) {
            return '/';
        }
        return normalized.substring(0, lastSlash);
    }
    /**
     * Get base name from path
     */
    static basename(path) {
        const normalized = this.normalize(path);
        if (normalized === '/') {
            return '/';
        }
        const lastSlash = normalized.lastIndexOf('/');
        return normalized.substring(lastSlash + 1);
    }
    /**
     * Check if path is absolute
     */
    static isAbsolute(path) {
        return typeof path === 'string' && path.startsWith('/');
    }
    /**
     * Validate path for FUSE operations
     */
    static validate(path) {
        if (typeof path !== 'string') {
            throw new FuseErrno('EINVAL', 'Path must be a string');
        }
        if (path.length === 0) {
            throw new FuseErrno('EINVAL', 'Path cannot be empty');
        }
        if (path.length > 4096) {
            // PATH_MAX
            throw new FuseErrno('ENAMETOOLONG', 'Path too long');
        }
        // Check for invalid characters (null bytes)
        if (path.includes('\0')) {
            throw new FuseErrno('EINVAL', 'Path contains null byte');
        }
    }
}
/**
 * File mode utility functions
 */
export class ModeUtils {
    /**
     * Check if mode represents a regular file
     */
    static isFile(mode) {
        const m = typeof mode === 'number' ? mode : Number(mode);
        return (m & S_IFMT) === S_IFREG;
    }
    /**
     * Check if mode represents a directory
     */
    static isDirectory(mode) {
        const m = typeof mode === 'number' ? mode : Number(mode);
        return (m & S_IFMT) === S_IFDIR;
    }
    /**
     * Check if mode represents a symbolic link
     */
    static isSymbolicLink(mode) {
        const m = typeof mode === 'number' ? mode : Number(mode);
        return (m & S_IFMT) === S_IFLNK;
    }
    /**
     * Check if mode represents a block device
     */
    static isBlockDevice(mode) {
        const m = typeof mode === 'number' ? mode : Number(mode);
        return (m & S_IFMT) === S_IFBLK;
    }
    /**
     * Check if mode represents a character device
     */
    static isCharacterDevice(mode) {
        const m = typeof mode === 'number' ? mode : Number(mode);
        return (m & S_IFMT) === S_IFCHR;
    }
    /**
     * Check if mode represents a FIFO
     */
    static isFifo(mode) {
        const m = typeof mode === 'number' ? mode : Number(mode);
        return (m & S_IFMT) === S_IFIFO;
    }
    /**
     * Check if mode represents a socket
     */
    static isSocket(mode) {
        const m = typeof mode === 'number' ? mode : Number(mode);
        return (m & S_IFMT) === S_IFSOCK;
    }
    /**
     * Get file type from mode
     */
    static getFileType(mode) {
        const m = typeof mode === 'number' ? mode : Number(mode);
        const type = m & S_IFMT;
        switch (type) {
            case S_IFREG:
                return DirentType.RegularFile;
            case S_IFDIR:
                return DirentType.Directory;
            case S_IFLNK:
                return DirentType.SymbolicLink;
            case S_IFBLK:
                return DirentType.BlockDevice;
            case S_IFCHR:
                return DirentType.CharDevice;
            case S_IFIFO:
                return DirentType.Fifo;
            case S_IFSOCK:
                return DirentType.Socket;
            default:
                return DirentType.Unknown;
        }
    }
    /**
     * Create mode value from type and permissions
     */
    static create(type, permissions) {
        let fileType;
        switch (type) {
            case DirentType.RegularFile:
                fileType = S_IFREG;
                break;
            case DirentType.Directory:
                fileType = S_IFDIR;
                break;
            case DirentType.SymbolicLink:
                fileType = S_IFLNK;
                break;
            case DirentType.BlockDevice:
                fileType = S_IFBLK;
                break;
            case DirentType.CharDevice:
                fileType = S_IFCHR;
                break;
            case DirentType.Fifo:
                fileType = S_IFIFO;
                break;
            case DirentType.Socket:
                fileType = S_IFSOCK;
                break;
            default:
                fileType = 0;
                break;
        }
        return createMode(fileType | (permissions & 0o7777));
    }
    /**
     * Format mode as human-readable string
     */
    static toString(mode) {
        const m = typeof mode === 'number' ? mode : Number(mode);
        let result = '';
        // File type
        const type = m & S_IFMT;
        switch (type) {
            case S_IFREG:
                result += '-';
                break;
            case S_IFDIR:
                result += 'd';
                break;
            case S_IFLNK:
                result += 'l';
                break;
            case S_IFBLK:
                result += 'b';
                break;
            case S_IFCHR:
                result += 'c';
                break;
            case S_IFIFO:
                result += 'p';
                break;
            case S_IFSOCK:
                result += 's';
                break;
            default:
                result += '?';
                break;
        }
        // Permissions
        result += m & S_IRUSR ? 'r' : '-';
        result += m & S_IWUSR ? 'w' : '-';
        result += m & S_IXUSR ? 'x' : '-';
        result += m & S_IRGRP ? 'r' : '-';
        result += m & S_IWGRP ? 'w' : '-';
        result += m & S_IXGRP ? 'x' : '-';
        result += m & S_IROTH ? 'r' : '-';
        result += m & S_IWOTH ? 'w' : '-';
        result += m & S_IXOTH ? 'x' : '-';
        return result;
    }
}
/**
 * Time utility functions
 */
export class TimeUtils {
    /**
     * Get current time as nanosecond timestamp
     */
    static now() {
        return getCurrentTimestamp();
    }
    /**
     * Create timestamp from seconds and nanoseconds
     */
    static fromTimespec(seconds, nanoseconds) {
        return BigInt(seconds) * 1000000000n + BigInt(nanoseconds);
    }
    /**
     * Convert timestamp to seconds and nanoseconds
     */
    static toTimespec(timestamp) {
        const seconds = Number(timestamp / 1000000000n);
        const nanoseconds = Number(timestamp % 1000000000n);
        return { seconds, nanoseconds };
    }
    /**
     * Convert timestamp to Date object
     */
    static toDate(timestamp) {
        return dateFromTimestamp(timestamp);
    }
    /**
     * Convert Date to timestamp
     */
    static fromDate(date) {
        return timestampFromDate(date);
    }
    /**
     * Format timestamp as ISO string
     */
    static toISOString(timestamp) {
        return this.toDate(timestamp).toISOString();
    }
    /**
     * Parse ISO string to timestamp
     */
    static fromISOString(isoString) {
        return this.fromDate(new Date(isoString));
    }
}
/**
 * Stat utility functions
 */
export class StatUtils {
    /**
     * Create a basic stat result
     */
    static create(ino, mode, size = 0n, uid = createUid(0), gid = createGid(0)) {
        const now = TimeUtils.now();
        return {
            ino,
            mode,
            nlink: 1,
            uid,
            gid,
            rdev: createDev(0n),
            size,
            blksize: 4096,
            blocks: (size + 511n) / 512n, // Round up to 512-byte blocks
            atime: now,
            mtime: now,
            ctime: now,
        };
    }
    /**
     * Create stat for directory
     */
    static createDirectory(ino, uid = createUid(0), gid = createGid(0), mode = 0o755) {
        return this.create(ino, ModeUtils.create(DirentType.Directory, mode), 0n, uid, gid);
    }
    /**
     * Create stat for regular file
     */
    static createFile(ino, size, uid = createUid(0), gid = createGid(0), mode = 0o644) {
        return this.create(ino, ModeUtils.create(DirentType.RegularFile, mode), size, uid, gid);
    }
    /**
     * Update timestamps in stat
     */
    static updateTimes(stat, options) {
        return {
            ...stat,
            atime: options.atime ?? stat.atime,
            mtime: options.mtime ?? stat.mtime,
            ctime: options.ctime ?? stat.ctime,
        };
    }
    /**
     * Clone stat result
     */
    static clone(stat) {
        return { ...stat };
    }
}
/**
 * Directory entry utility functions
 */
export class DirentUtils {
    /**
     * Create directory entry
     */
    static create(name, ino, type, nextOffset) {
        return {
            name,
            ino,
            type,
            nextOffset: nextOffset ?? undefined,
        };
    }
    /**
     * Create readdir result
     */
    static createReaddirResult(entries, hasMore = false, nextOffset) {
        return {
            entries,
            hasMore,
            nextOffset,
        };
    }
    /**
     * Create standard directory entries (. and ..)
     */
    static createStandardEntries(currentIno, parentIno = ROOT_INO) {
        return [
            this.create('.', currentIno, DirentType.Directory),
            this.create('..', parentIno, DirentType.Directory),
        ];
    }
}
/**
 * Buffer utility functions
 */
export class BufferUtils {
    /**
     * Create ArrayBuffer from string
     */
    static fromString(str, encoding = 'utf8') {
        const buffer = Buffer.from(str, encoding);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    /**
     * Convert ArrayBuffer to string
     */
    static toString(buffer, encoding = 'utf8') {
        return Buffer.from(buffer).toString(encoding);
    }
    /**
     * Create zero-filled ArrayBuffer
     */
    static zeros(size) {
        return new ArrayBuffer(size);
    }
    /**
     * Copy data between ArrayBuffers
     */
    static copy(source, target, targetOffset = 0) {
        const sourceView = new Uint8Array(source);
        const targetView = new Uint8Array(target, targetOffset);
        const copyLength = Math.min(sourceView.length, targetView.length);
        targetView.set(sourceView.subarray(0, copyLength));
        return copyLength;
    }
    /**
     * Concatenate ArrayBuffers
     */
    static concat(buffers) {
        const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
        const result = new ArrayBuffer(totalLength);
        const resultView = new Uint8Array(result);
        let offset = 0;
        for (const buffer of buffers) {
            const view = new Uint8Array(buffer);
            resultView.set(view, offset);
            offset += view.length;
        }
        return result;
    }
    /**
     * Slice ArrayBuffer
     */
    static slice(buffer, start = 0, end) {
        return buffer.slice(start, end);
    }
}
/**
 * Validation utility functions
 */
export class ValidationUtils {
    /**
     * Validate inode number
     */
    static validateIno(ino) {
        if (typeof ino !== 'bigint') {
            throw new FuseErrno('EINVAL', 'Inode must be a BigInt');
        }
        if (ino <= 0n) {
            throw new FuseErrno('EINVAL', 'Inode must be positive');
        }
    }
    /**
     * Validate file descriptor
     */
    static validateFd(fd) {
        if (typeof fd !== 'number') {
            throw new FuseErrno('EINVAL', 'File descriptor must be a number');
        }
        if (!Number.isInteger(fd) || fd < 0) {
            throw new FuseErrno('EINVAL', 'File descriptor must be a non-negative integer');
        }
    }
    /**
     * Validate offset
     */
    static validateOffset(offset) {
        if (typeof offset !== 'bigint') {
            throw new FuseErrno('EINVAL', 'Offset must be a BigInt');
        }
        if (offset < 0n) {
            throw new FuseErrno('EINVAL', 'Offset cannot be negative');
        }
    }
    /**
     * Validate size
     */
    static validateSize(size) {
        if (typeof size !== 'number') {
            throw new FuseErrno('EINVAL', 'Size must be a number');
        }
        if (!Number.isInteger(size) || size < 0) {
            throw new FuseErrno('EINVAL', 'Size must be a non-negative integer');
        }
    }
    /**
     * Validate ArrayBuffer
     */
    static validateArrayBuffer(buffer) {
        if (!(buffer instanceof ArrayBuffer)) {
            throw new FuseErrno('EINVAL', 'Buffer must be an ArrayBuffer');
        }
    }
}
/**
 * Default export with all utilities
 */
export default {
    PathUtils,
    ModeUtils,
    TimeUtils,
    StatUtils,
    DirentUtils,
    BufferUtils,
    ValidationUtils,
};
//# sourceMappingURL=helpers.js.map