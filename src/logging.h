#pragma once

#include <atomic>

#ifndef FUSE_LOG_ENABLED
#define FUSE_LOG_ENABLED 1
#endif

enum FuseLogLevel {
  FUSE_LOG_LEVEL_OFF = 0,
  FUSE_LOG_LEVEL_ERROR = 1,
  FUSE_LOG_LEVEL_WARN = 2,
  FUSE_LOG_LEVEL_INFO = 3,
  FUSE_LOG_LEVEL_DEBUG = 4,
  FUSE_LOG_LEVEL_TRACE = 5,
};

#ifndef FUSE_LOG_DEFAULT_LEVEL
#define FUSE_LOG_DEFAULT_LEVEL FUSE_LOG_LEVEL_INFO
#endif

#ifndef FUSE_LOG_TAG
#define FUSE_LOG_TAG "fuse-native"
#endif

namespace fuse_native {
namespace log {

#if FUSE_LOG_ENABLED

extern std::atomic<int> g_runtime_level;

inline bool should_log(int level) {
  constexpr int kMinCompiledLevel = FUSE_LOG_DEFAULT_LEVEL;
  if (level <= FUSE_LOG_LEVEL_OFF) {
    return false;
  }
  if (level > FUSE_LOG_LEVEL_TRACE) {
    return false;
  }
  if (level < kMinCompiledLevel) {
    return false;
  }
  int runtime_level = g_runtime_level.load(std::memory_order_relaxed);
  if (runtime_level == FUSE_LOG_LEVEL_OFF) {
    return false;
  }
  return level <= runtime_level;
}

void init_from_env_once();

#if defined(__GNUC__) || defined(__clang__)
__attribute__((format(printf, 5, 6)))
#endif
void log_line(int level, const char* file, int line, const char* function, const char* fmt, ...);

#else  // FUSE_LOG_ENABLED == 0

inline bool should_log(int) {
  return false;
}

inline void init_from_env_once() {}

inline void log_line(int, const char*, int, const char*, const char*, ...) {}

#endif  // FUSE_LOG_ENABLED

}  // namespace log
}  // namespace fuse_native

#if FUSE_LOG_ENABLED
#define FUSE_LOG_LEVEL_ENABLED(level) (fuse_native::log::should_log(level))

#define FUSE_LOG_IMPL(level, fmt, ...)                                                        \
  do {                                                                                         \
    if (FUSE_LOG_LEVEL_ENABLED(level)) {                                                      \
      fuse_native::log::log_line((level), __FILE__, __LINE__, __func__, (fmt), ##__VA_ARGS__); \
    }                                                                                          \
  } while (0)

#define FUSE_LOG(level, fmt, ...) FUSE_LOG_IMPL((level), (fmt), ##__VA_ARGS__)

#if FUSE_LOG_DEFAULT_LEVEL >= FUSE_LOG_LEVEL_ERROR
#define FUSE_LOG_ERROR(fmt, ...) FUSE_LOG_IMPL(FUSE_LOG_LEVEL_ERROR, fmt, ##__VA_ARGS__)
#else
#define FUSE_LOG_ERROR(fmt, ...) do { (void)sizeof(fmt); } while (0)
#endif

#if FUSE_LOG_DEFAULT_LEVEL >= FUSE_LOG_LEVEL_WARN
#define FUSE_LOG_WARN(fmt, ...) FUSE_LOG_IMPL(FUSE_LOG_LEVEL_WARN, fmt, ##__VA_ARGS__)
#else
#define FUSE_LOG_WARN(fmt, ...) do { (void)sizeof(fmt); } while (0)
#endif

#if FUSE_LOG_DEFAULT_LEVEL >= FUSE_LOG_LEVEL_INFO
#define FUSE_LOG_INFO(fmt, ...) FUSE_LOG_IMPL(FUSE_LOG_LEVEL_INFO, fmt, ##__VA_ARGS__)
#else
#define FUSE_LOG_INFO(fmt, ...) do { (void)sizeof(fmt); } while (0)
#endif

#if FUSE_LOG_DEFAULT_LEVEL >= FUSE_LOG_LEVEL_DEBUG
#define FUSE_LOG_DEBUG(fmt, ...) FUSE_LOG_IMPL(FUSE_LOG_LEVEL_DEBUG, fmt, ##__VA_ARGS__)
#else
#define FUSE_LOG_DEBUG(fmt, ...) do { (void)sizeof(fmt); } while (0)
#endif

#if FUSE_LOG_DEFAULT_LEVEL >= FUSE_LOG_LEVEL_TRACE
#define FUSE_LOG_TRACE(fmt, ...) FUSE_LOG_IMPL(FUSE_LOG_LEVEL_TRACE, fmt, ##__VA_ARGS__)
#else
#define FUSE_LOG_TRACE(fmt, ...) do { (void)sizeof(fmt); } while (0)
#endif

#else  // FUSE_LOG_ENABLED == 0

#define FUSE_LOG(level, fmt, ...) do { (void)sizeof(level); } while (0)
#define FUSE_LOG_ERROR(fmt, ...)  do { (void)sizeof(fmt); } while (0)
#define FUSE_LOG_WARN(fmt, ...)   do { (void)sizeof(fmt); } while (0)
#define FUSE_LOG_INFO(fmt, ...)   do { (void)sizeof(fmt); } while (0)
#define FUSE_LOG_DEBUG(fmt, ...)  do { (void)sizeof(fmt); } while (0)
#define FUSE_LOG_TRACE(fmt, ...)  do { (void)sizeof(fmt); } while (0)

#endif  // FUSE_LOG_ENABLED
