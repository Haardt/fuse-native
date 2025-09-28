#include "logging.h"

#if FUSE_LOG_ENABLED

#include <algorithm>
#include <chrono>
#include <cctype>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <mutex>
#include <string>

namespace fuse_native {
namespace log {

std::atomic<int> g_runtime_level{FUSE_LOG_DEFAULT_LEVEL};

namespace {

std::once_flag g_init_once;
std::mutex g_log_mutex;

int parse_level(const char* input) {
  if (!input || !*input) {
    return FUSE_LOG_DEFAULT_LEVEL;
  }

  std::string value(input);
  auto trim = [](std::string& s) {
    auto not_space = [](unsigned char ch) { return !std::isspace(static_cast<int>(ch)); };
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), not_space));
    s.erase(std::find_if(s.rbegin(), s.rend(), not_space).base(), s.end());
  };
  trim(value);
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
    return static_cast<char>(std::toupper(static_cast<int>(c)));
  });

  if (value == "OFF")   return FUSE_LOG_LEVEL_OFF;
  if (value == "ERROR") return FUSE_LOG_LEVEL_ERROR;
  if (value == "WARN" || value == "WARNING") return FUSE_LOG_LEVEL_WARN;
  if (value == "INFO")  return FUSE_LOG_LEVEL_INFO;
  if (value == "DEBUG") return FUSE_LOG_LEVEL_DEBUG;
  if (value == "TRACE") return FUSE_LOG_LEVEL_TRACE;
  return FUSE_LOG_DEFAULT_LEVEL;
}

const char* level_name(int level) {
  switch (level) {
    case FUSE_LOG_LEVEL_ERROR: return "ERROR";
    case FUSE_LOG_LEVEL_WARN:  return "WARN";
    case FUSE_LOG_LEVEL_INFO:  return "INFO";
    case FUSE_LOG_LEVEL_DEBUG: return "DEBUG";
    case FUSE_LOG_LEVEL_TRACE: return "TRACE";
    default: return "OFF";
  }
}

void format_timestamp(char* buffer, size_t buffer_size) {
  using namespace std::chrono;
  const auto now = system_clock::now();
  const auto millis = duration_cast<milliseconds>(now.time_since_epoch()) % milliseconds(1000);
  const std::time_t time_now = system_clock::to_time_t(now);
  std::tm tm_result;
#if defined(_WIN32)
  gmtime_s(&tm_result, &time_now);
#else
  gmtime_r(&time_now, &tm_result);
#endif
  std::snprintf(buffer,
                buffer_size,
                "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
                tm_result.tm_year + 1900,
                tm_result.tm_mon + 1,
                tm_result.tm_mday,
                tm_result.tm_hour,
                tm_result.tm_min,
                tm_result.tm_sec,
                static_cast<int>(millis.count()));
}

}  // namespace

void init_from_env_once() {
  std::call_once(g_init_once, [] {
    const char* env = std::getenv("FUSE_LOG");
    g_runtime_level.store(parse_level(env), std::memory_order_relaxed);
  });
}

void log_line(int level, const char* file, int line, const char* function, const char* fmt, ...) {
  init_from_env_once();
  if (!should_log(level)) {
    return;
  }

  char timestamp[64];
  format_timestamp(timestamp, sizeof(timestamp));

  char message[1024];
  va_list args;
  va_start(args, fmt);
  std::vsnprintf(message, sizeof(message), fmt, args);
  va_end(args);

  const char* safe_file = file ? file : "?";
  const char* safe_function = (function && *function) ? function : nullptr;

  std::lock_guard<std::mutex> lock(g_log_mutex);
  std::fprintf(stderr,
               "%s [%s] (%s) %s:%d %s%s%s\n",
               timestamp,
               level_name(level),
               FUSE_LOG_TAG,
               safe_file,
               line,
               safe_function ? safe_function : "",
               safe_function ? " - " : "",
               message);
  std::fflush(stderr);
}

}  // namespace log
}  // namespace fuse_native

#endif  // FUSE_LOG_ENABLED
