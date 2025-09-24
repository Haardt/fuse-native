/**
 * @file init_bridge.cc
 * @brief FUSE init callback bridge implementation
 * 
 * This module implements the FUSE init operation bridge, capturing connection
 * info and configuration during filesystem initialization and exposing it to
 * the TypeScript layer.
 */

#define FUSE_USE_VERSION 31
#include "init_bridge.h"
#include "napi_helpers.h"
#include "errno_mapping.h"
#include <fuse3/fuse_common.h>
#include <sys/mount.h>
#include <algorithm>
#include <sstream>

namespace fuse_native {

// Singleton instance
InitBridge& InitBridge::GetInstance() {
    static InitBridge instance;
    return instance;
}

void InitBridge::Initialize(struct fuse_operations* ops) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (ops == nullptr) {
        return;
    }
    
    // Set our init callback in FUSE operations
    ops->init = FuseInitCallback;
    initialized_ = true;
}

void InitBridge::SetInitCallback(Napi::Function callback) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!callback.IsFunction()) {
        return; // Invalid callback, silently ignore
    }

    // Clean up existing callback if present
    if (has_callback_) {
        init_callback_.Abort();
        init_callback_.Release();
    }

    // Create thread-safe function for callback
    init_callback_ = Napi::ThreadSafeFunction::New(
        callback.Env(),
        callback,
        "FuseInitCallback",
        0,  // unlimited queue
        1   // single callback thread
    );

    has_callback_ = true;
}

void InitBridge::RemoveInitCallback() {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!has_callback_) return;

    // Prevent further calls and stop the TSFN queue immediately
    init_callback_.Abort();
    // Release the reference count
    init_callback_.Release();

    has_callback_ = false;
}

std::shared_ptr<FuseConnectionInfo> InitBridge::GetConnectionInfo() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return connection_info_;
}

std::shared_ptr<FuseConfig> InitBridge::GetConfig() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return config_;
}

MountOptions InitBridge::GetAvailableMountOptions() const {
    MountOptions options;
    
    // Standard FUSE mount options
    options.available_options = {
        "allow_other",
        "allow_root", 
        "auto_unmount",
        "default_permissions",
        "dev",
        "nodev",
        "suid",
        "nosuid",
        "ro",
        "rw",
        "exec",
        "noexec",
        "sync",
        "async",
        "atime",
        "noatime",
        "diratime",
        "nodiratime",
        "relatime",
        "norelatime",
        "strictatime",
        "nostrictatime",
        "uid",
        "gid",
        "umask",
        "entry_timeout",
        "negative_timeout",
        "attr_timeout",
        "ac_attr_timeout",
        "auto_cache",
        "noauto_cache",
        "cache_timeout",
        "max_write",
        "max_read",
        "max_readahead",
        "async_read",
        "sync_read",
        "atomic_o_trunc",
        "big_writes",
        "no_remote_lock",
        "no_remote_flock",
        "no_remote_posix_lock",
        "splice_write",
        "splice_move",
        "splice_read"
    };
    
    // Default options that are commonly safe
    options.default_options = {
        "default_permissions",
        "auto_unmount",
        "async_read",
        "atomic_o_trunc"
    };
    
    return options;
}

bool InitBridge::CheckCapabilities(const std::vector<uint32_t>& caps) const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (!connection_info_) {
        return false;
    }
    
    // Check if all requested capabilities are available
    for (uint32_t cap : caps) {
        if ((connection_info_->capable & cap) == 0) {
            return false;
        }
    }
    
    return true;
}

std::vector<std::string> InitBridge::GetCapabilityNames() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::string> names;
    
    if (!connection_info_) {
        return names;
    }
    
    // Map capability flags to human-readable names
    struct CapabilityMapping {
        uint32_t flag;
        const char* name;
    };
    
    static const CapabilityMapping capabilities[] = {
        {FUSE_CAP_ASYNC_READ, "ASYNC_READ"},
        {FUSE_CAP_POSIX_LOCKS, "POSIX_LOCKS"},
        {FUSE_CAP_ATOMIC_O_TRUNC, "ATOMIC_O_TRUNC"},
        {FUSE_CAP_EXPORT_SUPPORT, "EXPORT_SUPPORT"},
        {FUSE_CAP_DONT_MASK, "DONT_MASK"},
        {FUSE_CAP_SPLICE_WRITE, "SPLICE_WRITE"},
        {FUSE_CAP_SPLICE_MOVE, "SPLICE_MOVE"},
        {FUSE_CAP_SPLICE_READ, "SPLICE_READ"},
        {FUSE_CAP_FLOCK_LOCKS, "FLOCK_LOCKS"},
        {FUSE_CAP_IOCTL_DIR, "IOCTL_DIR"},
        {FUSE_CAP_AUTO_INVAL_DATA, "AUTO_INVAL_DATA"},
        {FUSE_CAP_READDIRPLUS, "READDIRPLUS"},
        {FUSE_CAP_READDIRPLUS_AUTO, "READDIRPLUS_AUTO"},
        {FUSE_CAP_ASYNC_DIO, "ASYNC_DIO"},
        {FUSE_CAP_WRITEBACK_CACHE, "WRITEBACK_CACHE"},
        {FUSE_CAP_NO_OPEN_SUPPORT, "NO_OPEN_SUPPORT"},
        {FUSE_CAP_PARALLEL_DIROPS, "PARALLEL_DIROPS"},
        {FUSE_CAP_POSIX_ACL, "POSIX_ACL"},
        {FUSE_CAP_HANDLE_KILLPRIV, "HANDLE_KILLPRIV"},
        {FUSE_CAP_HANDLE_KILLPRIV_V2, "HANDLE_KILLPRIV_V2"},
        {FUSE_CAP_CACHE_SYMLINKS, "CACHE_SYMLINKS"},
        {FUSE_CAP_NO_OPENDIR_SUPPORT, "NO_OPENDIR_SUPPORT"},
        {FUSE_CAP_EXPLICIT_INVAL_DATA, "EXPLICIT_INVAL_DATA"},
        {FUSE_CAP_EXPIRE_ONLY, "EXPIRE_ONLY"},
        {FUSE_CAP_SETXATTR_EXT, "SETXATTR_EXT"},
        {FUSE_CAP_DIRECT_IO_ALLOW_MMAP, "DIRECT_IO_ALLOW_MMAP"},
        {FUSE_CAP_PASSTHROUGH, "PASSTHROUGH"},
        {FUSE_CAP_NO_EXPORT_SUPPORT, "NO_EXPORT_SUPPORT"}
    };
    
    for (const auto& cap : capabilities) {
        if (connection_info_->capable & cap.flag) {
            names.push_back(cap.name);
        }
    }
    
    return names;
}

void InitBridge::Reset() {
    std::lock_guard<std::mutex> lock(mutex_);

    if (has_callback_) {
        init_callback_.Abort();
        init_callback_.Release();
        has_callback_ = false;
    }

    connection_info_.reset();
    config_.reset();
    initialized_ = false;
}

void* InitBridge::FuseInitCallback(struct fuse_conn_info *conn, struct fuse_config *cfg) {
    InitBridge& bridge = GetInstance();

    // Defensive null checks
    if (!conn || !cfg) {
        return nullptr; // userdata
    }

    // Convert and store connection info and config
    {
        std::lock_guard<std::mutex> lock(bridge.mutex_);
        bridge.connection_info_ = bridge.ConvertConnectionInfo(conn);
        bridge.config_ = bridge.ConvertConfig(cfg);
    }

    // Call JavaScript callback if registered and we have valid data
    if (bridge.has_callback_ && bridge.connection_info_ && bridge.config_) {
        bridge.CallJavaScriptCallback(*bridge.connection_info_, *bridge.config_);
    }

    return nullptr; // userdata
}

std::shared_ptr<FuseConnectionInfo> InitBridge::ConvertConnectionInfo(struct fuse_conn_info *conn) {
    if (!conn) {
        return nullptr;
    }
    
    auto info = std::make_shared<FuseConnectionInfo>();
    
    info->proto_major = conn->proto_major;
    info->proto_minor = conn->proto_minor;
    info->capable = conn->capable;
    info->want = conn->want;
    info->max_write = conn->max_write;
    info->max_read = conn->max_read;
    info->max_readahead = conn->max_readahead;
    info->max_background = conn->max_background;
    info->congestion_threshold = conn->congestion_threshold;
    info->time_gran = conn->time_gran;
    
    // Copy reserved fields
    for (int i = 0; i < 22; i++) {
        info->reserved.push_back(conn->reserved[i]);
    }
    
    return info;
}

std::shared_ptr<FuseConfig> InitBridge::ConvertConfig(struct fuse_config *cfg) {
    if (!cfg) {
        return nullptr;
    }
    
    auto config = std::make_shared<FuseConfig>();
    
    config->set_gid = cfg->set_gid;
    config->gid = cfg->gid;
    config->set_uid = cfg->set_uid;
    config->uid = cfg->uid;
    config->set_mode = cfg->set_mode;
    config->umask = cfg->umask;
    config->entry_timeout = cfg->entry_timeout;
    config->negative_timeout = cfg->negative_timeout;
    config->attr_timeout = cfg->attr_timeout;
    config->use_ino = cfg->use_ino;
    config->readdir_ino = cfg->readdir_ino;
    config->direct_io = cfg->direct_io;
    config->kernel_cache = cfg->kernel_cache;
    config->auto_cache = cfg->auto_cache;
    config->ac_attr_timeout_set = cfg->ac_attr_timeout_set;
    config->ac_attr_timeout = cfg->ac_attr_timeout;
    config->nullpath_ok = cfg->nullpath_ok;
    config->show_help = cfg->show_help;
    // Note: modules field intentionally omitted - it's a pointer owned by FUSE
    // and would cause lifetime issues if copied. JS layer doesn't need this field.
    config->debug = cfg->debug;
    
    return config;
}

void InitBridge::CallJavaScriptCallback(const FuseConnectionInfo& conn_info, const FuseConfig& config) {
    // Check under lock to prevent race with RemoveInitCallback
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!has_callback_) {
            return;
        }
    }

    // Create copies to avoid use-after-free (captured by value in lambda)
    FuseConnectionInfo ci = conn_info;
    FuseConfig cf = config;

    // Call the JavaScript callback asynchronously
    init_callback_.BlockingCall([ci = std::move(ci), cf = std::move(cf)](Napi::Env env, Napi::Function jsCallback) {
        Napi::HandleScope hs(env);

        try {
            // Create connection info object
            Napi::Object connObj = Napi::Object::New(env);
            connObj.Set("protoMajor", ci.proto_major);
            connObj.Set("protoMinor", ci.proto_minor);
            connObj.Set("capable", ci.capable);
            connObj.Set("want", ci.want);
            connObj.Set("maxWrite", ci.max_write);
            connObj.Set("maxRead", ci.max_read);
            connObj.Set("maxReadahead", ci.max_readahead);
            connObj.Set("maxBackground", ci.max_background);
            connObj.Set("congestionThreshold", ci.congestion_threshold);
            connObj.Set("timeGranNs", ci.time_gran); // This is timeGranNs as required

            // Create capabilities array
            Napi::Array capsArray = Napi::Array::New(env);
            uint32_t index = 0;
            for (uint32_t i = 0; i < 32; i++) {
                if (ci.capable & (1u << i)) {
                    capsArray.Set(index++, 1u << i);
                }
            }
            connObj.Set("caps", capsArray);

            // Create config object
            Napi::Object cfgObj = Napi::Object::New(env);
            cfgObj.Set("setGid", cf.set_gid);
            cfgObj.Set("gid", cf.gid);
            cfgObj.Set("setUid", cf.set_uid);
            cfgObj.Set("uid", cf.uid);
            cfgObj.Set("setMode", cf.set_mode);
            cfgObj.Set("umask", cf.umask);
            cfgObj.Set("entryTimeout", cf.entry_timeout);
            cfgObj.Set("negativeTimeout", cf.negative_timeout);
            cfgObj.Set("attrTimeout", cf.attr_timeout);
            cfgObj.Set("useIno", cf.use_ino);
            cfgObj.Set("readdirIno", cf.readdir_ino);
            cfgObj.Set("directIo", cf.direct_io);
            cfgObj.Set("kernelCache", cf.kernel_cache);
            cfgObj.Set("autoCache", cf.auto_cache);
            cfgObj.Set("acAttrTimeoutSet", cf.ac_attr_timeout_set);
            cfgObj.Set("acAttrTimeout", cf.ac_attr_timeout);
            cfgObj.Set("nullpathOk", cf.nullpath_ok);
            cfgObj.Set("showHelp", cf.show_help);
            cfgObj.Set("debug", cf.debug);

            // Call JavaScript function with connection info and config
            jsCallback.Call({connObj, cfgObj});

        } catch (const std::exception& e) {
            // Log error but don't propagate to avoid crashing FUSE
            // In a production system, you might want to use proper logging
        }
    });
}

// N-API wrapper functions

Napi::Value InitializeInitBridge(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    try {
        // Note: FUSE operations will be set when session is created
        // This function just ensures the bridge is ready
        return env.Undefined();
    } catch (const std::exception& e) {
        Napi::TypeError::New(env, std::string("InitBridge initialization failed: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value SetInitCallback(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Expected function argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    try {
        Napi::Function callback = info[0].As<Napi::Function>();
        InitBridge::GetInstance().SetInitCallback(callback);
        return env.Undefined();
    } catch (const std::exception& e) {
        Napi::TypeError::New(env, std::string("Failed to set init callback: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value RemoveInitCallback(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    try {
        InitBridge::GetInstance().RemoveInitCallback();
        return env.Undefined();
    } catch (const std::exception& e) {
        Napi::TypeError::New(env, std::string("Failed to remove init callback: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value GetConnectionInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    try {
        auto conn_info = InitBridge::GetInstance().GetConnectionInfo();
        if (!conn_info) {
            return env.Null();
        }
        
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("protoMajor", conn_info->proto_major);
        obj.Set("protoMinor", conn_info->proto_minor);
        obj.Set("capable", conn_info->capable);
        obj.Set("want", conn_info->want);
        obj.Set("maxWrite", conn_info->max_write);
        obj.Set("maxRead", conn_info->max_read);
        obj.Set("maxReadahead", conn_info->max_readahead);
        obj.Set("maxBackground", conn_info->max_background);
        obj.Set("congestionThreshold", conn_info->congestion_threshold);
        obj.Set("timeGranNs", conn_info->time_gran);
        
        // Create capabilities array
        Napi::Array caps = Napi::Array::New(env);
        uint32_t index = 0;
        for (uint32_t i = 0; i < 32; i++) {
            if (conn_info->capable & (1u << i)) {
                caps.Set(index++, 1u << i);
            }
        }
        obj.Set("caps", caps);
        
        return obj;
    } catch (const std::exception& e) {
        Napi::TypeError::New(env, std::string("Failed to get connection info: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Null();
    }
}

Napi::Value GetFuseConfig(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    try {
        auto config = InitBridge::GetInstance().GetConfig();
        if (!config) {
            return env.Null();
        }
        
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("setGid", config->set_gid);
        obj.Set("gid", config->gid);
        obj.Set("setUid", config->set_uid);
        obj.Set("uid", config->uid);
        obj.Set("setMode", config->set_mode);
        obj.Set("umask", config->umask);
        obj.Set("entryTimeout", config->entry_timeout);
        obj.Set("negativeTimeout", config->negative_timeout);
        obj.Set("attrTimeout", config->attr_timeout);
        obj.Set("useIno", config->use_ino);
        obj.Set("readdirIno", config->readdir_ino);
        obj.Set("directIo", config->direct_io);
        obj.Set("kernelCache", config->kernel_cache);
        obj.Set("autoCache", config->auto_cache);
        obj.Set("acAttrTimeoutSet", config->ac_attr_timeout_set);
        obj.Set("acAttrTimeout", config->ac_attr_timeout);
        obj.Set("nullpathOk", config->nullpath_ok);
        obj.Set("showHelp", config->show_help);
        obj.Set("debug", config->debug);
        
        return obj;
    } catch (const std::exception& e) {
        Napi::TypeError::New(env, std::string("Failed to get FUSE config: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Null();
    }
}

Napi::Value GetAvailableMountOptions(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    try {
        MountOptions options = InitBridge::GetInstance().GetAvailableMountOptions();
        
        Napi::Object obj = Napi::Object::New(env);
        
        // Available options array
        Napi::Array available = Napi::Array::New(env, options.available_options.size());
        for (size_t i = 0; i < options.available_options.size(); i++) {
            available.Set(i, Napi::String::New(env, options.available_options[i]));
        }
        obj.Set("available", available);
        
        // Default options array
        Napi::Array defaults = Napi::Array::New(env, options.default_options.size());
        for (size_t i = 0; i < options.default_options.size(); i++) {
            defaults.Set(i, Napi::String::New(env, options.default_options[i]));
        }
        obj.Set("defaults", defaults);
        
        return obj;
    } catch (const std::exception& e) {
        Napi::TypeError::New(env, std::string("Failed to get mount options: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value CheckCapabilities(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::TypeError::New(env, "Expected array argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    try {
        Napi::Array caps_array = info[0].As<Napi::Array>();
        std::vector<uint32_t> caps;
        
        for (uint32_t i = 0; i < caps_array.Length(); i++) {
            Napi::Value val = caps_array.Get(i);
            if (val.IsNumber()) {
                caps.push_back(val.As<Napi::Number>().Uint32Value());
            }
        }
        
        bool result = InitBridge::GetInstance().CheckCapabilities(caps);
        return Napi::Boolean::New(env, result);
    } catch (const std::exception& e) {
        Napi::TypeError::New(env, std::string("Failed to check capabilities: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value GetCapabilityNames(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    try {
        std::vector<std::string> names = InitBridge::GetInstance().GetCapabilityNames();
        
        Napi::Array result = Napi::Array::New(env, names.size());
        for (size_t i = 0; i < names.size(); i++) {
            result.Set(i, Napi::String::New(env, names[i]));
        }
        
        return result;
    } catch (const std::exception& e) {
        Napi::TypeError::New(env, std::string("Failed to get capability names: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value ResetInitBridge(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    try {
        InitBridge::GetInstance().Reset();
        return env.Undefined();
    } catch (const std::exception& e) {
        Napi::TypeError::New(env, std::string("Failed to reset init bridge: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

} // namespace fuse_native