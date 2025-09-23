/**
 * @file operations.cc
 * @brief FUSE operations implementation and management
 * 
 * This file implements the FUSE operation management system,
 * providing registration and dispatch of FUSE operation handlers.
 */

#include "operations.h"
#include "napi_helpers.h"
#include "errno_mapping.h"
#include <unordered_map>
#include <memory>
#include <future>

namespace fuse_native {

/**
 * Global operation registry
 */
static std::unordered_map<std::string, Napi::ThreadSafeFunction> operation_handlers;
static std::mutex operation_handlers_mutex;

/**
 * Set operation handler
 */
Napi::Value SetOperationHandler(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        NapiHelpers::ThrowError(env, "Expected at least 2 arguments");
        return env.Undefined();
    }
    
    if (!info[0].IsString()) {
        NapiHelpers::ThrowTypeError(env, "Operation name must be a string");
        return env.Undefined();
    }
    
    if (!info[1].IsFunction()) {
        NapiHelpers::ThrowTypeError(env, "Operation handler must be a function");
        return env.Undefined();
    }
    
    std::string operation = info[0].As<Napi::String>().Utf8Value();
    Napi::Function handler = info[1].As<Napi::Function>();
    
    try {
        // Create ThreadSafeFunction for the handler
        Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
            env,
            handler,
            "fuse_operation_" + operation,
            0, // No limit on queue size
            1  // Single-threaded
        );
        
        // Store in registry
        std::lock_guard<std::mutex> lock(operation_handlers_mutex);
        operation_handlers[operation] = tsfn;
        
        return Napi::Boolean::New(env, true);
        
    } catch (const std::exception& e) {
        NapiHelpers::ThrowError(env, "Failed to create ThreadSafeFunction: " + std::string(e.what()));
        return env.Undefined();
    }
}

/**
 * Remove operation handler
 */
Napi::Value RemoveOperationHandler(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        NapiHelpers::ThrowError(env, "Expected operation name");
        return env.Undefined();
    }
    
    if (!info[0].IsString()) {
        NapiHelpers::ThrowTypeError(env, "Operation name must be a string");
        return env.Undefined();
    }
    
    std::string operation = info[0].As<Napi::String>().Utf8Value();
    
    std::lock_guard<std::mutex> lock(operation_handlers_mutex);
    auto it = operation_handlers.find(operation);
    if (it != operation_handlers.end()) {
        // Release ThreadSafeFunction
        it->second.Release();
        operation_handlers.erase(it);
        return Napi::Boolean::New(env, true);
    }
    
    return Napi::Boolean::New(env, false);
}

/**
 * Check if operation handler exists
 */
bool HasOperationHandler(const std::string& operation) {
    std::lock_guard<std::mutex> lock(operation_handlers_mutex);
    return operation_handlers.find(operation) != operation_handlers.end();
}

/**
 * Get operation handler ThreadSafeFunction
 */
std::optional<Napi::ThreadSafeFunction> GetOperationHandler(const std::string& operation) {
    std::lock_guard<std::mutex> lock(operation_handlers_mutex);
    auto it = operation_handlers.find(operation);
    if (it != operation_handlers.end()) {
        return it->second;
    }
    return std::nullopt;
}

/**
 * Call operation handler asynchronously
 */
struct OperationCallData {
    std::string operation;
    std::vector<napi_value> args;
    std::promise<napi_value> result_promise;
    napi_env env;
    
    OperationCallData(const std::string& op, napi_env environment) 
        : operation(op), env(environment) {}
};

void CallOperationHandlerAsync(const std::string& operation, 
                              const std::vector<napi_value>& args,
                              napi_env env,
                              std::function<void(napi_value)> callback) {
    auto handler_opt = GetOperationHandler(operation);
    if (!handler_opt) {
        // No handler, call callback with ENOSYS error
        napi_value error;
        napi_create_int32(env, -ENOSYS, &error);
        callback(error);
        return;
    }
    
    auto tsfn = *handler_opt;
    auto call_data = std::make_unique<OperationCallData>(operation, env);
    call_data->args = args;
    
    // TODO: Implement proper ThreadSafeFunction call
    // For now, just return ENOSYS
    napi_value error;
    napi_create_int32(env, -ENOSYS, &error);
    callback(error);
}

/**
 * Validate operation arguments
 */
bool ValidateOperationArgs(const std::string& operation,
                          const std::vector<napi_value>& args,
                          napi_env env) {
    // Basic validation based on operation type
    if (operation == "lookup") {
        return args.size() >= 2; // parent_ino, name
    } else if (operation == "getattr") {
        return args.size() >= 1; // ino
    } else if (operation == "read") {
        return args.size() >= 3; // ino, offset, size
    } else if (operation == "write") {
        return args.size() >= 4; // ino, data, offset, size
    }
    
    return true; // Default to valid for unknown operations
}

/**
 * Create operation context from request
 */
napi_value CreateOperationContext(napi_env env, fuse_req_t req) {
    const struct fuse_ctx* ctx = fuse_req_ctx(req);
    if (!ctx) {
        return nullptr;
    }
    
    napi_value context_obj;
    napi_status status = napi_create_object(env, &context_obj);
    if (status != napi_ok) {
        return nullptr;
    }
    
    // Set context properties
    napi_value uid, gid, pid, umask;
    napi_create_uint32(env, ctx->uid, &uid);
    napi_create_uint32(env, ctx->gid, &gid);
    napi_create_uint32(env, ctx->pid, &pid);
    napi_create_uint32(env, ctx->umask, &umask);
    
    napi_set_named_property(env, context_obj, "uid", uid);
    napi_set_named_property(env, context_obj, "gid", gid);
    napi_set_named_property(env, context_obj, "pid", pid);
    napi_set_named_property(env, context_obj, "umask", umask);
    
    return context_obj;
}

/**
 * Extract file info from FUSE file_info structure
 */
napi_value CreateFileInfo(napi_env env, const struct fuse_file_info* fi) {
    if (!fi) {
        return nullptr;
    }
    
    napi_value fi_obj;
    napi_status status = napi_create_object(env, &fi_obj);
    if (status != napi_ok) {
        return nullptr;
    }
    
    // Set file info properties
    napi_value fh, flags;
    napi_create_int64(env, fi->fh, &fh);
    napi_create_int32(env, fi->flags, &flags);
    
    napi_set_named_property(env, fi_obj, "fh", fh);
    napi_set_named_property(env, fi_obj, "flags", flags);
    
    // Boolean flags
    napi_value direct_io, keep_cache, flush, nonseekable;
    napi_get_boolean(env, fi->direct_io, &direct_io);
    napi_get_boolean(env, fi->keep_cache, &keep_cache);
    napi_get_boolean(env, fi->flush, &flush);
    napi_get_boolean(env, fi->nonseekable, &nonseekable);
    
    napi_set_named_property(env, fi_obj, "direct_io", direct_io);
    napi_set_named_property(env, fi_obj, "keep_cache", keep_cache);
    napi_set_named_property(env, fi_obj, "flush", flush);
    napi_set_named_property(env, fi_obj, "nonseekable", nonseekable);
    
    return fi_obj;
}

/**
 * Operations namespace functions - remove duplicate names
 */
// namespace Operations functions removed to avoid naming conflicts
// Functions are exposed directly from the main namespace

} // namespace fuse_native