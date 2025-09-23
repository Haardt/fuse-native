/**
 * @file timespec_codec.cc
 * @brief Timespec codec implementation for nanosecond-precision timestamp handling
 * 
 * This file implements utilities for converting between timespec structures
 * and nanosecond BigInt timestamps, providing high-precision time handling
 * for FUSE operations.
 */

#include "timespec_codec.h"
#include "napi_bigint.h"
#include <chrono>
#include <cstring>

namespace fuse_native {

/**
 * Convert timespec to nanoseconds since epoch (BigInt)
 */
napi_value timespec_to_ns_bigint(napi_env env, const struct timespec& ts) {
    // Calculate nanoseconds since epoch
    uint64_t ns_epoch = static_cast<uint64_t>(ts.tv_sec) * NS_PER_SEC + 
                        static_cast<uint64_t>(ts.tv_nsec);
    
    return u64_to_bigint(env, ns_epoch);
}

/**
 * Convert nanoseconds BigInt to timespec
 */
bool ns_bigint_to_timespec(napi_env env, napi_value ns_bigint, struct timespec* ts) {
    if (!ts) {
        return false;
    }
    
    uint64_t ns_epoch;
    if (!bigint_to_u64(env, ns_bigint, &ns_epoch)) {
        return false;
    }
    
    ts->tv_sec = static_cast<time_t>(ns_epoch / NS_PER_SEC);
    ts->tv_nsec = static_cast<long>(ns_epoch % NS_PER_SEC);
    
    return true;
}

/**
 * Get current time as timespec
 */
void get_current_timespec(struct timespec* ts) {
    if (!ts) {
        return;
    }
    
    auto now = std::chrono::high_resolution_clock::now();
    auto duration = now.time_since_epoch();
    auto seconds = std::chrono::duration_cast<std::chrono::seconds>(duration);
    auto nanoseconds = std::chrono::duration_cast<std::chrono::nanoseconds>(duration - seconds);
    
    ts->tv_sec = static_cast<time_t>(seconds.count());
    ts->tv_nsec = static_cast<long>(nanoseconds.count());
}

/**
 * Get current time as nanosecond BigInt
 */
napi_value get_current_ns_bigint(napi_env env) {
    struct timespec ts;
    get_current_timespec(&ts);
    return timespec_to_ns_bigint(env, ts);
}

/**
 * Convert JavaScript Date to timespec
 */
bool date_to_timespec(napi_env env, napi_value date_val, struct timespec* ts) {
    if (!ts) {
        return false;
    }
    
    // Check if it's a Date object
    bool is_date = false;
    napi_status status = napi_is_date(env, date_val, &is_date);
    if (status != napi_ok || !is_date) {
        return false;
    }
    
    // Get milliseconds since epoch
    double ms_epoch;
    status = napi_get_date_value(env, date_val, &ms_epoch);
    if (status != napi_ok) {
        return false;
    }
    
    // Convert to timespec
    ts->tv_sec = static_cast<time_t>(ms_epoch / MS_PER_SEC);
    ts->tv_nsec = static_cast<long>((ms_epoch - (ts->tv_sec * MS_PER_SEC)) * NS_PER_MS);
    
    return true;
}

/**
 * Convert timespec to JavaScript Date
 */
napi_value timespec_to_date(napi_env env, const struct timespec& ts) {
    // Convert to milliseconds since epoch
    double ms_epoch = static_cast<double>(ts.tv_sec) * MS_PER_SEC + 
                      static_cast<double>(ts.tv_nsec) / NS_PER_MS;
    
    napi_value date_val;
    napi_status status = napi_create_date(env, ms_epoch, &date_val);
    if (status != napi_ok) {
        return nullptr;
    }
    
    return date_val;
}

/**
 * Add/subtract nanoseconds from timespec
 */
void timespec_add_ns(struct timespec* ts, int64_t ns) {
    if (!ts) {
        return;
    }
    
    // Convert to total nanoseconds
    int64_t total_ns = static_cast<int64_t>(ts->tv_sec) * NS_PER_SEC + ts->tv_nsec;
    total_ns += ns;
    
    // Handle negative results
    if (total_ns < 0) {
        ts->tv_sec = -1;
        ts->tv_nsec = 0;
        return;
    }
    
    // Convert back to timespec
    ts->tv_sec = static_cast<time_t>(total_ns / NS_PER_SEC);
    ts->tv_nsec = static_cast<long>(total_ns % NS_PER_SEC);
}

/**
 * Compare two timespec values
 */
int timespec_compare(const struct timespec& a, const struct timespec& b) {
    if (a.tv_sec < b.tv_sec) {
        return -1;
    } else if (a.tv_sec > b.tv_sec) {
        return 1;
    } else {
        // Seconds are equal, compare nanoseconds
        if (a.tv_nsec < b.tv_nsec) {
            return -1;
        } else if (a.tv_nsec > b.tv_nsec) {
            return 1;
        } else {
            return 0;
        }
    }
}

/**
 * Calculate difference between two timespec values in nanoseconds
 */
int64_t timespec_diff_ns(const struct timespec& later, const struct timespec& earlier) {
    int64_t later_ns = static_cast<int64_t>(later.tv_sec) * NS_PER_SEC + later.tv_nsec;
    int64_t earlier_ns = static_cast<int64_t>(earlier.tv_sec) * NS_PER_SEC + earlier.tv_nsec;
    
    return later_ns - earlier_ns;
}

/**
 * Check if timespec is valid
 */
bool is_valid_timespec(const struct timespec& ts) {
    // Check for valid nanosecond range
    if (ts.tv_nsec < 0 || ts.tv_nsec >= NS_PER_SEC) {
        return false;
    }
    
    // Check for reasonable time range (not before 1970 or too far in future)
    if (ts.tv_sec < 0) {
        return false;
    }
    
    // Check for year 2038 problem on 32-bit systems
    if (sizeof(time_t) == 4 && ts.tv_sec > INT32_MAX) {
        return false;
    }
    
    return true;
}

/**
 * Normalize timespec (handle overflow in nanoseconds)
 */
void normalize_timespec(struct timespec* ts) {
    if (!ts) {
        return;
    }
    
    // Handle nanosecond overflow
    if (ts->tv_nsec >= NS_PER_SEC) {
        time_t extra_sec = ts->tv_nsec / NS_PER_SEC;
        ts->tv_sec += extra_sec;
        ts->tv_nsec %= NS_PER_SEC;
    }
    
    // Handle nanosecond underflow
    while (ts->tv_nsec < 0) {
        ts->tv_sec -= 1;
        ts->tv_nsec += NS_PER_SEC;
    }
}

/**
 * Create timespec from seconds and nanoseconds
 */
struct timespec make_timespec(time_t sec, long nsec) {
    struct timespec ts;
    ts.tv_sec = sec;
    ts.tv_nsec = nsec;
    normalize_timespec(&ts);
    return ts;
}

/**
 * Zero-initialize timespec
 */
void zero_timespec(struct timespec* ts) {
    if (ts) {
        ts->tv_sec = 0;
        ts->tv_nsec = 0;
    }
}

/**
 * Copy timespec
 */
void copy_timespec(const struct timespec& src, struct timespec* dst) {
    if (dst) {
        *dst = src;
    }
}

/**
 * Convert timespec to human-readable string (for debugging)
 */
std::string timespec_to_string(const struct timespec& ts) {
    char buffer[64];
    snprintf(buffer, sizeof(buffer), "%ld.%09ld", 
             static_cast<long>(ts.tv_sec), ts.tv_nsec);
    return std::string(buffer);
}

/**
 * Parse timespec from string representation
 */
bool string_to_timespec(const std::string& str, struct timespec* ts) {
    if (!ts) {
        return false;
    }
    
    try {
        // Find decimal point
        size_t dot_pos = str.find('.');
        if (dot_pos == std::string::npos) {
            // No fractional part
            ts->tv_sec = static_cast<time_t>(std::stoll(str));
            ts->tv_nsec = 0;
        } else {
            // Parse seconds part
            std::string sec_str = str.substr(0, dot_pos);
            ts->tv_sec = static_cast<time_t>(std::stoll(sec_str));
            
            // Parse nanoseconds part
            std::string nsec_str = str.substr(dot_pos + 1);
            
            // Pad or truncate to 9 digits
            if (nsec_str.length() < 9) {
                nsec_str.append(9 - nsec_str.length(), '0');
            } else if (nsec_str.length() > 9) {
                nsec_str = nsec_str.substr(0, 9);
            }
            
            ts->tv_nsec = static_cast<long>(std::stoll(nsec_str));
        }
        
        normalize_timespec(ts);
        return is_valid_timespec(*ts);
    } catch (...) {
        // Any parsing error
        zero_timespec(ts);
        return false;
    }
}

/**
 * High-precision sleep using timespec
 */
void timespec_sleep(const struct timespec& duration) {
    struct timespec remaining;
    struct timespec request = duration;
    
    // nanosleep can be interrupted, so we need to loop
    while (nanosleep(&request, &remaining) == -1) {
        if (errno != EINTR) {
            break; // Real error occurred
        }
        request = remaining; // Continue with remaining time
    }
}

/**
 * Get resolution of the system clock
 */
bool get_clock_resolution(struct timespec* resolution) {
    if (!resolution) {
        return false;
    }
    
    return clock_getres(CLOCK_REALTIME, resolution) == 0;
}

} // namespace fuse_native