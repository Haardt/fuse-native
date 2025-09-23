/**
 * @file time.ts
 * @brief TimeSpec conversion helpers for nanosecond-precision timestamps
 *
 * This module provides utilities for converting between various time formats
 * and nanosecond-precision BigInt timestamps used throughout the FUSE binding.
 */

import type { Timestamp } from './types.js';

// =============================================================================
// Type Definitions
// =============================================================================

/** TimeSpec input formats */
export type TimeSpecInput =
  | bigint // ns since epoch
  | Date // JavaScript Date
  | number // ms since epoch (number) or seconds (if < 1e10)
  | { sec: number; nsec: number } // seconds + nanoseconds
  | { seconds: number; nanoseconds: number } // alternative naming
  | string; // ISO string or "seconds.nanoseconds" format

/** Normalized timespec structure */
export interface TimeSpec {
  /** Seconds since epoch */
  seconds: number;
  /** Nanoseconds within the second (0-999999999) */
  nanoseconds: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Nanoseconds per second */
export const NS_PER_SEC = 1_000_000_000n;

/** Nanoseconds per millisecond */
export const NS_PER_MS = 1_000_000n;

/** Milliseconds per second */
export const MS_PER_SEC = 1000;

/** Threshold to distinguish between seconds and milliseconds when input is number */
export const SEC_MS_THRESHOLD = 1e10;

// =============================================================================
// Core Conversion Functions
// =============================================================================

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
export function toTimestamp(input: TimeSpecInput): Timestamp {
  if (typeof input === 'bigint') {
    return input;
  }

  if (input instanceof Date) {
    return BigInt(input.getTime()) * NS_PER_MS;
  }

  if (typeof input === 'number') {
    // Distinguish between seconds and milliseconds
    if (input < SEC_MS_THRESHOLD) {
      // Treat as seconds
      return (
        BigInt(Math.floor(input)) * NS_PER_SEC +
        BigInt(Math.floor((input % 1) * Number(NS_PER_SEC)))
      );
    } else {
      // Treat as milliseconds
      return BigInt(Math.floor(input)) * NS_PER_MS;
    }
  }

  if (typeof input === 'string') {
    // Try to parse as Date first
    const date = new Date(input);
    if (!isNaN(date.getTime())) {
      return BigInt(date.getTime()) * NS_PER_MS;
    }

    // Try to parse as "seconds.nanoseconds" format
    const match = input.match(/^(\d+)(?:\.(\d{1,9})\d*)?$/);
    if (match) {
      const seconds = BigInt(match[1]!);
      let nanoseconds = 0n;

      if (match[2]) {
        // Pad or truncate nanoseconds to 9 digits
        const nsecStr =
          match[2].length > 9
            ? match[2].substring(0, 9)
            : match[2].padEnd(9, '0');
        nanoseconds = BigInt(nsecStr);
      }

      return seconds * NS_PER_SEC + nanoseconds;
    }

    throw new Error(`Invalid time string format: ${input}`);
  }

  if (typeof input === 'object' && input !== null) {
    // Handle { sec, nsec } format
    if ('sec' in input && 'nsec' in input) {
      return BigInt(input.sec) * NS_PER_SEC + BigInt(input.nsec);
    }

    // Handle { seconds, nanoseconds } format
    if ('seconds' in input && 'nanoseconds' in input) {
      return BigInt(input.seconds) * NS_PER_SEC + BigInt(input.nanoseconds);
    }
  }

  throw new Error(`Unsupported time input format: ${typeof input}`);
}

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
export function toTimeSpec(timestamp: Timestamp): TimeSpec {
  const seconds = Number(timestamp / NS_PER_SEC);
  const nanoseconds = Number(timestamp % NS_PER_SEC);

  return { seconds, nanoseconds };
}

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
export function toTimespec(input: TimeSpecInput): TimeSpec {
  return toTimeSpec(toTimestamp(input));
}

// =============================================================================
// Conversion to Other Formats
// =============================================================================

/**
 * Convert timestamp to JavaScript Date
 * Note: Date has millisecond precision, so nanosecond precision will be lost
 *
 * @param timestamp - Nanosecond timestamp
 * @returns JavaScript Date object
 */
export function toDate(timestamp: Timestamp): Date {
  const ms = Number(timestamp / NS_PER_MS);
  return new Date(ms);
}

/**
 * Convert timestamp to milliseconds since epoch
 * Note: Nanosecond precision will be lost
 *
 * @param timestamp - Nanosecond timestamp
 * @returns Milliseconds since epoch
 */
export function toMilliseconds(timestamp: Timestamp): number {
  return Number(timestamp / NS_PER_MS);
}

/**
 * Convert timestamp to seconds since epoch (with fractional part)
 *
 * @param timestamp - Nanosecond timestamp
 * @returns Seconds since epoch as floating point
 */
export function toSeconds(timestamp: Timestamp): number {
  return Number(timestamp) / Number(NS_PER_SEC);
}

/**
 * Convert timestamp to human-readable string
 *
 * @param timestamp - Nanosecond timestamp
 * @param format - Output format ('iso' | 'timespec' | 'unix')
 * @returns Formatted string
 */
export function toString(
  timestamp: Timestamp,
  format: 'iso' | 'timespec' | 'unix' = 'iso'
): string {
  switch (format) {
    case 'iso':
      return toDate(timestamp).toISOString();

    case 'timespec': {
      const { seconds, nanoseconds } = toTimeSpec(timestamp);
      return `${seconds}.${nanoseconds.toString().padStart(9, '0')}`;
    }

    case 'unix': {
      const { seconds, nanoseconds } = toTimeSpec(timestamp);
      return `${seconds}.${nanoseconds.toString().padStart(9, '0')}`;
    }

    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get current time as nanosecond timestamp
 * Uses high-resolution time when available
 *
 * @returns Current timestamp in nanoseconds
 */
export function now(): Timestamp {
  // Fallback to Date.now() with millisecond precision
  return BigInt(Date.now()) * NS_PER_MS;
}

/**
 * Add nanoseconds to a timestamp
 *
 * @param timestamp - Base timestamp
 * @param nanoseconds - Nanoseconds to add (can be negative)
 * @returns New timestamp
 */
export function addNanoseconds(
  timestamp: Timestamp,
  nanoseconds: bigint
): Timestamp {
  return timestamp + nanoseconds;
}

/**
 * Add milliseconds to a timestamp
 *
 * @param timestamp - Base timestamp
 * @param milliseconds - Milliseconds to add (can be negative)
 * @returns New timestamp
 */
export function addMilliseconds(
  timestamp: Timestamp,
  milliseconds: number
): Timestamp {
  return timestamp + BigInt(milliseconds) * NS_PER_MS;
}

/**
 * Add seconds to a timestamp
 *
 * @param timestamp - Base timestamp
 * @param seconds - Seconds to add (can be negative, can be fractional)
 * @returns New timestamp
 */
export function addSeconds(timestamp: Timestamp, seconds: number): Timestamp {
  const nanoseconds = BigInt(Math.floor(seconds * Number(NS_PER_SEC)));
  return timestamp + nanoseconds;
}

/**
 * Calculate difference between two timestamps in nanoseconds
 *
 * @param later - Later timestamp
 * @param earlier - Earlier timestamp
 * @returns Difference in nanoseconds (later - earlier)
 */
export function diffNanoseconds(later: Timestamp, earlier: Timestamp): bigint {
  return later - earlier;
}

/**
 * Calculate difference between two timestamps in milliseconds
 *
 * @param later - Later timestamp
 * @param earlier - Earlier timestamp
 * @returns Difference in milliseconds
 */
export function diffMilliseconds(later: Timestamp, earlier: Timestamp): number {
  return Number(diffNanoseconds(later, earlier) / NS_PER_MS);
}

/**
 * Calculate difference between two timestamps in seconds
 *
 * @param later - Later timestamp
 * @param earlier - Earlier timestamp
 * @returns Difference in seconds (with fractional part)
 */
export function diffSeconds(later: Timestamp, earlier: Timestamp): number {
  return Number(diffNanoseconds(later, earlier)) / Number(NS_PER_SEC);
}

/**
 * Compare two timestamps
 *
 * @param a - First timestamp
 * @param b - Second timestamp
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compare(a: Timestamp, b: Timestamp): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Check if a timestamp is valid (not negative, not too far in the future)
 *
 * @param timestamp - Timestamp to validate
 * @returns True if timestamp appears valid
 */
export function isValid(timestamp: Timestamp): boolean {
  // Must be non-negative
  if (timestamp < 0n) return false;

  // Must be before year 2262 (BigInt can handle it, but let's be reasonable)
  const year2262 = 9223372036854775807n; // Max safe BigInt nanoseconds
  if (timestamp > year2262) return false;

  return true;
}

/**
 * Round timestamp to specified precision
 *
 * @param timestamp - Input timestamp
 * @param precision - Precision ('second' | 'millisecond' | 'microsecond')
 * @returns Rounded timestamp
 */
export function round(
  timestamp: Timestamp,
  precision: 'second' | 'millisecond' | 'microsecond'
): Timestamp {
  switch (precision) {
    case 'second':
      return (timestamp / NS_PER_SEC) * NS_PER_SEC;

    case 'millisecond':
      return (timestamp / NS_PER_MS) * NS_PER_MS;

    case 'microsecond':
      return (timestamp / 1000n) * 1000n;

    default:
      throw new Error(`Unknown precision: ${precision}`);
  }
}

// =============================================================================
// Constants and Presets
// =============================================================================

/** Unix epoch as BigInt nanoseconds */
export const UNIX_EPOCH: Timestamp = 0n;

/** Common time constants in nanoseconds */
export const TIME_CONSTANTS = {
  NANOSECOND: 1n,
  MICROSECOND: 1_000n,
  MILLISECOND: NS_PER_MS,
  SECOND: NS_PER_SEC,
  MINUTE: NS_PER_SEC * 60n,
  HOUR: NS_PER_SEC * 3600n,
  DAY: NS_PER_SEC * 86400n,
  WEEK: NS_PER_SEC * 604800n,
} as const;

// =============================================================================
// Default Export
// =============================================================================

export default {
  toTimestamp,
  toTimeSpec,
  toTimespec, // Main function as required
  toDate,
  toMilliseconds,
  toSeconds,
  toString,
  now,
  addNanoseconds,
  addMilliseconds,
  addSeconds,
  diffNanoseconds,
  diffMilliseconds,
  diffSeconds,
  compare,
  isValid,
  round,
  UNIX_EPOCH,
  TIME_CONSTANTS,
  NS_PER_SEC,
  NS_PER_MS,
  MS_PER_SEC,
};
