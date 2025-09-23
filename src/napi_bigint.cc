/**
 * @file napi_bigint.cc
 * @brief N-API BigInt utilities implementation for 64-bit value handling
 * 
 * This file implements utility functions for handling BigInt values in N-API,
 * providing lossless conversion between C++ 64-bit integers and JavaScript BigInt.
 */

#include "napi_bigint.h"
#include <limits>
#include <stdexcept>

namespace fuse_native {

/**
 * Convert uint64_t to N-API BigInt
 */
napi_value u64_to_bigint(napi_env env, uint64_t value) {
    napi_value result;
    napi_status status = napi_create_bigint_uint64(env, value, &result);
    
    if (status != napi_ok) {
        napi_throw_error(env, nullptr, "Failed to create BigInt from uint64");
        return nullptr;
    }
    
    return result;
}

/**
 * Convert N-API BigInt to uint64_t with lossless check
 */
bool bigint_to_u64(napi_env env, napi_value bigint_val, uint64_t* result) {
    if (result == nullptr) {
        return false;
    }
    
    // Check if it's actually a BigInt using Napi wrapper
    Napi::Value value(env, bigint_val);
    if (!value.IsBigInt()) {
        return false;
    }
    
    // Convert with lossless check
    bool lossless = false;
    napi_status status = napi_get_value_bigint_uint64(env, bigint_val, result, &lossless);
    
    if (status != napi_ok) {
        return false;
    }
    
    return lossless;
}

/**
 * Convert int64_t to N-API BigInt
 */
napi_value i64_to_bigint(napi_env env, int64_t value) {
    napi_value result;
    napi_status status = napi_create_bigint_int64(env, value, &result);
    
    if (status != napi_ok) {
        napi_throw_error(env, nullptr, "Failed to create BigInt from int64");
        return nullptr;
    }
    
    return result;
}

/**
 * Convert N-API BigInt to int64_t with lossless check
 */
bool bigint_to_i64(napi_env env, napi_value bigint_val, int64_t* result) {
    if (result == nullptr) {
        return false;
    }
    
    // Check if it's actually a BigInt using Napi wrapper
    Napi::Value value(env, bigint_val);
    if (!value.IsBigInt()) {
        return false;
    }
    
    // Convert with lossless check
    bool lossless = false;
    napi_status status = napi_get_value_bigint_int64(env, bigint_val, result, &lossless);
    
    if (status != napi_ok) {
        return false;
    }
    
    return lossless;
}

/**
 * Check if a value is a valid BigInt for uint64 conversion
 */
bool is_valid_u64_bigint(napi_env env, napi_value value) {
    Napi::Value val(env, value);
    if (!val.IsBigInt()) {
        return false;
    }
    
    // Try to convert and check if it's lossless
    uint64_t dummy;
    return bigint_to_u64(env, value, &dummy);
}

/**
 * Check if a value is a valid BigInt for int64 conversion
 */
bool is_valid_i64_bigint(napi_env env, napi_value value) {
    Napi::Value val(env, value);
    if (!val.IsBigInt()) {
        return false;
    }
    
    // Try to convert and check if it's lossless
    int64_t dummy;
    return bigint_to_i64(env, value, &dummy);
}

/**
 * Safe conversion with range checking
 */
bool safe_u64_to_bigint(napi_env env, uint64_t value, napi_value* result) {
    if (result == nullptr) {
        return false;
    }
    
    *result = u64_to_bigint(env, value);
    return *result != nullptr;
}

/**
 * Safe conversion with range checking
 */
bool safe_bigint_to_u64(napi_env env, napi_value bigint_val, uint64_t* result) {
    return bigint_to_u64(env, bigint_val, result);
}

/**
 * Safe conversion with range checking
 */
bool safe_i64_to_bigint(napi_env env, int64_t value, napi_value* result) {
    if (result == nullptr) {
        return false;
    }
    
    *result = i64_to_bigint(env, value);
    return *result != nullptr;
}

/**
 * Safe conversion with range checking
 */
bool safe_bigint_to_i64(napi_env env, napi_value bigint_val, int64_t* result) {
    return bigint_to_i64(env, bigint_val, result);
}

/**
 * Convert size_t to BigInt (for file sizes, offsets)
 */
napi_value size_to_bigint(napi_env env, size_t value) {
    // size_t is unsigned, so use uint64 conversion
    return u64_to_bigint(env, static_cast<uint64_t>(value));
}

/**
 * Convert BigInt to size_t with bounds checking
 */
bool bigint_to_size(napi_env env, napi_value bigint_val, size_t* result) {
    if (result == nullptr) {
        return false;
    }
    
    uint64_t value;
    if (!bigint_to_u64(env, bigint_val, &value)) {
        return false;
    }
    
    // Check if value fits in size_t
    if (value > static_cast<uint64_t>(std::numeric_limits<size_t>::max())) {
        return false;
    }
    
    *result = static_cast<size_t>(value);
    return true;
}

/**
 * Convert off_t to BigInt (for file offsets)
 */
napi_value offset_to_bigint(napi_env env, off_t value) {
    // off_t can be signed, so use appropriate conversion
    if (sizeof(off_t) == sizeof(int64_t)) {
        return i64_to_bigint(env, static_cast<int64_t>(value));
    } else {
        // Fallback for other sizes
        return i64_to_bigint(env, static_cast<int64_t>(value));
    }
}

/**
 * Convert BigInt to off_t with bounds checking
 */
bool bigint_to_offset(napi_env env, napi_value bigint_val, off_t* result) {
    if (result == nullptr) {
        return false;
    }
    
    int64_t value;
    if (!bigint_to_i64(env, bigint_val, &value)) {
        return false;
    }
    
    // Check bounds for off_t
    if (value < static_cast<int64_t>(std::numeric_limits<off_t>::min()) ||
        value > static_cast<int64_t>(std::numeric_limits<off_t>::max())) {
        return false;
    }
    
    *result = static_cast<off_t>(value);
    return true;
}

/**
 * Convert ino_t to BigInt (for inode numbers)
 */
napi_value ino_to_bigint(napi_env env, ino_t value) {
    return u64_to_bigint(env, static_cast<uint64_t>(value));
}

/**
 * Convert BigInt to ino_t with bounds checking
 */
bool bigint_to_ino(napi_env env, napi_value bigint_val, ino_t* result) {
    if (result == nullptr) {
        return false;
    }
    
    uint64_t value;
    if (!bigint_to_u64(env, bigint_val, &value)) {
        return false;
    }
    
    // Check bounds for ino_t
    if (value > static_cast<uint64_t>(std::numeric_limits<ino_t>::max())) {
        return false;
    }
    
    *result = static_cast<ino_t>(value);
    return true;
}

/**
 * Utility to get BigInt as string for debugging
 */
std::string bigint_to_string(napi_env env, napi_value bigint_val) {
    // Convert to string via JavaScript
    napi_value global, to_string_fn, result;
    
    if (napi_get_global(env, &global) != napi_ok) {
        return "[BigInt conversion error]";
    }
    
    if (napi_get_named_property(env, bigint_val, "toString", &to_string_fn) != napi_ok) {
        return "[BigInt toString error]";
    }
    
    if (napi_call_function(env, bigint_val, to_string_fn, 0, nullptr, &result) != napi_ok) {
        return "[BigInt call error]";
    }
    
    size_t str_len;
    if (napi_get_value_string_utf8(env, result, nullptr, 0, &str_len) != napi_ok) {
        return "[BigInt string length error]";
    }
    
    std::string str(str_len + 1, '\0');
    if (napi_get_value_string_utf8(env, result, &str[0], str.length(), &str_len) != napi_ok) {
        return "[BigInt string extraction error]";
    }
    
    str.resize(str_len);
    return str;
}

} // namespace fuse_native