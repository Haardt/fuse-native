#!/bin/bash

set -e

echo "🚀 FUSE Proxy Test Script"
echo "=========================="
echo ""

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_MOUNT="$HOME/fuse-test/fuse-proxy-test"
TARGET_DIR="$HOME/fuse-test/fuse-target-test"
PROXY_SCRIPT="$SCRIPT_DIR/fuse-proxy-quiet.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Cleanup function
cleanup() {
    print_status "Cleaning up..."

    # Try to unmount if mounted
    if mountpoint -q "$PROXY_MOUNT" 2>/dev/null; then
        print_status "Unmounting FUSE filesystem..."
        fusermount -u "$PROXY_MOUNT" 2>/dev/null || umount "$PROXY_MOUNT" 2>/dev/null || true
    fi

    # Remove directories if they exist
    if [ -d "$PROXY_MOUNT" ]; then
        rmdir "$PROXY_MOUNT" 2>/dev/null || true
    fi

    if [ -d "$TARGET_DIR" ]; then
        print_status "Removing target directory..."
        rm -rf "$TARGET_DIR"
    fi

    print_success "Cleanup completed"
}

# Set up trap for cleanup on exit
trap cleanup EXIT INT TERM

# Check prerequisites
print_status "Checking prerequisites..."

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed or not in PATH"
    exit 1
fi

# Check if npm/npx is available
if ! command -v npx &> /dev/null; then
    print_error "npx is not installed or not in PATH"
    exit 1
fi

# Check if FUSE is available
if ! command -v fusermount &> /dev/null && ! command -v umount &> /dev/null; then
    print_error "FUSE tools (fusermount) are not available"
    print_error "Install FUSE: sudo apt-get install fuse (Ubuntu/Debian) or brew install --cask osxfuse (macOS)"
    exit 1
fi

# Check if fuse-native module is built
if [ ! -f "$SCRIPT_DIR/../build/Release/fuse.node" ]; then
    print_error "FUSE native module not built"
    print_error "Run: cd $SCRIPT_DIR/.. && npm install"
    exit 1
fi

print_success "All prerequisites met"

# Clean up any existing test directories
cleanup

# Create directories
print_status "Setting up test environment..."
mkdir -p "$HOME/fuse-test"
mkdir -p "$TARGET_DIR"
mkdir -p "$PROXY_MOUNT"

print_status "Target directory: $TARGET_DIR"
print_status "Mount point: $PROXY_MOUNT"

# Check if proxy script exists
if [ ! -f "$PROXY_SCRIPT" ]; then
    print_error "FUSE proxy script not found: $PROXY_SCRIPT"
    exit 1
fi

print_success "Environment setup complete"

# Test basic file operations first
print_status "Testing basic FUSE proxy operations..."

# Start the proxy in the background
print_status "Starting FUSE proxy..."
node "$PROXY_SCRIPT" "$PROXY_MOUNT" "$TARGET_DIR" &
PROXY_PID=$!

# Give the proxy time to start
sleep 3

# Check if proxy is running
if ! kill -0 $PROXY_PID 2>/dev/null; then
    print_error "FUSE proxy failed to start"
    exit 1
fi

# Check if mount point is working
if ! mountpoint -q "$PROXY_MOUNT" 2>/dev/null; then
    print_error "FUSE filesystem not mounted"
    kill $PROXY_PID 2>/dev/null || true
    exit 1
fi

print_success "FUSE proxy started successfully (PID: $PROXY_PID)"

# Test basic operations
print_status "Testing basic file operations..."

# Test directory listing
if ls "$PROXY_MOUNT" > /dev/null 2>&1; then
    print_success "✓ Directory listing works"
else
    print_error "✗ Directory listing failed"
    kill $PROXY_PID 2>/dev/null || true
    exit 1
fi

# Test file creation
TEST_FILE="$PROXY_MOUNT/test.txt"
if echo "Hello FUSE!" > "$TEST_FILE" 2>/dev/null; then
    print_success "✓ File creation works"
else
    print_error "✗ File creation failed"
    kill $PROXY_PID 2>/dev/null || true
    exit 1
fi

# Test file reading
if [ "$(cat "$TEST_FILE" 2>/dev/null)" = "Hello FUSE!" ]; then
    print_success "✓ File reading works"
else
    print_error "✗ File reading failed"
    kill $PROXY_PID 2>/dev/null || true
    exit 1
fi

# Test directory creation
TEST_DIR="$PROXY_MOUNT/testdir"
if mkdir "$TEST_DIR" 2>/dev/null; then
    print_success "✓ Directory creation works"
else
    print_error "✗ Directory creation failed"
    kill $PROXY_PID 2>/dev/null || true
    exit 1
fi

# Verify files exist in target directory
if [ -f "$TARGET_DIR/test.txt" ] && [ -d "$TARGET_DIR/testdir" ]; then
    print_success "✓ Files correctly created in target directory"
else
    print_error "✗ Files not found in target directory"
    kill $PROXY_PID 2>/dev/null || true
    exit 1
fi

print_success "Basic file operations test completed successfully"

# Now wait for the create-react-app test to complete
print_status "FUSE proxy is running and ready for create-react-app test..."
print_status "The proxy will automatically start the create-react-app test"
print_status "This may take several minutes..."

echo ""
echo "📊 Monitoring FUSE operations:"
echo "   - All file system calls will be logged"
echo "   - Operations are forwarded to: $TARGET_DIR"
echo "   - Access files through: $PROXY_MOUNT"
echo ""
echo "🎯 The test will verify that create-react-app can:"
echo "   • Create directories and files"
echo "   • Install npm packages"
echo "   • Handle all required file operations"
echo "   • Complete successfully through the FUSE proxy"
echo ""

# Wait for the proxy process
wait $PROXY_PID

print_success "FUSE proxy test completed"
echo ""
echo "🎉 If you see this message, the FUSE proxy handled all operations correctly!"
echo "   The create-react-app test has completed through the FUSE filesystem."
echo ""
