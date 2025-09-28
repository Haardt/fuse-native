#include "logging.h"

#include <cstdlib>

int main() {
#if FUSE_LOG_ENABLED
  // Force verbose logging for the sample so every level is emitted.
  #if defined(_WIN32)
  _putenv_s("FUSE_LOG", "TRACE");
  #else
  setenv("FUSE_LOG", "TRACE", 1);
  #endif

  FUSE_LOG_ERROR("sample error %d", 1);
  FUSE_LOG_WARN("sample warning");
  FUSE_LOG_INFO("sample info");
  FUSE_LOG_DEBUG("sample debug %s", "details");
  FUSE_LOG_TRACE("sample trace value=%d", 42);
#else
  (void)0;  // logging disabled at compile time
#endif
  return 0;
}
