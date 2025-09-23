/**
 * @file helpers.ts
 * @brief Utility functions and type conversions for FUSE3 Node.js binding
 *
 * This module provides helper functions for common operations, type conversions,
 * path utilities, and other convenience functions used throughout the FUSE binding.
 */
import type { Ino, Fd, Mode, Uid, Gid, Timestamp, StatResult, DirentEntry, ReaddirResult } from './types.js';
import { DirentType } from './constants.js';
/**
 * Path utility functions
 */
export declare class PathUtils {
    /**
     * Normalize a file path
     */
    static normalize(path: string): string;
    /**
     * Join path components
     */
    static join(...components: string[]): string;
    /**
     * Get directory name from path
     */
    static dirname(path: string): string;
    /**
     * Get base name from path
     */
    static basename(path: string): string;
    /**
     * Check if path is absolute
     */
    static isAbsolute(path: string): boolean;
    /**
     * Validate path for FUSE operations
     */
    static validate(path: string): void;
}
/**
 * File mode utility functions
 */
export declare class ModeUtils {
    /**
     * Check if mode represents a regular file
     */
    static isFile(mode: Mode | number): boolean;
    /**
     * Check if mode represents a directory
     */
    static isDirectory(mode: Mode | number): boolean;
    /**
     * Check if mode represents a symbolic link
     */
    static isSymbolicLink(mode: Mode | number): boolean;
    /**
     * Check if mode represents a block device
     */
    static isBlockDevice(mode: Mode | number): boolean;
    /**
     * Check if mode represents a character device
     */
    static isCharacterDevice(mode: Mode | number): boolean;
    /**
     * Check if mode represents a FIFO
     */
    static isFifo(mode: Mode | number): boolean;
    /**
     * Check if mode represents a socket
     */
    static isSocket(mode: Mode | number): boolean;
    /**
     * Get file type from mode
     */
    static getFileType(mode: Mode | number): DirentType;
    /**
     * Create mode value from type and permissions
     */
    static create(type: DirentType, permissions: number): Mode;
    /**
     * Format mode as human-readable string
     */
    static toString(mode: Mode | number): string;
}
/**
 * Time utility functions
 */
export declare class TimeUtils {
    /**
     * Get current time as nanosecond timestamp
     */
    static now(): Timestamp;
    /**
     * Create timestamp from seconds and nanoseconds
     */
    static fromTimespec(seconds: number, nanoseconds: number): Timestamp;
    /**
     * Convert timestamp to seconds and nanoseconds
     */
    static toTimespec(timestamp: Timestamp): {
        seconds: number;
        nanoseconds: number;
    };
    /**
     * Convert timestamp to Date object
     */
    static toDate(timestamp: Timestamp): Date;
    /**
     * Convert Date to timestamp
     */
    static fromDate(date: Date): Timestamp;
    /**
     * Format timestamp as ISO string
     */
    static toISOString(timestamp: Timestamp): string;
    /**
     * Parse ISO string to timestamp
     */
    static fromISOString(isoString: string): Timestamp;
}
/**
 * Stat utility functions
 */
export declare class StatUtils {
    /**
     * Create a basic stat result
     */
    static create(ino: Ino, mode: Mode, size?: bigint, uid?: Uid, gid?: Gid): StatResult;
    /**
     * Create stat for directory
     */
    static createDirectory(ino: Ino, uid?: Uid, gid?: Gid, mode?: number): StatResult;
    /**
     * Create stat for regular file
     */
    static createFile(ino: Ino, size: bigint, uid?: Uid, gid?: Gid, mode?: number): StatResult;
    /**
     * Update timestamps in stat
     */
    static updateTimes(stat: StatResult, options: {
        atime?: Timestamp;
        mtime?: Timestamp;
        ctime?: Timestamp;
    }): StatResult;
    /**
     * Clone stat result
     */
    static clone(stat: StatResult): StatResult;
}
/**
 * Directory entry utility functions
 */
export declare class DirentUtils {
    /**
     * Create directory entry
     */
    static create(name: string, ino: Ino, type: DirentType, nextOffset?: bigint): DirentEntry;
    /**
     * Create readdir result
     */
    static createReaddirResult(entries: DirentEntry[], hasMore?: boolean, nextOffset?: bigint): ReaddirResult;
    /**
     * Create standard directory entries (. and ..)
     */
    static createStandardEntries(currentIno: Ino, parentIno?: Ino): DirentEntry[];
}
/**
 * Buffer utility functions
 */
export declare class BufferUtils {
    /**
     * Create ArrayBuffer from string
     */
    static fromString(str: string, encoding?: BufferEncoding): ArrayBuffer;
    /**
     * Convert ArrayBuffer to string
     */
    static toString(buffer: ArrayBuffer, encoding?: BufferEncoding): string;
    /**
     * Create zero-filled ArrayBuffer
     */
    static zeros(size: number): ArrayBuffer;
    /**
     * Copy data between ArrayBuffers
     */
    static copy(source: ArrayBuffer, target: ArrayBuffer, targetOffset?: number): number;
    /**
     * Concatenate ArrayBuffers
     */
    static concat(buffers: ArrayBuffer[]): ArrayBuffer;
    /**
     * Slice ArrayBuffer
     */
    static slice(buffer: ArrayBuffer, start?: number, end?: number): ArrayBuffer;
}
/**
 * Validation utility functions
 */
export declare class ValidationUtils {
    /**
     * Validate inode number
     */
    static validateIno(ino: unknown): asserts ino is Ino;
    /**
     * Validate file descriptor
     */
    static validateFd(fd: unknown): asserts fd is Fd;
    /**
     * Validate offset
     */
    static validateOffset(offset: unknown): asserts offset is bigint;
    /**
     * Validate size
     */
    static validateSize(size: unknown): asserts size is number;
    /**
     * Validate ArrayBuffer
     */
    static validateArrayBuffer(buffer: unknown): asserts buffer is ArrayBuffer;
}
/**
 * Default export with all utilities
 */
declare const _default: {
    PathUtils: typeof PathUtils;
    ModeUtils: typeof ModeUtils;
    TimeUtils: typeof TimeUtils;
    StatUtils: typeof StatUtils;
    DirentUtils: typeof DirentUtils;
    BufferUtils: typeof BufferUtils;
    ValidationUtils: typeof ValidationUtils;
};
export default _default;
//# sourceMappingURL=helpers.d.ts.map