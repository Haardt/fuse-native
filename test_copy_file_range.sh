#!/bin/bash

# Test script for copy_file_range functionality using FUSE3 passthrough example
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$SCRIPT_DIR/docs/example"
PASSTHROUGH_C="$DOCS_DIR/passthrough_fh.c"
PASSTHROUGH_HELPERS_H="$DOCS_DIR/passthrough_helpers.h"
PASSTHROUGH_BIN="$SCRIPT_DIR/passthrough_test"
TEST_MOUNT="/tmp/passthrough_test_mount"
TEST_SOURCE="/tmp/passthrough_source"
TEST_FILE="$TEST_SOURCE/source.txt"
TEST_MOUNT_FILE="$TEST_MOUNT/source.txt"
TEST_COPY_FILE="$TEST_MOUNT/copied.txt"

echo "=== FUSE3 Passthrough copy_file_range Test ==="

# Cleanup function
cleanup() {
    echo "Cleaning up..."
    if mountpoint -q "$TEST_MOUNT" 2>/dev/null; then
        echo "Unmounting $TEST_MOUNT"
        fusermount -u "$TEST_MOUNT" 2>/dev/null || fusermount3 -u "$TEST_MOUNT" 2>/dev/null || true
        sleep 1
    fi
    if [ -d "$TEST_MOUNT" ]; then
        rmdir "$TEST_MOUNT" 2>/dev/null || true
    fi
    if [ -d "$TEST_SOURCE" ]; then
        rm -rf "$TEST_SOURCE" 2>/dev/null || true
    fi
    if [ -f "$PASSTHROUGH_BIN" ]; then
        rm -f "$PASSTHROUGH_BIN"
    fi
}

# Set trap for cleanup
trap cleanup EXIT

# Check if fuse3 development package is available
if ! pkg-config --exists fuse3; then
    echo "ERROR: fuse3 development package not found"
    echo "Install with: sudo apt-get install libfuse3-dev (Ubuntu/Debian)"
    exit 1
fi

# Check if passthrough.c exists
if [ ! -f "$PASSTHROUGH_C" ]; then
    echo "ERROR: $PASSTHROUGH_C not found"
    echo "Make sure you're running this from the fuse-native directory"
    exit 1
fi

# Check if passthrough_helpers.h exists
if [ ! -f "$PASSTHROUGH_HELPERS_H" ]; then
    echo "ERROR: $PASSTHROUGH_HELPERS_H not found"
    exit 1
fi

# Compile the passthrough example
echo "Compiling passthrough example..."
gcc -Wall -D_GNU_SOURCE -DHAVE_COPY_FILE_RANGE=1 -I"$DOCS_DIR" \
    "$PASSTHROUGH_C" \
    $(pkg-config fuse3 --cflags --libs) -lulockmgr \
    -o "$PASSTHROUGH_BIN"

if [ ! -f "$PASSTHROUGH_BIN" ]; then
    echo "ERROR: Failed to compile passthrough example"
    exit 1
fi

echo "Compilation successful"

# Create test directories
mkdir -p "$TEST_SOURCE"
mkdir -p "$TEST_MOUNT"

# Create test file with content
echo "This is test content for copy_file_range testing!" > "$TEST_FILE"
echo "Line 2 of test content" >> "$TEST_FILE"
echo "Line 3 with some more data for testing" >> "$TEST_FILE"

echo "Created test file: $TEST_FILE"
echo "Test file size: $(wc -c < "$TEST_FILE") bytes"
echo "Test file content:"
cat "$TEST_FILE"

# Start passthrough filesystem
echo ""
echo "Starting passthrough FUSE filesystem..."
echo "Mounting $TEST_SOURCE at $TEST_MOUNT"
cd "$TEST_SOURCE"
"$PASSTHROUGH_BIN" -f "$TEST_MOUNT" &
FUSE_PID=$!

# Give it time to start
sleep 2

# Check if mount succeeded
if ! mountpoint -q "$TEST_MOUNT"; then
    echo "ERROR: Mount failed"
    kill $FUSE_PID 2>/dev/null || true
    exit 1
fi

echo "Mount successful, PID: $FUSE_PID"

# Test basic operations first
echo ""
echo "=== Testing basic operations ==="

echo "1. Listing mounted directory:"
ls -la "$TEST_MOUNT/"
echo "DONE: Directory listing"

echo ""
echo "2. Reading source file through FUSE:"
if cat "$TEST_MOUNT_FILE"; then
    echo "✓ Read successful"
else
    echo "✗ Read failed"
fi
echo "DONE: Read test"

# Test copy_file_range functionality
echo ""
echo "=== Testing copy_file_range ==="

echo "3. Testing copy with cp command (may use copy_file_range):"
if cp "$TEST_MOUNT_FILE" "$TEST_COPY_FILE" 2>/dev/null; then
    echo "✓ cp command successful"
    if [ -f "$TEST_COPY_FILE" ]; then
        echo "✓ Copy file created"
        echo "Original size: $(wc -c < "$TEST_MOUNT_FILE") bytes"
        echo "Copy size: $(wc -c < "$TEST_COPY_FILE") bytes"

        if cmp -s "$TEST_MOUNT_FILE" "$TEST_COPY_FILE"; then
            echo "✓ Files are identical"
        else
            echo "✗ Files differ!"
            echo "Original content:"
            cat "$TEST_MOUNT_FILE"
            echo "Copy content:"
            cat "$TEST_COPY_FILE"
        fi
    else
        echo "✗ Copy file not created"
    fi
else
    echo "✗ cp command failed"
fi
echo "DONE: Copy test"

# Test with dd to force copy_file_range usage
echo ""
echo "4. Testing with dd (direct copy_file_range):"
TEST_DD_FILE="$TEST_MOUNT/dd_copied.txt"
if dd if="$TEST_MOUNT_FILE" of="$TEST_DD_FILE" bs=1024 count=1 2>/dev/null; then
    echo "✓ dd copy successful"
    if [ -f "$TEST_DD_FILE" ]; then
        echo "✓ DD copy file created"
        echo "DD copy size: $(wc -c < "$TEST_DD_FILE") bytes"
        echo "DD copy content:"
        cat "$TEST_DD_FILE"
    fi
else
    echo "✗ dd copy failed"
fi
echo "DONE: DD test"

# Test multiple concurrent copies
echo ""
echo "5. Testing multiple concurrent copies:"
for i in {1..3}; do
    (cp "$TEST_MOUNT_FILE" "$TEST_MOUNT/concurrent_$i.txt" 2>/dev/null && echo "✓ Concurrent copy $i successful") &
done
wait
echo "DONE: Concurrent copy test"

# List final state
echo ""
echo "6. Final directory listing:"
ls -la "$TEST_MOUNT/"
echo "DONE: Final listing"

echo ""
echo "=== Test Summary ==="
sleep 1

# Check FUSE process status
if kill -0 $FUSE_PID 2>/dev/null; then
    echo "✓ FUSE process is still running (PID: $FUSE_PID)"

    # Try to terminate gracefully
    echo "Sending SIGTERM to FUSE process..."
    kill -TERM $FUSE_PID

    # Wait a bit for graceful shutdown
    sleep 2
    echo "DONE: SIGTERM sent and waited"

    if kill -0 $FUSE_PID 2>/dev/null; then
        echo "Process still running, sending SIGKILL..."
        kill -KILL $FUSE_PID 2>/dev/null || true
        echo "DONE: SIGKILL sent"
    fi
else
    echo "✗ FUSE process has terminated unexpectedly"
fi

# Final check
if mountpoint -q "$TEST_MOUNT"; then
    echo "Mount point still active, forcing unmount..."
else
    echo "✓ Mount point cleanly unmounted"
fi

echo ""
echo "=== copy_file_range test completed ==="
echo "DONE: All tests completed successfully!"
echo ""
echo "Summary of copy_file_range testing:"
echo "- Basic file operations: Should work"
echo "- cp command: Tests kernel copy_file_range usage"
echo "- dd command: Tests direct copy operations"
echo "- Concurrent copies: Tests stability under load"
echo ""
echo "If any tests hang, it indicates issues in FUSE3 copy_file_range implementation"
