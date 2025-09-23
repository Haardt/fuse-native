/**
 * @file statfs_bridge.cc
 * @brief FUSE statfs operation N-API bridge implementation
 * 
 * This file implements the N-API bridge for the statfs operation,
 * handling the conversion between FUSE low-level API and JavaScript.
 * Uses BigInt for 64-bit filesystem statistics fields.
 */

#include "fuse_bridge.h"
#include "napi_helpers.h"
#include "napi_bigint.h"
#include "errno_mapping.h"
#include <sys/statvfs.h>
#include <cerrno>

namespace fuse_native {

/**
 * Process statfs operation request
 * Calls JavaScript handler and processes the response
 */
void FuseBridge::ProcessStatfsRequest(std::unique_ptr<FuseRequestContext> context) {
    if (!operation_handlers_.count(FuseOpType::STATFS)) {
        fuse_reply_err(context->req, ENOSYS);
        return;
    }

    auto tsfn = operation_handlers_.at(FuseOpType::STATFS);
    
    // Call JavaScript handler asynchronously
    // Process the statfs request  
    FuseRequestContext* contextPtr = context.release();
    napi_status status = tsfn.NonBlockingCall([contextPtr](
        Napi::Env env, Napi::Function jsCallback) {

        std::unique_ptr<FuseRequestContext> context(contextPtr);

        try {
            // Prepare arguments for JavaScript callback
            Napi::Object contextObj = Napi::Object::New(env);
            contextObj.Set("uid", Napi::Number::New(env, context->uid));
            contextObj.Set("gid", Napi::Number::New(env, context->gid));
            contextObj.Set("pid", Napi::Number::New(env, 0)); // TODO: Get actual PID

            // Create options object
            Napi::Object options = Napi::Object::New(env);
            // No specific options for statfs currently
            
            // Call JavaScript handler: statfs(ino, context, options)
            std::vector<napi_value> args = {
                fuse_native::u64_to_bigint(env, context->ino),
                contextObj.operator napi_value(),
                options.operator napi_value()
            };

            Napi::Value result = jsCallback.Call(args);

            // Handle the result
            if (result.IsPromise()) {
                auto promise = result.As<Napi::Promise>();

                // Create promise handlers
                FuseRequestContext* rawContext = context.release();
                auto onResolve = Napi::Function::New(env, [rawContext](
                    const Napi::CallbackInfo& info) -> Napi::Value {

                    HandleStatfsSuccess(info.Env(), info[0], rawContext);
                    return info.Env().Undefined();
                });

                auto onReject = Napi::Function::New(env, [rawContext](
                    const Napi::CallbackInfo& info) -> Napi::Value {

                    HandleStatfsError(info.Env(), info[0], rawContext);
                    return info.Env().Undefined();
                });

                promise.Get("then").As<Napi::Function>().Call(promise, { onResolve });
                promise.Get("catch").As<Napi::Function>().Call(promise, { onReject });
            } else {
                // Synchronous result
                HandleStatfsSuccess(env, result, context.get());
            }

        } catch (const Napi::Error& e) {
            HandleStatfsError(env, e.Value(), context.get());
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
            fuse_reply_err(context->req, EIO);
        }
    });
    
    if (status != napi_ok) {
        fuse_reply_err(context->req, EIO);
    }
}

/**
 * Handle successful statfs response
 */
void FuseBridge::HandleStatfsSuccess(Napi::Env env, Napi::Value result, FuseRequestContext* context) {
    try {
        if (!result.IsObject()) {
            fuse_reply_err(context->req, EIO);
            delete context;
            return;
        }
        
        Napi::Object statfs_obj = result.As<Napi::Object>();
        
        // Convert JavaScript object to struct statvfs
        struct statvfs stvfs;
        memset(&stvfs, 0, sizeof(stvfs));
        
        // Extract and validate all fields
        if (statfs_obj.Has("bsize")) {
            stvfs.f_bsize = statfs_obj.Get("bsize").As<Napi::Number>().Uint32Value();
        }
        
        if (statfs_obj.Has("frsize")) {
            stvfs.f_frsize = statfs_obj.Get("frsize").As<Napi::Number>().Uint32Value();
        }
        
        if (statfs_obj.Has("blocks")) {
            Napi::Value blocks_val = statfs_obj.Get("blocks");
            if (blocks_val.IsBigInt()) {
                bool lossless;
                lossless = fuse_native::bigint_to_u64(env, blocks_val.operator napi_value(), &stvfs.f_blocks);
                if (!lossless) {
                    fuse_reply_err(context->req, ERANGE);
                    delete context;
                    return;
                }
            }
        }
        
        if (statfs_obj.Has("bfree")) {
            Napi::Value bfree_val = statfs_obj.Get("bfree");
            if (bfree_val.IsBigInt()) {
                bool lossless;
                lossless = fuse_native::bigint_to_u64(env, bfree_val.operator napi_value(), &stvfs.f_bfree);
                if (!lossless) {
                    fuse_reply_err(context->req, ERANGE);
                    delete context;
                    return;
                }
            }
        }
        
        if (statfs_obj.Has("bavail")) {
            Napi::Value bavail_val = statfs_obj.Get("bavail");
            if (bavail_val.IsBigInt()) {
                bool lossless;
                lossless = fuse_native::bigint_to_u64(env, bavail_val.operator napi_value(), &stvfs.f_bavail);
                if (!lossless) {
                    fuse_reply_err(context->req, ERANGE);
                    delete context;
                    return;
                }
            }
        }
        
        if (statfs_obj.Has("files")) {
            Napi::Value files_val = statfs_obj.Get("files");
            if (files_val.IsBigInt()) {
                bool lossless;
                lossless = fuse_native::bigint_to_u64(env, files_val.operator napi_value(), &stvfs.f_files);
                if (!lossless) {
                    fuse_reply_err(context->req, ERANGE);
                    delete context;
                    return;
                }
            }
        }
        
        if (statfs_obj.Has("ffree")) {
            Napi::Value ffree_val = statfs_obj.Get("ffree");
            if (ffree_val.IsBigInt()) {
                bool lossless;
                lossless = fuse_native::bigint_to_u64(env, ffree_val.operator napi_value(), &stvfs.f_ffree);
                if (!lossless) {
                    fuse_reply_err(context->req, ERANGE);
                    delete context;
                    return;
                }
            }
        }
        
        if (statfs_obj.Has("favail")) {
            Napi::Value favail_val = statfs_obj.Get("favail");
            if (favail_val.IsBigInt()) {
                bool lossless;
                lossless = fuse_native::bigint_to_u64(env, favail_val.operator napi_value(), &stvfs.f_favail);
                if (!lossless) {
                    fuse_reply_err(context->req, ERANGE);
                    delete context;
                    return;
                }
            }
        }
        
        if (statfs_obj.Has("fsid")) {
            Napi::Value fsid_val = statfs_obj.Get("fsid");
            if (fsid_val.IsBigInt()) {
                bool lossless;
                lossless = fuse_native::bigint_to_u64(env, fsid_val.operator napi_value(), &stvfs.f_fsid);
                if (!lossless) {
                    fuse_reply_err(context->req, ERANGE);
                    delete context;
                    return;
                }
            }
        }
        
        if (statfs_obj.Has("flag")) {
            stvfs.f_flag = statfs_obj.Get("flag").As<Napi::Number>().Uint32Value();
        }
        
        if (statfs_obj.Has("namemax")) {
            stvfs.f_namemax = statfs_obj.Get("namemax").As<Napi::Number>().Uint32Value();
        }
        
        // Reply with the statvfs structure
        fuse_reply_statfs(context->req, &stvfs);
        
    } catch (const std::exception& e) {
        fuse_reply_err(context->req, EIO);
    }
    
    delete context;
}

/**
 * Handle statfs error response
 */
void FuseBridge::HandleStatfsError(Napi::Env env, Napi::Value error, FuseRequestContext* context) {
    int errno_val = EIO; // Default error
    
    try {
        if (error.IsObject()) {
            Napi::Object error_obj = error.As<Napi::Object>();
            
            // Check for errno property
            if (error_obj.Has("errno")) {
                Napi::Value errno_prop = error_obj.Get("errno");
                if (errno_prop.IsNumber()) {
                    int provided_errno = errno_prop.As<Napi::Number>().Int32Value();
                    // Ensure it's negative (FUSE convention)
                    errno_val = provided_errno > 0 ? -provided_errno : provided_errno;
                    errno_val = -errno_val; // FUSE expects positive errno
                }
            }
            
            // Check for code property (like 'EACCES', 'EIO')
            if (error_obj.Has("code")) {
                Napi::Value code_prop = error_obj.Get("code");
                if (code_prop.IsString()) {
                    std::string code = code_prop.As<Napi::String>().Utf8Value();
                    errno_val = fuse_native::string_to_errno(code);
                }
            }
        } else if (error.IsNumber()) {
            errno_val = error.As<Napi::Number>().Int32Value();
            errno_val = errno_val > 0 ? errno_val : -errno_val; // Ensure positive
        }
        
    } catch (const std::exception& e) {
        errno_val = EIO;
    }
    
    fuse_reply_err(context->req, errno_val);
    delete context;
}

} // namespace fuse_native