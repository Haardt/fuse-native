const tape = require("tape");
const fs = require("fs");
const path = require("path");

const Fuse = require("../");
const createMountpoint = require("./fixtures/mnt");
const stat = require("./fixtures/stat");
const { unmount } = require("./helpers");

const mnt = createMountpoint();

// Test access operation
tape("access", function (t) {
  let accessCalled = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["test"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/test")
        return process.nextTick(cb, null, stat({ mode: "file", size: 11 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    access: function (path, mode, cb) {
      accessCalled = true;
      t.equal(path, "/test", "correct path");
      t.equal(typeof mode, "number", "mode is number");
      t.equal(typeof cb, "function", "callback is function");
      process.nextTick(cb, 0);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.access(path.join(mnt, "test"), fs.constants.F_OK, function (err) {
      t.error(err, "no error");
      t.ok(accessCalled, "access was called");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

// Test utimens operation
tape("utimens", function (t) {
  let utimensCalled = false;
  const testTime = new Date();

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["test"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/test")
        return process.nextTick(cb, null, stat({ mode: "file", size: 11 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    utimens: function (path, atime, mtime, cb) {
      utimensCalled = true;
      t.equal(path, "/test", "correct path");
      t.equal(typeof atime, "number", "atime is number");
      t.equal(typeof mtime, "number", "mtime is number");
      t.equal(typeof cb, "function", "callback is function");
      process.nextTick(cb, 0);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.utimes(path.join(mnt, "test"), testTime, testTime, function (err) {
      t.error(err, "no error");
      t.ok(utimensCalled, "utimens was called");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

// Test truncate operation
tape("truncate", function (t) {
  let truncateCalled = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["test"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/test")
        return process.nextTick(cb, null, stat({ mode: "file", size: 100 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    truncate: function (path, size, cb) {
      truncateCalled = true;
      t.equal(path, "/test", "correct path");
      t.equal(size, 50, "correct size");
      t.equal(typeof cb, "function", "callback is function");
      process.nextTick(cb, 0);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.truncate(path.join(mnt, "test"), 50, function (err) {
      t.error(err, "no error");
      t.ok(truncateCalled, "truncate was called");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

// Test chmod operation
tape("chmod", function (t) {
  let chmodCalled = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["test"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/test")
        return process.nextTick(cb, null, stat({ mode: "file", size: 11 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    chmod: function (path, mode, cb) {
      chmodCalled = true;
      t.equal(path, "/test", "correct path");
      t.equal(mode & 0o777, 0o644, "correct mode");
      t.equal(typeof cb, "function", "callback is function");
      process.nextTick(cb, 0);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.chmod(path.join(mnt, "test"), 0o644, function (err) {
      t.error(err, "no error");
      t.ok(chmodCalled, "chmod was called");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

// Test chown operation
tape("chown", function (t) {
  let chownCalled = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["test"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/test")
        return process.nextTick(cb, null, stat({ mode: "file", size: 11 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    chown: function (path, uid, gid, cb) {
      chownCalled = true;
      t.equal(path, "/test", "correct path");
      t.equal(typeof uid, "number", "uid is number");
      t.equal(typeof gid, "number", "gid is number");
      t.equal(typeof cb, "function", "callback is function");
      process.nextTick(cb, 0);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.chown(
      path.join(mnt, "test"),
      process.getuid(),
      process.getgid(),
      function (err) {
        t.error(err, "no error");
        t.ok(chownCalled, "chown was called");

        unmount(fuse, function () {
          t.end();
        });
      },
    );
  });
});

// Test unlink operation
tape("unlink", function (t) {
  let unlinkCalled = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["test"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/test" && !unlinkCalled)
        return process.nextTick(cb, null, stat({ mode: "file", size: 11 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    unlink: function (path, cb) {
      unlinkCalled = true;
      t.equal(path, "/test", "correct path");
      t.equal(typeof cb, "function", "callback is function");
      process.nextTick(cb, 0);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.unlink(path.join(mnt, "test"), function (err) {
      t.error(err, "no error");
      t.ok(unlinkCalled, "unlink was called");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

// Test mkdir operation
tape("mkdir", function (t) {
  let mkdirCalled = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, mkdirCalled ? ["newdir"] : [], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/newdir" && mkdirCalled)
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    mkdir: function (path, mode, cb) {
      mkdirCalled = true;
      t.equal(path, "/newdir", "correct path");
      t.equal(typeof mode, "number", "mode is number");
      t.equal(typeof cb, "function", "callback is function");
      process.nextTick(cb, 0);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.mkdir(path.join(mnt, "newdir"), function (err) {
      t.error(err, "no error");
      t.ok(mkdirCalled, "mkdir was called");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

// Test rmdir operation
tape("rmdir", function (t) {
  let rmdirCalled = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, rmdirCalled ? [] : ["testdir"], []);
      if (path === "/testdir" && !rmdirCalled)
        return process.nextTick(cb, null, [], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/testdir" && !rmdirCalled)
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    rmdir: function (path, cb) {
      rmdirCalled = true;
      t.equal(path, "/testdir", "correct path");
      t.equal(typeof cb, "function", "callback is function");
      process.nextTick(cb, 0);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.rmdir(path.join(mnt, "testdir"), function (err) {
      t.error(err, "no error");
      t.ok(rmdirCalled, "rmdir was called");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

// Test rename operation
tape("rename", function (t) {
  let renameCalled = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") {
        if (!renameCalled) return process.nextTick(cb, null, ["oldname"], []);
        else return process.nextTick(cb, null, ["newname"], []);
      }
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/oldname" && !renameCalled)
        return process.nextTick(cb, null, stat({ mode: "file", size: 11 }));
      if (path === "/newname" && renameCalled)
        return process.nextTick(cb, null, stat({ mode: "file", size: 11 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    rename: function (src, dest, cb) {
      renameCalled = true;
      t.equal(src, "/oldname", "correct source");
      t.equal(dest, "/newname", "correct destination");
      t.equal(typeof cb, "function", "callback is function");
      process.nextTick(cb, 0);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.rename(
      path.join(mnt, "oldname"),
      path.join(mnt, "newname"),
      function (err) {
        t.error(err, "no error");
        t.ok(renameCalled, "rename was called");

        unmount(fuse, function () {
          t.end();
        });
      },
    );
  });
});

// Test symlink operation
tape("symlink", function (t) {
  let symlinkCalled = false;
  let symlinkCreated = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") {
        const files = ["target"];
        if (symlinkCreated) files.push("link");
        return process.nextTick(cb, null, files, []);
      }
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/target")
        return process.nextTick(cb, null, stat({ mode: "file", size: 11 }));
      if (path === "/link" && symlinkCreated)
        return process.nextTick(cb, null, stat({ mode: "link", size: 6 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    symlink: function (src, dest, cb) {
      symlinkCalled = true;
      symlinkCreated = true;
      t.equal(src, "target", "correct source");
      t.equal(dest, "/link", "correct destination");
      t.equal(typeof cb, "function", "callback is function");
      process.nextTick(cb, 0);
    },
    readlink: function (path, cb) {
      if (path === "/link") return process.nextTick(cb, null, "target");
      return process.nextTick(cb, Fuse.ENOENT);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.symlink("target", path.join(mnt, "link"), function (err) {
      t.error(err, "no error");
      t.ok(symlinkCalled, "symlink was called");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

// Test mknod operation (using direct operation call since fs.mknod may not be available)
tape("mknod operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let mknodCalled = false;
  fuse.ops.mknod = function (path, mode, dev, cb) {
    mknodCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof mode, "number", "mode is number");
    t.equal(typeof dev, "number", "dev is number");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, 0);
  };

  const mockSignal = (err) => {
    t.equal(err, 0, "should signal success");
    t.ok(mknodCalled, "mknod was called");
    t.end();
  };

  fuse._op_mknod(mockSignal, "/test", 0o644, 0);
});

// Test fsync operation signature
tape("fsync operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let fsyncCalled = false;
  fuse.ops.fsync = function (path, datasync, fd, cb) {
    fsyncCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof datasync, "number", "datasync is number");
    t.equal(typeof fd, "number", "fd is number");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, 0);
  };

  const mockSignal = (err) => {
    t.equal(err, 0, "should signal success");
    t.ok(fsyncCalled, "fsync was called");
    t.end();
  };

  fuse._op_fsync(mockSignal, "/test", 1, 42);
});

// Test fsyncdir operation signature
tape("fsyncdir operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let fsyncdirCalled = false;
  fuse.ops.fsyncdir = function (path, datasync, fd, cb) {
    fsyncdirCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof datasync, "number", "datasync is number");
    t.equal(typeof fd, "number", "fd is number");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, 0);
  };

  const mockSignal = (err) => {
    t.equal(err, 0, "should signal success");
    t.ok(fsyncdirCalled, "fsyncdir was called");
    t.end();
  };

  fuse._op_fsyncdir(mockSignal, "/test", 1, 42);
});

// Test ftruncate operation signature
tape("ftruncate operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let ftruncateCalled = false;
  fuse.ops.ftruncate = function (path, fd, size, cb) {
    ftruncateCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof fd, "number", "fd is number");
    t.equal(typeof size, "number", "size is number");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, 0);
  };

  const mockSignal = (err) => {
    t.equal(err, 0, "should signal success");
    t.ok(ftruncateCalled, "ftruncate was called");
    t.end();
  };

  fuse._op_ftruncate(mockSignal, "/test", 42, 100, 0);
});

// Test extended attributes operations
tape("setxattr operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let setxattrCalled = false;
  fuse.ops.setxattr = function (path, name, value, position, flags, cb) {
    setxattrCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof name, "string", "name is string");
    t.ok(Buffer.isBuffer(value), "value is buffer");
    t.equal(typeof position, "number", "position is number");
    t.equal(typeof flags, "number", "flags is number");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, 0);
  };

  const mockSignal = (err) => {
    t.equal(err, 0, "should signal success");
    t.ok(setxattrCalled, "setxattr was called");
    t.end();
  };

  const testValue = Buffer.from("test-value");
  fuse._op_setxattr(mockSignal, "/test", "user.test", testValue, 0, 0);
});

tape("getxattr operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let getxattrCalled = false;
  fuse.ops.getxattr = function (path, name, position, cb) {
    getxattrCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof name, "string", "name is string");
    t.equal(typeof position, "number", "position is number");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, null, Buffer.from("test-value"));
  };

  const mockSignal = (result) => {
    t.equal(result, 10, "should signal value length");
    t.ok(getxattrCalled, "getxattr was called");
    t.end();
  };

  const testBuf = Buffer.alloc(100);
  fuse._op_getxattr(mockSignal, "/test", "user.test", testBuf, 0);
});

// Test lseek operation signature
tape("lseek operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let lseekCalled = false;
  fuse.ops.lseek = function (path, offset, whence, fd, cb) {
    lseekCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof offset, "number", "offset is number");
    t.equal(typeof whence, "number", "whence is number");
    t.equal(typeof fd, "number", "fd is number");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, null, 1024);
  };

  const mockSignal = (err, offsetLow, offsetHigh) => {
    t.equal(err, 0, "should signal success");
    t.equal(typeof offsetLow, "number", "offsetLow is number");
    t.equal(typeof offsetHigh, "number", "offsetHigh is number");
    t.ok(lseekCalled, "lseek was called");
    t.end();
  };

  fuse._op_lseek(mockSignal, "/test", 1024, 0, 0, 42);
});

// Test fallocate operation signature
tape("fallocate operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let fallocateCalled = false;
  fuse.ops.fallocate = function (path, mode, offset, length, fd, cb) {
    fallocateCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof mode, "number", "mode is number");
    t.equal(typeof offset, "number", "offset is number");
    t.equal(typeof length, "number", "length is number");
    t.equal(typeof fd, "number", "fd is number");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, 0);
  };

  const mockSignal = (err) => {
    t.equal(err, 0, "should signal success");
    t.ok(fallocateCalled, "fallocate was called");
    t.end();
  };

  fuse._op_fallocate(mockSignal, "/test", 0, 0, 0, 1024, 0, 42);
});

// Test other operation signatures that are harder to trigger via fs operations
tape("lock operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let lockCalled = false;
  fuse.ops.lock = function (path, fd, cmd, flock, cb) {
    lockCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof fd, "number", "fd is number");
    t.equal(typeof cmd, "number", "cmd is number");
    t.ok(flock, "flock object provided");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, 0);
  };

  const mockSignal = (err) => {
    t.equal(err, 0, "should signal success");
    t.ok(lockCalled, "lock was called");
    t.end();
  };

  const mockFlock = { l_type: 1, l_whence: 0, l_start: 0, l_len: 100 };
  fuse._op_lock(mockSignal, "/test", 42, 5, mockFlock);
});

tape("bmap operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let bmapCalled = false;
  fuse.ops.bmap = function (path, blocksize, cb) {
    bmapCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof blocksize, "number", "blocksize is number");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, null, 42);
  };

  const mockSignal = (err, idxLow, idxHigh) => {
    t.equal(err, 0, "should signal success");
    t.equal(typeof idxLow, "number", "idxLow is number");
    t.equal(typeof idxHigh, "number", "idxHigh is number");
    t.ok(bmapCalled, "bmap was called");
    t.end();
  };

  fuse._op_bmap(mockSignal, "/test", 4096);
});

tape("ioctl operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let ioctlCalled = false;
  fuse.ops.ioctl = function (path, cmd, arg, fd, flags, data, cb) {
    ioctlCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof cmd, "number", "cmd is number");
    t.equal(typeof arg, "number", "arg is number");
    t.equal(typeof fd, "number", "fd is number");
    t.equal(typeof flags, "number", "flags is number");
    t.equal(data, null, "data can be null");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, 0);
  };

  const mockSignal = (err) => {
    t.equal(err, 0, "should signal success");
    t.ok(ioctlCalled, "ioctl was called");
    t.end();
  };

  fuse._op_ioctl(mockSignal, "/test", 0x1000, 0, 42, 0, null);
});

tape("poll operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let pollCalled = false;
  fuse.ops.poll = function (path, fd, ph, reventsp, cb) {
    pollCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof fd, "number", "fd is number");
    t.ok(ph, "ph provided");
    t.ok(reventsp, "reventsp provided");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, 0);
  };

  const mockSignal = (err) => {
    t.equal(err, 0, "should signal success");
    t.ok(pollCalled, "poll was called");
    t.end();
  };

  fuse._op_poll(mockSignal, "/test", 42, {}, {});
});

tape("flock operation signature", function (t) {
  const fuse = new Fuse("/tmp/test", {});

  let flockCalled = false;
  fuse.ops.flock = function (path, fd, op, cb) {
    flockCalled = true;
    t.equal(typeof path, "string", "path is string");
    t.equal(typeof fd, "number", "fd is number");
    t.equal(typeof op, "number", "op is number");
    t.equal(typeof cb, "function", "callback is function");
    process.nextTick(cb, 0);
  };

  const mockSignal = function (err) {
    t.equal(err, 0, "should signal success");
    t.ok(flockCalled, "flock should have been called");
    t.end();
  };

  fuse._op_flock(mockSignal, "/test", 42, 1);
});
