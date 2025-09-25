/**
 * @file time.test.ts
 * @brief Comprehensive tests for nanosecond-precision timestamp handling
 *
 * This test suite validates the time conversion utilities, ensuring
 * nanosecond precision is maintained throughout all conversions.
 */

import {
  toTimespec,
  toTimestamp,
  toTimeSpec,
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
  TIME_CONSTANTS,
  NS_PER_SEC,
  NS_PER_MS,
  UNIX_EPOCH,
  type TimeSpec,
} from '../time.ts';

import type { Timestamp } from '../types.ts';

describe('Time Utilities', () => {
  // Test constants for ns-precision roundtrip testing
  const TEST_TIMESTAMP_NS = 1234567890123456789n;
  const TEST_TIMESTAMP_SEC = 1672531200n;
  const TEST_TIMESTAMP_MS = 1672531200123n;

  describe('toTimestamp()', () => {
    it('should handle BigInt input (pass-through)', () => {
      const input = TEST_TIMESTAMP_NS;
      const result = toTimestamp(input);
      expect(result).toBe(input);
    });

    it('should convert Date to nanosecond timestamp', () => {
      const date = new Date('2023-01-01T00:00:00.123Z');
      const result = toTimestamp(date);
      const expected = BigInt(date.getTime()) * NS_PER_MS;
      expect(result).toBe(expected);
    });

    it('should handle number as milliseconds (large numbers)', () => {
      const ms = 1672531200123;
      const result = toTimestamp(ms);
      const expected = BigInt(ms) * NS_PER_MS;
      expect(result).toBe(expected);
    });

    it('should handle number as seconds (small numbers)', () => {
      const sec = 1672531200.123456789;
      const result = toTimestamp(sec);
      // Should convert to nanoseconds with fractional precision
      expect(Number(result)).toBeCloseTo(sec * Number(NS_PER_SEC));
    });

    it('should handle { sec, nsec } object format', () => {
      const input = { sec: 1672531200, nsec: 123456789 };
      const result = toTimestamp(input);
      const expected = BigInt(input.sec) * NS_PER_SEC + BigInt(input.nsec);
      expect(result).toBe(expected);
    });

    it('should handle { seconds, nanoseconds } object format', () => {
      const input = { seconds: 1672531200, nanoseconds: 123456789 };
      const result = toTimestamp(input);
      const expected =
        BigInt(input.seconds) * NS_PER_SEC + BigInt(input.nanoseconds);
      expect(result).toBe(expected);
    });

    it('should handle ISO string format', () => {
      const isoString = '2023-01-01T00:00:00.123Z';
      const result = toTimestamp(isoString);
      const expected = BigInt(new Date(isoString).getTime()) * NS_PER_MS;
      expect(result).toBe(expected);
    });

    it('should handle "seconds.nanoseconds" string format', () => {
      const timespecString = '1672531200.123456789';
      const result = toTimestamp(timespecString);
      const expected = 1672531200n * NS_PER_SEC + 123456789n;
      expect(result).toBe(expected);
    });

    it('should pad short nanosecond strings', () => {
      const timespecString = '1672531200.123';
      const result = toTimestamp(timespecString);
      const expected = 1672531200n * NS_PER_SEC + 123000000n; // Padded to 9 digits
      expect(result).toBe(expected);
    });

    it('should truncate long nanosecond strings', () => {
      const timespecString = '1672531200.123456789012';
      const result = toTimestamp(timespecString);
      const expected = 1672531200n * NS_PER_SEC + 123456789n; // Truncated to 9 digits
      expect(result).toBe(expected);
    });

    it('should throw error for invalid string format', () => {
      expect(() => toTimestamp('invalid-format')).toThrow(
        'Invalid time string format'
      );
    });

    it('should throw error for unsupported object format', () => {
      expect(() => toTimestamp({ invalid: 'object' } as any)).toThrow(
        'Unsupported time input format'
      );
    });
  });

  describe('toTimeSpec()', () => {
    it('should convert nanosecond timestamp to TimeSpec', () => {
      const timestamp = TEST_TIMESTAMP_NS;
      const result = toTimeSpec(timestamp);

      expect(result.seconds).toBe(Number(timestamp / NS_PER_SEC));
      expect(result.nanoseconds).toBe(Number(timestamp % NS_PER_SEC));
    });

    it('should handle zero timestamp', () => {
      const result = toTimeSpec(UNIX_EPOCH);
      expect(result).toEqual({ seconds: 0, nanoseconds: 0 });
    });

    it('should handle exact second boundaries', () => {
      const timestamp = 1672531200n * NS_PER_SEC;
      const result = toTimeSpec(timestamp);
      expect(result).toEqual({ seconds: 1672531200, nanoseconds: 0 });
    });
  });

  describe('toTimespec() - Main API Function', () => {
    it('should be equivalent to toTimeSpec(toTimestamp())', () => {
      const inputs = [
        TEST_TIMESTAMP_NS,
        new Date('2023-01-01T00:00:00.123Z'),
        1672531200123,
        { sec: 1672531200, nsec: 123456789 },
        '2023-01-01T00:00:00.123Z',
      ];

      inputs.forEach(input => {
        const direct = toTimespec(input);
        const indirect = toTimeSpec(toTimestamp(input));
        expect(direct).toEqual(indirect);
      });
    });
  });

  describe('Nanosecond Precision Roundtrip Tests', () => {
    it('should maintain ns precision through BigInt roundtrip', () => {
      const original = TEST_TIMESTAMP_NS;
      const timespec = toTimeSpec(original);
      const restored =
        BigInt(timespec.seconds) * NS_PER_SEC + BigInt(timespec.nanoseconds);

      expect(restored).toBe(original);
    });

    it('should handle maximum nanosecond values', () => {
      const maxNanos = 999999999n;
      const timestamp = TEST_TIMESTAMP_SEC * NS_PER_SEC + maxNanos;
      const timespec = toTimeSpec(timestamp);
      const restored =
        BigInt(timespec.seconds) * NS_PER_SEC + BigInt(timespec.nanoseconds);

      expect(restored).toBe(timestamp);
      expect(timespec.nanoseconds).toBe(Number(maxNanos));
    });

    it('should preserve precision in timespec string format', () => {
      const original = TEST_TIMESTAMP_NS;
      const timespecString = toString(original, 'timespec');
      const restored = toTimestamp(timespecString);

      expect(restored).toBe(original);
    });

    it('should handle edge case: 1234567890123456789n', () => {
      const testValue = 1234567890123456789n;
      const timespec = toTimeSpec(testValue);
      const restored =
        BigInt(timespec.seconds) * NS_PER_SEC + BigInt(timespec.nanoseconds);

      expect(restored).toBe(testValue);
      expect(timespec.seconds).toBe(1234567890);
      expect(timespec.nanoseconds).toBe(123456789);
    });
  });

  describe('Format Conversion', () => {
    it('should convert to Date (with precision loss warning)', () => {
      const timestamp = TEST_TIMESTAMP_NS;
      const date = toDate(timestamp);

      expect(date).toBeInstanceOf(Date);
      // Precision should be lost to millisecond level
      const expectedMs = Number(timestamp / NS_PER_MS);
      expect(date.getTime()).toBe(expectedMs);
    });

    it('should convert to milliseconds', () => {
      const timestamp = TEST_TIMESTAMP_NS;
      const ms = toMilliseconds(timestamp);

      expect(ms).toBe(Number(timestamp / NS_PER_MS));
    });

    it('should convert to seconds with fractional part', () => {
      const timestamp = TEST_TIMESTAMP_NS;
      const seconds = toSeconds(timestamp);

      expect(seconds).toBeCloseTo(Number(timestamp) / Number(NS_PER_SEC));
    });

    describe('toString() formatting', () => {
      it('should format as ISO string', () => {
        const timestamp = 1672531200123000000n; // Known value for predictable ISO string
        const result = toString(timestamp, 'iso');
        expect(result).toBe('2023-01-01T00:00:00.123Z');
      });

      it('should format as timespec string', () => {
        const timestamp = 1672531200123456789n;
        const result = toString(timestamp, 'timespec');
        expect(result).toBe('1672531200.123456789');
      });

      it('should format as unix timestamp', () => {
        const timestamp = 1672531200123456789n;
        const result = toString(timestamp, 'unix');
        expect(result).toBe('1672531200.123456789');
      });

      it('should throw error for unknown format', () => {
        expect(() => toString(TEST_TIMESTAMP_NS, 'invalid' as any)).toThrow(
          'Unknown format'
        );
      });
    });
  });

  describe('Time Arithmetic', () => {
    const baseTime = 1672531200000000000n;

    it('should add nanoseconds', () => {
      const result = addNanoseconds(baseTime, 123456789n);
      expect(result).toBe(baseTime + 123456789n);
    });

    it('should add milliseconds', () => {
      const result = addMilliseconds(baseTime, 123);
      expect(result).toBe(baseTime + 123n * NS_PER_MS);
    });

    it('should add seconds (with fractional)', () => {
      const result = addSeconds(baseTime, 1.5);
      expect(result).toBe(baseTime + 1500000000n);
    });

    it('should handle negative additions', () => {
      const result = addSeconds(baseTime, -1);
      expect(result).toBe(baseTime - NS_PER_SEC);
    });

    describe('Time Differences', () => {
      const earlier = 1672531200000000000n;
      const later = 1672531261123456789n; // 61.123456789 seconds later

      it('should calculate nanosecond differences', () => {
        const diff = diffNanoseconds(later, earlier);
        expect(diff).toBe(later - earlier);
      });

      it('should calculate millisecond differences', () => {
        const diff = diffMilliseconds(later, earlier);
        expect(diff).toBe(Number((later - earlier) / NS_PER_MS));
      });

      it('should calculate second differences', () => {
        const diff = diffSeconds(later, earlier);
        expect(diff).toBeCloseTo(61.123456789, 6);
      });

      it('should handle negative differences', () => {
        const diff = diffSeconds(earlier, later);
        expect(diff).toBeCloseTo(-61.123456789, 6);
      });
    });
  });

  describe('Comparison and Validation', () => {
    it('should compare timestamps correctly', () => {
      const a = 1000000000n;
      const b = 2000000000n;
      const c = 1000000000n;

      expect(compare(a, b)).toBe(-1);
      expect(compare(b, a)).toBe(1);
      expect(compare(a, c)).toBe(0);
    });

    describe('Validation', () => {
      it('should validate positive timestamps', () => {
        expect(isValid(TEST_TIMESTAMP_NS)).toBe(true);
        expect(isValid(UNIX_EPOCH)).toBe(true);
      });

      it('should reject negative timestamps', () => {
        expect(isValid(-1n)).toBe(false);
      });

      it('should reject extremely large timestamps', () => {
        const tooLarge = 9223372036854775808n; // Beyond reasonable range
        expect(isValid(tooLarge)).toBe(false);
      });
    });

    describe('Rounding', () => {
      const timestamp = 1672531200123456789n;

      it('should round to seconds', () => {
        const result = round(timestamp, 'second');
        expect(result).toBe(1672531200000000000n);
      });

      it('should round to milliseconds', () => {
        const result = round(timestamp, 'millisecond');
        expect(result).toBe(1672531200123000000n);
      });

      it('should round to microseconds', () => {
        const result = round(timestamp, 'microsecond');
        expect(result).toBe(1672531200123456000n);
      });

      it('should throw error for unknown precision', () => {
        expect(() => round(timestamp, 'invalid' as any)).toThrow(
          'Unknown precision'
        );
      });
    });
  });

  describe('Utility Functions', () => {
    it('should get current time', () => {
      const before = BigInt(Date.now()) * NS_PER_MS;
      const current = now();
      const after = BigInt(Date.now()) * NS_PER_MS;

      expect(current).toBeGreaterThanOrEqual(before);
      expect(current).toBeLessThanOrEqual(after);
      expect(isValid(current)).toBe(true);
    });

    it('should provide time constants', () => {
      expect(TIME_CONSTANTS.NANOSECOND).toBe(1n);
      expect(TIME_CONSTANTS.MICROSECOND).toBe(1000n);
      expect(TIME_CONSTANTS.MILLISECOND).toBe(NS_PER_MS);
      expect(TIME_CONSTANTS.SECOND).toBe(NS_PER_SEC);
      expect(TIME_CONSTANTS.MINUTE).toBe(NS_PER_SEC * 60n);
      expect(TIME_CONSTANTS.HOUR).toBe(NS_PER_SEC * 3600n);
      expect(TIME_CONSTANTS.DAY).toBe(NS_PER_SEC * 86400n);
      expect(TIME_CONSTANTS.WEEK).toBe(NS_PER_SEC * 604800n);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle UNIX_EPOCH constant', () => {
      expect(UNIX_EPOCH).toBe(0n);
      expect(isValid(UNIX_EPOCH)).toBe(true);
    });

    it('should handle very large but valid timestamps', () => {
      const year2050 = 2524608000n * NS_PER_SEC; // Approximate timestamp for 2050
      expect(isValid(year2050)).toBe(true);

      const timespec = toTimeSpec(year2050);
      const restored =
        BigInt(timespec.seconds) * NS_PER_SEC + BigInt(timespec.nanoseconds);
      expect(restored).toBe(year2050);
    });

    it('should handle boundary conditions in string parsing', () => {
      // Test with exactly 9 nanosecond digits
      const result1 = toTimestamp('1672531200.123456789');
      expect(result1).toBe(1672531200123456789n);

      // Test with 1 nanosecond digit (should pad)
      const result2 = toTimestamp('1672531200.1');
      expect(result2).toBe(1672531200100000000n);

      // Test with no fractional part
      const result3 = toTimestamp('1672531200');
      expect(result3).toBe(1672531200000000000n);
    });

    it('should maintain precision across multiple conversions', () => {
      const original = TEST_TIMESTAMP_NS;

      // Convert through multiple formats
      const timespec = toTimespec(original);
      const backToTimestamp = toTimestamp(timespec);
      const timespecString = toString(backToTimestamp, 'timespec');
      const finalTimestamp = toTimestamp(timespecString);

      expect(finalTimestamp).toBe(original);
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle large batch conversions efficiently', () => {
      const count = 1000;
      const timestamps = Array.from(
        { length: count },
        (_, i) => TEST_TIMESTAMP_NS + BigInt(i) * 1000000n
      );

      const start = process.hrtime.bigint();

      const timespecs = timestamps.map(toTimeSpec);
      const restored = timespecs.map(
        ts => BigInt(ts.seconds) * NS_PER_SEC + BigInt(ts.nanoseconds)
      );

      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1000000;

      // Should complete reasonably quickly (adjust threshold as needed)
      expect(durationMs).toBeLessThan(100);

      // Verify all conversions were accurate
      restored.forEach((ts, i) => {
        expect(ts).toBe(timestamps[i]);
      });
    });
  });

  describe('Type Safety', () => {
    it('should work with branded Timestamp type', () => {
      const timestamp: Timestamp = TEST_TIMESTAMP_NS;
      const timespec: TimeSpec = toTimeSpec(timestamp);

      expect(typeof timespec.seconds).toBe('number');
      expect(typeof timespec.nanoseconds).toBe('number');
    });

    it('should accept all documented input types', () => {
      // This test mainly ensures TypeScript compilation succeeds
      const inputs = [
        1672531200123456789n,
        new Date(),
        1672531200123,
        1672531200,
        { sec: 1672531200, nsec: 123456789 },
        { seconds: 1672531200, nanoseconds: 123456789 },
        '2023-01-01T00:00:00.123Z',
        '1672531200.123456789',
      ];

      inputs.forEach(input => {
        expect(() => toTimespec(input)).not.toThrow();
      });
    });
  });
});
