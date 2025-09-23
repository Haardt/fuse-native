/**
 * @file timespec_codec.h
 * @brief Timespec codec header for nanosecond-precision timestamp handling
 * 
 * This header defines utilities for converting between timespec structures
 * and nanosecond BigInt timestamps, providing high-precision time handling
 * for FUSE operations.
 */

#ifndef TIMESPEC_CODEC_H
#define TIMESPEC_CODEC_H

#include <napi.h>
#include <sys/types.h>
#include <time.h>
#include <cstdint>
#include <string>

namespace fuse_native {

/**
 * Time constants
 */
constexpr uint64_t NS_PER_SEC = 1000000000ULL;   // Nanoseconds per second
constexpr uint64_t NS_PER_MS = 1000000ULL;       // Nanoseconds per millisecond
constexpr uint64_t MS_PER_SEC = 1000ULL;         // Milliseconds per second

/**
 * Convert timespec to nanoseconds since epoch (BigInt)
 * @param env N-API environment
 * @param ts timespec structure
 * @return N-API BigInt value representing nanoseconds since epoch
 */
napi_value timespec_to_ns_bigint(napi_env env, const struct timespec& ts);

/**
 * Convert nanoseconds BigInt to timespec
 * @param env N-API environment
 * @param ns_bigint N-API BigInt value (nanoseconds since epoch)
 * @param ts Pointer to timespec structure to fill
 * @return true if conversion succeeded
 */
bool ns_bigint_to_timespec(napi_env env, napi_value ns_bigint, struct timespec* ts);

/**
 * Get current time as timespec
 * @param ts Pointer to timespec structure to fill
 */
void get_current_timespec(struct timespec* ts);

/**
 * Get current time as nanosecond BigInt
 * @param env N-API environment
 * @return N-API BigInt value representing current time in nanoseconds since epoch
 */
napi_value get_current_ns_bigint(napi_env env);

/**
 * Convert JavaScript Date to timespec
 * @param env N-API environment
 * @param date_val N-API Date value
 * @param ts Pointer to timespec structure to fill
 * @return true if conversion succeeded
 */
bool date_to_timespec(napi_env env, napi_value date_val, struct timespec* ts);

/**
 * Convert timespec to JavaScript Date
 * @param env N-API environment
 * @param ts timespec structure
 * @return N-API Date value
 */
napi_value timespec_to_date(napi_env env, const struct timespec& ts);

/**
 * Add/subtract nanoseconds from timespec
 * @param ts Pointer to timespec structure to modify
 * @param ns Nanoseconds to add (positive) or subtract (negative)
 */
void timespec_add_ns(struct timespec* ts, int64_t ns);

/**
 * Compare two timespec values
 * @param a First timespec
 * @param b Second timespec
 * @return -1 if a < b, 0 if a == b, 1 if a > b
 */
int timespec_compare(const struct timespec& a, const struct timespec& b);

/**
 * Calculate difference between two timespec values in nanoseconds
 * @param later Later timespec
 * @param earlier Earlier timespec
 * @return Difference in nanoseconds (later - earlier)
 */
int64_t timespec_diff_ns(const struct timespec& later, const struct timespec& earlier);

/**
 * Check if timespec is valid
 * @param ts timespec structure to validate
 * @return true if timespec is valid
 */
bool is_valid_timespec(const struct timespec& ts);

/**
 * Normalize timespec (handle overflow in nanoseconds)
 * @param ts Pointer to timespec structure to normalize
 */
void normalize_timespec(struct timespec* ts);

/**
 * Create timespec from seconds and nanoseconds
 * @param sec Seconds
 * @param nsec Nanoseconds
 * @return Normalized timespec structure
 */
struct timespec make_timespec(time_t sec, long nsec);

/**
 * Zero-initialize timespec
 * @param ts Pointer to timespec structure to zero
 */
void zero_timespec(struct timespec* ts);

/**
 * Copy timespec
 * @param src Source timespec
 * @param dst Destination timespec pointer
 */
void copy_timespec(const struct timespec& src, struct timespec* dst);

/**
 * Convert timespec to human-readable string (for debugging)
 * @param ts timespec structure
 * @return String representation in format "seconds.nanoseconds"
 */
std::string timespec_to_string(const struct timespec& ts);

/**
 * Parse timespec from string representation
 * @param str String in format "seconds.nanoseconds"
 * @param ts Pointer to timespec structure to fill
 * @return true if parsing succeeded
 */
bool string_to_timespec(const std::string& str, struct timespec* ts);

/**
 * High-precision sleep using timespec
 * @param duration Sleep duration as timespec
 */
void timespec_sleep(const struct timespec& duration);

/**
 * Get resolution of the system clock
 * @param resolution Pointer to timespec to store resolution
 * @return true if successful
 */
bool get_clock_resolution(struct timespec* resolution);

/**
 * Template helper for timespec operations
 */
template<typename T>
struct TimespecConverter {
    static_assert(std::is_arithmetic_v<T>, "Type must be arithmetic");
    
    /**
     * Convert numeric value to timespec (assuming seconds)
     */
    static struct timespec from_seconds(T seconds) {
        struct timespec ts;
        ts.tv_sec = static_cast<time_t>(seconds);
        ts.tv_nsec = static_cast<long>((seconds - ts.tv_sec) * NS_PER_SEC);
        normalize_timespec(&ts);
        return ts;
    }
    
    /**
     * Convert timespec to numeric seconds
     */
    static T to_seconds(const struct timespec& ts) {
        return static_cast<T>(ts.tv_sec) + static_cast<T>(ts.tv_nsec) / static_cast<T>(NS_PER_SEC);
    }
};

/**
 * Convenience macros for timespec operations
 */
#define TIMESPEC_TO_NS(ts) \
    (static_cast<uint64_t>((ts).tv_sec) * NS_PER_SEC + static_cast<uint64_t>((ts).tv_nsec))

#define NS_TO_TIMESPEC(ns, ts_ptr) do { \
    (ts_ptr)->tv_sec = static_cast<time_t>((ns) / NS_PER_SEC); \
    (ts_ptr)->tv_nsec = static_cast<long>((ns) % NS_PER_SEC); \
} while(0)

#define TIMESPEC_ZERO(ts_ptr) do { \
    (ts_ptr)->tv_sec = 0; \
    (ts_ptr)->tv_nsec = 0; \
} while(0)

} // namespace fuse_native

#endif // TIMESPEC_CODEC_H