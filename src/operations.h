/**
 * @file operations.h
 * @brief FUSE operations header file for operation management
 * 
 * This header defines the FUSE operation management system,
 * providing registration and dispatch of FUSE operation handlers.
 */

#ifndef OPERATIONS_H
#define OPERATIONS_H

#include <napi.h>
#include <fuse3/fuse_lowlevel.h>
#include <string>
#include <vector>
#include <functional>
#include <optional>
#include <memory>
#include <mutex>

namespace fuse_native {

/**
 * Set operation handler
 * @param info N-API callback info containing operation name and handler function
 * @return N-API value indicating success/failure
 */
Napi::Value SetOperationHandler(const Napi::CallbackInfo& info);

/**
 * Remove operation handler
 * @param info N-API callback info containing operation name
 * @return N-API value indicating success/failure
 */
Napi::Value RemoveOperationHandler(const Napi::CallbackInfo& info);

/**
 * Check if operation handler exists
 * @param operation Operation name to check
 * @return true if handler exists
 */
bool HasOperationHandler(const std::string& operation);

/**
 * Get operation handler ThreadSafeFunction
 * @param operation Operation name
 * @return ThreadSafeFunction if exists, nullopt otherwise
 */
std::optional<Napi::ThreadSafeFunction> GetOperationHandler(const std::string& operation);

/**
 * Call operation handler asynchronously
 * @param operation Operation name
 * @param args Arguments to pass to handler
 * @param env N-API environment
 * @param callback Callback function to receive result
 */
void CallOperationHandlerAsync(const std::string& operation, 
                              const std::vector<napi_value>& args,
                              napi_env env,
                              std::function<void(napi_value)> callback);

/**
 * Validate operation arguments
 * @param operation Operation name
 * @param args Arguments to validate
 * @param env N-API environment
 * @return true if arguments are valid
 */
bool ValidateOperationArgs(const std::string& operation,
                          const std::vector<napi_value>& args,
                          napi_env env);

/**
 * Create operation context from FUSE request
 * @param env N-API environment
 * @param req FUSE request
 * @return N-API object containing context information
 */
napi_value CreateOperationContext(napi_env env, fuse_req_t req);

/**
 * Create file info object from FUSE file_info structure
 * @param env N-API environment
 * @param fi FUSE file info structure
 * @return N-API object containing file info
 */
napi_value CreateFileInfo(napi_env env, const struct fuse_file_info* fi);

// Operations namespace removed to avoid naming conflicts
// Functions are exposed directly from the main namespace

} // namespace fuse_native

#endif // OPERATIONS_H