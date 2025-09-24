#!/bin/bash

set -e

echo "🚀 FUSE In-Memory Filesystem Starter"
echo "===================================="
echo ""

# Configuration - can be overridden by environment variables or command line
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOUNT_POINT="${MOUNT_POINT:-/tmp/inmemory-fs-test}"
LOG_LEVEL="${LOG_LEVEL:-info}"
DEBUG="${DEBUG:-false}"
FOREGROUND="${FOREGROUND:-false}"
AUTO_UNMOUNT="${AUTO_UNMOUNT:-true}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_info() {
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

print_header() {
    echo -e "${PURPLE}$1${NC}"
}

print_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# Cleanup function
cleanup() {
    print_info "Cleaning up..."

    # Try to unmount if mounted
    if mountpoint -q "$MOUNT_POINT" 2>/dev/null; then
        print_info "Unmounting FUSE filesystem..."
        fusermount -u "$MOUNT_POINT" 2>/dev/null || umount "$MOUNT_POINT" 2>/dev/null || true
    fi

    # Remove mount point if it exists
    if [ -d "$MOUNT_POINT" ]; then
        rmdir "$MOUNT_POINT" 2>/dev/null || true
    fi

    print_success "Cleanup completed"
}

# Set up trap for cleanup on exit
trap cleanup EXIT INT TERM

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --mount-point|-m)
            MOUNT_POINT="$2"
            shift 2
            ;;
        --log-level|-l)
            LOG_LEVEL="$2"
            shift 2
            ;;
        --debug)
            DEBUG="true"
            shift
            ;;
        --foreground|-f)
            FOREGROUND="true"
            shift
            ;;
        --no-auto-unmount)
            AUTO_UNMOUNT="false"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Start the FUSE In-Memory Filesystem example"
            echo ""
            echo "Options:"
            echo "  -m, --mount-point PATH    Mount point (default: /tmp/inmemory-fs-test)"
            echo "  -l, --log-level LEVEL     Log level: error, warn, info, debug (default: info)"
            echo "  --debug                   Enable debug mode"
            echo "  -f, --foreground          Run in foreground"
            echo "  --no-auto-unmount         Disable automatic unmounting"
            echo "  -h, --help                Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  MOUNT_POINT               Mount point path"
            echo "  LOG_LEVEL                 Log level"
            echo "  DEBUG                     Enable debug (true/false)"
            echo "  FOREGROUND                Run in foreground (true/false)"
            echo "  AUTO_UNMOUNT              Auto unmount on exit (true/false)"
            echo ""
            echo "Examples:"
            echo "  $0 --mount-point /tmp/my-fs --debug"
            echo "  $0 -m /mnt/inmemory -f"
            echo "  DEBUG=true $0"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            print_error "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Prerequisites check
print_header "Checking Prerequisites"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed or not in PATH"
    exit 1
fi

print_success "✓ Node.js found: $(node --version)"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed or not in PATH"
    exit 1
fi

print_success "✓ npm found: $(npm --version)"

# Check if FUSE is available
if ! command -v fusermount &> /dev/null && ! command -v umount &> /dev/null; then
    print_error "FUSE tools (fusermount) are not available"
    print_error "Install FUSE: sudo apt-get install fuse (Ubuntu/Debian) or brew install --cask osxfuse (macOS)"
    exit 1
fi

print_success "✓ FUSE tools available"

# Check if the in-memory filesystem script exists
if [ ! -f "$SCRIPT_DIR/inmemory-fs.mjs" ]; then
    print_error "In-memory filesystem script not found: $SCRIPT_DIR/inmemory-fs.mjs"
    exit 1
fi

print_success "✓ In-memory filesystem script found"

# Always build TS to ensure dist/ matches latest sources (ESM loader fix)
print_info "Building TypeScript (ensuring dist is up-to-date)..."
if ! npm run build:ts; then
    print_error "Failed to build TypeScript"
    print_error "Run: npm run build:ts"
    exit 1
fi
print_success "✓ TypeScript build up-to-date"

# Check if native module is built (Release or Debug, fuse-native.node)
HAS_NATIVE="false"
if [ -f "build/Release/fuse-native.node" ] || [ -f "build/Debug/fuse-native.node" ]; then
    HAS_NATIVE="true"
fi

if [ "$HAS_NATIVE" != "true" ]; then
    print_warning "Native module not built. Building native addon..."
    # Prefer building only the native addon here
    if ! npm run build:native; then
        print_error "Failed to build native module"
        print_error "Try: npm run build:native"
        exit 1
    fi

    if [ ! -f "build/Release/fuse-native.node" ] && [ ! -f "build/Debug/fuse-native.node" ]; then
        print_error "Native module still not found after build"
        print_error "Expected: build/Release/fuse-native.node or build/Debug/fuse-native.node"
        exit 1
    fi
fi

print_success "✓ Native module built (fuse-native.node)"

# Setup
print_header "Setting up Filesystem"

# Clean up any existing mount
cleanup

# Create mount point
mkdir -p "$MOUNT_POINT"
print_success "✓ Mount point created: $MOUNT_POINT"

# Configuration summary
print_header "Configuration"
echo "Mount Point: $MOUNT_POINT"
echo "Log Level: $LOG_LEVEL"
echo "Debug Mode: $DEBUG"
echo "Foreground: $FOREGROUND"
echo "Auto Unmount: $AUTO_UNMOUNT"
echo ""

# Start the filesystem
print_header "Starting In-Memory Filesystem"

if [ "$FOREGROUND" = "true" ]; then
    print_info "Running in foreground mode..."
    print_info "Press Ctrl+C to stop and unmount"
    echo ""

    # Run in foreground
    exec node "$SCRIPT_DIR/inmemory-fs.mjs" "$MOUNT_POINT"
else
    print_info "Starting filesystem in background..."
    print_info "PID will be displayed below"
    echo ""

    # Start in background
    node "$SCRIPT_DIR/inmemory-fs.mjs" "$MOUNT_POINT" &
    FS_PID=$!

    # Give it time to start
    sleep 2

    # Check if it's still running
    if kill -0 $FS_PID 2>/dev/null; then
        print_success "✓ Filesystem started successfully (PID: $FS_PID)"

        # Show mount status
        if mountpoint -q "$MOUNT_POINT" 2>/dev/null; then
            print_success "✓ Filesystem mounted at: $MOUNT_POINT"
        else
            print_warning "! Filesystem may not be fully mounted yet"
        fi

        echo ""
        print_header "Filesystem Ready"
        echo "The in-memory filesystem is now running!"
        echo ""
        echo "Mount point: $MOUNT_POINT"
        echo "Process ID: $FS_PID"
        echo ""
        echo "Try these commands:"
        echo "  ls -la \"$MOUNT_POINT\""
        echo "  echo 'test' > \"$MOUNT_POINT\"/test.txt"
        echo "  mkdir \"$MOUNT_POINT\"/testdir"
        echo "  cat \"$MOUNT_POINT\"/testdir/test.txt"
        echo ""
        echo "Stop with: kill $FS_PID"
        echo "Or unmount with: fusermount -u \"$MOUNT_POINT\""
        echo ""

        # Wait for the process
        wait $FS_PID
    else
        print_error "Filesystem failed to start"
        exit 1
    fi
fi