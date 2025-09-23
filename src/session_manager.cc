/**
 * @file session_manager.cc
 * @brief FUSE session manager implementation for lifecycle management
 * 
 * This file implements the FUSE session manager that handles the lifecycle
 * of FUSE sessions, including creation, mounting, unmounting, and cleanup.
 */

#include "session_manager.h"
#include "fuse_bridge.h"
#include "napi_helpers.h"
#include "errno_mapping.h"
#include <unordered_map>
#include <memory>
#include <thread>
#include <chrono>

namespace fuse_native {

/**
 * Global session registry
 */
static std::unordered_map<uint64_t, std::unique_ptr<SessionManager>> active_sessions;
static std::mutex sessions_mutex;
static uint64_t next_session_id = 1;

/**
 * SessionManager implementation
 */
SessionManager::SessionManager(const std::string& mountpoint, const SessionOptions& options)
    : mountpoint_(mountpoint), options_(options), session_id_(next_session_id++),
      state_(SessionState::CREATED), fuse_session_(nullptr), fuse_channel_(nullptr),
      bridge_(nullptr), mount_thread_running_(false) {
}

SessionManager::~SessionManager() {
    if (state_ != SessionState::DESTROYED) {
        Destroy();
    }
}

uint64_t SessionManager::GetSessionId() const {
    return session_id_;
}

std::string SessionManager::GetMountpoint() const {
    return mountpoint_;
}

SessionState SessionManager::GetState() const {
    std::lock_guard<std::mutex> lock(state_mutex_);
    return state_;
}

bool SessionManager::IsReady() const {
    std::lock_guard<std::mutex> lock(state_mutex_);
    return state_ == SessionState::MOUNTED && fuse_session_ != nullptr;
}

bool SessionManager::Initialize() {
    std::lock_guard<std::mutex> lock(state_mutex_);
    
    if (state_ != SessionState::CREATED) {
        return false;
    }
    
    try {
        // Create FUSE bridge
        bridge_ = std::make_unique<FuseBridge>(this);
        if (!bridge_->Initialize(Napi::Env(nullptr))) { // TODO: Pass real env
            return false;
        }
        
        // Create FUSE session arguments
        std::vector<std::string> fuse_args;
        fuse_args.push_back("fuse-native");
        fuse_args.push_back(mountpoint_);
        
        // Add FUSE options
        if (options_.debug) {
            fuse_args.push_back("-d");
        }
        if (options_.foreground) {
            fuse_args.push_back("-f");
        }
        if (options_.single_threaded) {
            fuse_args.push_back("-s");
        }
        if (options_.allow_other) {
            fuse_args.push_back("-o");
            fuse_args.push_back("allow_other");
        }
        if (options_.allow_root) {
            fuse_args.push_back("-o");
            fuse_args.push_back("allow_root");
        }
        if (options_.auto_unmount) {
            fuse_args.push_back("-o");
            fuse_args.push_back("auto_unmount");
        }
        
        // Convert to char* array
        std::vector<char*> argv;
        for (auto& arg : fuse_args) {
            argv.push_back(const_cast<char*>(arg.c_str()));
        }
        
        // Parse FUSE arguments
        struct fuse_args args = FUSE_ARGS_INIT(static_cast<int>(argv.size()), argv.data());
        
        // Create FUSE session
        fuse_session_ = fuse_session_new(&args, bridge_->GetFuseOperations(), 
                                        sizeof(*bridge_->GetFuseOperations()), this);
        
        fuse_opt_free_args(&args);
        
        if (!fuse_session_) {
            return false;
        }
        
        state_ = SessionState::INITIALIZED;
        return true;
        
    } catch (const std::exception& e) {
        // Log error
        return false;
    }
}

bool SessionManager::Mount() {
    std::lock_guard<std::mutex> lock(state_mutex_);
    
    if (state_ != SessionState::INITIALIZED) {
        if (state_ == SessionState::CREATED && !Initialize()) {
            return false;
        } else if (state_ != SessionState::INITIALIZED) {
            return false;
        }
    }
    
    // Mount the filesystem
    if (fuse_session_mount(fuse_session_, mountpoint_.c_str()) != 0) {
        return false;
    }
    
    state_ = SessionState::MOUNTED;
    
    // Start the FUSE loop in a separate thread
    mount_thread_running_ = true;
    mount_thread_ = std::thread([this]() {
        this->RunFuseLoop();
    });
    
    return true;
}

bool SessionManager::Unmount() {
    {
        std::lock_guard<std::mutex> lock(state_mutex_);
        
        if (state_ != SessionState::MOUNTED) {
            return false;
        }
        
        state_ = SessionState::UNMOUNTING;
    }
    
    // Signal FUSE session to exit
    if (fuse_session_) {
        fuse_session_exit(fuse_session_);
    }
    
    // Wait for mount thread to finish
    if (mount_thread_.joinable()) {
        mount_thread_running_ = false;
        mount_thread_.join();
    }
    
    // Unmount filesystem
    if (fuse_session_) {
        fuse_session_unmount(fuse_session_);
    }
    
    {
        std::lock_guard<std::mutex> lock(state_mutex_);
        state_ = SessionState::UNMOUNTED;
    }
    
    return true;
}

void SessionManager::Destroy() {
    // Unmount if still mounted
    if (GetState() == SessionState::MOUNTED) {
        Unmount();
    }
    
    std::lock_guard<std::mutex> lock(state_mutex_);
    
    // Clean up FUSE session
    if (fuse_session_) {
        fuse_session_destroy(fuse_session_);
        fuse_session_ = nullptr;
    }
    
    // Clean up bridge
    if (bridge_) {
        bridge_->Shutdown();
        bridge_.reset();
    }
    
    state_ = SessionState::DESTROYED;
}

void SessionManager::RunFuseLoop() {
    if (!fuse_session_) {
        return;
    }
    
    struct fuse_buf fbuf = {
        .size = options_.max_read,
        .flags = static_cast<enum fuse_buf_flags>(0),
        .mem = nullptr,
        .fd = -1,
        .pos = 0,
    };
    
    // Allocate buffer for FUSE operations
    fbuf.mem = malloc(fbuf.size);
    if (!fbuf.mem) {
        return;
    }
    
    // Main FUSE loop
    while (mount_thread_running_ && !fuse_session_exited(fuse_session_)) {
        int res = fuse_session_receive_buf(fuse_session_, &fbuf);
        if (res == -EINTR || res == 0) {
            continue;
        }
        if (res < 0) {
            break;
        }
        
        fuse_session_process_buf(fuse_session_, &fbuf);
    }
    
    // Clean up buffer
    if (fbuf.mem) {
        free(fbuf.mem);
    }
}

/**
 * Static session management functions
 */

/**
 * Create session (N-API exposed function)
 */
Napi::Value CreateSession(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        NapiHelpers::ThrowError(env, "Expected session options");
        return env.Undefined();
    }
    
    if (!info[0].IsObject()) {
        NapiHelpers::ThrowTypeError(env, "Session options must be an object");
        return env.Undefined();
    }
    
    Napi::Object options_obj = info[0].As<Napi::Object>();
    
    // Extract mountpoint
    if (!options_obj.Has("mountpoint")) {
        NapiHelpers::ThrowError(env, "Missing mountpoint in session options");
        return env.Undefined();
    }
    
    std::string mountpoint = NapiHelpers::GetString(options_obj.Get("mountpoint"));
    
    // Parse session options
    SessionOptions options;
    options.debug = options_obj.Has("debug") && 
                   options_obj.Get("debug").As<Napi::Boolean>().Value();
    options.foreground = options_obj.Has("foreground") && 
                        options_obj.Get("foreground").As<Napi::Boolean>().Value();
    options.single_threaded = options_obj.Has("singleThreaded") && 
                             options_obj.Get("singleThreaded").As<Napi::Boolean>().Value();
    options.allow_other = options_obj.Has("allowOther") && 
                         options_obj.Get("allowOther").As<Napi::Boolean>().Value();
    options.allow_root = options_obj.Has("allowRoot") && 
                        options_obj.Get("allowRoot").As<Napi::Boolean>().Value();
    options.auto_unmount = options_obj.Has("autoUnmount") && 
                          options_obj.Get("autoUnmount").As<Napi::Boolean>().Value();
    
    if (options_obj.Has("maxRead")) {
        options.max_read = options_obj.Get("maxRead").As<Napi::Number>().Uint32Value();
    }
    
    try {
        // Create session manager
        auto session_manager = std::make_unique<SessionManager>(mountpoint, options);
        uint64_t session_id = session_manager->GetSessionId();
        
        // Store in registry
        {
            std::lock_guard<std::mutex> lock(sessions_mutex);
            active_sessions[session_id] = std::move(session_manager);
        }
        
        // Return session handle
        Napi::Object session_handle = Napi::Object::New(env);
        session_handle.Set("id", Napi::Number::New(env, static_cast<double>(session_id)));
        session_handle.Set("mountpoint", Napi::String::New(env, mountpoint));
        
        return session_handle;
        
    } catch (const std::exception& e) {
        NapiHelpers::ThrowError(env, "Failed to create session: " + std::string(e.what()));
        return env.Undefined();
    }
}

/**
 * Destroy session (N-API exposed function)
 */
Napi::Value DestroySession(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        NapiHelpers::ThrowError(env, "Expected session handle");
        return env.Undefined();
    }
    
    if (!info[0].IsObject()) {
        NapiHelpers::ThrowTypeError(env, "Session handle must be an object");
        return env.Undefined();
    }
    
    Napi::Object handle = info[0].As<Napi::Object>();
    if (!handle.Has("id")) {
        NapiHelpers::ThrowError(env, "Invalid session handle");
        return env.Undefined();
    }
    
    uint64_t session_id = static_cast<uint64_t>(handle.Get("id").As<Napi::Number>().DoubleValue());
    
    {
        std::lock_guard<std::mutex> lock(sessions_mutex);
        auto it = active_sessions.find(session_id);
        if (it != active_sessions.end()) {
            it->second->Destroy();
            active_sessions.erase(it);
            return Napi::Boolean::New(env, true);
        }
    }
    
    return Napi::Boolean::New(env, false);
}

/**
 * Mount session (N-API exposed function)
 */
Napi::Value Mount(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        NapiHelpers::ThrowError(env, "Expected session handle");
        return env.Undefined();
    }
    
    Napi::Object handle = info[0].As<Napi::Object>();
    uint64_t session_id = static_cast<uint64_t>(handle.Get("id").As<Napi::Number>().DoubleValue());
    
    {
        std::lock_guard<std::mutex> lock(sessions_mutex);
        auto it = active_sessions.find(session_id);
        if (it != active_sessions.end()) {
            bool success = it->second->Mount();
            return Napi::Boolean::New(env, success);
        }
    }
    
    NapiHelpers::ThrowError(env, "Session not found");
    return env.Undefined();
}

/**
 * Unmount session (N-API exposed function)
 */
Napi::Value Unmount(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        NapiHelpers::ThrowError(env, "Expected session handle");
        return env.Undefined();
    }
    
    Napi::Object handle = info[0].As<Napi::Object>();
    uint64_t session_id = static_cast<uint64_t>(handle.Get("id").As<Napi::Number>().DoubleValue());
    
    {
        std::lock_guard<std::mutex> lock(sessions_mutex);
        auto it = active_sessions.find(session_id);
        if (it != active_sessions.end()) {
            bool success = it->second->Unmount();
            return Napi::Boolean::New(env, success);
        }
    }
    
    NapiHelpers::ThrowError(env, "Session not found");
    return env.Undefined();
}

/**
 * Check if session is ready (N-API exposed function)
 */
Napi::Value IsReady(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        return Napi::Boolean::New(env, false);
    }
    
    Napi::Object handle = info[0].As<Napi::Object>();
    uint64_t session_id = static_cast<uint64_t>(handle.Get("id").As<Napi::Number>().DoubleValue());
    
    {
        std::lock_guard<std::mutex> lock(sessions_mutex);
        auto it = active_sessions.find(session_id);
        if (it != active_sessions.end()) {
            return Napi::Boolean::New(env, it->second->IsReady());
        }
    }
    
    return Napi::Boolean::New(env, false);
}

} // namespace fuse_native