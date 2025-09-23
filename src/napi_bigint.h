/**
 * @file napi_bigint.h
 * @brief N-API BigInt utilities header for 64-bit value handling
 * 
 * This header defines utility functions for handling BigInt values in N-API,
 * providing lossless conversion between C++ 64-bit integers and JavaScript BigInt.
 */

#ifndef NAPI_BIGINT_H
#define NAPI_BIGINT_H

#include <napi.h>
#include <sys/types.h>
#include <cstdint>
#include <string>

namespace fuse_native {

/**
 * Convert uint64_t to N-API BigInt
 * @param env N-API environment
 * @param value 64-bit unsigned integer value
 * @return N-API BigInt value, or nullptr on error
 */
napi_value u64_to_bigint(napi_env env, uint64_t value);

/**
 * Convert N-API BigInt to uint64_t with lossless check
 * @param env N-API environment
 * @param bigint_val N-API BigInt value
 * @param result Pointer to store the converted value
 * @return true if conversion was lossless, false otherwise
 */
bool bigint_to_u64(napi_env env, napi_value bigint_val, uint64_t* result);

/**
 * Convert int64_t to N-API BigInt
 * @param env N-API environment
 * @param value 64-bit signed integer value
 * @return N-API BigInt value, or nullptr on error
 */
napi_value i64_to_bigint(napi_env env, int64_t value);

/**
 * Convert N-API BigInt to int64_t with lossless check
 * @param env N-API environment
 * @param bigint_val N-API BigInt value
 * @param result Pointer to store the converted value
 * @return true if conversion was lossless, false otherwise
 */
bool bigint_to_i64(napi_env env, napi_value bigint_val, int64_t* result);

/**
 * Check if a value is a valid BigInt for uint64 conversion
 * @param env N-API environment
 * @param value N-API value to check
 * @return true if value is a valid uint64 BigInt
 */
bool is_valid_u64_bigint(napi_env env, napi_value value);

/**
 * Check if a value is a valid BigInt for int64 conversion
 * @param env N-API environment
 * @param value N-API value to check
 * @return true if value is a valid int64 BigInt
 */
bool is_valid_i64_bigint(napi_env env, napi_value value);

/**
 * Safe conversion with range checking (uint64)
 * @param env N-API environment
 * @param value 64-bit unsigned integer value
 * @param result Pointer to store the N-API BigInt result
 * @return true if conversion succeeded
 */
bool safe_u64_to_bigint(napi_env env, uint64_t value, napi_value* result);

/**
 * Safe conversion with range checking (uint64)
 * @param env N-API environment
 * @param bigint_val N-API BigInt value
 * @param result Pointer to store the converted value
 * @return true if conversion was successful and lossless
 */
bool safe_bigint_to_u64(napi_env env, napi_value bigint_val, uint64_t* result);

/**
 * Safe conversion with range checking (int64)
 * @param env N-API environment
 * @param value 64-bit signed integer value
 * @param result Pointer to store the N-API BigInt result
 * @return true if conversion succeeded
 */
bool safe_i64_to_bigint(napi_env env, int64_t value, napi_value* result);

/**
 * Safe conversion with range checking (int64)
 * @param env N-API environment
 * @param bigint_val N-API BigInt value
 * @param result Pointer to store the converted value
 * @return true if conversion was successful and lossless
 */
bool safe_bigint_to_i64(napi_env env, napi_value bigint_val, int64_t* result);

/**
 * Convert size_t to BigInt (for file sizes, lengths)
 * @param env N-API environment
 * @param value size_t value
 * @return N-API BigInt value, or nullptr on error
 */
napi_value size_to_bigint(napi_env env, size_t value);

/**
 * Convert BigInt to size_t with bounds checking
 * @param env N-API environment
 * @param bigint_val N-API BigInt value
 * @param result Pointer to store the converted value
 * @return true if conversion was successful and within bounds
 */
bool bigint_to_size(napi_env env, napi_value bigint_val, size_t* result);

/**
 * Convert off_t to BigInt (for file offsets)
 * @param env N-API environment
 * @param value off_t value
 * @return N-API BigInt value, or nullptr on error
 */
napi_value offset_to_bigint(napi_env env, off_t value);

/**
 * Convert BigInt to off_t with bounds checking
 * @param env N-API environment
 * @param bigint_val N-API BigInt value
 * @param result Pointer to store the converted value
 * @return true if conversion was successful and within bounds
 */
bool bigint_to_offset(napi_env env, napi_value bigint_val, off_t* result);

/**
 * Convert ino_t to BigInt (for inode numbers)
 * @param env N-API environment
 * @param value ino_t value
 * @return N-API BigInt value, or nullptr on error
 */
napi_value ino_to_bigint(napi_env env, ino_t value);

/**
 * Convert BigInt to ino_t with bounds checking
 * @param env N-API environment
 * @param bigint_val N-API BigInt value
 * @param result Pointer to store the converted value
 * @return true if conversion was successful and within bounds
 */
bool bigint_to_ino(napi_env env, napi_value bigint_val, ino_t* result);

/**
 * Utility to get BigInt as string for debugging
 * @param env N-API environment
 * @param bigint_val N-API BigInt value
 * @return String representation of the BigInt
 */
std::string bigint_to_string(napi_env env, napi_value bigint_val);

/**
 * Convenience macros for BigInt conversion
 * Use the specific functions directly to avoid template specialization conflicts
 */
#define BIGINT_U64_TO_NAPI(env, value) u64_to_bigint(env, value)
#define BIGINT_I64_TO_NAPI(env, value) i64_to_bigint(env, value)
#define BIGINT_SIZE_TO_NAPI(env, value) size_to_bigint(env, value)
#define BIGINT_OFFSET_TO_NAPI(env, value) offset_to_bigint(env, value)
#define BIGINT_INO_TO_NAPI(env, value) ino_to_bigint(env, value)

#define NAPI_TO_BIGINT_U64(env, napi_val, result) bigint_to_u64(env, napi_val, result)
#define NAPI_TO_BIGINT_I64(env, napi_val, result) bigint_to_i64(env, napi_val, result)
#define NAPI_TO_BIGINT_SIZE(env, napi_val, result) bigint_to_size(env, napi_val, result)
#define NAPI_TO_BIGINT_OFFSET(env, napi_val, result) bigint_to_offset(env, napi_val, result)
#define NAPI_TO_BIGINT_INO(env, napi_val, result) bigint_to_ino(env, napi_val, result)

} // namespace fuse_native

#endif // NAPI_BIGINT_H