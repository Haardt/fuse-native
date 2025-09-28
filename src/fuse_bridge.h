/**
 * @file fuse_bridge.h
 * @brief FUSE3 bridge declarations for N-API integration
 */

#ifndef FUSE_BRIDGE_H
#define FUSE_BRIDGE_H

#include <napi.h>
#include <fuse3/fuse_lowlevel.h>
#include <fcntl.h>
#include <atomic>
#include <chrono>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "tsfn_dispatcher.h"

namespace fuse_native {

class SessionManager;
class FuseBridge;

/**
 * Supported FUSE operation types for registration/dispatch.
 */
enum class FuseOpType {
    INIT,
    DESTROY,
    FORGET,
    FORGET_MULTI,
    LOOKUP,
    GETATTR,
    SETATTR,
    READLINK,
    MKNOD,
    MKDIR,
    UNLINK,
    RMDIR,
    SYMLINK,
    RENAME,
    LINK,
    SETXATTR,
    GETXATTR,
    LISTXATTR,
    REMOVEXATTR,
    OPEN,
    READ,
    WRITE,
    WRITE_BUF,
    READ_BUF,
    FLUSH,
    RELEASE,
    FSYNC,
    FALLOCATE,
    LSEEK,
    COPY_FILE_RANGE,
    OPENDIR,
    READDIR,
    READDIRPLUS,
    RELEASEDIR,
    FSYNCDIR,
    STATFS,
    ACCESS,
    CREATE,
    BMAP,
    IOCTL,
    POLL,
    FLOCK,
    GETLK,
    SETLK,
    RETRIEVE_REPLY,
    // --- Aliases for simplified dispatch ---
    TRUNCATE,
    CHMOD,
    CHOWN,
    UNKNOWN
};

FuseOpType StringToFuseOpType(const std::string& name);
const char* FuseOpTypeToString(FuseOpType type);

#include <atomic>
#include <memory>
#include <vector>

struct FuseRequestContext : public std::enable_shared_from_this<FuseRequestContext> {
    FuseRequestContext(FuseOpType op_type, fuse_req_t request, FuseBridge* bridge);

    FuseRequestContext(const FuseRequestContext&) = delete;
    FuseRequestContext& operator=(const FuseRequestContext&) = delete;
    FuseRequestContext(FuseRequestContext&&) = delete;
    FuseRequestContext& operator=(FuseRequestContext&&) = delete;

    void CaptureCallerContext();
    bool TryMarkReplied();
    void ReplyError(int errno_code);
    void ReplyOk();
    void ReplyUnsupported();

    void ReplyAttr(const struct stat& attr_value, double attr_timeout);
    void ReplyEntry(const struct fuse_entry_param& entry);
    void ReplyBuf(const void* data_ptr, size_t length);
    void ReplyWrite(size_t bytes_written);
    void ReplyOpen(const struct fuse_file_info& result_fi);
    void ReplyOpendir(const struct fuse_file_info& result_fi);
    void ReplyCreate(const struct fuse_entry_param& entry,
                     const struct fuse_file_info& result_fi);
    void ReplyStatfs(const struct statvfs& stats);
    void ReplyReadlink(const std::string& target_path);
    void ReplyGetlk(const struct flock& lock);

    // --- NEU: hält Antwortdaten bis nach fuse_reply_* am Leben ---
    std::shared_ptr<void> keepalive;

    FuseOpType op_type;
    fuse_req_t request;
    FuseBridge* bridge;
    uint64_t request_id{};
    CallbackPriority priority{};
    std::chrono::steady_clock::time_point start_time{};
    struct fuse_ctx caller_ctx{};
    bool has_caller_ctx{false};

    // Generic request metadata
    fuse_ino_t ino{};
    fuse_ino_t parent{};
    fuse_ino_t new_parent{};
    std::string name;
    std::string new_name;
    std::string link_target;
    mode_t mode{};
    dev_t rdev{};
    uint32_t setattr_valid{};
    struct stat attr{};
    bool has_attr{false};
    struct fuse_file_info fi{};
    bool has_fi{false};
    struct fuse_file_info fi_out{};
    bool has_fi_out{false};
    uint64_t offset{};
    uint64_t new_offset{};
    size_t size{};
    int flags{};
    int datasync{};
    uint32_t access_mask{};
    std::vector<uint8_t> data;
    struct flock lock{};
    bool has_lock{false};
    int sleep{};

    std::atomic<bool> replied{false};
};

/**
 * Bridge between FUSE kernel callbacks and the JavaScript layer.
 */
class FuseBridge {
public:
    explicit FuseBridge(SessionManager* session_mgr);
    ~FuseBridge();

    bool Initialize(Napi::Env env);
    void Shutdown();

    const struct fuse_lowlevel_ops* GetFuseOperations() const { return &fuse_ops_; }

    // Global handler management used by the N-API surface
    static bool RegisterOperationHandler(Napi::Env env, FuseOpType op_type, Napi::Function handler, const std::string& operation_name = "");
    static bool RemoveOperationHandler(FuseOpType op_type);
    static bool HasOperationHandler(FuseOpType op_type);

    static FuseBridge* GetBridgeFromRequest(fuse_req_t req);

private:
    SessionManager* session_manager_;
    napi_env env_;
    bool initialized_;
    struct fuse_lowlevel_ops fuse_ops_;

    struct HandlerRecord {
        std::string operation_name;
    };

    static std::mutex handler_mutex_;
    static std::unordered_map<FuseOpType, HandlerRecord> handler_registry_;

    void InitializeFuseOperations();
    void ProcessRequest(std::shared_ptr<FuseRequestContext> context,
                        std::function<void(Napi::Env, Napi::Function)> js_invoker);
    std::shared_ptr<FuseRequestContext> CreateContext(FuseOpType op_type, fuse_req_t req);

    // Instance-level handlers invoked from static callbacks
    void HandleLookup(fuse_req_t req, fuse_ino_t parent, const char* name);
    void HandleGetattr(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    void HandleSetattr(fuse_req_t req, fuse_ino_t ino, struct stat* attr, int to_set,
                       struct fuse_file_info* fi);
    void HandleReadlink(fuse_req_t req, fuse_ino_t ino);
    void HandleMknod(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode, dev_t rdev);
    void HandleMkdir(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode);
    void HandleChmod(fuse_req_t req, fuse_ino_t ino, mode_t mode, struct fuse_file_info* fi, int to_set);
    void HandleChown(fuse_req_t req, fuse_ino_t ino, struct stat* attr, int to_set,
                     struct fuse_file_info* fi);
    void HandleSymlink(fuse_req_t req, const char* link, fuse_ino_t parent, const char* name);
    void HandleUnlink(fuse_req_t req, fuse_ino_t parent, const char* name);
    void HandleRmdir(fuse_req_t req, fuse_ino_t parent, const char* name);
    void HandleRename(fuse_req_t req, fuse_ino_t parent, const char* name,
                      fuse_ino_t newparent, const char* newname, unsigned int flags);
    void HandleLink(fuse_req_t req, fuse_ino_t ino, fuse_ino_t newparent, const char* newname);
    void HandleOpen(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    void HandleRead(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off,
                    struct fuse_file_info* fi);
    void HandleWrite(fuse_req_t req, fuse_ino_t ino, const char* buf, size_t size, off_t off,
                     struct fuse_file_info* fi);
    void HandleFlush(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    void HandleRelease(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    void HandleFsync(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info* fi);
    void HandleOpendir(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    void HandleReaddir(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off,
                       struct fuse_file_info* fi);
    void HandleReaddirplus(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off,
                           struct fuse_file_info* fi);
    void HandleReleasedir(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    void HandleFsyncdir(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info* fi);
    void HandleStatfs(fuse_req_t req, fuse_ino_t ino);
    void HandleAccess(fuse_req_t req, fuse_ino_t ino, int mask);
    void HandleCreate(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode,
                      struct fuse_file_info* fi);
    void HandleCopyFileRange(fuse_req_t req, fuse_ino_t ino_in, off_t off_in,
                             struct fuse_file_info* fi_in, fuse_ino_t ino_out,
                             off_t off_out, struct fuse_file_info* fi_out,
                             size_t len, int flags);
    void HandleGetlk(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi, struct flock* lock);
    void HandleSetlk(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi, struct flock* lock, int sleep);
    void HandleBmap(fuse_req_t req, fuse_ino_t ino, size_t blocksize, uint64_t idx);
    void HandleIoctl(fuse_req_t req, fuse_ino_t ino, int cmd, void* arg, struct fuse_file_info* fi, unsigned flags, const void* in_buf, size_t in_bufsz, size_t out_bufsz);
    void HandlePoll(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi, struct fuse_pollhandle* ph);

   // Handlers for operations without a specific high-level decomposition
   void HandleInit(fuse_req_t req, struct fuse_conn_info* conn);
   void HandleDestroy(fuse_req_t req);
   void HandleForget(fuse_req_t req, fuse_ino_t ino, uint64_t nlookup);
   void HandleForgetMulti(fuse_req_t req, size_t count, struct fuse_forget_data* forgets);
   void HandleReadBuf(fuse_req_t req,
                      fuse_ino_t ino,
                      size_t size,
                      off_t off,
                      struct fuse_file_info* fi,
                      struct fuse_bufvec** bufp);
   void HandleWriteBuf(fuse_req_t req,
                       fuse_ino_t ino,
                       struct fuse_bufvec* buf,
                       off_t off,
                       struct fuse_file_info* fi);
   void HandleSetxattr(fuse_req_t req,
                       fuse_ino_t ino,
                       const char* name,
                       const char* value,
                       size_t size,
                       int flags);
   void HandleGetxattr(fuse_req_t req, fuse_ino_t ino, const char* name, size_t size);
   void HandleListxattr(fuse_req_t req, fuse_ino_t ino, size_t size);
   void HandleRemovexattr(fuse_req_t req, fuse_ino_t ino, const char* name);

    // Static callbacks wired into fuse_lowlevel_ops
   static void LogMissingOperationHandlers();

   static void InitCallback(void* userdata, struct fuse_conn_info* conn);
   static void DestroyCallback(void* userdata);
   static void ForgetCallback(fuse_req_t req, fuse_ino_t ino, uint64_t nlookup);
   static void ForgetMultiCallback(fuse_req_t req, size_t count, struct fuse_forget_data* forgets);
    static void LookupCallback(fuse_req_t req, fuse_ino_t parent, const char* name);
    static void GetattrCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    static void SetattrCallback(fuse_req_t req, fuse_ino_t ino, struct stat* attr, int to_set,
                                struct fuse_file_info* fi);
    static void ReadlinkCallback(fuse_req_t req, fuse_ino_t ino);
    static void MknodCallback(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode, dev_t rdev);
    static void MkdirCallback(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode);
    static void SymlinkCallback(fuse_req_t req, const char* link, fuse_ino_t parent, const char* name);
    static void UnlinkCallback(fuse_req_t req, fuse_ino_t parent, const char* name);
    static void RmdirCallback(fuse_req_t req, fuse_ino_t parent, const char* name);
    static void RenameCallback(fuse_req_t req, fuse_ino_t parent, const char* name,
                               fuse_ino_t newparent, const char* newname, unsigned int flags);
    static void LinkCallback(fuse_req_t req, fuse_ino_t ino, fuse_ino_t newparent, const char* newname);
    static void OpenCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    static void ReadCallback(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off,
                             struct fuse_file_info* fi);
    static void WriteCallback(fuse_req_t req, fuse_ino_t ino, const char* buf, size_t size, off_t off,
                              struct fuse_file_info* fi);
   static void WriteBufCallback(fuse_req_t req,
                                fuse_ino_t ino,
                                struct fuse_bufvec* buf,
                                off_t off,
                                struct fuse_file_info* fi);
    static void FlushCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    static void ReleaseCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    static void FsyncCallback(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info* fi);
    static void OpendirCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    static void ReaddirCallback(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off,
                                struct fuse_file_info* fi);
    static void ReaddirplusCallback(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off,
                                    struct fuse_file_info* fi);
    static void ReleasedirCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi);
    static void FsyncdirCallback(fuse_req_t req, fuse_ino_t ino, int datasync, struct fuse_file_info* fi);
    static void StatfsCallback(fuse_req_t req, fuse_ino_t ino);
    static void AccessCallback(fuse_req_t req, fuse_ino_t ino, int mask);
    static void CreateCallback(fuse_req_t req, fuse_ino_t parent, const char* name, mode_t mode,
                               struct fuse_file_info* fi);
    static void CopyFileRangeCallback(fuse_req_t req, fuse_ino_t ino_in, off_t off_in,
                                      struct fuse_file_info* fi_in, fuse_ino_t ino_out,
                                      off_t off_out, struct fuse_file_info* fi_out,
                                      size_t len, int flags);

   static void SetxattrCallback(fuse_req_t req,
                                fuse_ino_t ino,
                                const char* name,
                                const char* value,
                                size_t size,
                                int flags);
   static void GetxattrCallback(fuse_req_t req, fuse_ino_t ino, const char* name, size_t size);
   static void ListxattrCallback(fuse_req_t req, fuse_ino_t ino, size_t size);
   static void RemovexattrCallback(fuse_req_t req, fuse_ino_t ino, const char* name);
   static void GetlkCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi, struct flock* lock);
   static void SetlkCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi, struct flock* lock, int sleep);
   static void BmapCallback(fuse_req_t req, fuse_ino_t ino, size_t blocksize, uint64_t idx);
   static void IoctlCallback(fuse_req_t req, fuse_ino_t ino, int cmd, void* arg, struct fuse_file_info* fi, unsigned flags, const void* in_buf, size_t in_bufsz, size_t out_bufsz);
   static void PollCallback(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info* fi, struct fuse_pollhandle* ph);
};

Napi::Value SetOperationHandler(const Napi::CallbackInfo& info);
Napi::Value RemoveOperationHandler(const Napi::CallbackInfo& info);

} // namespace fuse_native

#endif // FUSE_BRIDGE_H
