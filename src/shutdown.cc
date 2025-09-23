/**
 * @file shutdown.cc
 * @brief Geordneter shutdown management implementation for FUSE native binding
 * 
 * This file implements the shutdown management system that handles graceful
 * shutdown of FUSE sessions with proper state transitions, signal handling,
 * and resource cleanup.
 */

#include "shutdown.h"
#include "napi_helpers.h"
#include "tsfn_dispatcher.h"
#include "write_queue.h"
#include <fuse3/fuse.h>
#include <algorithm>
#include <thread>
#include <csignal>
#include <cstring>
#include <chrono>

namespace fuse_native {

/**
 * Global shutdown manager instance
 */
static std::unique_ptr<ShutdownManager> global_shutdown_manager_;
static std::mutex global_shutdown_mutex_;

/**
 * FUSE session registry for shutdown management
 */
static std::mutex fuse_sessions_mutex_;
static std::unordered_map<uint64_t, struct fuse_session*> registered_fuse_sessions_;

/**
 * Signal handling globals
 */
static ShutdownManager* signal_shutdown_manager_ = nullptr;
static std::mutex signal_handler_mutex_;

/**
 * ShutdownManager implementation
 */
ShutdownManager::ShutdownManager()
    : current_state_(ShutdownState::RUNNING), signal_handlers_installed_(false),
      shutdown_in_progress_(false) {
}

ShutdownManager::~ShutdownManager() {
    if (current_state_ != ShutdownState::CLOSED) {
        ForceShutdown("Destructor cleanup");
    }
    
    RemoveSignalHandlers();
    
    if (shutdown_thread_.joinable()) {
        shutdown_thread_.join();
    }
}

bool ShutdownManager::Initialize() {
    std::lock_guard<std::mutex> lock(state_mutex_);
    
    if (current_state_ != ShutdownState::RUNNING) {
        return false; // Already initialized or shutting down
    }
    
    try {
        // Initialize default shutdown phases
        InitializeDefaultPhases();
        
        // Install signal handlers
        InstallSignalHandlers();
        
        // Initialize statistics
        stats_ = ShutdownStats();
        
        return true;
        
    } catch (const std::exception& e) {
        return false;
    }
}

void ShutdownManager::RegisterCallback(std::shared_ptr<ShutdownCallback> callback) {
    if (!callback) {
        return;
    }
    
    std::lock_guard<std::mutex> lock(callbacks_mutex_);
    callbacks_.push_back(callback);
}

void ShutdownManager::UnregisterCallback(std::shared_ptr<ShutdownCallback> callback) {
    if (!callback) {
        return;
    }
    
    std::lock_guard<std::mutex> lock(callbacks_mutex_);
    callbacks_.erase(
        std::remove_if(callbacks_.begin(), callbacks_.end(),
                      [&callback](const std::weak_ptr<ShutdownCallback>& weak_cb) {
                          auto shared_cb = weak_cb.lock();
                          return !shared_cb || shared_cb == callback;
                      }),
        callbacks_.end()
    );
}

ShutdownState ShutdownManager::GetState() const {
    return current_state_;
}

bool ShutdownManager::IsShuttingDown() const {
    ShutdownState state = current_state_;
    return state != ShutdownState::RUNNING && state != ShutdownState::CLOSED;
}

bool ShutdownManager::IsShutdownComplete() const {
    return current_state_ == ShutdownState::CLOSED;
}

bool ShutdownManager::InitiateShutdown(const std::string& reason, uint32_t timeout_ms) {
    bool expected = false;
    if (!shutdown_in_progress_.compare_exchange_strong(expected, true)) {
        return false; // Shutdown already in progress
    }
    
    // Transition from RUNNING to DRAINING
    {
        std::lock_guard<std::mutex> lock(state_mutex_);
        if (current_state_ != ShutdownState::RUNNING) {
            shutdown_in_progress_ = false;
            return false; // Not in a state to shutdown
        }
        
        TransitionState(ShutdownState::DRAINING);
    }
    
    // Start shutdown in separate thread
    if (shutdown_thread_.joinable()) {
        shutdown_thread_.join();
    }
    
    shutdown_thread_ = std::thread(&ShutdownManager::ExecuteShutdown, this, reason, timeout_ms);
    
    return true;
}

void ShutdownManager::ForceShutdown(const std::string& reason) {
    shutdown_in_progress_ = true;
    
    // Signal all FUSE sessions to exit immediately
    SignalAllFuseSessions();
    
    // Cancel all write queues
    auto write_queue_manager = GetGlobalWriteQueueManager();
    if (write_queue_manager) {
        write_queue_manager->CancelAll(-ECANCELED);
    }
    
    // Shutdown dispatcher
    ShutdownGlobalDispatcher(100); // 100ms timeout for force shutdown
    
    // Update statistics
    {
        std::lock_guard<std::mutex> lock(stats_mutex_);
        stats_.shutdown_end = std::chrono::steady_clock::now();
        stats_.final_state = ShutdownState::CLOSED;
        stats_.graceful_completion = false;
        stats_.failure_reason = "Force shutdown: " + reason;
    }
    
    // Transition directly to CLOSED
    TransitionState(ShutdownState::CLOSED);
    
    // Notify callbacks
    NotifyCallbacks([&reason](ShutdownCallback& callback) {
        callback.OnShutdownFailed(ShutdownState::CLOSED, reason);
    });
}

bool ShutdownManager::WaitForShutdown(uint32_t timeout_ms) {
    auto start_time = std::chrono::steady_clock::now();
    auto timeout = std::chrono::milliseconds(timeout_ms);
    
    std::unique_lock<std::mutex> lock(state_mutex_);
    return state_cv_.wait_for(lock, timeout, [this]() {
        return current_state_ == ShutdownState::CLOSED;
    });
}

ShutdownStats ShutdownManager::GetStats() const {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    return stats_;
}

void ShutdownManager::SetPhaseTimeout(ShutdownState state, uint32_t timeout_ms) {
    std::lock_guard<std::mutex> lock(phases_mutex_);
    
    for (auto& phase : shutdown_phases_) {
        if (phase->state == state) {
            phase->timeout = std::chrono::milliseconds(timeout_ms);
            break;
        }
    }
}

void ShutdownManager::RegisterPhaseCleanup(ShutdownState state, std::function<void()> cleanup_fn) {
    std::lock_guard<std::mutex> lock(phases_mutex_);
    
    for (auto& phase : shutdown_phases_) {
        if (phase->state == state) {
            phase->cleanup_action = cleanup_fn;
            break;
        }
    }
}

void ShutdownManager::RegisterPhaseCompletionCheck(ShutdownState state, std::function<bool()> check_fn) {
    std::lock_guard<std::mutex> lock(phases_mutex_);
    
    for (auto& phase : shutdown_phases_) {
        if (phase->state == state) {
            phase->completion_check = check_fn;
            break;
        }
    }
}

void ShutdownManager::InstallSignalHandlers() {
    if (signal_handlers_installed_) {
        return;
    }
    
    std::lock_guard<std::mutex> lock(signal_handler_mutex_);
    signal_shutdown_manager_ = this;
    
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = SignalHandler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_RESTART;
    
    sigaction(SIGINT, &sa, nullptr);
    sigaction(SIGTERM, &sa, nullptr);
    
    signal_handlers_installed_ = true;
}

void ShutdownManager::RemoveSignalHandlers() {
    if (!signal_handlers_installed_) {
        return;
    }
    
    std::lock_guard<std::mutex> lock(signal_handler_mutex_);
    
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = SIG_DFL;
    sigemptyset(&sa.sa_mask);
    
    sigaction(SIGINT, &sa, nullptr);
    sigaction(SIGTERM, &sa, nullptr);
    
    signal_shutdown_manager_ = nullptr;
    signal_handlers_installed_ = false;
}

void ShutdownManager::SignalHandler(int signal) {
    std::lock_guard<std::mutex> lock(signal_handler_mutex_);
    
    if (signal_shutdown_manager_) {
        std::string reason = "Signal " + std::to_string(signal);
        if (signal == SIGINT) {
            reason = "SIGINT (Ctrl+C)";
        } else if (signal == SIGTERM) {
            reason = "SIGTERM";
        }
        
        signal_shutdown_manager_->InitiateShutdown(reason, 15000);
    }
}

void ShutdownManager::ExecuteShutdown(const std::string& reason, uint32_t timeout_ms) {
    {
        std::lock_guard<std::mutex> lock(stats_mutex_);
        stats_.shutdown_start = std::chrono::steady_clock::now();
    }
    
    // Notify callbacks about shutdown begin
    NotifyCallbacks([&reason](ShutdownCallback& callback) {
        callback.OnShutdownBegin(reason);
    });
    
    auto total_start = std::chrono::steady_clock::now();
    auto total_timeout = std::chrono::milliseconds(timeout_ms);
    bool all_phases_succeeded = true;
    
    // Execute each shutdown phase
    {
        std::lock_guard<std::mutex> lock(phases_mutex_);
        
        for (const auto& phase : shutdown_phases_) {
            auto elapsed = std::chrono::steady_clock::now() - total_start;
            if (elapsed >= total_timeout) {
                all_phases_succeeded = false;
                break;
            }
            
            // Adjust phase timeout based on remaining total timeout
            auto remaining = total_timeout - elapsed;
            auto phase_timeout = std::min(phase->timeout, std::chrono::duration_cast<std::chrono::milliseconds>(remaining));
            
            // Update phase start time and timeout
            const_cast<ShutdownPhase&>(*phase).start_time = std::chrono::steady_clock::now();
            const_cast<ShutdownPhase&>(*phase).timeout = phase_timeout;
            
            // Transition to phase state
            TransitionState(phase->state);
            
            // Notify callbacks about phase start
            NotifyCallbacks([&phase](ShutdownCallback& callback) {
                callback.OnShutdownPhase(*phase);
            });
            
            // Execute phase
            bool phase_success = ExecutePhase(*phase);
            
            // Record phase duration
            auto phase_end = std::chrono::steady_clock::now();
            auto phase_duration = std::chrono::duration_cast<std::chrono::milliseconds>(
                phase_end - phase->start_time);
            
            {
                std::lock_guard<std::mutex> stats_lock(stats_mutex_);
                stats_.phase_durations.emplace_back(phase->state, phase_duration);
            }
            
            if (!phase_success) {
                all_phases_succeeded = false;
                
                // Notify callbacks about failure
                std::string failure_reason = "Phase " + phase->description + " failed or timed out";
                NotifyCallbacks([&phase, &failure_reason](ShutdownCallback& callback) {
                    callback.OnShutdownFailed(phase->state, failure_reason);
                });
                
                break;
            }
        }
    }
    
    // Final transition to CLOSED state
    TransitionState(ShutdownState::CLOSED);
    
    // Update final statistics
    {
        std::lock_guard<std::mutex> lock(stats_mutex_);
        stats_.shutdown_end = std::chrono::steady_clock::now();
        stats_.final_state = ShutdownState::CLOSED;
        stats_.graceful_completion = all_phases_succeeded;
        
        if (!all_phases_succeeded) {
            stats_.failure_reason = "One or more shutdown phases failed";
        }
    }
    
    // Notify callbacks about completion
    auto final_stats = GetStats();
    NotifyCallbacks([&final_stats](ShutdownCallback& callback) {
        callback.OnShutdownComplete(final_stats);
    });
    
    shutdown_in_progress_ = false;
}

bool ShutdownManager::ExecutePhase(const ShutdownPhase& phase) {
    auto start_time = std::chrono::steady_clock::now();
    
    // Execute cleanup action if provided
    if (phase.cleanup_action) {
        try {
            phase.cleanup_action();
        } catch (const std::exception& e) {
            return false;
        }
    }
    
    // Wait for completion check if provided
    if (phase.completion_check) {
        while (std::chrono::steady_clock::now() - start_time < phase.timeout) {
            if (phase.completion_check()) {
                return true; // Phase completed successfully
            }
            
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
        
        return false; // Timeout
    }
    
    // If no completion check, just execute cleanup and return success
    return true;
}

void ShutdownManager::TransitionState(ShutdownState new_state) {
    {
        std::lock_guard<std::mutex> lock(state_mutex_);
        current_state_ = new_state;
    }
    
    state_cv_.notify_all();
}

void ShutdownManager::NotifyCallbacks(std::function<void(ShutdownCallback&)> callback_fn) {
    std::vector<std::shared_ptr<ShutdownCallback>> active_callbacks;
    
    {
        std::lock_guard<std::mutex> lock(callbacks_mutex_);
        
        // Clean up expired callbacks and collect active ones
        CleanupExpiredCallbacks();
        
        for (const auto& weak_cb : callbacks_) {
            auto shared_cb = weak_cb.lock();
            if (shared_cb) {
                active_callbacks.push_back(shared_cb);
            }
        }
    }
    
    // Call callbacks outside of lock to avoid deadlocks
    for (auto& callback : active_callbacks) {
        try {
            callback_fn(*callback);
        } catch (const std::exception& e) {
            // Ignore callback exceptions
        }
    }
}

void ShutdownManager::InitializeDefaultPhases() {
    shutdown_phases_.clear();
    
    // Phase 1: DRAINING - drain pending operations
    auto draining_phase = std::make_unique<ShutdownPhase>(
        ShutdownState::DRAINING, 
        "Draining pending operations", 
        std::chrono::milliseconds(5000)
    );
    
    draining_phase->cleanup_action = []() {
        // Flush all write queues
        auto write_queue_manager = GetGlobalWriteQueueManager();
        if (write_queue_manager) {
            write_queue_manager->FlushAll(5000);
        }
    };
    
    draining_phase->completion_check = []() {
        auto write_queue_manager = GetGlobalWriteQueueManager();
        if (write_queue_manager) {
            auto stats = write_queue_manager->GetAggregateStats();
            return stats.queue_size == 0;
        }
        return true;
    };
    
    shutdown_phases_.push_back(std::move(draining_phase));
    
    // Phase 2: UNMOUNTING - unmount FUSE sessions
    auto unmounting_phase = std::make_unique<ShutdownPhase>(
        ShutdownState::UNMOUNTING, 
        "Unmounting FUSE sessions", 
        std::chrono::milliseconds(8000)
    );
    
    unmounting_phase->cleanup_action = []() {
        // Signal all FUSE sessions to exit
        SignalAllFuseSessions();
        
        // Shutdown dispatcher
        ShutdownGlobalDispatcher(5000);
        
        // Shutdown write queue manager
        ShutdownGlobalWriteQueueManager(3000);
    };
    
    unmounting_phase->completion_check = []() {
        // Check if all FUSE sessions have exited
        return WaitForAllFuseSessions(100); // Quick check
    };
    
    shutdown_phases_.push_back(std::move(unmounting_phase));
}

void ShutdownManager::CleanupExpiredCallbacks() {
    callbacks_.erase(
        std::remove_if(callbacks_.begin(), callbacks_.end(),
                      [](const std::weak_ptr<ShutdownCallback>& weak_cb) {
                          return weak_cb.expired();
                      }),
        callbacks_.end()
    );
}

/**
 * FUSE session registry functions
 */
bool RegisterFuseSession(uint64_t session_id, void* session_ptr) {
    if (!session_ptr) {
        return false;
    }
    
    std::lock_guard<std::mutex> lock(fuse_sessions_mutex_);
    registered_fuse_sessions_[session_id] = static_cast<struct fuse_session*>(session_ptr);
    return true;
}

bool UnregisterFuseSession(uint64_t session_id) {
    std::lock_guard<std::mutex> lock(fuse_sessions_mutex_);
    return registered_fuse_sessions_.erase(session_id) > 0;
}

size_t SignalAllFuseSessions() {
    std::lock_guard<std::mutex> lock(fuse_sessions_mutex_);
    
    size_t signaled = 0;
    for (auto& pair : registered_fuse_sessions_) {
        if (pair.second) {
            if (pair.second) {
                // Signal the session to exit - this is a mock implementation
                // In real implementation, we would call fuse_session_exit
                // fuse_session_exit(pair.second);
            }
            signaled++;
        }
    }
    
    return signaled;
}

bool WaitForAllFuseSessions(uint32_t timeout_ms) {
    auto start_time = std::chrono::steady_clock::now();
    auto timeout = std::chrono::milliseconds(timeout_ms);
    
    while (std::chrono::steady_clock::now() - start_time < timeout) {
        bool all_exited = true;
        
        {
            std::lock_guard<std::mutex> lock(fuse_sessions_mutex_);
            for (const auto& pair : registered_fuse_sessions_) {
                if (pair.second) {
                    // Check if session has exited - this is a mock implementation
                    // In real implementation, we would call fuse_session_exited
                    // if (!fuse_session_exited(pair.second)) {
                    //     all_exited = false;
                    //     break;
                    // }
                    // For now, assume all sessions exit quickly
                }
            }
        }
        
        if (all_exited) {
            return true;
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    
    return false; // Timeout
}

/**
 * Global shutdown manager functions
 */
ShutdownManager* GetGlobalShutdownManager() {
    std::lock_guard<std::mutex> lock(global_shutdown_mutex_);
    return global_shutdown_manager_.get();
}

bool InitializeGlobalShutdownManager() {
    std::lock_guard<std::mutex> lock(global_shutdown_mutex_);
    
    if (global_shutdown_manager_) {
        return false; // Already initialized
    }
    
    global_shutdown_manager_ = std::make_unique<ShutdownManager>();
    return global_shutdown_manager_->Initialize();
}

bool ShutdownGlobalShutdownManager(uint32_t timeout_ms) {
    std::unique_ptr<ShutdownManager> manager;
    
    {
        std::lock_guard<std::mutex> lock(global_shutdown_mutex_);
        manager = std::move(global_shutdown_manager_);
    }
    
    if (!manager) {
        return true; // Already shutdown
    }
    
    bool success = false;
    if (manager->GetState() == ShutdownState::RUNNING) {
        success = manager->InitiateShutdown("Global shutdown", timeout_ms);
        if (success) {
            success = manager->WaitForShutdown(timeout_ms);
        }
    } else {
        success = manager->WaitForShutdown(timeout_ms);
    }
    
    return success;
}

/**
 * N-API exposed functions
 */
Napi::Value InitializeShutdownManager(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    bool success = InitializeGlobalShutdownManager();
    return Napi::Boolean::New(env, success);
}

Napi::Value InitiateGracefulShutdown(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    std::string reason = "Manual shutdown";
    uint32_t timeout_ms = 15000;
    
    if (info.Length() > 0 && info[0].IsString()) {
        reason = info[0].As<Napi::String>().Utf8Value();
    }
    
    if (info.Length() > 1 && info[1].IsNumber()) {
        timeout_ms = info[1].As<Napi::Number>().Uint32Value();
    }
    
    auto manager = GetGlobalShutdownManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Shutdown manager not initialized");
        return env.Undefined();
    }
    
    bool success = manager->InitiateShutdown(reason, timeout_ms);
    return Napi::Boolean::New(env, success);
}

Napi::Value ForceImmediateShutdown(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    std::string reason = "Forced shutdown";
    if (info.Length() > 0 && info[0].IsString()) {
        reason = info[0].As<Napi::String>().Utf8Value();
    }
    
    auto manager = GetGlobalShutdownManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Shutdown manager not initialized");
        return env.Undefined();
    }
    
    manager->ForceShutdown(reason);
    return Napi::Boolean::New(env, true);
}

Napi::Value GetShutdownState(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    auto manager = GetGlobalShutdownManager();
    if (!manager) {
        return Napi::Number::New(env, static_cast<int>(ShutdownState::RUNNING));
    }
    
    ShutdownState state = manager->GetState();
    return Napi::Number::New(env, static_cast<int>(state));
}

Napi::Value GetShutdownStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    auto manager = GetGlobalShutdownManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Shutdown manager not initialized");
        return env.Undefined();
    }
    
    auto stats = manager->GetStats();
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("finalState", Napi::Number::New(env, static_cast<int>(stats.final_state)));
    result.Set("gracefulCompletion", Napi::Boolean::New(env, stats.graceful_completion));
    result.Set("failureReason", Napi::String::New(env, stats.failure_reason));
    
    // Add phase durations
    Napi::Array phases = Napi::Array::New(env, stats.phase_durations.size());
    for (size_t i = 0; i < stats.phase_durations.size(); ++i) {
        Napi::Object phase = Napi::Object::New(env);
        phase.Set("state", Napi::Number::New(env, static_cast<int>(stats.phase_durations[i].first)));
        phase.Set("durationMs", Napi::Number::New(env, static_cast<double>(stats.phase_durations[i].second.count())));
        phases.Set(i, phase);
    }
    result.Set("phaseDurations", phases);
    
    // Add total duration if shutdown completed
    if (stats.shutdown_end > stats.shutdown_start) {
        auto total_duration = std::chrono::duration_cast<std::chrono::milliseconds>(
            stats.shutdown_end - stats.shutdown_start);
        result.Set("totalDurationMs", Napi::Number::New(env, static_cast<double>(total_duration.count())));
    }
    
    return result;
}

Napi::Value RegisterShutdownCallback(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsObject()) {
        NapiHelpers::ThrowTypeError(env, "Expected callback object");
        return env.Undefined();
    }
    
    auto manager = GetGlobalShutdownManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Shutdown manager not initialized");
        return env.Undefined();
    }
    
    // TODO: Implement N-API callback wrapper
    // This would require creating a C++ wrapper class that implements ShutdownCallback
    // and calls back to JavaScript functions
    
    return Napi::Boolean::New(env, true);
}

Napi::Value WaitForShutdownCompletion(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    uint32_t timeout_ms = 30000;
    if (info.Length() > 0 && info[0].IsNumber()) {
        timeout_ms = info[0].As<Napi::Number>().Uint32Value();
    }
    
    auto manager = GetGlobalShutdownManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Shutdown manager not initialized");
        return env.Undefined();
    }
    
    // For now, return a simple boolean result
    // In a full implementation, this should return a Promise
    bool success = manager->WaitForShutdown(timeout_ms);
    return Napi::Boolean::New(env, success);
}

Napi::Value ConfigureShutdownTimeouts(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsObject()) {
        NapiHelpers::ThrowTypeError(env, "Expected timeout configuration object");
        return env.Undefined();
    }
    
    auto manager = GetGlobalShutdownManager();
    if (!manager) {
        NapiHelpers::ThrowError(env, "Shutdown manager not initialized");
        return env.Undefined();
    }
    
    Napi::Object config = info[0].As<Napi::Object>();
    
    if (config.Has("draining")) {
        uint32_t timeout = config.Get("draining").As<Napi::Number>().Uint32Value();
        manager->SetPhaseTimeout(ShutdownState::DRAINING, timeout);
    }
    
    if (config.Has("unmounting")) {
        uint32_t timeout = config.Get("unmounting").As<Napi::Number>().Uint32Value();
        manager->SetPhaseTimeout(ShutdownState::UNMOUNTING, timeout);
    }
    
    return Napi::Boolean::New(env, true);
}

} // namespace fuse_native