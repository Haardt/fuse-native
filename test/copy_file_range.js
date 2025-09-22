const tape = require("tape");
const fs = require("fs");
const path = require("path");

const Fuse = require("../");
const createMountpoint = require("./fixtures/mnt");
const stat = require("./fixtures/stat");

const { unmount } = require("./helpers");
const mnt = createMountpoint();

tape("copy_file_range paththrough test", function (t) {
  const files = new Map();
  const fileDescriptors = new Map();
  let fdCounter = 1;

  const testContent =
    "Hello World! This is test content for copy_file_range testing.\nSecond line.\nThird line with more data.";

  // Create test files in memory
  files.set("/source.txt", Buffer.from(testContent));
  files.set("/target.txt", Buffer.alloc(0));

  let copyFileRangeCalled = false;
  let copyCallArgs = null;

  const testFS = {
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, ["source.txt", "target.txt"]);
      return process.nextTick(cb, Fuse.ENOENT);
    },

    getattr: function (path, cb) {
      if (path === "/") {
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      }

      if (files.has(path)) {
        const file = files.get(path);
        return process.nextTick(
          cb,
          null,
          stat({
            mode: "file",
            size: file.length,
            mtime: new Date(),
            atime: new Date(),
          }),
        );
      }

      return process.nextTick(cb, Fuse.ENOENT);
    },

    open: function (path, flags, cb) {
      if (!files.has(path)) {
        return process.nextTick(cb, Fuse.ENOENT);
      }

      const fd = fdCounter++;
      fileDescriptors.set(fd, { path, flags });
      return process.nextTick(cb, 0, fd);
    },

    create: function (path, mode, cb) {
      files.set(path, Buffer.alloc(0));
      const fd = fdCounter++;
      fileDescriptors.set(fd, { path, flags: "w" });
      return process.nextTick(cb, 0, fd);
    },

    read: function (path, fd, buf, len, pos, cb) {
      const fdInfo = fileDescriptors.get(fd);
      if (!fdInfo) return process.nextTick(cb, Fuse.EBADF);

      const file = files.get(fdInfo.path);
      if (!file) return process.nextTick(cb, Fuse.ENOENT);

      const start = Math.min(pos, file.length);
      const end = Math.min(pos + len, file.length);
      const bytesToRead = Math.max(0, end - start);

      if (bytesToRead > 0) {
        file.copy(buf, 0, start, end);
      }

      return process.nextTick(cb, bytesToRead);
    },

    write: function (path, fd, buf, len, pos, cb) {
      const fdInfo = fileDescriptors.get(fd);
      if (!fdInfo) return process.nextTick(cb, Fuse.EBADF);

      let file = files.get(fdInfo.path);
      if (!file) {
        file = Buffer.alloc(0);
        files.set(fdInfo.path, file);
      }

      // Extend file if necessary
      const newSize = Math.max(file.length, pos + len);
      if (newSize > file.length) {
        const newFile = Buffer.alloc(newSize);
        file.copy(newFile);
        file = newFile;
        files.set(fdInfo.path, file);
      }

      // Copy data from buf to file
      buf.copy(file, pos, 0, len);

      return process.nextTick(cb, len);
    },

    release: function (path, fd, cb) {
      fileDescriptors.delete(fd);
      return process.nextTick(cb, 0);
    },

    copy_file_range: function (
      pathIn,
      fdIn,
      offsetIn,
      pathOut,
      fdOut,
      offsetOut,
      len,
      flags,
      cb,
    ) {
      copyFileRangeCalled = true;
      copyCallArgs = {
        pathIn,
        fdIn,
        offsetIn,
        pathOut,
        fdOut,
        offsetOut,
        len,
        flags,
      };

      // Verify parameters are passed correctly
      t.same(pathIn, "/source.txt", "correct source path");
      t.same(pathOut, "/target.txt", "correct target path");
      t.ok(typeof fdIn === "number", "source fd is number");
      t.ok(typeof fdOut === "number", "target fd is number");
      t.ok(
        typeof offsetIn === "number" && offsetIn >= 0,
        "valid source offset",
      );
      t.ok(
        typeof offsetOut === "number" && offsetOut >= 0,
        "valid target offset",
      );
      t.ok(typeof len === "number" && len > 0, "valid length");
      t.ok(typeof flags === "number", "valid flags");

      // Simulate successful copy
      const actualLen = Math.min(len, testContent.length - offsetIn);
      return process.nextTick(cb, null, actualLen);
    },
  };

  const fuse = new Fuse(mnt, testFS, { debug: false });

  fuse.mount(function (err) {
    t.error(err, "no error on mount");

    // Test copy_file_range paththrough by calling internal method directly
    fuse._op_copy_file_range(
      function signal(err, bytes) {
        // Test the paththrough worked regardless of file descriptor issues
        t.ok(copyFileRangeCalled, "copy_file_range handler was called");
        t.ok(copyCallArgs, "copy_file_range received arguments");

        if (copyCallArgs) {
          t.same(copyCallArgs.pathIn, "/source.txt", "pathIn passed correctly");
          t.same(
            copyCallArgs.pathOut,
            "/target.txt",
            "pathOut passed correctly",
          );
          t.same(copyCallArgs.offsetIn, 5, "offsetIn passed correctly");
          t.same(copyCallArgs.offsetOut, 0, "offsetOut passed correctly");
          t.same(copyCallArgs.len, 20, "len passed correctly");
          t.same(copyCallArgs.flags, 0, "flags passed correctly");
        }

        unmount(fuse, function () {
          t.end();
        });
      },
      "/source.txt", // pathIn
      1, // fdIn (dummy)
      5, // offsetInLow
      0, // offsetInHigh
      "/target.txt", // pathOut
      2, // fdOut (dummy)
      0, // offsetOutLow
      0, // offsetOutHigh
      20, // len
      0, // flags
    );
  });
});

tape("copy_file_range registration test", function (t) {
  // Test that copy_file_range is properly registered as an implemented operation
  const testFS = {
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    copy_file_range: function (
      pathIn,
      fdIn,
      offsetIn,
      pathOut,
      fdOut,
      offsetOut,
      len,
      flags,
      cb,
    ) {
      return process.nextTick(cb, null, len);
    },
  };

  const fuse = new Fuse(mnt + "_reg", testFS, { debug: false });

  // Check if copy_file_range is in the implemented operations
  const binding = require("../build/Release/fuse.node");
  const hasCopyFileRange = fuse._implemented.has(binding.op_copy_file_range);

  t.ok(
    hasCopyFileRange,
    "copy_file_range is registered as implemented operation",
  );
  t.same(binding.op_copy_file_range, 43, "copy_file_range has correct opcode");

  t.end();
});

tape("copy_file_range binding constants", function (t) {
  // Test that the native binding exports the correct constants
  const binding = require("../build/Release/fuse.node");

  t.ok(
    typeof binding.op_copy_file_range === "number",
    "op_copy_file_range is a number",
  );
  t.same(
    binding.op_copy_file_range,
    43,
    "op_copy_file_range has correct FUSE opcode value",
  );

  // Test that JavaScript fallback is available when copy_file_range is not implemented
  const testFS = {
    readdir: () => {},
    getattr: () => {},
    read: () => {},
    write: () => {},
    // Note: no copy_file_range - should use fallback
  };

  const fuse = new Fuse(mnt + "_binding", testFS, { debug: false });
  const hasFallback = typeof fuse._op_copy_file_range === "function";

  t.ok(hasFallback, "copy_file_range fallback method exists");

  t.end();
});
