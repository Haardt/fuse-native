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
#include <cstring>

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
SessionManager::SessionManager(napi_env env, const std::string& mountpoint, const SessionOptions& options)
    : mountpoint_(mountpoint), options_(options), session_id_(next_session_id++),
      state_(SessionState::CREATED), env_(env), fuse_session_(nullptr), fuse_channel_(nullptr),
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
        fprintf(stderr, "FUSE: creating bridge...\n");
        fflush(stderr);
        bridge_ = std::make_unique<FuseBridge>(this);
        fprintf(stderr, "FUSE: bridge created, initializing...\n");
        fflush(stderr);
        if (!bridge_->Initialize(Napi::Env(env_))) {
            fprintf(stderr, "FUSE: bridge initialization failed\n");
            fflush(stderr);
            return false;
        }
        fprintf(stderr, "FUSE: bridge initialization succeeded\n");
        fflush(stderr);
        
        // Create FUSE session arguments using proper FUSE argument parsing
        std::vector<std::string> fuse_args;
        fuse_args.push_back("fuse-native");

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

        // Convert to char* array for FUSE argument parsing
        std::vector<char*> argv;
        for (auto& arg : fuse_args) {
            argv.push_back(const_cast<char*>(arg.c_str()));
        }
        argv.push_back(nullptr); // Null terminate for exec-style parsing

        // Parse FUSE arguments using FUSE's argument parser
        struct fuse_args args = FUSE_ARGS_INIT(static_cast<int>(argv.size() - 1), argv.data());
        struct fuse_cmdline_opts opts;

        // Parse command line options
        if (fuse_parse_cmdline(&args, &opts) != 0) {
            fuse_opt_free_args(&args);
            fprintf(stderr, "FUSE: failed to parse command line arguments\n");
            fflush(stderr);
            return false;
        }

        // Set the mountpoint
        opts.mountpoint = strdup(mountpoint_.c_str());
        if (!opts.mountpoint) {
            fuse_opt_free_args(&args);
            fprintf(stderr, "FUSE: failed to allocate mountpoint string\n");
            fflush(stderr);
            return false;
        }

        // Create FUSE session
        fuse_session_ = fuse_session_new(&args, bridge_->GetFuseOperations(),
                                         sizeof(*bridge_->GetFuseOperations()), this);

        // Clean up
        fuse_opt_free_args(&args);
        free(opts.mountpoint);

        if (!fuse_session_) {
            fprintf(stderr, "FUSE: session_new failed\n");
            fflush(stderr);
            return false;
        }
        fprintf(stderr, "FUSE: session_new succeeded\n");
        fflush(stderr);
        
        state_ = SessionState::INITIALIZED;
        return true;
        
    } catch (const std::exception& e) {
        // Log error
        return false;
    }
}

bool SessionManager::Mount() {
    std::lock_guard<std::mutex> lock(state_mutex_);
    fprintf(stderr, "FUSE: Mount1 %s\n", mountpoint_.c_str());
    fflush(stderr);

    if (state_ != SessionState::INITIALIZED) {
        fprintf(stderr, "FUSE: state is %d, need to initialize\n", static_cast<int>(state_));
        fflush(stderr);
        if (state_ == SessionState::CREATED && !Initialize()) {
            fprintf(stderr, "FUSE: Initialize() failed\n");
            fflush(stderr);
            return false;
        } else if (state_ != SessionState::INITIALIZED) {
            fprintf(stderr, "FUSE: state is still not INITIALIZED after Initialize()\n");
            fflush(stderr);
            return false;
        }
    }
    fprintf(stderr, "FUSE: Mount2 %s\n", mountpoint_.c_str());
    fflush(stderr);

    // Mount the filesystem
    if (fuse_session_mount(fuse_session_, mountpoint_.c_str()) != 0) {
        fprintf(stderr, "FUSE: session_mount failed for %s\n", mountpoint_.c_str());
        fflush(stderr);
        return false;
    }
    fprintf(stderr, "FUSE: session_mount succeeded for %s\n", mountpoint_.c_str());
    fflush(stderr);
    
    state_ = SessionState::MOUNTED;
    
    // Start the FUSE loop in a separate thread
    mount_thread_running_ = true;
    mount_thread_ = std::thread([this]() {
        this->RunFuseLoop();
    });
    
    return true;
}

bool SessionManager::Unmount() {
  // Phase 1: FUSE/Loop stoppen (unter state_mutex_)
  {
    std::lock_guard<std::mutex> lock(state_mutex_);

    if (state_ == SessionState::MOUNTED) {
      if (fuse_session_) {
        // Reihenfolge je nach FUSE-Variante:
        fuse_session_unmount(fuse_session_);  // unmount -> löst Mount
        fuse_session_exit(fuse_session_);     // signalisiert der Loop zu enden
      }
      state_ = SessionState::INITIALIZED;
    }

    // eigenes Flag für benutzerdefinierte Loops
    mount_thread_running_ = false;
  }

  // Phase 2: Worker-Thread joinen (ohne state_mutex_)
  if (mount_thread_.joinable()) {
    if (std::this_thread::get_id() == mount_thread_.get_id()) {
      // aus demselben Thread heraus unmounten wäre fatal → nicht joinen
      return false;
    }
    mount_thread_.join();
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
        fprintf(stderr, "FUSE: RunFuseLoop - no fuse_session_\n");
        return;
    }

    fprintf(stderr, "FUSE: RunFuseLoop - starting FUSE loop thread\n");
    fprintf(stderr, "FUSE: RunFuseLoop - max_read: %u\n", options_.max_read);

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
        fprintf(stderr, "FUSE: RunFuseLoop - failed to allocate buffer\n");
        return;
    }
    fprintf(stderr, "FUSE: RunFuseLoop - allocated buffer of size %zu\n", fbuf.size);

    // Main FUSE loop
    int loop_count = 0;
    while (mount_thread_running_ && !fuse_session_exited(fuse_session_)) {
        loop_count++;
        if (loop_count % 100 == 1) {
            fprintf(stderr, "FUSE: RunFuseLoop - loop iteration %d\n", loop_count);
        }

        int res = fuse_session_receive_buf(fuse_session_, &fbuf);
        if (res == -EINTR || res == 0) {
            if (res == -EINTR) {
                fprintf(stderr, "FUSE: RunFuseLoop - received EINTR, continuing\n");
            }
            continue;
        }
        if (res < 0) {
            // Log error for debugging
            fprintf(stderr, "FUSE: RunFuseLoop - receive_buf failed with %d\n", res);
            fprintf(stderr, "FUSE: RunFuseLoop - errno: %d (%s)\n", errno, strerror(errno));
            break;
        }

        fprintf(stderr, "FUSE: RunFuseLoop - received buffer, processing...\n");
        fuse_session_process_buf(fuse_session_, &fbuf);
        fprintf(stderr, "FUSE: RunFuseLoop - processed buffer\n");
    }

    fprintf(stderr, "FUSE: RunFuseLoop - exiting loop after %d iterations\n", loop_count);

    // Clean up buffer
    if (fbuf.mem) {
        free(fbuf.mem);
        fprintf(stderr, "FUSE: RunFuseLoop - freed buffer\n");
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
        auto session_manager = std::make_unique<SessionManager>(env, mountpoint, options);
        uint64_t session_id = session_manager->GetSessionId();

        fprintf(stderr, "FUSE: CreateSession - calling Initialize() on session manager\n");
        fflush(stderr);
        if (!session_manager->Initialize()) {
            fprintf(stderr, "FUSE: CreateSession - Initialize() failed\n");
            fflush(stderr);
            NapiHelpers::ThrowError(env, "Failed to initialize session");
            return env.Undefined();
        }
        fprintf(stderr, "FUSE: CreateSession - Initialize() succeeded\n");
        fflush(stderr);

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
 * Supports both:
 *   mount(handle, options, callback)  // preferred in your JS
 *   const ok = mount(handle)          // boolean fallback
 */
Napi::Value Mount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Expected session handle").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Function cb;
  if (info.Length() >= 2 && info[1].IsFunction()) cb = info[1].As<Napi::Function>();
  else if (info.Length() >= 3 && info[2].IsFunction()) cb = info[2].As<Napi::Function>();

  Napi::Object handle = info[0].As<Napi::Object>();
  const uint64_t session_id =
      static_cast<uint64_t>(handle.Get("id").As<Napi::Number>().Int64Value());

  SessionManager* mgr = nullptr;
  {
    std::lock_guard<std::mutex> lock(sessions_mutex);
    auto it = active_sessions.find(session_id);
    if (it != active_sessions.end()) {
      mgr = it->second.get();   // unique_ptr -> raw*
    }
  }

  if (!mgr) {
    if (cb) { cb.Call(env.Null(), { Napi::Error::New(env, "Session not found").Value() }); return env.Undefined(); }
    Napi::Error::New(env, "Session not found").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const bool ok = mgr->Mount();

  if (cb) {
    if (ok) cb.Call(env.Null(), { env.Null() });
    else cb.Call(env.Null(), { Napi::Error::New(env, "mount failed").Value() });
    return env.Undefined();
  }
  return Napi::Boolean::New(env, ok);
}

/// erwartet: unmount(handle) -> boolean
 //           unmount(handle, cb) -> cb(err|null)
 //           unmount(handle, options, cb) -> options ignoriert, cb genutzt
 Napi::Value Unmount(const Napi::CallbackInfo& info) {
   Napi::Env env = info.Env();

   if (info.Length() < 1 || !info[0].IsObject()) {
     Napi::TypeError::New(env, "Expected session handle").ThrowAsJavaScriptException();
     return env.Undefined();
   }

   // optionalen Callback erkennen (2. oder 3. Arg)
   Napi::Function cb;
   if (info.Length() >= 2 && info[1].IsFunction()) {
     cb = info[1].As<Napi::Function>();
   } else if (info.Length() >= 3 && info[2].IsFunction()) {
     cb = info[2].As<Napi::Function>();
   }

   Napi::Object handle = info[0].As<Napi::Object>();
   if (!handle.Has("id") || !handle.Get("id").IsNumber()) {
     if (cb) { cb.Call(env.Null(), { Napi::TypeError::New(env, "Invalid session handle").Value() }); return env.Undefined(); }
     Napi::TypeError::New(env, "Invalid session handle").ThrowAsJavaScriptException();
     return env.Undefined();
   }

   const uint64_t session_id =
       static_cast<uint64_t>(handle.Get("id").As<Napi::Number>().Int64Value());

   // ⚠️ Map enthält unique_ptr → nur rohen Zeiger herausziehen
   SessionManager* mgr = nullptr;
   {
     std::lock_guard<std::mutex> lock(sessions_mutex);
     auto it = active_sessions.find(session_id);
     if (it != active_sessions.end()) {
       mgr = it->second.get();   // ✅ unique_ptr -> raw*
       // Optional: wenn du beim Unmount aus der Map löschen willst,
       // kannst du hier NICHT löschen, solange wir mgr verwenden.
       // Siehe Kommentar unten.
     }
   }

   if (!mgr) {
     if (cb) { cb.Call(env.Null(), { Napi::Error::New(env, "Session not found").Value() }); return env.Undefined(); }
     Napi::Error::New(env, "Session not found").ThrowAsJavaScriptException();
     return env.Undefined();
   }

   const bool ok = mgr->Unmount();  // kann blockieren (join), aber wir halten NICHT den sessions_mutex!

   // Optional: Wenn du die Session nach Unmount aus der Map entfernen willst:
   // (nur wenn dein Design das vorsieht)
   /*
   {
     std::lock_guard<std::mutex> lock(sessions_mutex);
     auto it = active_sessions.find(session_id);
     if (it != active_sessions.end() && it->second.get() == mgr) {
       active_sessions.erase(it);  // unique_ptr wird zerstört
     }
   }
   */

   if (cb) {
     if (ok) cb.Call(env.Null(), { env.Null() });
     else cb.Call(env.Null(), { Napi::Error::New(env, "unmount failed").Value() });
     return env.Undefined();
   }

   return Napi::Boolean::New(env, ok);
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
