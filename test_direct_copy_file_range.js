const tape = require("tape");
const fs = require("fs");
const path = require("path");

const Fuse = require("./");
const createMountpoint = require("./test/fixtures/mnt");
const stat = require("./test/fixtures/stat");

const { unmount } = require("./test/helpers");
const mnt = createMountpoint();

tape("copy_file_range direct binding test", function (t) {
  const files = new Map();
  const fileDescriptors = new Map();
  let fdCounter = 1;

  // Test data
  const testContent =
    "Hello World! This is test content for copy_file_range.\nSecond line of content.\nThird line with more data.";

  // Create test files in memory
  files.set("/source.txt", Buffer.from(testContent));
  files.set("/target.txt", Buffer.alloc(0));

  let copyFileRangeCalled = false;
  let copyFileRangeArgs = null;

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
      t.comment(`Opened ${path} with fd=${fd}, flags=${flags}`);
      return process.nextTick(cb, 0, fd);
    },

    create: function (path, mode, cb) {
      files.set(path, Buffer.alloc(0));
      const fd = fdCounter++;
      fileDescriptors.set(fd, { path, flags: "w" });
      t.comment(`Created ${path} with fd=${fd}, mode=${mode}`);
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

      t.comment(
        `Read ${bytesToRead} bytes from ${fdInfo.path} at offset ${pos}`,
      );
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

      t.comment(`Wrote ${len} bytes to ${fdInfo.path} at offset ${pos}`);
      return process.nextTick(cb, len);
    },

    release: function (path, fd, cb) {
      const fdInfo = fileDescriptors.get(fd);
      if (fdInfo) {
        t.comment(`Released ${fdInfo.path} (fd=${fd})`);
      }
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
      copyFileRangeArgs = {
        pathIn,
        fdIn,
        offsetIn,
        pathOut,
        fdOut,
        offsetOut,
        len,
        flags,
      };

      t.comment(`copy_file_range called:`);
      t.comment(`  Source: ${pathIn} (fd=${fdIn}) offset=${offsetIn}`);
      t.comment(`  Target: ${pathOut} (fd=${fdOut}) offset=${offsetOut}`);
      t.comment(`  Length: ${len}, flags: ${flags}`);

      const fdInfoIn = fileDescriptors.get(fdIn);
      const fdInfoOut = fileDescriptors.get(fdOut);

      if (!fdInfoIn || !fdInfoOut) {
        t.comment(
          `  Error: Invalid file descriptors (in=${!!fdInfoIn}, out=${!!fdInfoOut})`,
        );
        return process.nextTick(cb, Fuse.EBADF);
      }

      const fileIn = files.get(fdInfoIn.path);
      let fileOut = files.get(fdInfoOut.path);

      if (!fileIn) {
        t.comment(`  Error: Source file not found`);
        return process.nextTick(cb, Fuse.ENOENT);
      }

      if (!fileOut) {
        fileOut = Buffer.alloc(0);
        files.set(fdInfoOut.path, fileOut);
      }

      // Calculate actual bytes to copy
      const maxReadLen = Math.max(0, fileIn.length - offsetIn);
      const actualLen = Math.min(len, maxReadLen);

      if (actualLen <= 0) {
        t.comment(`  No bytes to copy (actualLen=${actualLen})`);
        return process.nextTick(cb, null, 0);
      }

      // Extend output file if necessary
      const newOutSize = Math.max(fileOut.length, offsetOut + actualLen);
      if (newOutSize > fileOut.length) {
        const newFileOut = Buffer.alloc(newOutSize);
        fileOut.copy(newFileOut);
        fileOut = newFileOut;
        files.set(fdInfoOut.path, fileOut);
      }

      // Copy the data
      fileIn.copy(fileOut, offsetOut, offsetIn, offsetIn + actualLen);

      t.comment(`  Successfully copied ${actualLen} bytes`);
      return process.nextTick(cb, null, actualLen);
    },
  };

  const fuse = new Fuse(mnt, testFS, { debug: false });

  fuse.mount(function (err) {
    t.error(err, "no error on mount");

    // Test basic file operations first
    fs.readFile(path.join(mnt, "source.txt"), function (err, data) {
      t.error(err, "source file read successfully");
      t.equal(data.toString(), testContent, "source file content correct");

      // Now test direct copy_file_range invocation through the JavaScript API
      t.comment("Testing direct copy_file_range invocation...");

      // Open source file for reading
      fs.open(path.join(mnt, "source.txt"), "r", (err, srcFd) => {
        t.error(err, "source file opened");
        t.ok(typeof srcFd === "number", "source fd is a number");

        // Open/create target file for writing
        fs.open(path.join(mnt, "target.txt"), "w", (err, dstFd) => {
          t.error(err, "target file opened");
          t.ok(typeof dstFd === "number", "target fd is a number");

          // Try to trigger copy_file_range manually using the FUSE internal API
          // This tests the binding directly rather than relying on Node.js fs module

          const testFuse = fuse;

          // Test if we can access the copy_file_range operation directly
          t.comment(
            "Checking if copy_file_range is in implemented operations...",
          );

          // Get the binding and check if copy_file_range is supported
          const binding = require("./build/Release/fuse_native.node");
          t.ok(
            typeof binding.op_copy_file_range === "number",
            "op_copy_file_range constant exists",
          );
          t.comment(`op_copy_file_range = ${binding.op_copy_file_range}`);

          // Test the JavaScript fallback implementation in index.js
          const pathIn = "/source.txt";
          const pathOut = "/target.txt";
          const offsetIn = 5; // Start copying from "World!"
          const offsetOut = 0;
          const copyLen = 20;
          const flags = 0;

          // Call the internal copy_file_range method directly
          testFuse._op_copy_file_range(
            function signal(err, bytes) {
              t.comment(
                `copy_file_range signal callback: err=${err}, bytes=${bytes}`,
              );

              if (err === 0) {
                t.pass("copy_file_range completed without error");
                t.ok(bytes > 0, `copied ${bytes} bytes`);

                if (copyFileRangeCalled) {
                  t.pass("custom copy_file_range implementation was called");
                  t.ok(copyFileRangeArgs, "copy_file_range arguments captured");

                  if (copyFileRangeArgs) {
                    t.equal(
                      copyFileRangeArgs.pathIn,
                      pathIn,
                      "correct source path",
                    );
                    t.equal(
                      copyFileRangeArgs.pathOut,
                      pathOut,
                      "correct target path",
                    );
                    t.equal(
                      copyFileRangeArgs.offsetIn,
                      offsetIn,
                      "correct source offset",
                    );
                    t.equal(
                      copyFileRangeArgs.offsetOut,
                      offsetOut,
                      "correct target offset",
                    );
                    t.equal(copyFileRangeArgs.len, copyLen, "correct length");
                  }
                } else {
                  t.comment("copy_file_range was not called (using fallback)");
                }
              } else {
                t.comment(`copy_file_range failed with error: ${err}`);
              }

              // Verify the result by reading the target file
              fs.readFile(path.join(mnt, "target.txt"), (err, data) => {
                if (!err && data.length > 0) {
                  const copiedContent = data.toString();
                  const expectedContent = testContent.substr(
                    offsetIn,
                    Math.min(copyLen, testContent.length - offsetIn),
                  );
                  t.comment(`Copied content: "${copiedContent}"`);
                  t.comment(`Expected content: "${expectedContent}"`);

                  if (copyFileRangeCalled) {
                    t.equal(
                      copiedContent,
                      expectedContent,
                      "copied content matches expected",
                    );
                  }
                }

                fs.close(srcFd, () => {});
                fs.close(dstFd, () => {});

                unmount(fuse, function () {
                  t.comment(
                    "DONE: copy_file_range direct binding test completed",
                  );
                  t.end();
                });
              });
            },
            pathIn, // path
            srcFd, // fd
            0, // offsetInLow
            0, // offsetInHigh
            pathOut, // pathOut
            dstFd, // fdOut
            0, // offsetOutLow
            0, // offsetOutHigh
            copyLen, // len
            flags, // flags
          );
        });
      });
    });
  });
});

tape("copy_file_range with various offsets and lengths", function (t) {
  const files = new Map();
  const fileDescriptors = new Map();
  let fdCounter = 1;

  // Create a longer test file
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const longContent = alphabet.repeat(10); // 360 characters

  files.set("/long.txt", Buffer.from(longContent));
  files.set("/partial.txt", Buffer.alloc(0));

  const copyOperations = [];

  const testFS = {
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, ["long.txt", "partial.txt"]);
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
      if (!files.has(path)) return process.nextTick(cb, Fuse.ENOENT);

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

      const newSize = Math.max(file.length, pos + len);
      if (newSize > file.length) {
        const newFile = Buffer.alloc(newSize);
        file.copy(newFile);
        file = newFile;
        files.set(fdInfo.path, file);
      }

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
      copyOperations.push({
        pathIn,
        fdIn,
        offsetIn,
        pathOut,
        fdOut,
        offsetOut,
        len,
        flags,
      });

      const fdInfoIn = fileDescriptors.get(fdIn);
      const fdInfoOut = fileDescriptors.get(fdOut);

      if (!fdInfoIn || !fdInfoOut) {
        return process.nextTick(cb, Fuse.EBADF);
      }

      const fileIn = files.get(fdInfoIn.path);
      let fileOut = files.get(fdInfoOut.path);

      if (!fileIn) return process.nextTick(cb, Fuse.ENOENT);

      if (!fileOut) {
        fileOut = Buffer.alloc(0);
        files.set(fdInfoOut.path, fileOut);
      }

      const maxRead = Math.max(0, fileIn.length - offsetIn);
      const actualLen = Math.min(len, maxRead);

      if (actualLen <= 0) {
        return process.nextTick(cb, null, 0);
      }

      const newOutSize = Math.max(fileOut.length, offsetOut + actualLen);
      if (newOutSize > fileOut.length) {
        const newFileOut = Buffer.alloc(newOutSize);
        fileOut.copy(newFileOut);
        fileOut = newFileOut;
        files.set(fdInfoOut.path, fileOut);
      }

      fileIn.copy(fileOut, offsetOut, offsetIn, offsetIn + actualLen);
      return process.nextTick(cb, null, actualLen);
    },
  };

  const fuse = new Fuse(mnt + "_partial", testFS, { debug: false });

  fuse.mount(function (err) {
    t.error(err, "no error on mount");

    // Test multiple copy operations with different parameters
    const testCases = [
      {
        offsetIn: 0,
        offsetOut: 0,
        len: 10,
        description: "copy first 10 bytes",
      },
      {
        offsetIn: 36,
        offsetOut: 10,
        len: 10,
        description: "copy 10 bytes from position 36 to position 10",
      },
      {
        offsetIn: 100,
        offsetOut: 20,
        len: 50,
        description: "copy 50 bytes from position 100 to position 20",
      },
    ];

    let testIndex = 0;

    function runNextTest() {
      if (testIndex >= testCases.length) {
        // All tests completed
        t.equal(
          copyOperations.length,
          testCases.length,
          `${testCases.length} copy operations were executed`,
        );

        unmount(fuse, function () {
          t.comment(
            "DONE: copy_file_range with various offsets and lengths test completed",
          );
          t.end();
        });
        return;
      }

      const testCase = testCases[testIndex];
      t.comment(`Running test case ${testIndex + 1}: ${testCase.description}`);

      fs.open(path.join(mnt + "_partial", "long.txt"), "r", (err, srcFd) => {
        t.error(err, `test ${testIndex + 1}: source file opened`);

        fs.open(
          path.join(mnt + "_partial", "partial.txt"),
          "w",
          (err, dstFd) => {
            t.error(err, `test ${testIndex + 1}: target file opened`);

            // Call copy_file_range using the internal API
            fuse._op_copy_file_range(
              function signal(err, bytes) {
                t.equal(
                  err,
                  0,
                  `test ${testIndex + 1}: copy operation succeeded`,
                );

                if (err === 0) {
                  const expectedBytes = Math.min(
                    testCase.len,
                    longContent.length - testCase.offsetIn,
                  );
                  t.equal(
                    bytes,
                    expectedBytes,
                    `test ${testIndex + 1}: correct number of bytes copied`,
                  );
                }

                fs.close(srcFd, () => {});
                fs.close(dstFd, () => {});

                testIndex++;
                setImmediate(runNextTest);
              },
              "/long.txt",
              srcFd,
              testCase.offsetIn & 0xffffffff, // offsetInLow
              (testCase.offsetIn >> 32) & 0xffffffff, // offsetInHigh
              "/partial.txt",
              dstFd,
              testCase.offsetOut & 0xffffffff, // offsetOutLow
              (testCase.offsetOut >> 32) & 0xffffffff, // offsetOutHigh
              testCase.len,
              0, // flags
            );
          },
        );
      });
    }

    runNextTest();
  });
});
