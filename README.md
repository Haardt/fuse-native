# fuse-native

FUSE bindings for Node JS.

This is a fork of https://www.npmjs.com/package/fuse-native that does
NOT ship libfuse, and instead depends on it being installed on the user's
computer. It also only supports Linux.

URL: https://github.com/sagemathinc/fuse-native

Upstream: [https://github.com/fuse\-friends/fuse\-native](https://github.com/fuse-friends/fuse-native), but upstream is [no longer maintained](https://github.com/fuse-friends/fuse-native/issues/36).  However, [this fork](https://github.com/zkochan/fuse-native) might be the most maintained?

### TESTING

This project includes a comprehensive testing framework with an in-memory FUSE filesystem for testing all FUSE operations.

#### Running Tests

```sh
# Run all tests
pnpm test

# Run only FUSE operations tests
pnpm test:fuse

# Run with verbose output
pnpm test:verbose

# Run the in-memory filesystem example
pnpm example:memory-fs
```

#### Test Framework

The test suite includes:

- **96 comprehensive tests** covering all FUSE operations
- **In-memory filesystem** (`test/memory-fs.js`) - Complete FUSE implementation in memory
- **Operation tests** (`test/fuse-operations.test.js`) - Tests for all 40+ FUSE operations
- **Integration tests** - End-to-end filesystem scenarios
- **Example usage** (`test/example-usage.js`) - Mountable in-memory filesystem demo

#### Tested FUSE Operations

All major FUSE operations are tested with positive and negative test cases:

**Core Operations:** `init`, `error`, `access`, `statfs`
**File Metadata:** `getattr`, `fgetattr`, `utimens`, `chmod`, `chown`  
**File I/O:** `open`, `create`, `read`, `write`, `release`, `flush`, `fsync`, `truncate`, `ftruncate`
**Directory Operations:** `opendir`, `readdir`, `releasedir`, `fsyncdir`, `mkdir`, `rmdir`
**File Management:** `unlink`, `rename`, `link`, `symlink`, `readlink`, `mknod`
**Extended Attributes:** `setxattr`, `getxattr`, `listxattr`, `removexattr`
**Advanced Operations:** `lock`, `bmap`, `ioctl`, `poll`, `write_buf`, `read_buf`, `flock`, `fallocate`, `lseek`, `copy_file_range`

#### Callback Conventions

The tests follow strict callback conventions based on AGENTS.md:
- **Success**: `cb(0)` or `cb(0, result)` 
- **File operations**: `create` returns `cb(0, fd)`, `read`/`write` return `cb(bytesTransferred)`
- **Errors**: `cb(negativeNumber)` using standard errno codes

#### Example: Testing Your FUSE Implementation

```js
const MemoryFileSystem = require('./test/memory-fs');
const fs = new MemoryFileSystem();

// Test file creation
fs.create('/test.txt', 0o644, (err, fd) => {
  console.log('File created with FD:', fd);
  
  // Test writing
  const data = Buffer.from('Hello World');
  fs.write(fd, data, data.length, 0, (bytesWritten) => {
    console.log('Bytes written:', bytesWritten);
  });
});
```

#### Testing Results

- On ARM64 linux, at least, 3 of the tests fail.
- On x86\-64 linux, all the tests pass

### Other Notes

- Upstream seems dead \-\- [https://github.com/fuse\-friends/fuse\-native/issues/36](https://github.com/fuse-friends/fuse-native/issues/36) 
- On ARM64 linux upstream doesn't install, due to the shared library binary that they ship, which is wrong.  That's the reason I removed all use of shipping shared libraries in an npm module, which is really the wrong way to do things, obviously.
- I added the `nonEmpty` option, which wasn't in upstream.

## API

In order to create a FUSE mountpoint, you first need to create a `Fuse` object that wraps a set of implemented FUSE syscall handlers:

```js
const fuse = new Fuse(mnt, handlers, opts = {})
```

Create a new `Fuse` object.

`mnt` is the string path of your desired mountpoint.

`handlers` is an object mapping syscall names to implementations. The complete list of available syscalls is described below. As an example, if you wanted to implement a filesystem that only supports `getattr`, your handle object would look like:

```js
{
  getattr: function (path, cb) {
    if (path === '/') {
        cb(0, stat({ mode: 'dir', size: 4096 }));
        return;
    }
    if (path === '/test') {
        cb(0, stat({ mode: 'file', size: 11 }));
        return;
    }
    cb(Fuse.ENOENT);
  }
}
```

`opts` can be include:

```js
  displayFolder: 'Folder Name', // Add a name/icon to the mount volume on OSX,
  debug: false,  // Enable detailed tracing of operations.
  force: false,  // Attempt to unmount a the mountpoint before remounting.
  mkdir: false   // Create the mountpoint before mounting.
```

I'm making extensive use of these bindings in [WebSocketFS](https://github.com/sagemathinc/websocketfs/blob/main/lib/fuse/sftp-fuse.ts), which is _**like sshfs, but over a WebSocket and implemented in Typescript.**_ Look at code here: https://github.com/sagemathinc/websocketfs/tree/main/lib/fuse 

### FUSE API

Most of the [FUSE api](http://fuse.sourceforge.net/doxygen/structfuse__operations.html) is supported. In general the callback for each op should be called with `cb(returnCode, [value])` where the return code is a number (`0` for OK and `< 0` for errors). See below for a list of POSIX error codes.

Typescript: see [index.d.ts](./index.d.ts).

#### `ops.init(cb)`

Called on filesystem init.

#### `ops.access(path, mode, cb)`

Called before the filesystem accessed a file

#### `ops.statfs(path, cb)`

Called when the filesystem is being stat'ed. Accepts a fs stat object after the return code in the callback.

``` js
ops.statfs = function (path, cb) {
  cb(0, {
    bsize: 1000000,
    frsize: 1000000,
    blocks: 1000000,
    bfree: 1000000,
    bavail: 1000000,
    files: 1000000,
    ffree: 1000000,
    favail: 1000000,
    fsid: 1000000,
    flag: 1000000,
    namemax: 1000000
  })
}
```

#### `ops.getattr(path, cb)`

Called when a path is being stat'ed. Accepts a stat object (similar to the one returned in `fs.stat(path, cb)`) after the return code in the callback.

``` js
ops.getattr = function (path, cb) {
  cb(0, {
    mtime: new Date(),
    atime: new Date(),
    ctime: new Date(),
    size: 100,
    mode: 16877,
    uid: process.getuid(),
    gid: process.getgid()
  })
}
```

#### `ops.fgetattr(path, fd, cb)`

Same as above but is called when someone stats a file descriptor

#### `ops.flush(path, fd, cb)`

Called when a file descriptor is being flushed

#### `ops.fsync(path, datasync, fd, cb)`

Called when a file descriptor is being fsync'ed.

#### `ops.fsyncdir(path, datasync, fd, cb)`

Same as above but on a directory

#### `ops.readdir(path, cb)`

Called when a directory is being listed. Accepts an array of file/directory names after the return code in the callback

``` js
ops.readdir = function (path, cb) {
  cb(0, ['file-1.txt', 'dir'])
}
```

#### `ops.truncate(path, size, cb)`

Called when a path is being truncated to a specific size

#### `ops.ftruncate(path, fd, size, cb)`

Same as above but on a file descriptor

#### `ops.readlink(path, cb)`

Called when a symlink is being resolved. Accepts a pathname (that the link should resolve to) after the return code in the callback

``` js
ops.readlink = function (path, cb) {
  cb(null, 'file.txt') // make link point to file.txt
}
```

#### `ops.chown(path, uid, gid, cb)`

Called when ownership of a path is being changed

#### `ops.chmod(path:string, mode:number, cb)`

Called when the mode of a path is being changed.  Always called
with mode a number (not a string).

#### `ops.mknod(path, mode, dev, cb)`

Called when a new device file is being made.

#### `ops.setxattr(path, name, value, position, flags, cb)`

Called when extended attributes is being set (see the extended docs for your platform).

Copy the `value` buffer somewhere to store it.

The position argument is mostly a legacy argument only used on MacOS but see the getxattr docs
on Mac for more on that (you probably don't need to use that).

#### `ops.getxattr(path, name, position, cb)`

Called when extended attributes is being read.

Return the extended attribute as the second argument to the callback (needs to be a buffer).
If no attribute is stored return `null` as the second argument.

The position argument is mostly a legacy argument only used on MacOS but see the getxattr docs
on Mac for more on that (you probably don't need to use that).

#### `ops.listxattr(path, cb)`

Called when extended attributes of a path are being listed.

Return a list of strings of the names of the attributes you have stored as the second argument to the callback.

#### `ops.removexattr(path, name, cb)`

Called when an extended attribute is being removed.

#### `ops.open(path, flags, cb)`

Called when a path is being opened. `flags` in a number containing the permissions being requested. Accepts a file descriptor after the return code in the callback.

``` js
var toFlag = function(flags) {
  flags = flags & 3
  if (flags === 0) return 'r'
  if (flags === 1) return 'w'
  return 'r+'
}

ops.open = function (path, flags, cb) {
  var flag = toFlag(flags) // convert flags to a node style string
  ...
  cb(0, 42) // 42 is a file descriptor
}
```

#### `ops.opendir(path, flags, cb)`

Same as above but for directories

#### `ops.read(path, fd, buffer, length, position, cb)`

Called when contents of a file is being read. You should write the result of the read to the `buffer` and return the number of bytes written as the first argument in the callback.
If no bytes were written (read is complete) return 0 in the callback.

``` js
var data = new Buffer('hello world')

ops.read = function (path, fd, buffer, length, position, cb) {
  if (position >= data.length) return cb(0) // done
  var part = data.slice(position, position + length)
  part.copy(buffer) // write the result of the read to the result buffer
  cb(part.length) // return the number of bytes read
}
```

#### `ops.write(path, fd, buffer, length, position, cb)`

Called when a file is being written to. You can get the data being written in `buffer` and you should return the number of bytes written in the callback as the first argument.

``` js
ops.write = function (path, fd, buffer, length, position, cb) {
  console.log('writing', buffer.slice(0, length))
  cb(length) // we handled all the data
}
```

#### `ops.release(path, fd, cb)`

Called when a file descriptor is being released. Happens when a read/write is done etc.

#### `ops.releasedir(path, fd, cb)`

Same as above but for directories

#### `ops.create(path, mode, cb)`

Called when a new file is being opened.

#### `ops.utimens(path, atime, mtime, cb)`

Called when the atime/mtime of a file is being changed.

#### `ops.unlink(path, cb)`

Called when a file is being unlinked.

#### `ops.rename(src, dest, cb)`

Called when a file is being renamed.

#### `ops.link(src, dest, cb)`

Called when a new link is created.

#### `ops.symlink(src, dest, cb)`

Called when a new symlink is created

#### `ops.mkdir(path, mode, cb)`

Called when a new directory is being created

#### `ops.rmdir(path, cb)`

Called when a directory is being removed

### Newly Added Operations

The following operations have been recently added and are available for use:

#### `ops.lock(path, fd, cmd, flock, cb)`

Called to perform POSIX file locking. `flock` is an object with the following properties:

```js
{
  l_type: 0, // F_RDLCK, F_WRLCK, F_UNLCK
  l_whence: 0, // SEEK_SET, SEEK_CUR, SEEK_END
  l_start: 0,
  l_len: 0,
  l_pid: 0
}
```

#### `ops.bmap(path, blocksize, cb)`

Called to map a block in the file to a block on the device.

#### `ops.ioctl(path, cmd, arg, fd, flags, data, cb)`

Called to perform an ioctl on a file descriptor. `arg` and `data` are buffers.

#### `ops.poll(path, fd, ph, reventsp, cb)`

Called to poll for I/O readiness. `ph` and `reventsp` are buffers.

#### `ops.write_buf(path, buf, offset, fd, cb)`

Called to write the contents of a buffer to a file. `buf` is a `fuse_bufvec` structure, passed as a buffer.

#### `ops.read_buf(path, bufp, len, offset, fd, cb)`

Called to read the contents of a file into a buffer. `bufp` is a `fuse_bufvec` structure, passed as a buffer.

#### `ops.flock(path, fd, op, cb)`

Called to perform BSD file locking.

#### `ops.fallocate(path, mode, offset, length, fd, cb)`

Called to allocate space for a file.

#### `ops.lseek(path, offset, whence, fd, cb)`

Called to find the next data or hole in a file.

#### `ops.copy_file_range(path, fd, offsetIn, pathOut, fdOut, offsetOut, len, flags, cb)`

Called to copy a range of data from one file to another.

## Error Codes

FUSE operations should return appropriate POSIX error codes. Here are common ones used in the tests:

- `0` - Success
- `-2` (ENOENT) - File/directory not found
- `-9` (EBADF) - Bad file descriptor
- `-13` (EACCES) - Access denied
- `-17` (EEXIST) - File exists
- `-20` (ENOTDIR) - Not a directory
- `-21` (EISDIR) - Is a directory
- `-22` (EINVAL) - Invalid argument
- `-25` (ENOTTY) - Not a terminal
- `-39` (ENOTEMPTY) - Directory not empty
- `-61` (ENODATA) - No data available

## Testing and Development

See `test/README.md` for detailed information about the testing framework and how to use the in-memory filesystem for development and testing.

## License

MIT for these bindings.

See the [libfuse](https://github.com/libfuse/libfuse) license for Linux/BSD
for the FUSE shared library license, which is LGPL

