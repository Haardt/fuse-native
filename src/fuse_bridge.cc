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

#if defined(__APPLE__)
inline struct timespec GetStatAtime(const struct stat& st) {
    return st.st_atimespec;
}

inline struct timespec GetStatMtime(const struct stat& st) {
    return st.st_mtimespec;
}

inline struct timespec GetStatCtime(const struct stat& st) {
    return st.st_ctimespec;
}
#else
inline struct timespec GetStatAtime(const struct stat& st) {
    return st.st_atim;
}

inline struct timespec GetStatMtime(const struct stat& st) {
    return st.st_mtim;
}

inline struct timespec GetStatCtime(const struct stat& st) {
    return st.st_ctim;
}
#endif

// Kanonische FUSE3-lowlevel Operationen (exakte Feldnamen aus fuse_lowlevel_ops)
constexpr std::array<OperationMapping, 45> kOperationMappings = {{
    {"init",             FuseOpType::INIT},
    {"destroy",          FuseOpType::DESTROY},
    {"forget",           FuseOpType::FORGET},
    {"forget_multi",     FuseOpType::FORGET_MULTI},
    {"lookup",           FuseOpType::LOOKUP},
    {"getattr",          FuseOpType::GETATTR},
    {"setattr",          FuseOpType::SETATTR},
    {"readlink",         FuseOpType::READLINK},
    {"mknod",            FuseOpType::MKNOD},
    {"mkdir",            FuseOpType::MKDIR},
    {"unlink",           FuseOpType::UNLINK},
    {"rmdir",            FuseOpType::RMDIR},
    {"symlink",          FuseOpType::SYMLINK},
    {"rename",           FuseOpType::RENAME},
    {"link",             FuseOpType::LINK},
    {"setxattr",         FuseOpType::SETXATTR},
    {"getxattr",         FuseOpType::GETXATTR},
    {"listxattr",        FuseOpType::LISTXATTR},
    {"removexattr",      FuseOpType::REMOVEXATTR},
    {"open",             FuseOpType::OPEN},
    {"read",             FuseOpType::READ},
    {"write",            FuseOpType::WRITE},
    {"write_buf",        FuseOpType::WRITE_BUF},
    {"read_buf",         FuseOpType::READ_BUF},
    {"flush",            FuseOpType::FLUSH},
    {"release",          FuseOpType::RELEASE},
    {"fsync",            FuseOpType::FSYNC},
    {"fallocate",        FuseOpType::FALLOCATE},
    {"lseek",            FuseOpType::LSEEK},
    {"copy_file_range",  FuseOpType::COPY_FILE_RANGE},
    {"opendir",          FuseOpType::OPENDIR},
    {"readdir",          FuseOpType::READDIR},
    {"readdirplus",      FuseOpType::READDIRPLUS},
    {"releasedir",       FuseOpType::RELEASEDIR},
    {"fsyncdir",         FuseOpType::FSYNCDIR},
    {"statfs",           FuseOpType::STATFS},
    {"access",           FuseOpType::ACCESS},
    {"create",           FuseOpType::CREATE},
    {"bmap",             FuseOpType::BMAP},
    {"ioctl",            FuseOpType::IOCTL},
    {"poll",             FuseOpType::POLL},
    {"flock",            FuseOpType::FLOCK},
    {"getlk",            FuseOpType::GETLK},
    {"setlk",            FuseOpType::SETLK},
    {"retrieve_reply",   FuseOpType::RETRIEVE_REPLY}
}};

// Praktische Aliase für deine N-API Oberfläche
constexpr std::array<OperationMapping, 5> kOperationAliasMappings = {{
    // Lowlevel kennt kein eigenes "truncate" – das ist ein setattr(size)
    {"truncate", FuseOpType::TRUNCATE}, // falls du es getrennt behandelst
    // Lowlevel kennt kein eigenes chmod/chown – beides ist ebenfalls setattr
    {"chmod",    FuseOpType::CHMOD},
    {"chown",    FuseOpType::CHOWN},
    // Highlevel kennt "utimens" – lowlevel ist das setattr(atime/mtime)
    {"utimens",  FuseOpType::SETATTR},
    // Für Konsistenz, falls JS-Seite camelCase verwendet
    {"copyFileRange", FuseOpType::COPY_FILE_RANGE},
}};


inline uint64_t ToUint64(fuse_ino_t value) {
    return static_cast<uint64_t>(value);
}

Napi::Object CreateRequestContextObject(Napi::Env env, const FuseRequestContext& context) {
    fprintf(stderr, "FUSE: CreateRequestContextObject - creating object\n");
    Napi::Object ctx = Napi::Object::New(env);
    if (!context.has_caller_ctx) {
        fprintf(stderr, "FUSE: CreateRequestContextObject - no caller context, setting defaults\n");
        ctx.Set("uid", Napi::Number::New(env, 0));
        ctx.Set("gid", Napi::Number::New(env, 0));
        ctx.Set("pid", Napi::Number::New(env, 0));
        ctx.Set("umask", Napi::Number::New(env, 0));
        fprintf(stderr, "FUSE: CreateRequestContextObject - returning default context\n");
        return ctx;
    }

    fprintf(stderr, "FUSE: CreateRequestContextObject - has caller context, setting values\n");
    ctx.Set("uid", Napi::Number::New(env, static_cast<double>(context.caller_ctx.uid)));
    ctx.Set("gid", Napi::Number::New(env, static_cast<double>(context.caller_ctx.gid)));
    ctx.Set("pid", Napi::Number::New(env, static_cast<double>(context.caller_ctx.pid)));
    ctx.Set("umask", Napi::Number::New(env, static_cast<double>(context.caller_ctx.umask)));
    fprintf(stderr, "FUSE: CreateRequestContextObject - returning context with caller info\n");
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
      new_offset(0),
      size(0),
      flags(0),
      datasync(0),
      access_mask(0),
      has_lock(false),
      sleep(0),
      replied(false) {
    fprintf(stderr, "FUSE: FuseRequestContext - creating context for op_type %d\n", static_cast<int>(op));
    std::memset(&attr, 0, sizeof(attr));
    std::memset(&fi, 0, sizeof(fi));
    std::memset(&fi_out, 0, sizeof(fi_out));
    std::memset(&lock, 0, sizeof(lock));
    std::memset(&caller_ctx, 0, sizeof(caller_ctx));
    if (req) {
        fprintf(stderr, "FUSE: FuseRequestContext - capturing caller context\n");
        CaptureCallerContext();
    } else {
        fprintf(stderr, "FUSE: FuseRequestContext - no request provided\n");
    }
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

void FuseRequestContext::ReplyGetlk(const struct flock& lock) {
    if (!TryMarkReplied() || !request) {
        return;
    }
    fuse_reply_lock(request, const_cast<struct flock*>(&lock));
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
    for (const auto& mapping : kOperationAliasMappings) {
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
     for (const auto& mapping : kOperationAliasMappings) {
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
    fprintf(stderr, "FUSE: FuseBridge::Initialize - starting\n");
    if (initialized_) {
        fprintf(stderr, "FUSE: FuseBridge::Initialize - already initialized\n");
        return true;
    }

    env_ = env;
    fprintf(stderr, "FUSE: FuseBridge::Initialize - calling InitializeFuseOperations\n");
    InitializeFuseOperations();
    initialized_ = true;
    fprintf(stderr, "FUSE: FuseBridge::Initialize - completed successfully\n");
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

bool FuseBridge::RegisterOperationHandler(Napi::Env env, FuseOpType op_type, Napi::Function handler, const std::string& operation_name) {
    if (op_type == FuseOpType::UNKNOWN) {
        std::string error_msg = "Unsupported FUSE operation: " + operation_name;
        Napi::TypeError::New(env, error_msg).ThrowAsJavaScriptException();
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

    fprintf(stderr, "FUSE: Registering handler for %s\n", operation_name.c_str());
    fflush(stderr);

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
    bool found = handler_registry_.find(op_type) != handler_registry_.end();
    fprintf(stderr, "FUSE: Checking for handler for %s, found: %d\n", FuseOpTypeToString(op_type), found);
    fflush(stderr);
    return found;
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

    // Lifecycle
    fuse_ops_.init = InitCallback;
    fuse_ops_.destroy = DestroyCallback;

    // Inode/Entry management
    fuse_ops_.forget = ForgetCallback;
    fuse_ops_.forget_multi = ForgetMultiCallback;
    fuse_ops_.lookup = LookupCallback;

    fuse_ops_.getattr = GetattrCallback;
    fuse_ops_.setattr = SetattrCallback;
    fuse_ops_.readlink = ReadlinkCallback;
    fuse_ops_.mknod = MknodCallback;
    fuse_ops_.mkdir = MkdirCallback;
    fuse_ops_.unlink = UnlinkCallback;
    fuse_ops_.rmdir = RmdirCallback;
    fuse_ops_.symlink = SymlinkCallback;
    fuse_ops_.rename = RenameCallback;
    fuse_ops_.link = LinkCallback;

    // File/Directory operations
    fuse_ops_.open = OpenCallback;
    fuse_ops_.read = ReadCallback;
    fuse_ops_.write = WriteCallback;
    fuse_ops_.write_buf = WriteBufCallback;
    fuse_ops_.flush = FlushCallback;
    fuse_ops_.release = ReleaseCallback;
    fuse_ops_.fsync = FsyncCallback;
    fuse_ops_.opendir = OpendirCallback;
    fuse_ops_.readdir = ReaddirCallback;
    fuse_ops_.readdirplus = nullptr;
    fuse_ops_.releasedir = ReleasedirCallback;
    fuse_ops_.fsyncdir = FsyncdirCallback;
    fuse_ops_.statfs = StatfsCallback;
    fuse_ops_.access = AccessCallback;
    fuse_ops_.create = CreateCallback;
    fuse_ops_.copy_file_range = CopyFileRangeCallback;
    
    // Explicitly add handlers that might be missing
    fuse_ops_.getlk = nullptr;
    fuse_ops_.setlk = nullptr;
    fuse_ops_.bmap = nullptr;
    fuse_ops_.ioctl = nullptr;
    fuse_ops_.poll = nullptr;

    // Extended attributes
    fuse_ops_.setxattr = SetxattrCallback;
    fuse_ops_.getxattr = GetxattrCallback;
    fuse_ops_.listxattr = ListxattrCallback;
    fuse_ops_.removexattr = RemovexattrCallback;

    // File locking
    fuse_ops_.getlk = GetlkCallback;
    fuse_ops_.setlk = SetlkCallback;
}

void FuseBridge::ProcessRequest(std::shared_ptr<FuseRequestContext> context,
                                 std::function<void(Napi::Env, Napi::Function)> js_invoker) {
    if (!context) {
        fprintf(stderr, "FUSE: ProcessRequest - context is null\n");
        return;
    }

    fprintf(stderr, "FUSE: ProcessRequest - op_type: %d\n", static_cast<int>(context->op_type));
    const char* op_name_str = FuseOpTypeToString(context->op_type);
    fprintf(stderr, "FUSE: ProcessRequest - op_name: %s\n", op_name_str);

    if (!HasOperationHandler(context->op_type)) {
        fprintf(stderr, "FUSE: ProcessRequest - no handler for %s\n", op_name_str);
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

    std::string op_name = op_name_str;
    auto shared_context = context;
    auto invoker_copy = std::move(js_invoker);

uint64_t request_id = dispatcher->DispatchCustom(
    op_name,
    [shared_context, invoker = std::move(invoker_copy), op_name](Napi::Env env, Napi::Function handler) mutable {
        Napi::HandleScope hs(env);
        if (!shared_context || !handler.IsFunction()) { 
            if (shared_context) shared_context->ReplyError(EIO); 
            return; 
        }
        invoker(env, handler);
    },
    shared_context->priority,
    [shared_context](int error_code) {
        fprintf(stderr, "FUSE: Dispatch error cb: %d\n", error_code);
        if (shared_context && !shared_context->replied.load()) {
            shared_context->ReplyError(error_code == 0 ? EIO : error_code);
        }
    });

    if (request_id == 0) {
        shared_context->ReplyError(EAGAIN);
        return;
    }

    context->request_id = request_id;
}

std::shared_ptr<FuseRequestContext> FuseBridge::CreateContext(FuseOpType op_type, fuse_req_t req) {
    fprintf(stderr, "FUSE: CreateContext - creating context for op_type %d\n", static_cast<int>(op_type));
    auto context = std::make_shared<FuseRequestContext>(op_type, req, this);
    fprintf(stderr, "FUSE: CreateContext - context created successfully\n");
    return context;
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
        options.Set("mask", mask_value);

        auto result = handler.Call({ino_value, request_ctx, options});
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
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            struct fuse_entry_param entry {};
            if (!PopulateEntryFromResult(env_inner, value, &entry)) {
                // ENOENT is a valid negative cache response for lookup
                context->ReplyError(ENOENT);
                return;
            }
            context->ReplyEntry(entry);
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
    const bool mode_requested = (to_set & FUSE_SET_ATTR_MODE) != 0;
    const bool other_mode_bits = (to_set & ~FUSE_SET_ATTR_MODE) != 0;
    const bool uid_requested = (to_set & FUSE_SET_ATTR_UID) != 0;
    const bool gid_requested = (to_set & FUSE_SET_ATTR_GID) != 0;
    const uint32_t chown_mask = FUSE_SET_ATTR_UID | FUSE_SET_ATTR_GID;
    const bool only_chown_bits = (to_set & ~chown_mask) == 0;

    if ((uid_requested || gid_requested) && only_chown_bits && attr &&
        HasOperationHandler(FuseOpType::CHOWN)) {
        HandleChown(req, ino, attr, to_set, fi);
        return;
    }

    if (mode_requested && !other_mode_bits && attr && HasOperationHandler(FuseOpType::CHMOD)) {
        HandleChmod(req, ino, attr->st_mode, fi, to_set);
        return;
    }

    if (!attr) {
        auto context = CreateContext(FuseOpType::SETATTR, req);
        context->ReplyError(EINVAL);
        return;
    }

    // Special-case: pure truncate via setattr(size) → dispatch to 'truncate' if available
    const bool size_requested = (to_set & FUSE_SET_ATTR_SIZE) != 0;
    const bool only_size = (to_set & ~FUSE_SET_ATTR_SIZE) == 0;
    if (size_requested && only_size && HasOperationHandler(FuseOpType::TRUNCATE)) {
        auto tctx = CreateContext(FuseOpType::TRUNCATE, req);
        tctx->ino = ino;
        if (fi) {
            tctx->fi = *fi;
            tctx->has_fi = true;
        }

        ProcessRequest(tctx, [tctx, attr](Napi::Env env, Napi::Function handler) {
            Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(tctx->ino));
            Napi::Value size_value = NapiHelpers::CreateBigInt64(env, static_cast<int64_t>(attr->st_size));
            Napi::Object request_ctx = CreateRequestContextObject(env, *tctx);
            Napi::Object options = Napi::Object::New(env);
            if (tctx->has_fi) {
                options.Set("fi", NapiHelpers::FileInfoToObject(env, tctx->fi));
            }

            auto result = handler.Call({ino_value, size_value, request_ctx, options});
            ResolvePromiseOrValue(env, tctx, result, [tctx](Napi::Env env_inner, Napi::Value value) {
                if (!value.IsObject()) {
                    tctx->ReplyError(EIO);
                    return;
                }

                Napi::Object result_obj = value.As<Napi::Object>();
                if (!result_obj.Has("attr")) {
                    tctx->ReplyError(EIO);
                    return;
                }

                Napi::Value attr_value = result_obj.Get("attr");
                if (!attr_value.IsObject()) {
                    tctx->ReplyError(EIO);
                    return;
                }

                struct stat attr_result {};
                if (!NapiHelpers::ObjectToStat(attr_value.As<Napi::Object>(), &attr_result)) {
                    tctx->ReplyError(EIO);
                    return;
                }

                double timeout = 1.0;
                if (result_obj.Has("timeout")) {
                    Napi::Value timeout_value = result_obj.Get("timeout");
                    if (!timeout_value.IsNumber()) {
                        tctx->ReplyError(EIO);
                        return;
                    }
                    timeout = timeout_value.As<Napi::Number>().DoubleValue();
                    if (!std::isfinite(timeout) || timeout < 0.0) {
                        tctx->ReplyError(EIO);
                        return;
                    }
                }

                tctx->ReplyAttr(attr_result, timeout);
            });
        });
        return;
    }

    auto context = CreateContext(FuseOpType::SETATTR, req);
    context->ino = ino;
    context->setattr_valid = static_cast<uint32_t>(to_set);
    context->attr = *attr;
    context->has_attr = true;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Object attr_object = Napi::Object::New(env);

        if (context->has_attr) {
            const struct stat& st = context->attr;
            const uint32_t valid = context->setattr_valid;

            if ((valid & FUSE_SET_ATTR_MODE) != 0) {
                attr_object.Set("mode", Napi::Number::New(env, st.st_mode));
            }
            if ((valid & FUSE_SET_ATTR_UID) != 0) {
                attr_object.Set("uid", Napi::Number::New(env, st.st_uid));
            }
            if ((valid & FUSE_SET_ATTR_GID) != 0) {
                attr_object.Set("gid", Napi::Number::New(env, st.st_gid));
            }
            if ((valid & FUSE_SET_ATTR_SIZE) != 0) {
                attr_object.Set("size", NapiHelpers::CreateBigInt64(env, st.st_size));
            }
            if ((valid & FUSE_SET_ATTR_ATIME) != 0) {
                struct timespec ts = GetStatAtime(st);
                attr_object.Set("atime", NapiHelpers::TimespecToNsBigInt(env, ts));
            }
            if ((valid & FUSE_SET_ATTR_MTIME) != 0) {
                struct timespec ts = GetStatMtime(st);
                attr_object.Set("mtime", NapiHelpers::TimespecToNsBigInt(env, ts));
            }
            if ((valid & FUSE_SET_ATTR_CTIME) != 0) {
                struct timespec ts = GetStatCtime(st);
                attr_object.Set("ctime", NapiHelpers::TimespecToNsBigInt(env, ts));
            }
        }

        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);
        options.Set("valid", Napi::Number::New(env, context->setattr_valid));
        if (context->has_fi) {
            options.Set("fi", NapiHelpers::FileInfoToObject(env, context->fi));
        }
        if ((context->setattr_valid & FUSE_SET_ATTR_ATIME_NOW) != 0) {
            options.Set("atimeNow", Napi::Boolean::New(env, true));
        }
        if ((context->setattr_valid & FUSE_SET_ATTR_MTIME_NOW) != 0) {
            options.Set("mtimeNow", Napi::Boolean::New(env, true));
        }

        auto result = handler.Call({ino_value, attr_object, request_ctx, options});
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

            struct stat attr_result {};
            if (!NapiHelpers::ObjectToStat(attr_value.As<Napi::Object>(), &attr_result)) {
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

            context->ReplyAttr(attr_result, timeout);
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

void FuseBridge::HandleChmod(fuse_req_t req, fuse_ino_t ino, mode_t mode, struct fuse_file_info* fi, int to_set) {
    auto context = CreateContext(FuseOpType::CHMOD, req);
    context->ino = ino;
    context->mode = mode;
    context->setattr_valid = static_cast<uint32_t>(to_set);
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Number mode_value = Napi::Number::New(env, context->mode);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);
        options.Set("valid", Napi::Number::New(env, context->setattr_valid));
        if (context->has_fi) {
            options.Set("fi", NapiHelpers::FileInfoToObject(env, context->fi));
        }

        auto result = handler.Call({ino_value, mode_value, request_ctx, options});
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

void FuseBridge::HandleChown(fuse_req_t req, fuse_ino_t ino, struct stat* attr, int to_set,
                             struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::CHOWN, req);
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

        Napi::Value uid_value = env.Null();
        Napi::Value gid_value = env.Null();

        if (context->has_attr) {
            if ((context->setattr_valid & FUSE_SET_ATTR_UID) != 0) {
                uid_value = Napi::Number::New(env, static_cast<double>(context->attr.st_uid));
            }
            if ((context->setattr_valid & FUSE_SET_ATTR_GID) != 0) {
                gid_value = Napi::Number::New(env, static_cast<double>(context->attr.st_gid));
            }
        }

        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);
        options.Set("valid", Napi::Number::New(env, context->setattr_valid));
        if (context->has_fi) {
            options.Set("fi", NapiHelpers::FileInfoToObject(env, context->fi));
        }

        auto result = handler.Call({ino_value, uid_value, gid_value, request_ctx, options});
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

            struct stat attr_result {};
            if (!NapiHelpers::ObjectToStat(attr_value.As<Napi::Object>(), &attr_result)) {
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

            context->ReplyAttr(attr_result, timeout);
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
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);
        options.Set("flags", Napi::Number::New(env, context->has_fi ? context->fi.flags : 0));

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
void FuseBridge::HandleOpendir(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::OPENDIR, req);
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
        
        // Copy buffer data to new ArrayBuffer to ensure proper lifetime management
        Napi::ArrayBuffer buffer;
        if (context->data.empty()) {
            buffer = Napi::ArrayBuffer::New(env, 0);
        } else {
            buffer = Napi::ArrayBuffer::New(env, context->data.size());
            std::memcpy(buffer.Data(), context->data.data(), context->data.size());
        }
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
        ResolvePromiseOrValue(
        env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            if (!value.IsObject()) {
                context->ReplyError(EIO);
                return;
            }

            Napi::Object result_obj = value.As<Napi::Object>();
            if (!result_obj.Has("entries") || !result_obj.Get("entries").IsArray()) {
                context->ReplyError(EIO);
                return;
            }

            Napi::Array entries = result_obj.Get("entries").As<Napi::Array>();
            std::vector<char> buffer(4096);
            size_t buffer_offset = 0;

            for (uint32_t i = 0; i < entries.Length(); ++i) {
                Napi::Value item = entries.Get(i);
                if (!item.IsObject()) continue;

                Napi::Object entry = item.As<Napi::Object>();
                std::string name = entry.Get("name").As<Napi::String>().Utf8Value();
                fuse_ino_t ino = NapiHelpers::GetBigUint64(env_inner, entry.Get("ino"));
                uint32_t type = entry.Get("type").As<Napi::Number>().Uint32Value();

                struct stat st = {};
                st.st_ino = ino;
                st.st_mode = (type & 0xF) << 12;

                size_t entry_len = fuse_add_direntry(context->request, nullptr, 0, name.c_str(), &st, 0);
                if (buffer_offset + entry_len > buffer.size()) {
                    buffer.resize(buffer_offset + entry_len);
                }

                off_t next_offset = i + 1;
                if (entry.Has("nextOffset")) {
                    Napi::Value next_offset_val = entry.Get("nextOffset");
                    if (next_offset_val.IsBigInt()) {
                        bool lossless = false;
                        next_offset = static_cast<off_t>(next_offset_val.As<Napi::BigInt>().Int64Value(&lossless));
                    } else if (next_offset_val.IsNumber()) {
                        next_offset = static_cast<off_t>(next_offset_val.As<Napi::Number>().Int64Value());
                    }
                }

                fuse_add_direntry(context->request, buffer.data() + buffer_offset, buffer.size() - buffer_offset, name.c_str(), &st, next_offset);
                buffer_offset += entry_len;
            }

            context->ReplyBuf(buffer.data(), buffer_offset);
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
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value val) {
            // For now, just reply with a basic statvfs structure
            struct statvfs st = {};
            st.f_bsize = 4096;
            st.f_frsize = 4096;
            st.f_blocks = 1000000;
            st.f_bfree = 500000;
            st.f_bavail = 500000;
            st.f_files = 100000;
            st.f_ffree = 50000;
            st.f_favail = 50000;
            st.f_fsid = 0;
            st.f_flag = 0;
            st.f_namemax = 255;
            context->ReplyStatfs(st);
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
            if (!value.IsObject()) {
                context->ReplyUnsupported();
                return;
            }

            Napi::Object result_obj = value.As<Napi::Object>();
            if (!result_obj.Has("fi") || !result_obj.Has("attr")) {
                context->ReplyUnsupported();
                return;
            }

            struct fuse_file_info fi_result{};
            if (!NapiHelpers::ObjectToFileInfo(result_obj.Get("fi").As<Napi::Object>(), &fi_result)) {
                context->ReplyError(EIO);
                return;
            }

            struct stat attr{};
            if (!NapiHelpers::ObjectToStat(result_obj.Get("attr").As<Napi::Object>(), &attr)) {
                context->ReplyError(EIO);
                return;
            }

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
        });
    });
}
void FuseBridge::HandleCopyFileRange(fuse_req_t req, fuse_ino_t ino_in, off_t off_in,
                                     struct fuse_file_info* fi_in, fuse_ino_t ino_out,
                                     off_t off_out, struct fuse_file_info* fi_out,
                                     size_t len, int flags) {
    auto context = CreateContext(FuseOpType::COPY_FILE_RANGE, req);
    context->ino = ino_in;
    context->offset = static_cast<uint64_t>(off_in);
    context->new_parent = ino_out;
    context->new_offset = static_cast<uint64_t>(off_out);
    context->size = len;
    context->flags = flags;
    if (fi_in) {
        context->fi = *fi_in;
        context->has_fi = true;
    }
    if (fi_out) {
        context->fi_out = *fi_out;
        context->has_fi_out = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_in_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Value off_in_value = NapiHelpers::CreateBigUint64(env, context->offset);
        Napi::Value fi_in_value = context->has_fi
                                  ? NapiHelpers::FileInfoToObject(env, context->fi)
                                  : env.Null();
        Napi::Value ino_out_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->new_parent));
        Napi::Value off_out_value = NapiHelpers::CreateBigUint64(env, context->new_offset);
        Napi::Value fi_out_value = context->has_fi_out
                                   ? NapiHelpers::FileInfoToObject(env, context->fi_out)
                                   : env.Null();
        Napi::Value len_value = NapiHelpers::CreateBigUint64(env, context->size);
        Napi::Number flags_value = Napi::Number::New(env, context->flags);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_in_value, off_in_value, fi_in_value, ino_out_value,
                                   off_out_value, fi_out_value, len_value, flags_value,
                                   request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            if (value.IsBigInt()) {
                bool lossless = false;
                uint64_t copied = value.As<Napi::BigInt>().Uint64Value(&lossless);
                if (lossless) {
                    context->ReplyWrite(static_cast<size_t>(copied));
                    return;
                }
            } else if (value.IsNumber()) {
                size_t copied = static_cast<size_t>(value.As<Napi::Number>().Uint32Value());
                context->ReplyWrite(copied);
                return;
            }
            context->ReplyUnsupported();
        });
    });
}

void FuseBridge::HandleGetlk(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi, struct flock* lock) {
    auto context = CreateContext(FuseOpType::GETLK, req);
    context->ino = ino;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }
    if (lock) {
        context->lock = *lock;
        context->has_lock = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Value fi_value = context->has_fi
                               ? NapiHelpers::FileInfoToObject(env, context->fi)
                               : env.Null();
        Napi::Object lock_obj = Napi::Object::New(env);
        if (context->has_lock) {
            lock_obj.Set("type", Napi::Number::New(env, context->lock.l_type));
            lock_obj.Set("start", NapiHelpers::CreateBigInt64(env, context->lock.l_start));
            lock_obj.Set("len", NapiHelpers::CreateBigInt64(env, context->lock.l_len));
            lock_obj.Set("pid", Napi::Number::New(env, context->lock.l_pid));
        }
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, fi_value, lock_obj, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value value) {
            if (value.IsObject()) {
                Napi::Object result_obj = value.As<Napi::Object>();
                if (result_obj.Has("lock")) {
                    Napi::Value lock_value = result_obj.Get("lock");
                    if (lock_value.IsObject()) {
                        struct flock lock_result{};
                        // Populate lock_result from lock_value
                        context->ReplyGetlk(lock_result);
                        return;
                    }
                }
            }
            context->ReplyError(EIO);
        });
    });
}

void FuseBridge::HandleSetlk(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi, struct flock* lock, int sleep) {
    auto context = CreateContext(FuseOpType::SETLK, req);
    context->ino = ino;
    context->sleep = sleep;
    if (fi) {
        context->fi = *fi;
        context->has_fi = true;
    }
    if (lock) {
        context->lock = *lock;
        context->has_lock = true;
    }

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::Value fi_value = context->has_fi
                               ? NapiHelpers::FileInfoToObject(env, context->fi)
                               : env.Null();
        Napi::Object lock_obj = Napi::Object::New(env);
        if (context->has_lock) {
            lock_obj.Set("type", Napi::Number::New(env, context->lock.l_type));
            lock_obj.Set("start", NapiHelpers::CreateBigInt64(env, context->lock.l_start));
            lock_obj.Set("len", NapiHelpers::CreateBigInt64(env, context->lock.l_len));
            lock_obj.Set("pid", Napi::Number::New(env, context->lock.l_pid));
        }
        Napi::Boolean sleep_value = Napi::Boolean::New(env, context->sleep != 0);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, fi_value, lock_obj, sleep_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value) {
            context->ReplyOk();
        });
    });
}
void FuseBridge::HandleInit(fuse_req_t req, struct fuse_conn_info* conn) {
    auto context = CreateContext(FuseOpType::INIT, req);
    conn->want |= FUSE_CAP_ASYNC_READ | FUSE_CAP_WRITEBACK_CACHE;
    conn->max_write = 4096 * 4;
    conn->max_readahead = 4096 * 4;
    ProcessRequest(context, [context, conn](Napi::Env env, Napi::Function handler) {
        Napi::Object conn_info = Napi::Object::New(env);
        conn_info.Set("protoMajor", conn->proto_major);
        conn_info.Set("protoMinor", conn->proto_minor);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        auto result = handler.Call({conn_info, request_ctx});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env, Napi::Value) { context->ReplyOk(); });
    });
}

void FuseBridge::HandleDestroy(fuse_req_t req) {
    auto context = CreateContext(FuseOpType::DESTROY, req);
    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        auto result = handler.Call({CreateRequestContextObject(env, *context)});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env, Napi::Value) {
            if (context->request) {
                fuse_reply_err(context->request, 0);
            }
        });
    });
}

void FuseBridge::HandleForget(fuse_req_t req, fuse_ino_t ino, uint64_t nlookup) {
    if (req) fuse_reply_none(req);
}

void FuseBridge::HandleForgetMulti(fuse_req_t req, size_t count, struct fuse_forget_data* forgets) {
    if (req) fuse_reply_none(req);
}

void FuseBridge::HandleReadBuf(fuse_req_t req, fuse_ino_t, size_t, off_t, struct fuse_file_info*, struct fuse_bufvec**) {
    auto context = CreateContext(FuseOpType::READ_BUF, req);
    context->ReplyUnsupported();
}

void FuseBridge::HandleWriteBuf(fuse_req_t req,
                                fuse_ino_t ino,
                                struct fuse_bufvec* buf,
                                off_t off,
                                struct fuse_file_info* fi) {
    auto context = CreateContext(FuseOpType::WRITE_BUF, req);
    context->ReplyUnsupported();
}

void FuseBridge::HandleSetxattr(fuse_req_t req,
                                fuse_ino_t ino,
                                const char* name,
                                const char* value,
                                size_t size,
                                int flags) {
    auto context = CreateContext(FuseOpType::SETXATTR, req);
    context->ino = ino;
    context->name = name ? name : "";
    context->size = size;
    context->flags = flags;
    if (value && size > 0) {
        context->data.assign(reinterpret_cast<const uint8_t*>(value),
                             reinterpret_cast<const uint8_t*>(value) + size);
    }
    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        auto result =
            handler.Call({NapiHelpers::CreateBigUint64(env, ToUint64(context->ino)),
                          Napi::String::New(env, context->name),
                          Napi::Buffer<uint8_t>::Copy(env, context->data.data(), context->data.size()),
                          Napi::Number::New(env, context->flags),
                          CreateRequestContextObject(env, *context)});
        ResolvePromiseOrValue(env, context, result,
                              [context](Napi::Env, Napi::Value) { context->ReplyOk(); });
    });
}

void FuseBridge::HandleGetxattr(fuse_req_t req, fuse_ino_t ino, const char* name, size_t size) {
    auto context = CreateContext(FuseOpType::GETXATTR, req);
    context->ino = ino;
    context->name = name ? name : "";
    context->size = size;
    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Object opts = Napi::Object::New(env);
        opts.Set("size", Napi::Number::New(env, context->size));
        auto result = handler.Call({NapiHelpers::CreateBigUint64(env, ToUint64(context->ino)),
                                    Napi::String::New(env, context->name),
                                    CreateRequestContextObject(env, *context), opts});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env, Napi::Value value) {
            if (value.IsBuffer()) {
                Napi::Buffer<uint8_t> buf = value.As<Napi::Buffer<uint8_t>>();
                if (context->size == 0) return (void)fuse_reply_xattr(context->request, buf.Length());
                if (buf.Length() > context->size) return context->ReplyError(ERANGE);
                context->ReplyBuf(buf.Data(), buf.Length());
            } else if (value.IsNumber()) {
                fuse_reply_xattr(context->request, value.As<Napi::Number>().Uint32Value());
            } else {
                context->ReplyError(EIO);
            }
        });
    });
}

void FuseBridge::HandleListxattr(fuse_req_t req, fuse_ino_t ino, size_t size) {
    auto context = CreateContext(FuseOpType::LISTXATTR, req);
    context->ino = ino;
    context->size = size;
    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Object opts = Napi::Object::New(env);
        opts.Set("size", Napi::Number::New(env, context->size));
        auto result = handler.Call(
            {NapiHelpers::CreateBigUint64(env, ToUint64(context->ino)), CreateRequestContextObject(env, *context), opts});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env, Napi::Value value) {
            if (value.IsArray()) {
                Napi::Array arr = value.As<Napi::Array>();
                std::string list;
                for (uint32_t i = 0; i < arr.Length(); ++i) list.append(arr.Get(i).As<Napi::String>().Utf8Value()).push_back('\0');
                if (context->size == 0) return (void)fuse_reply_xattr(context->request, list.length());
                if (list.length() > context->size) return context->ReplyError(ERANGE);
                context->ReplyBuf(list.data(), list.length());
            } else if (value.IsNumber()) {
                fuse_reply_xattr(context->request, value.As<Napi::Number>().Uint32Value());
            } else {
                context->ReplyError(EIO);
            }
        });
    });
}

void FuseBridge::HandleRemovexattr(fuse_req_t req, fuse_ino_t ino, const char* name) {
    auto context = CreateContext(FuseOpType::REMOVEXATTR, req);
    context->ino = ino;
    context->name = name ? name : "";

    ProcessRequest(context, [context](Napi::Env env, Napi::Function handler) {
        Napi::Value ino_value = NapiHelpers::CreateBigUint64(env, ToUint64(context->ino));
        Napi::String name_value = Napi::String::New(env, context->name);
        Napi::Object request_ctx = CreateRequestContextObject(env, *context);
        Napi::Object options = Napi::Object::New(env);

        auto result = handler.Call({ino_value, name_value, request_ctx, options});
        ResolvePromiseOrValue(env, context, result, [context](Napi::Env env_inner, Napi::Value) {
            context->ReplyOk();
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

void FuseBridge::CopyFileRangeCallback(fuse_req_t req, fuse_ino_t ino_in, off_t off_in,
                                       struct fuse_file_info* fi_in, fuse_ino_t ino_out,
                                       off_t off_out, struct fuse_file_info* fi_out,
                                       size_t len, int flags) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleCopyFileRange(req, ino_in, off_in, fi_in, ino_out, off_out, fi_out, len, flags);
}

void FuseBridge::InitCallback(void* userdata, struct fuse_conn_info* conn) {
    auto* session_mgr = static_cast<SessionManager*>(userdata);
    if (!session_mgr) {
        return;
    }
    auto* bridge = session_mgr->GetBridge();
    if (!bridge) {
        return;
    }
    bridge->HandleInit(nullptr, conn);
}

void FuseBridge::DestroyCallback(void* userdata) {
    auto* session_mgr = static_cast<SessionManager*>(userdata);
    if (!session_mgr) {
        return;
    }
    auto* bridge = session_mgr->GetBridge();
    if (!bridge) {
        return;
    }
    bridge->HandleDestroy(nullptr);
}

void FuseBridge::ForgetCallback(fuse_req_t req, fuse_ino_t ino, uint64_t nlookup) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_none(req);
        return;
    }
    bridge->HandleForget(req, ino, nlookup);
}

void FuseBridge::ForgetMultiCallback(fuse_req_t req, size_t count, struct fuse_forget_data* forgets) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_none(req);
        return;
    }
    bridge->HandleForgetMulti(req, count, forgets);
}

void FuseBridge::WriteBufCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_bufvec* buf, off_t off, struct fuse_file_info* fi) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleWriteBuf(req, ino, buf, off, fi);
}

void FuseBridge::SetxattrCallback(fuse_req_t req, fuse_ino_t ino, const char* name, const char* value, size_t size, int flags) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleSetxattr(req, ino, name, value, size, flags);
}

void FuseBridge::GetxattrCallback(fuse_req_t req, fuse_ino_t ino, const char* name, size_t size) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleGetxattr(req, ino, name, size);
}

void FuseBridge::ListxattrCallback(fuse_req_t req, fuse_ino_t ino, size_t size) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleListxattr(req, ino, size);
}

void FuseBridge::RemovexattrCallback(fuse_req_t req, fuse_ino_t ino, const char* name) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleRemovexattr(req, ino, name);
}

void FuseBridge::GetlkCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi, struct flock* lock) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleGetlk(req, ino, fi, lock);
}

void FuseBridge::SetlkCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi, struct flock* lock, int sleep) {
    auto* bridge = GetBridgeFromRequest(req);
    if (!bridge) {
        fuse_reply_err(req, ENODEV);
        return;
    }
    bridge->HandleSetlk(req, ino, fi, lock, sleep);
}

void FuseBridge::LogMissingOperationHandlers() {
    fprintf(stderr, "FUSE: === REGISTERED OPERATION HANDLERS ===\n");

    bool has_any_handlers = false;
    for (const auto& mapping : kOperationMappings) {
        if (HasOperationHandler(mapping.type)) {
            fprintf(stderr, "FUSE: ✓ %s\n", mapping.name);
            has_any_handlers = true;
        }
    }

    if (!has_any_handlers) {
        fprintf(stderr, "FUSE: No operation handlers registered!\n");
        return;
    }

    fprintf(stderr, "FUSE: === MISSING OPERATION HANDLERS ===\n");
    bool has_missing = false;
    for (const auto& mapping : kOperationMappings) {
        if (!HasOperationHandler(mapping.type)) {
            fprintf(stderr, "FUSE: ✗ %s (not registered)\n", mapping.name);
            has_missing = true;
        }
    }

    if (!has_missing) {
        fprintf(stderr, "FUSE: All operation handlers are registered!\n");
    }

    fprintf(stderr, "FUSE: === END OPERATION HANDLERS LOG ===\n\n");
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

    bool success = FuseBridge::RegisterOperationHandler(env, op_type, handler, operation);
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