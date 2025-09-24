/**
 * @file fuse_bridge.cc
 * @brief FUSE3 bridge implementations for N-API integration
 */

#include "fuse_bridge.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cerrno>
#include <cmath>
#include <cstring>
#include <utility>
#include <sys/statvfs.h>

#include "errno_mapping.h"
#include "session_manager.h"
#include "napi_helpers.h"
#include "tsfn_dispatcher.h"

namespace fuse_native {

namespace {

struct OperationMapping {
    const char* name;
    FuseOpType type;
};

constexpr std::array<OperationMapping, 23> kOperationMappings = {{{"lookup", FuseOpType::LOOKUP},
                                                                  {"getattr", FuseOpType::GETATTR},
                                                                  {"setattr", FuseOpType::SETATTR},
                                                                  {"readlink", FuseOpType::READLINK},
                                                                  {"mknod", FuseOpType::MKNOD},
                                                                  {"mkdir", FuseOpType::MKDIR},
                                                                  {"symlink", FuseOpType::SYMLINK},
                                                                  {"unlink", FuseOpType::UNLINK},
                                                                  {"rmdir", FuseOpType::RMDIR},
                                                                  {"rename", FuseOpType::RENAME},
                                                                  {"link", FuseOpType::LINK},
                                                                  {"open", FuseOpType::OPEN},
                                                                  {"read", FuseOpType::READ},
                                                                  {"write", FuseOpType::WRITE},
                                                                  {"flush", FuseOpType::FLUSH},
                                                                  {"release", FuseOpType::RELEASE},
                                                                  {"fsync", FuseOpType::FSYNC},
                                                                  {"opendir", FuseOpType::OPENDIR},
                                                                  {"readdir", FuseOpType::READDIR},
                                                                  {"releasedir", FuseOpType::RELEASEDIR},
                                                                  {"fsyncdir", FuseOpType::FSYNCDIR},
                                                                  {"statfs", FuseOpType::STATFS},
                                                                  {"access", FuseOpType::ACCESS}}};

inline uint64_t ToUint64(fuse_ino_t value) {
    return static_cast<uint64_t>(value);
}

Napi::Object CreateRequestContextObject(Napi::Env env, const FuseRequestContext& context) {
    Napi::Object ctx = Napi::Object::New(env);
    if (!context.has_caller_ctx) {
        ctx.Set("uid", Napi::Number::New(env, 0));
        ctx.Set("gid", Napi::Number::New(env, 0));
        ctx.Set("pid", Napi::Number::New(env, 0));
        ctx.Set("umask", Napi::Number::New(env, 0));
        return ctx;
    }

    ctx.Set("uid", Napi::Number::New(env, static_cast<double>(context.caller_ctx.uid)));
    ctx.Set("gid", Napi::Number::New(env, static_cast<double>(context.caller_ctx.gid)));
    ctx.Set("pid", Napi::Number::New(env, static_cast<double>(context.caller_ctx.pid)));
    ctx.Set("umask", Napi::Number::New(env, static_cast<double>(context.caller_ctx.umask)));
    return ctx;
}

bool PopulateEntryFromResult(Napi::Env env,
                             Napi::Value value,
                             struct fuse_entry_param* entry_out) {
    if (!entry_out || !value.IsObject()) {
        return false;
    }

    Napi::Object result_obj = value.As<Napi::Object>();
    if (!result_obj.Has("attr")) {
        return false;
    }

    Napi::Value attr_value = result_obj.Get("attr");
    if (!attr_value.IsObject()) {
        return false;
    }

    struct stat attr{};
    if (!NapiHelpers::ObjectToStat(attr_value.As<Napi::Object>(), &attr)) {
        return false;
    }

    double attr_timeout = 1.0;
    double entry_timeout = 1.0;

    auto extract_timeout = [](Napi::Env inner_env, Napi::Value timeout_value, double* target) {
        if (!timeout_value.IsNumber() || !target) {
            return false;
        }
        double timeout = timeout_value.As<Napi::Number>().DoubleValue();
        if (!std::isfinite(timeout) || timeout < 0.0) {
            return false;
        }
        *target = timeout;
        return true;
    };

    if (result_obj.Has("timeout")) {
        Napi::Value timeout_value = result_obj.Get("timeout");
        if (!extract_timeout(env, timeout_value, &attr_timeout)) {
            return false;
        }
        entry_timeout = attr_timeout;
    }

    if (result_obj.Has("attrTimeout")) {
        if (!extract_timeout(env, result_obj.Get("attrTimeout"), &attr_timeout)) {
            return false;
        }
    }

    if (result_obj.Has("entryTimeout")) {
        if (!extract_timeout(env, result_obj.Get("entryTimeout"), &entry_timeout)) {
            return false;
        }
    }

    uint64_t generation = 0;
    if (result_obj.Has("generation")) {
        Napi::Value gen_value = result_obj.Get("generation");
        if (gen_value.IsBigInt()) {
            bool lossless = false;
            uint64_t gen = gen_value.As<Napi::BigInt>().Uint64Value(&lossless);
            if (!lossless) {
                return false;
            }
            generation = gen;
        } else if (gen_value.IsNumber()) {
            double gen_num = gen_value.As<Napi::Number>().DoubleValue();
            if (!std::isfinite(gen_num) || gen_num < 0) {
                return false;
            }
            generation = static_cast<uint64_t>(gen_num);
        } else {
            return false;
        }
    }

    struct fuse_entry_param entry{};
    entry.attr = attr;
    entry.attr_timeout = attr_timeout;
    entry.entry_timeout = entry_timeout;
    entry.generation = generation;
    entry.ino = attr.st_ino != 0 ? static_cast<fuse_ino_t>(attr.st_ino) : 0;

    *entry_out = entry;
    return true;
}

int ExtractErrnoFromValue(Napi::Env env, Napi::Value value) {
    if (value.IsNumber()) {
        int32_t err = value.As<Napi::Number>().Int32Value();
        return err < 0 ? -err : err;
    }

    if (value.IsBigInt()) {
        bool lossless = false;
        int64_t err = value.As<Napi::BigInt>().Int64Value(&lossless);
        if (!lossless) {
            return EIO;
        }
        return err < 0 ? static_cast<int>(-err) : static_cast<int>(err);
    }

    if (value.IsObject()) {
        Napi::Object obj = value.As<Napi::Object>();

        if (obj.Has("errno")) {
            Napi::Value errno_value = obj.Get("errno");
            return ExtractErrnoFromValue(env, errno_value);
        }

        if (obj.Has("code")) {
            std::string code = obj.Get("code").As<Napi::String>().Utf8Value();
            int mapped = string_to_errno(code);
            if (mapped != 0) {
                return mapped;
            }
        }
    }

    return EIO;
}

void ReplyWithErrorValue(Napi::Env env,
                         const std::shared_ptr<FuseRequestContext>& context,
                         Napi::Value error_value) {
    int errno_code = ExtractErrnoFromValue(env, error_value);
    if (errno_code == 0) {
        errno_code = EIO;
    }
    context->ReplyError(errno_code);
}

void ResolvePromiseOrValue(Napi::Env env,
                           const std::shared_ptr<FuseRequestContext>& context,
                           Napi::Value result,
                           std::function<void(Napi::Env, Napi::Value)> on_resolve,
                           std::function<void(Napi::Env, Napi::Value)> on_reject = nullptr) {
    std::function<void(Napi::Env, Napi::Value)> rejection_handler =
        [context](Napi::Env env_inner, Napi::Value reason) {
            ReplyWithErrorValue(env_inner, context, reason);
        };

    if (on_reject) {
        rejection_handler = [context, on_reject](Napi::Env env_inner, Napi::Value reason) {
            try {
                on_reject(env_inner, reason);
            } catch (...) {
                ReplyWithErrorValue(env_inner, context, reason);
                return;
            }
        };
    }

    if (result.IsPromise()) {
        Napi::Object promise_obj = result.As<Napi::Object>();
        Napi::Value then_value = promise_obj.Get("then");
        if (then_value.IsFunction()) {
            Napi::Function then_fn = then_value.As<Napi::Function>();

            Napi::Function resolve_cb = Napi::Function::New(env, [context, on_resolve](const Napi::CallbackInfo& info) {
                Napi::Env env_inner = info.Env();
                Napi::Value value = info.Length() > 0 ? info[0] : env_inner.Undefined();
                try {
                    on_resolve(env_inner, value);
                } catch (...) {
                    context->ReplyError(EIO);
                }
                return env_inner.Undefined();
            });

            Napi::Function reject_cb = Napi::Function::New(env, [context, rejection_handler](const Napi::CallbackInfo& info) {
                Napi::Env env_inner = info.Env();
                Napi::Value reason = info.Length() > 0 ? info[0] : env_inner.Undefined();
                rejection_handler(env_inner, reason);
                return env_inner.Undefined();
            });

            then_fn.Call(promise_obj, {resolve_cb, reject_cb});
            return;
        }

        // Promise without a then function – treat as immediate value
        result = promise_obj;
    }

    try {
        on_resolve(env, result);
    } catch (...) {
        context->ReplyError(EIO);
    }
}

} // namespace

FuseRequestContext::FuseRequestContext(FuseOpType op, fuse_req_t req, FuseBridge* bridge_ptr)
    : op_type(op),
      request(req),
      bridge(bridge_ptr),
      request_id(0),
      priority(CallbackPriority::NORMAL),
      start_time(std::chrono::steady_clock::now()),
      has_caller_ctx(false),
      ino(0),
      parent(0),
      new_parent(0),
      mode(0),
      rdev(0),
      setattr_valid(0),
      has_attr(false),
      has_fi(false),
      has_fi_out(false),
      offset(0),
      size(0),
      flags(0),
      datasync(0),
      access_mask(0),
      replied(false) {
    std::memset(&attr, 0, sizeof(attr));
    std::memset(&fi, 0, sizeof(fi));
    std::memset(&fi_out, 0, sizeof(fi_out));
    std::memset(&caller_ctx, 0, sizeof(caller_ctx));
    CaptureCallerContext();
}

void FuseRequestContext::CaptureCallerContext() {
    const struct fuse_ctx* ctx = fuse_req_ctx(request);
    if (ctx != nullptr) {
        caller_ctx = *ctx;
        has_caller_ctx = true;
    } else {
        has_caller_ctx = false;
    }
}

bool FuseRequestContext::TryMarkReplied() {
    bool expected = false;
    return replied.compare_exchange_strong(expected, true);
}

void FuseRequestContext::ReplyError(int errno_code) {
    if (!TryMarkReplied()) {
        return;
    }

    if (!request) {
        return;
    }

    int fuse_errno = errno_code;
    if (fuse_errno < 0) {
        fuse_errno = -fuse_errno;
    }

    fuse_reply_err(request, fuse_errno);
}

void FuseRequestContext::ReplyOk() {
    if (!TryMarkReplied() || !request) {
        return;
    }
    fuse_reply_err(request, 0);
}

void FuseRequestContext::ReplyUnsupported() {
    ReplyError(ENOSYS);
}

void FuseRequestContext::ReplyAttr(const struct stat& attr_value, double attr_timeout) {
    if (!TryMarkReplied() || !request) {
        return;
    }
    fuse_reply_attr(request, &attr_value, attr_timeout);
}

void FuseRequestContext::ReplyEntry(const struct fuse_entry_param& entry) {
    if (!TryMarkReplied() || !request) {
        return;
    }
    fuse_reply_entry(request, const_cast<struct fuse_entry_param*>(&entry));
}

void FuseRequestContext::ReplyBuf(const void* data_ptr, size_t length) {
    if (!TryMarkReplied() || !request) {
        return;
    }
    fuse_reply_buf(request, static_cast<const char*>(data_ptr), length);
}

void FuseRequestContext::ReplyWrite(size_t bytes_written) {
    if (!TryMarkReplied() || !request) {
        return;
    }
    fuse_reply_write(request, bytes_written);
}

void FuseRequestContext::ReplyOpen(const struct fuse_file_info& result_fi) {
    if (!TryMarkReplied() || !request) {
        return;
    }
    fuse_reply_open(request, const_cast<struct fuse_file_info*>(&result_fi));
}

void FuseRequestContext::ReplyCreate(const struct fuse_entry_param& entry,
                                     const struct fuse_file_info& result_fi) {
    if (!TryMarkReplied() || !request) {
        return;
    }
    fuse_reply_create(request,
                      const_cast<struct fuse_entry_param*>(&entry),
                      const_cast<struct fuse_file_info*>(&result_fi));
}

void FuseRequestContext::ReplyStatfs(const struct statvfs& stats) {
    if (!TryMarkReplied() || !request) {
        return;
    }
    fuse_reply_statfs(request, const_cast<struct statvfs*>(&stats));
}

void FuseRequestContext::ReplyReadlink(const std::string& target_path) {
    if (!TryMarkReplied() || !request) {
        return;
    }
    fuse_reply_readlink(request, target_path.c_str());
}

// Static member definitions
std::mutex FuseBridge::handler_mutex_;
std::unordered_map<FuseOpType, FuseBridge::HandlerRecord> FuseBridge::handler_registry_;

FuseOpType StringToFuseOpType(const std::string& name) {
    std::string lowered;
    lowered.reserve(name.size());
    std::transform(name.begin(), name.end(), std::back_inserter(lowered), [](unsigned char ch) {
        return static_cast<char>(std::tolower(ch));
    });

    for (const auto& mapping : kOperationMappings) {
        if (lowered == mapping.name) {
            return mapping.type;
        }
    }
    return FuseOpType::UNKNOWN;
}

const char* FuseOpTypeToString(FuseOpType type) {
    for (const auto& mapping : kOperationMappings) {
        if (mapping.type == type) {
            return mapping.name;
        }
    }
    return "unknown";
}

FuseBridge::FuseBridge(SessionManager* session_mgr)
    : session_manager_(session_mgr), env_(nullptr), initialized_(false) {
    std::memset(&fuse_ops_, 0, sizeof(fuse_ops_));
}

FuseBridge::~FuseBridge() {
    Shutdown();
}

bool FuseBridge::Initialize(Napi::Env env) {
    if (initialized_) {
        return true;
    }

    env_ = env;
    InitializeFuseOperations();
    initialized_ = true;
    return true;
}

void FuseBridge::Shutdown() {
    if (!initialized_) {
        return;
    }

    initialized_ = false;
    env_ = nullptr;
    std::memset(&fuse_ops_, 0, sizeof(fuse_ops_));
}

bool FuseBridge::RegisterOperationHandler(Napi::Env env, FuseOpType op_type, Napi::Function handler) {
    if (op_type == FuseOpType::UNKNOWN) {
        Napi::TypeError::New(env, "Unsupported FUSE operation").ThrowAsJavaScriptException();
        return false;
    }

    auto dispatcher = GetGlobalDispatcher();
    if (!dispatcher) {
        if (!InitializeGlobalDispatcher(env)) {
            Napi::Error::New(env, "Failed to initialize operation dispatcher").ThrowAsJavaScriptException();
            return false;
        }
        dispatcher = GetGlobalDispatcher();
    }

    if (!dispatcher || !dispatcher->RegisterHandler(FuseOpTypeToString(op_type), handler)) {
        Napi::Error::New(env, "Failed to register operation handler").ThrowAsJavaScriptException();
        return false;
    }

    {
        std::lock_guard<std::mutex> lock(handler_mutex_);
        handler_registry_[op_type] = HandlerRecord{FuseOpTypeToString(op_type)};
    }
    return true;
}

bool FuseBridge::RemoveOperationHandler(FuseOpType op_type) {
    if (op_type == FuseOpType::UNKNOWN) {
        return false;
    }

    auto dispatcher = GetGlobalDispatcher();
    if (!dispatcher) {
        return false;
    }

    std::string operation_name = FuseOpTypeToString(op_type);
    bool success = dispatcher->UnregisterHandler(operation_name);

    if (success) {
        std::lock_guard<std::mutex> lock(handler_mutex_);
        handler_registry_.erase(op_type);
    }

    return success;
}

bool FuseBridge::HasOperationHandler(FuseOpType op_type) {
    if (op_type == FuseOpType::UNKNOWN) {
        return false;
    }

    std::lock_guard<std::mutex> lock(handler_mutex_);
    return handler_registry_.find(op_type) != handler_registry_.end();
}

FuseBridge* FuseBridge::GetBridgeFromRequest(fuse_req_t req) {
    if (!req) {
        return nullptr;
    }

    auto* session_mgr = static_cast<SessionManager*>(fuse_req_userdata(req));
    if (!session_mgr) {
        return nullptr;
    }
    return session_mgr->GetBridge();
}

void FuseBridge::InitializeFuseOperations() {
    std::memset(&fuse_ops_, 0, sizeof(fuse_ops_));
    fuse_ops_.lookup = LookupCallback;
    fuse_ops_.getattr = GetattrCallback;
    fuse_ops_.setattr = SetattrCallback;
    fuse_ops_.readlink = ReadlinkCallback;
    fuse_ops_.mknod = MknodCallback;
    fuse_ops_.mkdir = MkdirCallback;
    fuse_ops_.symlink = SymlinkCallback;
    fuse_ops_.unlink = UnlinkCallback;
    fuse_ops_.rmdir = RmdirCallback;
    fuse_ops_.rename = RenameCallback;
    fuse_ops_.link = LinkCallback;
    fuse_ops_.open = OpenCallback;
    fuse_ops_.read = ReadCallback;
    fuse_ops_.write = WriteCallback;
    fuse_ops_.flush = FlushCallback;
    fuse_ops_.release = ReleaseCallback;
    fuse_ops_.fsync = FsyncCallback;
    fuse_ops_.opendir = OpendirCallback;
    fuse_ops_.readdir = ReaddirCallback;
    fuse_ops_.releasedir = ReleasedirCallback;
    fuse_ops_.fsyncdir = FsyncdirCallback;
    fuse_ops_.statfs = StatfsCallback;
    fuse_ops_.access = AccessCallback;
    fuse_ops_.create = CreateCallback;
}

void FuseBridge::ProcessRequest(std::shared_ptr<FuseRequestContext> context,
                                std::function<void(Napi::Env, Napi::Function)> js_invoker) {
    if (!context) {
        return;
    }

    if (!HasOperationHandler(context->op_type)) {
        context->ReplyError(ENOSYS);
        return;
    }

    auto dispatcher = GetGlobalDispatcher();
    if (!dispatcher) {
        if (!env_) {
            context->ReplyError(EINVAL);
            return;
        }

        if (!InitializeGlobalDispatcher(Napi::Env(env_))) {
            context->ReplyError(EIO);
            return;
        }
        dispatcher = GetGlobalDispatcher();
        if (!dispatcher) {
            context->ReplyError(EIO);
            return;
        }
    }

    std::string op_name = FuseOpTypeToString(context->op_type);
    auto shared_context = context;
    auto invoker_copy = std::move(js_invoker);

    uint64_t request_id = dispatcher->DispatchCustom(
        op_name,
        [shared_context, invoker_copy](Napi::Env env, Napi::Function handler) mutable {
            if (!invoker_copy) {
                shared_context->ReplyError(ENOSYS);
                return;
            }

            try {
                invoker_copy(env, handler);
            } catch (...) {
                shared_context->ReplyError(EIO);
            }
        },
        shared_context->priority,
        [shared_context](int error_code) {
            shared_context->ReplyError(error_code == 0 ? EIO : error_code);
        });

    if (request_id == 0) {
        shared_context->ReplyError(EAGAIN);
        return;
    }

    context->request_id = request_id;
}

std::shared_ptr<FuseRequestContext> FuseBridge::CreateContext(FuseOpType op_type, fuse_req_t req) {
    return std::make_shared<FuseRequestContext>(op_type, req, this);
}

void FuseBridge::HandleUnlink(fuse_req_t req, fuse_ino_t parent, const char* name) {
    auto context = CreateContext(FuseOpType::UNLINK, req);
    context->parent = parent;
    context->name = name ? name : "";

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value parent_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->parent));
        Napi::String name_value = Napi::String::New(env, context->name);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({parent_value, name_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value) {
            context->ReplyOk();
        });
    });
}

void FuseBridge::HandleRmdir(fuse_req_t req, fuse_ino_t parent, const char* name) {
    auto context = CreateContext(FuseOpType::RMDIR, req);
    context->parent = parent;
    context->name = name ? name : "";

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value parent_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->parent));
        Napi::String name_value = Napi::String::New(env, context->name);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({parent_value, name_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value) {
            context->ReplyOk();
        });
    });
}

void FuseBridge::HandleFlush(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::FLUSH, req);
    context->ino = ino;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Value fi_value = context->has_fi
                                   ? NapiHelpers::FileInfoToObject(env, context->fi)
                                   : env.Null();
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, fi_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value) {
            context->ReplyOk();
        });
    });
}

void FuseBridge::HandleRelease(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::RELEASE, req);
    context->ino = ino;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Value fi_value = context->has_fi
                                   ? NapiHelpers::FileInfoToObject(env, context->fi)
                                   : env.Null();
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, fi_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value) {
            context->ReplyOk();
        });
    });
}

void FuseBridge::HandleFsync(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::FSYNC, req);
    context->ino = ino;
    context->datasync = datasync;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Boolean datasync_value = Napi::Boolean::New(env, context->datasync != 0);
        Napi::Value fi_value = context->has_fi
                                   ? NapiHelpers::FileInfoToObject(env, context->fi)
                                   : env.Null();
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, datasync_value, fi_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value) {
            context->ReplyOk();
        });
    });
}

void FuseBridge::HandleReleasedir(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::RELEASEDIR, req);
    context->ino = ino;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Value fi_value = context->has_fi
                                   ? NapiHelpers::FileInfoToObject(env, context->fi)
                                   : env.Null();
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, fi_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value) {
            context->ReplyOk();
        });
    });
}

void FuseBridge::HandleFsyncdir(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::FSYNCDIR, req);
    context->ino = ino;
    context->datasync = datasync;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Boolean datasync_value = Napi::Boolean::New(env, context->datasync != 0);
        Napi::Value fi_value = context->has_fi
                                   ? NapiHelpers::FileInfoToObject(env, context->fi)
                                   : env.Null();
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, datasync_value, fi_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value) {
            context->ReplyOk();
        });
    });
}

void FuseBridge::HandleAccess(fuse_req_t req, fuse_ino_t ino, int mask) {
    auto context = CreateContext(FuseOpType::ACCESS, req);
    context->ino = ino;
    context->access_mask = static_cast<uint32_t>(mask);

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Number mask_value = Napi::Number::New(env, context->access_mask);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, mask_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value) {
            context->ReplyOk();
        });
    });
}

void FuseBridge::HandleRename(fuse_req_t req, fuse_ino_t parent, const char* name,
                              fuse_ino_t newparent, const char* newname, unsigned int flags) {
    auto context = CreateContext(FuseOpType::RENAME, req);
    context->parent = parent;
    context->name = name ? name : "";
    context->new_parent = newparent;
    context->new_name = newname ? newname : "";
    context->flags = static_cast<int>(flags);

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value parent_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->parent));
        Napi::String name_value = Napi::String::New(env, context->name);
        Napi::Value new_parent_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->new_parent));
        Napi::String new_name_value = Napi::String::New(env, context->new_name);
        Napi::Number flags_value = Napi::Number::New(env, context->flags);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({parent_value, name_value, new_parent_value, new_name_value,
                                    flags_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            if (value.IsUndefined() || value.IsNull()) {
                context->ReplyOk();
                return;
            }
            context->ReplyError(EIO);
        });
    });
}

void FuseBridge::HandleLink(fuse_req_t req, fuse_ino_t ino, fuse_ino_t newparent, const char* newname) {
    auto context = CreateContext(FuseOpType::LINK, req);
    context->ino = ino;
    context->new_parent = newparent;
    context->new_name = newname ? newname : "";

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Value new_parent_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->new_parent));
        Napi::String new_name_value = Napi::String::New(env, context->new_name);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, new_parent_value, new_name_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env, Napi::Value) {
            context->ReplyUnsupported();
        });
    });
}

void FuseBridge::HandleLookup(fuse_req_t req, fuse_ino_t parent, const char* name) {
    auto context = CreateContext(FuseOpType::LOOKUP, req);
    context->parent = parent;
    context->name = name ? name : "";

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value parent_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->parent));
        Napi::String name_value = Napi::String::New(env, context->name);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({parent_value, name_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env, Napi::Value) {
            context->ReplyUnsupported();
        });
    });
}

void FuseBridge::HandleGetattr(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::GETATTR, req);
    context->ino = ino;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Value fi_value = context->has_fi
                                   ? NapiHelpers::FileInfoToObject(env, context->fi)
                                   : env.Null();
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, request_ctx, fi_value, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            if (!value.IsObject()) {
                context->ReplyError(EIO);
                return;
            }

            Napi::Object result_obj = value.As<Napi::Object>();
            if (!result_obj.Has("attr")) {
                context->ReplyError(EIO);
                return;
            }

            Napi::Value attr_value = result_obj.Get("attr");
            if (!attr_value.IsObject()) {
                context->ReplyError(EIO);
                return;
            }

            struct stat attr{};
            if (!NapiHelpers::ObjectToStat(attr_value.As<Napi::Object>(), &attr)) {
                context->ReplyError(EIO);
                return;
            }

            double timeout = 1.0;
            if (result_obj.Has("timeout")) {
                Napi::Value timeout_value = result_obj.Get("timeout");
                if (!timeout_value.IsNumber()) {
                    context->ReplyError(EIO);
                    return;
                }

                timeout = timeout_value.As<Napi::Number>().DoubleValue();
                if (!std::isfinite(timeout) || timeout < 0.0) {
                    context->ReplyError(EIO);
                    return;
                }
            }

            context->ReplyAttr(attr, timeout);
        });
    });
}

void FuseBridge::HandleSetattr(fuse_req_t req, fuse_ino_t ino, struct stat* attr, int to_set,
                               struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::SETATTR, req);
    context->ino = ino;
    context->setattr_valid = static_cast<uint32_t>(to_set);
    if (attr) {
        context->attr = *attr;
        context->has_attr = true;
    }
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Object attr_value = context->has_attr
                                      ? NapiHelpers::StatToObject(env, context->attr)
                                      : Napi::Object::New(env);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);
        options.Set("valid", Napi::Number::New(env, context->setattr_valid));
        if (context->has_fi) {
            options.Set("fi", NapiHelpers::FileInfoToObject(env, context->fi));
        }

        auto result = handler.Call({ino_value, attr_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env, Napi::Value) {
            context->ReplyUnsupported();
        });
    });
}

void FuseBridge::HandleReadlink(fuse_req_t req, fuse_ino_t ino) {
    auto context = CreateContext(FuseOpType::READLINK, req);
    context->ino = ino;

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            if (value.IsString()) {
                context->ReplyReadlink(value.As<Napi::String>().Utf8Value());
                return;
            }

            if (value.IsObject()) {
                Napi::Object obj = value.As<Napi::Object>();
                if (obj.Has("target")) {
                    Napi::Value target_value = obj.Get("target");
                    if (target_value.IsString()) {
                        context->ReplyReadlink(target_value.As<Napi::String>().Utf8Value());
                        return;
                    }
                }
            }

            context->ReplyError(EIO);
        });
    });
}

void FuseBridge::HandleMknod(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode, dev_t rdev) {
    auto context = CreateContext(FuseOpType::MKNOD, req);
    context->parent = parent;
    context->name = name ? name : "";
    context->mode = mode;
    context->rdev = rdev;

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value parent_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->parent));
        Napi::String name_value = Napi::String::New(env, context->name);
        Napi::Number mode_value = Napi::Number::New(env, context->mode);
        Napi::Value rdev_value = NapiHelpers::CreateBigUint64(env, static_cast<uint64_t>(context->rdev));
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({parent_value, name_value, mode_value, rdev_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            struct fuse_entry_param entry{};
            if (!PopulateEntryFromResult(env_inner, value, &entry)) {
                context->ReplyError(EIO);
                return;
            }

            context->ReplyEntry(entry);
        });
    });
}

void FuseBridge::HandleMkdir(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode) {
    auto context = CreateContext(FuseOpType::MKDIR, req);
    context->parent = parent;
    context->name = name ? name : "";
    context->mode = mode;

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value parent_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->parent));
        Napi::String name_value = Napi::String::New(env, context->name);
        Napi::Number mode_value = Napi::Number::New(env, context->mode);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({parent_value, name_value, mode_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            struct fuse_entry_param entry{};
            if (!PopulateEntryFromResult(env_inner, value, &entry)) {
                context->ReplyError(EIO);
                return;
            }

            context->ReplyEntry(entry);
        });
    });
}

void FuseBridge::HandleSymlink(fuse_req_t req, const char* link, fuse_ino_t parent, const char* name) {
    auto context = CreateContext(FuseOpType::SYMLINK, req);
    context->link_target = link ? link : "";
    context->parent = parent;
    context->name = name ? name : "";

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::String target_value = Napi::String::New(env, context->link_target);
        Napi::Value parent_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->parent));
        Napi::String name_value = Napi::String::New(env, context->name);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({target_value, parent_value, name_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            struct fuse_entry_param entry{};
            if (!PopulateEntryFromResult(env_inner, value, &entry)) {
                context->ReplyError(EIO);
                return;
            }

            context->ReplyEntry(entry);
        });
    });
}

void FuseBridge::HandleOpen(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::OPEN, req);
    context->ino = ino;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Number flags_value = Napi::Number::New(env, context->has_fi ? context->fi.flags : 0);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, flags_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            if (value.IsObject()) {
                auto fi_object = value.As<Napi::Object>();
                struct fuse_file_info fi_result{};
                if (NapiHelpers::ObjectToFileInfo(fi_object, &fi_result)) {
                    context->ReplyOpen(fi_result);
                    return;
                }
            }
            context->ReplyUnsupported();
        });
    });
}

void FuseBridge::HandleOpendir(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::OPENDIR, req);
    context->ino = ino;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            if (value.IsObject()) {
                auto fi_object = value.As<Napi::Object>();
                struct fuse_file_info fi_result{};
                if (NapiHelpers::ObjectToFileInfo(fi_object, &fi_result)) {
                    context->ReplyOpen(fi_result);
                    return;
                }
            }
            context->ReplyUnsupported();
        });
    });
}

void FuseBridge::HandleRead(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off,
                    struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::READ, req);
    context->ino = ino;
    context->size = size;
    context->offset = static_cast<uint64_t>(off);
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Object options = Napi::Object::New(env);
        options.Set("offset", NapiHelpers::CreateBigUint64(env, context->offset));
        options.Set("size", Napi::Number::New(env, context->size));
        if (context->has_fi) {
            options.Set("fi", NapiHelpers::FileInfoToObject(env, context->fi));
        }
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);

        auto result = handler.Call({ino_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            if (value.IsArrayBuffer()) {
                Napi::ArrayBuffer buffer = value.As<Napi::ArrayBuffer>();
                context->ReplyBuf(buffer.Data(), buffer.ByteLength());
                return;
            }
            if (value.IsTypedArray()) {
                Napi::TypedArray typed = value.As<Napi::TypedArray>();
                context->ReplyBuf(typed.ArrayBuffer().Data(), typed.ByteLength());
                return;
            }
            context->ReplyUnsupported();
        });
    });
}

void FuseBridge::HandleWrite(fuse_req_t req, fuse_ino_t ino, const char* buf, size_t size, off_t off,
                     struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::WRITE, req);
    context->ino = ino;
    context->size = size;
    context->offset = static_cast<uint64_t>(off);
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }
    if (buf && size > 0) {
        context->data.assign(reinterpret_cast<const uint8_t*>(buf),
                             reinterpret_cast<const uint8_t*>(buf) + size);
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::ArrayBuffer buffer = context->data.empty()
                                       ? Napi::ArrayBuffer::New(env, 0)
                                       : Napi::ArrayBuffer::New(env,
                                                                context->data.data(),
                                                                context->data.size());
        Napi::Object options = Napi::Object::New(env);
        options.Set("offset", NapiHelpers::CreateBigUint64(env, context->offset));
        if (context->has_fi) {
            options.Set("fi", NapiHelpers::FileInfoToObject(env, context->fi));
        }
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);

        auto result = handler.Call({ino_value, buffer, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            if (value.IsNumber()) {
                size_t written = static_cast<size_t>(value.As<Napi::Number>().Uint32Value());
                context->ReplyWrite(written);
                return;
            }
            if (value.IsBigInt()) {
                bool lossless = false;
                uint64_t written = value.As<Napi::BigInt>().Uint64Value(&lossless);
                if (lossless) {
                    context->ReplyWrite(static_cast<size_t>(written));
                    return;
                }
            }
            context->ReplyUnsupported();
        });
    });
}

void FuseBridge::HandleReaddir(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off,
                       struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::READDIR, req);
    context->ino = ino;
    context->size = size;
    context->offset = static_cast<uint64_t>(off);
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Value offset_value = NapiHelpers::CreateBigUint64(env, context->offset);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Value fi_value = context->has_fi
                                   ? NapiHelpers::FileInfoToObject(env, context->fi)
                                   : env.Null();
        Napi::Object options = Napi::Object::New(env);
        options.Set("size", Napi::Number::New(env, context->size));

        auto result = handler.Call({ino_value, offset_value, request_ctx, fi_value, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env, Napi::Value) {
            context->ReplyUnsupported();
        });
    });
}

void FuseBridge::HandleStatfs(fuse_req_t req, fuse_ino_t ino) {
    auto context = CreateContext(FuseOpType::STATFS, req);
    context->ino = ino;

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env, Napi::Value) {
            context->ReplyUnsupported();
        });
    });
}

void FuseBridge::HandleCreate(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode,
                      struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::CREATE, req);
    context->parent = parent;
    context->name = name ? name : "";
    context->mode = mode;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value parent_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->parent));
        Napi::String name_value = Napi::String::New(env, context->name);
        Napi::Number mode_value = Napi::Number::New(env, context->mode);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);
        if (context->has_fi) {
            options.Set("fi", NapiHelpers::FileInfoToObject(env, context->fi));
        }

        auto result = handler.Call({parent_value, name_value, mode_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            if (value.IsObject()) {
                Napi::Object result_obj = value.As<Napi::Object>();
                if (result_obj.Has("fi")) {
                    struct fuse_file_info fi_result{};
                    if (NapiHelpers::ObjectToFileInfo(result_obj.Get("fi").As<Napi::Object>(), &fi_result)) {
                        if (result_obj.Has("attr")) {
                            struct stat attr{};
                            if (NapiHelpers::ObjectToStat(result_obj.Get("attr").As<Napi::Object>(), &attr)) {
                                double timeout = 1.0;
                                if (result_obj.Has("timeout") && result_obj.Get("timeout").IsNumber()) {
                                    timeout = result_obj.Get("timeout").As<Napi::Number>().DoubleValue();
                                }
                                struct fuse_entry_param entry{};
                                std::memset(&entry, 0, sizeof(entry));
                                entry.attr = attr;
                                entry.attr_timeout = timeout;
                                entry.entry_timeout = timeout;
                                entry.ino = attr.st_ino != 0 ? static_cast<fuse_ino_t>(attr.st_ino) : 0;
                                context->ReplyCreate(entry, fi_result);
                                return;
                            }
                        }
                    }
                }
            }
            context->ReplyUnsupported();
        });
    });
}

void FuseBridge::LookupCallback(fuse_req_t req, fuse_ino_t parent, const char* name) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleLookup(req, parent, name);
}

void FuseBridge::GetattrCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleGetattr(req, ino, fi);
}

void FuseBridge::SetattrCallback(fuse_req_t req, fuse_ino_t ino, struct stat* attr, int to_set,
                                struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        if (req) {
            fuse_reply_err(req, ENODEV);
        }
        return;
    }
    bridge->HandleSetattr(req, ino, attr, to_set, fi);
}

void FuseBridge::ReadlinkCallback(fuse_req_t req, fuse_ino_t ino) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleReadlink(req, ino);
}

void FuseBridge::MknodCallback(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode, dev_t rdev) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleMknod(req, parent, name, mode, rdev);
}

void FuseBridge::MkdirCallback(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleMkdir(req, parent, name, mode);
}

void FuseBridge::SymlinkCallback(fuse_req_t req, const char* link, fuse_ino_t parent, const char* name) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleSymlink(req, link, parent, name);
}

void FuseBridge::UnlinkCallback(fuse_req_t req, fuse_ino_t parent, const char* name) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleUnlink(req, parent, name);
}

void FuseBridge::RmdirCallback(fuse_req_t req, fuse_ino_t parent, const char* name) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleRmdir(req, parent, name);
}

void FuseBridge::RenameCallback(fuse_req_t req, fuse_ino_t parent, const char* name,
                               fuse_ino_t newparent, const char* newname, unsigned int flags) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleRename(req, parent, name, newparent, newname, flags);
}

void FuseBridge::LinkCallback(fuse_req_t req, fuse_ino_t ino, fuse_ino_t newparent, const char* newname) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleLink(req, ino, newparent, newname);
}

void FuseBridge::OpenCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleOpen(req, ino, fi);
}

void FuseBridge::ReadCallback(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off,
                             struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleRead(req, ino, size, off, fi);
}

void FuseBridge::WriteCallback(fuse_req_t req, fuse_ino_t ino, const char* buf, size_t size, off_t off,
                              struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleWrite(req, ino, buf, size, off, fi);
}

void FuseBridge::FlushCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleFlush(req, ino, fi);
}

void FuseBridge::ReleaseCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleRelease(req, ino, fi);
}

void FuseBridge::FsyncCallback(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleFsync(req, ino, datasync, fi);
}

void FuseBridge::OpendirCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleOpendir(req, ino, fi);
}

void FuseBridge::ReaddirCallback(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off,
                                struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleReaddir(req, ino, size, off, fi);
}

void FuseBridge::ReleasedirCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleReleasedir(req, ino, fi);
}

void FuseBridge::FsyncdirCallback(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleFsyncdir(req, ino, datasync, fi);
}

void FuseBridge::StatfsCallback(fuse_req_t req, fuse_ino_t ino) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleStatfs(req, ino);
}

void FuseBridge::AccessCallback(fuse_req_t req, fuse_ino_t ino, int mask) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleAccess(req, ino, mask);
}

void FuseBridge::CreateCallback(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode,
                               struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleCreate(req, parent, name, mode, fi);
}

Napi::Value SetOperationHandler(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected operation name and handler").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (!info[0].IsString()) {
        Napi::TypeError::New(env, "Operation name must be a string").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (!info[1].IsFunction()) {
        Napi::TypeError::New(env, "Handler must be a function").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string operation = info[0].As<Napi::String>().Utf8Value();
    FuseOpType op_type = StringToFuseOpType(operation);
    Napi::Function handler = info[1].As<Napi::Function>();

    bool success = FuseBridge::RegisterOperationHandler(env, op_type, handler);
    return Napi::Boolean::New(env, success);
}

Napi::Value RemoveOperationHandler(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected operation name string").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string operation = info[0].As<Napi::String>().Utf8Value();
    FuseOpType op_type = StringToFuseOpType(operation);

    bool success = FuseBridge::RemoveOperationHandler(op_type);
    return Napi::Boolean::New(env, success);
}

} // namespace fuse_native
