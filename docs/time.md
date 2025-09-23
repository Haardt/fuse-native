# Time Handling in FUSE Native

This document describes the nanosecond-precision timestamp handling in the FUSE Native binding.

## Overview

The FUSE Native binding provides nanosecond-precision timestamp support throughout the API, using BigInt values to represent nanoseconds since the Unix epoch. This ensures no precision loss for high-resolution timestamps while maintaining compatibility with standard JavaScript time formats.

## Core Concepts

### Timestamp Type

All timestamps in the FUSE Native binding are represented as:

```typescript
type Timestamp = bigint; // Nanoseconds since Unix epoch (1970-01-01T00:00:00.000Z)
```

### TimeSpec Structure

For interoperability with C/C++ code, timestamps can be converted to/from TimeSpec format:

```typescript
interface TimeSpec {
  seconds: number;      // Seconds since epoch
  nanoseconds: number;  // Nanoseconds within the second (0-999999999)
}
```

## Usage Examples

### Basic Conversion

```typescript
import { toTimespec, toTimestamp, now } from 'fuse-native';

// Get current time with nanosecond precision
const currentTime = now();
console.log(currentTime); // 1672531200123456789n

// Convert to TimeSpec format
const timespec = toTimespec(currentTime);
console.log(timespec); // { seconds: 1672531200, nanoseconds: 123456789 }

// Convert from various formats
const timestamp1 = toTimestamp(new Date('2023-01-01T00:00:00.000Z'));
const timestamp2 = toTimestamp(1672531200000); // milliseconds
const timestamp3 = toTimestamp({ sec: 1672531200, nsec: 123456789 });
const timestamp4 = toTimestamp('2023-01-01T00:00:00.000Z');
```

### Supported Input Formats

The `toTimespec()` function accepts multiple input formats:

```typescript
// BigInt nanoseconds (pass-through)
toTimespec(1672531200123456789n)

// JavaScript Date object (ms precision)
toTimespec(new Date('2023-01-01T00:00:00.123Z'))

// Number as milliseconds (if >= 1e10) or seconds (if < 1e10)
toTimespec(1672531200000)  // milliseconds
toTimespec(1672531200)     // seconds

// TimeSpec object variants
toTimespec({ sec: 1672531200, nsec: 123456789 })
toTimespec({ seconds: 1672531200, nanoseconds: 123456789 })

// String formats
toTimespec('2023-01-01T00:00:00.000Z')  // ISO string
toTimespec('1672531200.123456789')       // "seconds.nanoseconds"
```

### Working with File Timestamps

```typescript
import { StatResult, toTimespec, now, addSeconds } from 'fuse-native';

// In your FUSE operation handlers
const operations = {
  async getattr(ino: Ino): Promise<{ attr: StatResult; timeout: number }> {
    const currentTime = now();
    
    return {
      attr: {
        ino,
        mode: 0o644,
        nlink: 1,
        uid: 1000,
        gid: 1000,
        size: 1024n,
        atime: currentTime,
        mtime: addSeconds(currentTime, -3600), // 1 hour ago
        ctime: currentTime,
        // ... other fields
      },
      timeout: 1.0
    };
  },

  async setattr(ino: Ino, attr: Partial<StatResult>): Promise<{ attr: StatResult; timeout: number }> {
    // Handle timestamp updates
    if (attr.atime !== undefined) {
      // Convert any input format to our internal timestamp
      const accessTime = toTimestamp(attr.atime);
      // ... update access time
    }
    
    if (attr.mtime !== undefined) {
      const modifyTime = toTimestamp(attr.mtime);
      // ... update modify time
    }
    
    // Return updated attributes
    return { attr: updatedAttr, timeout: 1.0 };
  }
};
```

## Time Utilities

### Arithmetic Operations

```typescript
import { 
  addNanoseconds, 
  addMilliseconds, 
  addSeconds,
  diffNanoseconds,
  diffSeconds
} from 'fuse-native';

const baseTime = now();

// Add time
const futureTime = addSeconds(baseTime, 60);        // 60 seconds later
const preciseFuture = addNanoseconds(baseTime, 1234567n); // precise addition

// Calculate differences
const diff = diffSeconds(futureTime, baseTime);     // 60.0
const preciseDiff = diffNanoseconds(futureTime, baseTime); // 60000000000n
```

### Formatting and Display

```typescript
import { toString, toDate, toSeconds } from 'fuse-native';

const timestamp = 1672531200123456789n;

// Convert to various formats
const isoString = toString(timestamp, 'iso');      // "2023-01-01T00:00:00.123Z"
const timespecStr = toString(timestamp, 'timespec'); // "1672531200.123456789"
const unixStr = toString(timestamp, 'unix');       // "1672531200.123456789"

// Convert to JavaScript Date (loses nanosecond precision)
const date = toDate(timestamp);  // Date object
const seconds = toSeconds(timestamp); // 1672531200.123456789
```

### Validation and Comparison

```typescript
import { isValid, compare, round } from 'fuse-native';

const timestamp1 = 1672531200123456789n;
const timestamp2 = 1672531200987654321n;

// Validate timestamps
console.log(isValid(timestamp1)); // true
console.log(isValid(-1n));        // false (negative)

// Compare timestamps
const result = compare(timestamp1, timestamp2); // -1 (timestamp1 < timestamp2)

// Round to different precisions
const rounded = round(timestamp1, 'millisecond'); // 1672531200123000000n
```

## Precision Considerations

### JavaScript Date Limitations

JavaScript `Date` objects have millisecond precision. When converting from nanosecond timestamps to `Date`, precision will be lost:

```typescript
const nanoTimestamp = 1672531200123456789n; // 789 nanoseconds
const date = toDate(nanoTimestamp);
const backToNano = toTimestamp(date);       // 1672531200123000000n (789ns lost)
```

### Number Precision Limits

JavaScript numbers have 53-bit precision. For timestamps as numbers:

```typescript
// Safe: seconds since epoch (fits in 53 bits until ~2285 AD)
const seconds = toSeconds(timestamp); // Safe

// Unsafe: nanoseconds since epoch (exceeds 53-bit precision)
const nanosAsNumber = Number(timestamp); // May lose precision!
```

### Best Practices

1. **Always use BigInt** for nanosecond timestamps
2. **Use TimeSpec format** when interfacing with C/C++ code
3. **Document precision loss** when converting to Date or milliseconds
4. **Validate timestamps** before using them in calculations

## Constants

The time module provides useful constants:

```typescript
import { TIME_CONSTANTS, NS_PER_SEC, NS_PER_MS } from 'fuse-native';

// Time constants in nanoseconds
TIME_CONSTANTS.NANOSECOND   // 1n
TIME_CONSTANTS.MICROSECOND  // 1_000n
TIME_CONSTANTS.MILLISECOND  // 1_000_000n
TIME_CONSTANTS.SECOND       // 1_000_000_000n
TIME_CONSTANTS.MINUTE       // 60_000_000_000n
TIME_CONSTANTS.HOUR         // 3_600_000_000_000n
TIME_CONSTANTS.DAY          // 86_400_000_000_000n
TIME_CONSTANTS.WEEK         // 604_800_000_000_000n

// Conversion factors
NS_PER_SEC  // 1_000_000_000n
NS_PER_MS   // 1_000_000n
```

## C++ Integration

The binding automatically converts between JavaScript BigInt timestamps and C++ `timespec` structures:

```cpp
// In C++ N-API bridge code
#include "timespec_codec.h"

// Convert JS BigInt to timespec
napi_value js_timestamp = ...; // BigInt from JavaScript
struct timespec ts;
if (ns_bigint_to_timespec(env, js_timestamp, &ts)) {
    // Use ts.tv_sec and ts.tv_nsec
}

// Convert timespec to JS BigInt
struct timespec ts = { .tv_sec = 1672531200, .tv_nsec = 123456789 };
napi_value js_result = timespec_to_ns_bigint(env, ts);
// Returns BigInt(1672531200123456789)
```

## Performance Notes

- BigInt arithmetic is slower than regular number arithmetic
- For high-frequency operations, consider caching converted values
- TimeSpec conversion involves division and modulo operations
- Direct BigInt comparisons are fastest for timestamp ordering

## Migration from Millisecond APIs

If migrating from millisecond-precision APIs:

```typescript
// Old millisecond-based code
const oldTimestamp = Date.now();        // 1672531200123
const oldDate = new Date(oldTimestamp); // Date object

// New nanosecond-based code
const newTimestamp = now();                    // 1672531200123456789n
const compatTimestamp = toTimestamp(oldDate); // 1672531200123000000n
const backToDate = toDate(newTimestamp);      // Date object (precision loss)
```

## Error Handling

The time utilities throw descriptive errors for invalid inputs:

```typescript
try {
  const result = toTimespec("invalid-format");
} catch (error) {
  console.error(error.message); // "Invalid time string format: invalid-format"
}

try {
  const result = toTimespec({ invalid: "object" });
} catch (error) {
  console.error(error.message); // "Unsupported time input format: object"
}
```

## See Also

- [API Reference](api.md) - Complete API documentation
- [Types Reference](types.md) - TypeScript type definitions
- [Performance Guide](performance.md) - Performance optimization tips