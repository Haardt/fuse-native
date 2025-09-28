cmake_minimum_required(VERSION 3.18)

# Project configuration
project(fuse-native)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(PkgConfig REQUIRED)

# Check for FUSE3
pkg_check_modules(FUSE3 REQUIRED fuse3)

# Include Node-API headers - use cmake-js provided variables
include_directories(${CMAKE_JS_INC})

# Try to get node-addon-api include directory
execute_process(
    COMMAND node -p "require('node-addon-api').include"
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    OUTPUT_VARIABLE NODE_ADDON_API_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
)

# If we got a result, include it
if(NODE_ADDON_API_DIR)
    # Remove quotes if present
    string(REPLACE "\"" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")
    include_directories(${NODE_ADDON_API_DIR})
else()
    # Fallback to local node_modules
    include_directories("${CMAKE_SOURCE_DIR}/node_modules/node-addon-api")
endif()

# FUSE3 setup
include_directories(${FUSE3_INCLUDE_DIRS})
link_directories(${FUSE3_LIBRARY_DIRS})
add_compile_options(${FUSE3_CFLAGS_OTHER})

# Compiler flags
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fexceptions")
set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} -g -O0 -DDEBUG")
set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -O3 -DNDEBUG")

# Add debug symbols and sanitizers for debug builds
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=address,undefined -fno-omit-frame-pointer -g")
    set(CMAKE_LINKER_FLAGS "${CMAKE_LINKER_FLAGS} -fsanitize=address,undefined")
    add_definitions(-DNAPI_FATAL_ERRORS=1)
    # Ensure ASan runtime is available at runtime
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fsanitize=address,undefined")
endif()

# Source files
set(SOURCE_FILES
    src/main.cc
    src/fuse_bridge.cc
    src/napi_helpers.cc
    src/napi_bigint.cc
    src/timespec_codec.cc
    src/errno_mapping.cc
    src/logging.cc
    src/session_manager.cc
    src/buffer_bridge.cc
    src/copy_file_range.cc
    src/tsfn_dispatcher.cc
    src/write_queue.cc
    src/shutdown.cc
    src/xattr_bridge.cc
    src/init_bridge.cc
)

# Create the addon
add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES})

# Set target properties
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")

# Link libraries
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB} ${FUSE3_LIBRARIES})

# Platform-specific settings
if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
    execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()

# Definitions
add_definitions(-DNODE_ADDON_API_DISABLE_DEPRECATED)
add_definitions(-DNAPI_VERSION=8)
add_definitions(-DFUSE_USE_VERSION=31)

# Additional compiler warnings
if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    target_compile_options(${PROJECT_NAME} PRIVATE
        -Wall
        -Wextra
        -Wno-unused-parameter
        -Wno-missing-field-initializers
    )
endif()
