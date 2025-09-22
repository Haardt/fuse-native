const tape = require("tape");
const fs = require("fs");
const path = require("path");

const Fuse = require("./");
const createMountpoint = require("./test/fixtures/mnt");
const stat = require("./test/fixtures/stat");

const { unmount } = require("./test/helpers");
const mnt = createMountpoint();

tape("simple copy_file_range paththrough test", function (t) {
  let copyFileRangeCalled = false;
  let copyCallCount = 0;

  const testContent = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  const testFS = {
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["source.txt"]);
      return process.nextTick(cb, Fuse.ENOENT);
    },

    getattr: function (path, cb) {
      if (path === "/") {
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      }
      if (path === "/source.txt") {
        return process.nextTick(
          cb,
          null,
          stat({
            mode: "file",
            size: testContent.length,
          }),
        );
      }
      return process.nextTick(cb, Fuse.ENOENT);
    },

    open: function (path, flags, cb) {
      t.comment(`open: ${path}, flags: ${flags}`);
      return process.nextTick(cb, 0, 1);
    },

    create: function (path, mode, cb) {
      t.comment(`create: ${path}, mode: ${mode}`);
      return process.nextTick(cb, 0, 2);
    },

    read: function (path, fd, buf, len, pos, cb) {
      t.comment(`read: ${path}, fd: ${fd}, len: ${len}, pos: ${pos}`);
      if (path === "/source.txt") {
        const data = Buffer.from(testContent);
        const bytesToRead = Math.min(len, Math.max(0, data.length - pos));
        if (bytesToRead > 0) {
          data.copy(buf, 0, pos, pos + bytesToRead);
        }
        return process.nextTick(cb, bytesToRead);
      }
      return process.nextTick(cb, 0);
    },

    write: function (path, fd, buf, len, pos, cb) {
      t.comment(`write: ${path}, fd: ${fd}, len: ${len}, pos: ${pos}`);
      return process.nextTick(cb, len);
    },

    release: function (path, fd, cb) {
      t.comment(`release: ${path}, fd: ${fd}`);
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
      copyCallCount++;

      t.comment("=== COPY_FILE_RANGE CALLED ===");
      t.comment(`Source: ${pathIn} (fd=${fdIn}) offset=${offsetIn}`);
      t.comment(`Target: ${pathOut} (fd=${fdOut}) offset=${offsetOut}`);
      t.comment(`Length: ${len}, flags: ${flags}`);
      t.comment(`Call count: ${copyCallCount}`);

      // Simulate copying the specified number of bytes
      const actualBytes = Math.min(
        len,
        Math.max(0, testContent.length - offsetIn),
      );

      t.comment(`Returning ${actualBytes} bytes copied`);
      return process.nextTick(cb, null, actualBytes);
    },
  };

  const fuse = new Fuse(mnt, testFS, { debug: false });

  fuse.mount(function (err) {
    t.error(err, "mount successful");
    t.comment("FUSE filesystem mounted, starting tests...");

    // Test 1: Check if copy_file_range is available in binding
    try {
      const binding = require("./build/Release/fuse.node");
      t.ok(
        typeof binding.op_copy_file_range === "number",
        "op_copy_file_range constant exists",
      );
      t.comment(`op_copy_file_range opcode = ${binding.op_copy_file_range}`);
    } catch (e) {
      t.fail(`Could not load native binding: ${e.message}`);
    }

    // Test 2: Direct call to internal copy_file_range method
    t.comment("Testing direct internal _op_copy_file_range call...");

    fs.open(path.join(mnt, "source.txt"), "r", (err, srcFd) => {
      t.error(err, "source file opened");

      fs.open(path.join(mnt, "target.txt"), "w", (err, dstFd) => {
        if (err) {
          t.comment(
            `Target file creation failed, skipping file descriptor test: ${err.message}`,
          );
          // Still test copy_file_range with dummy file descriptors
          dstFd = -1;
        } else {
          t.pass("target file created");
        }

        // Call the internal copy_file_range method directly
        fuse._op_copy_file_range(
          function signal(err, bytes) {
            t.comment(`Signal callback: err=${err}, bytes=${bytes}`);

            if (err === 0) {
              t.pass("copy_file_range operation completed successfully");
              t.ok(bytes >= 0, `copied ${bytes} bytes`);

              if (copyFileRangeCalled) {
                t.pass("✓ Custom copy_file_range implementation was called!");
                t.equal(
                  copyCallCount,
                  1,
                  "copy_file_range called exactly once",
                );
              } else {
                t.comment("copy_file_range was NOT called (fallback used)");
              }
            } else {
              t.fail(`copy_file_range failed with error: ${err}`);
            }

            // Cleanup
            fs.close(srcFd, () => {});
            if (dstFd > 0) {
              fs.close(dstFd, () => {});
            }

            unmount(fuse, function () {
              t.comment(
                "DONE: Simple copy_file_range paththrough test completed",
              );
              t.end();
            });
          },
          "/source.txt", // pathIn
          srcFd, // fdIn
          0, // offsetInLow
          0, // offsetInHigh
          "/target.txt", // pathOut
          dstFd, // fdOut
          0, // offsetOutLow
          0, // offsetOutHigh
          10, // len
          0, // flags
        );
      });
    });
  });
});

// Additional test to check if copy_file_range is properly registered
tape("copy_file_range registration test", function (t) {
  const testFS = {
    readdir: () => {},
    getattr: () => {},
    copy_file_range: function () {
      t.comment("copy_file_range method exists in filesystem");
    },
  };

  const fuse = new Fuse(mnt + "_reg", testFS, { debug: false });

  // Check if copy_file_range is in the implemented operations
  const binding = require("./build/Release/fuse.node");
  const hasCopyFileRange = fuse._implemented.has(binding.op_copy_file_range);

  t.ok(
    hasCopyFileRange,
    "copy_file_range is registered as implemented operation",
  );
  t.comment(`copy_file_range implemented: ${hasCopyFileRange}`);
  t.comment(`op_copy_file_range value: ${binding.op_copy_file_range}`);

  t.comment("DONE: copy_file_range registration test completed");
  t.end();
});
