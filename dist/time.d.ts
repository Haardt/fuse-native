/**
 * @file time.ts
 * @brief TimeSpec conversion helpers for nanosecond-precision timestamps
 *
 * This module provides utilities for converting between various time formats
 * and nanosecond-precision BigInt timestamps used throughout the FUSE binding.
 */
import type { Timestamp } from './types.js';
/** TimeSpec input formats */
export type TimeSpecInput = bigint | Date | number | {
    sec: number;
    nsec: number;
} | {
    seconds: number;
    nanoseconds: number;
} | string;
/** Normalized timespec structure */
export interface TimeSpec {
    /** Seconds since epoch */
    seconds: number;
    /** Nanoseconds within the second (0-999999999) */
    nanoseconds: number;
}
/** Nanoseconds per second */
export declare const NS_PER_SEC = 1000000000n;
/** Nanoseconds per millisecond */
export declare const NS_PER_MS = 1000000n;
/** Milliseconds per second */
export declare const MS_PER_SEC = 1000;
/** Threshold to distinguish between seconds and milliseconds when input is number */
export declare const SEC_MS_THRESHOLD = 10000000000;
/**
 * Convert various time formats to nanosecond-precision BigInt timestamp
 *
 * @param input - Time in various formats
 * @returns Nanosecond timestamp as BigInt
 *
 * @example
 * ```typescript
 * // From BigInt (pass-through)
 * toTimestamp(1234567890123456789n) // 1234567890123456789n
 *
 * // From Date
 * toTimestamp(new Date('2023-01-01T00:00:00.000Z')) // 1672531200000000000n
 *
 * // From number (milliseconds)
 * toTimestamp(1672531200000) // 1672531200000000000n
 *
 * // From number (seconds, if < 1e10)
 * toTimestamp(1672531200) // 1672531200000000000n
 *
 * // From timespec object
 * toTimestamp({ sec: 1672531200, nsec: 123456789 }) // 1672531200123456789n
 *
 * // From ISO string
 * toTimestamp('2023-01-01T00:00:00.000Z') // 1672531200000000000n
 * ```
 */
export declare function toTimestamp(input: TimeSpecInput): Timestamp;
/**
 * Convert nanosecond timestamp to TimeSpec structure
 *
 * @param timestamp - Nanosecond timestamp
 * @returns TimeSpec with seconds and nanoseconds
 *
 * @example
 * ```typescript
 * toTimeSpec(1672531200123456789n)
 * // Returns: { seconds: 1672531200, nanoseconds: 123456789 }
 * ```
 */
export declare function toTimeSpec(timestamp: Timestamp): TimeSpec;
/**
 * Main conversion function that accepts any time input and returns TimeSpec
 * This is the primary function mentioned in the AGENTS.md requirements
 *
 * @param input - Time in various formats
 * @returns Normalized TimeSpec structure
 *
 * @example
 * ```typescript
 * // All these return equivalent TimeSpec objects:
 * toTimespec(1672531200123456789n)
 * toTimespec(new Date('2023-01-01T00:00:00.123456789Z'))
 * toTimespec({ sec: 1672531200, nsec: 123456789 })
 * toTimespec('1672531200.123456789')
 * ```
 */
export declare function toTimespec(input: TimeSpecInput): TimeSpec;
/**
 * Convert timestamp to JavaScript Date
 * Note: Date has millisecond precision, so nanosecond precision will be lost
 *
 * @param timestamp - Nanosecond timestamp
 * @returns JavaScript Date object
 */
export declare function toDate(timestamp: Timestamp): Date;
/**
 * Convert timestamp to milliseconds since epoch
 * Note: Nanosecond precision will be lost
 *
 * @param timestamp - Nanosecond timestamp
 * @returns Milliseconds since epoch
 */
export declare function toMilliseconds(timestamp: Timestamp): number;
/**
 * Convert timestamp to seconds since epoch (with fractional part)
 *
 * @param timestamp - Nanosecond timestamp
 * @returns Seconds since epoch as floating point
 */
export declare function toSeconds(timestamp: Timestamp): number;
/**
 * Convert timestamp to human-readable string
 *
 * @param timestamp - Nanosecond timestamp
 * @param format - Output format ('iso' | 'timespec' | 'unix')
 * @returns Formatted string
 */
export declare function toString(timestamp: Timestamp, format?: 'iso' | 'timespec' | 'unix'): string;
/**
 * Get current time as nanosecond timestamp
 * Uses high-resolution time when available
 *
 * @returns Current timestamp in nanoseconds
 */
export declare function now(): Timestamp;
/**
 * Add nanoseconds to a timestamp
 *
 * @param timestamp - Base timestamp
 * @param nanoseconds - Nanoseconds to add (can be negative)
 * @returns New timestamp
 */
export declare function addNanoseconds(timestamp: Timestamp, nanoseconds: bigint): Timestamp;
/**
 * Add milliseconds to a timestamp
 *
 * @param timestamp - Base timestamp
 * @param milliseconds - Milliseconds to add (can be negative)
 * @returns New timestamp
 */
export declare function addMilliseconds(timestamp: Timestamp, milliseconds: number): Timestamp;
/**
 * Add seconds to a timestamp
 *
 * @param timestamp - Base timestamp
 * @param seconds - Seconds to add (can be negative, can be fractional)
 * @returns New timestamp
 */
export declare function addSeconds(timestamp: Timestamp, seconds: number): Timestamp;
/**
 * Calculate difference between two timestamps in nanoseconds
 *
 * @param later - Later timestamp
 * @param earlier - Earlier timestamp
 * @returns Difference in nanoseconds (later - earlier)
 */
export declare function diffNanoseconds(later: Timestamp, earlier: Timestamp): bigint;
/**
 * Calculate difference between two timestamps in milliseconds
 *
 * @param later - Later timestamp
 * @param earlier - Earlier timestamp
 * @returns Difference in milliseconds
 */
export declare function diffMilliseconds(later: Timestamp, earlier: Timestamp): number;
/**
 * Calculate difference between two timestamps in seconds
 *
 * @param later - Later timestamp
 * @param earlier - Earlier timestamp
 * @returns Difference in seconds (with fractional part)
 */
export declare function diffSeconds(later: Timestamp, earlier: Timestamp): number;
/**
 * Compare two timestamps
 *
 * @param a - First timestamp
 * @param b - Second timestamp
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export declare function compare(a: Timestamp, b: Timestamp): -1 | 0 | 1;
/**
 * Check if a timestamp is valid (not negative, not too far in the future)
 *
 * @param timestamp - Timestamp to validate
 * @returns True if timestamp appears valid
 */
export declare function isValid(timestamp: Timestamp): boolean;
/**
 * Round timestamp to specified precision
 *
 * @param timestamp - Input timestamp
 * @param precision - Precision ('second' | 'millisecond' | 'microsecond')
 * @returns Rounded timestamp
 */
export declare function round(timestamp: Timestamp, precision: 'second' | 'millisecond' | 'microsecond'): Timestamp;
/** Unix epoch as BigInt nanoseconds */
export declare const UNIX_EPOCH: Timestamp;
/** Common time constants in nanoseconds */
export declare const TIME_CONSTANTS: {
    readonly NANOSECOND: 1n;
    readonly MICROSECOND: 1000n;
    readonly MILLISECOND: 1000000n;
    readonly SECOND: 1000000000n;
    readonly MINUTE: bigint;
    readonly HOUR: bigint;
    readonly DAY: bigint;
    readonly WEEK: bigint;
};
declare const _default: {
    toTimestamp: typeof toTimestamp;
    toTimeSpec: typeof toTimeSpec;
    toTimespec: typeof toTimespec;
    toDate: typeof toDate;
    toMilliseconds: typeof toMilliseconds;
    toSeconds: typeof toSeconds;
    toString: typeof toString;
    now: typeof now;
    addNanoseconds: typeof addNanoseconds;
    addMilliseconds: typeof addMilliseconds;
    addSeconds: typeof addSeconds;
    diffNanoseconds: typeof diffNanoseconds;
    diffMilliseconds: typeof diffMilliseconds;
    diffSeconds: typeof diffSeconds;
    compare: typeof compare;
    isValid: typeof isValid;
    round: typeof round;
    UNIX_EPOCH: bigint;
    TIME_CONSTANTS: {
        readonly NANOSECOND: 1n;
        readonly MICROSECOND: 1000n;
        readonly MILLISECOND: 1000000n;
        readonly SECOND: 1000000000n;
        readonly MINUTE: bigint;
        readonly HOUR: bigint;
        readonly DAY: bigint;
        readonly WEEK: bigint;
    };
    NS_PER_SEC: bigint;
    NS_PER_MS: bigint;
    MS_PER_SEC: number;
};
export default _default;
//# sourceMappingURL=time.d.ts.map