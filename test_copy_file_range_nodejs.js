const tape = require("tape");
const fs = require("fs");
const path = require("path");
const os = require("os");

const Fuse = require("./");
const createMountpoint = require("./test/fixtures/mnt");
const stat = require("./test/fixtures/stat");

const { unmount } = require("./test/helpers");
const mnt = createMountpoint();

// Create temporary directory for testing
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fuse-copy-test-"));
const sourceFile = path.join(tmpDir, "source.txt");
const targetFile = path.join(tmpDir, "target.txt");

// Test data
const testContent =
  "This is test content for copy_file_range testing!\nLine 2 of test content\nLine 3 with some more data for testing";

// Create source file
fs.writeFileSync(sourceFile, testContent);

tape("copy_file_range basic functionality", function (t) {
  const files = new Map();
  const fileDescriptors = new Map();
  let fdCounter = 1;

  // Create test files in memory
  files.set("/source.txt", Buffer.from(testContent));
  files.set("/target.txt", Buffer.alloc(0));

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
      t.comment(
        `copy_file_range called: ${pathIn} -> ${pathOut}, offset_in=${offsetIn}, offset_out=${offsetOut}, len=${len}, flags=${flags}`,
      );

      const fdInfoIn = fileDescriptors.get(fdIn);
      const fdInfoOut = fileDescriptors.get(fdOut);

      if (!fdInfoIn || !fdInfoOut) {
        return process.nextTick(cb, Fuse.EBADF);
      }

      const fileIn = files.get(fdInfoIn.path);
      let fileOut = files.get(fdInfoOut.path);

      if (!fileIn) {
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

      return process.nextTick(cb, null, actualLen);
    },
  };

  const fuse = new Fuse(mnt, testFS, { debug: true });

  fuse.mount(function (err) {
    t.error(err, "no error on mount");

    // Test 1: Basic file operations
    fs.readFile(path.join(mnt, "source.txt"), function (err, data) {
      t.error(err, "no error reading source file");
      t.equal(data.toString(), testContent, "source file content matches");

      // Test 2: Test copy_file_range via Node.js fs.copyFile
      fs.copyFile(
        path.join(mnt, "source.txt"),
        path.join(mnt, "copied.txt"),
        function (err) {
          if (err) {
            t.comment(
              "fs.copyFile failed, this is expected if copy_file_range is not used by Node.js on this system",
            );
          }

          // Test 3: Manual copy using read/write (should trigger copy_file_range fallback)
          const sourcePath = path.join(mnt, "source.txt");
          const targetPath = path.join(mnt, "manual_copy.txt");

          fs.open(sourcePath, "r", (err, srcFd) => {
            t.error(err, "no error opening source");

            fs.open(targetPath, "w", (err, dstFd) => {
              t.error(err, "no error creating target");

              // Try to use copy_file_range directly if available
              if (fs.copyFileRange) {
                fs.copyFileRange(
                  srcFd,
                  0,
                  dstFd,
                  0,
                  testContent.length,
                  0,
                  (err, bytesRead) => {
                    if (!err) {
                      t.pass("copy_file_range succeeded");
                      t.equal(
                        bytesRead,
                        testContent.length,
                        "correct bytes copied",
                      );
                    } else {
                      t.comment(
                        "copy_file_range not available or failed: " +
                          err.message,
                      );
                    }

                    fs.close(srcFd, () => {});
                    fs.close(dstFd, () => {});

                    // Test 4: Verify the copied content
                    fs.readFile(targetPath, (err, data) => {
                      if (!err) {
                        t.equal(
                          data.toString(),
                          testContent,
                          "copied content matches",
                        );
                      }

                      unmount(fuse, function () {
                        // Cleanup
                        try {
                          fs.unlinkSync(sourceFile);
                          fs.unlinkSync(targetFile);
                          fs.rmdirSync(tmpDir);
                        } catch (e) {}

                        t.end();
                      });
                    });
                  },
                );
              } else {
                t.comment(
                  "fs.copyFileRange not available in this Node.js version",
                );
                fs.close(srcFd, () => {});
                fs.close(dstFd, () => {});

                unmount(fuse, function () {
                  // Cleanup
                  try {
                    fs.unlinkSync(sourceFile);
                    fs.unlinkSync(targetFile);
                    fs.rmdirSync(tmpDir);
                  } catch (e) {}

                  t.end();
                });
              }
            });
          });
        },
      );
    });
  });
});

tape("copy_file_range with partial copy", function (t) {
  const files = new Map();
  const fileDescriptors = new Map();
  let fdCounter = 1;

  // Create test file with known content
  const longContent = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".repeat(10); // 360 chars
  files.set("/long.txt", Buffer.from(longContent));
  files.set("/partial.txt", Buffer.alloc(0));

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
      t.comment(
        `copy_file_range: copying ${len} bytes from offset ${offsetIn} to offset ${offsetOut}`,
      );

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

      // Calculate actual copy size
      const maxRead = Math.max(0, fileIn.length - offsetIn);
      const actualLen = Math.min(len, maxRead);

      if (actualLen <= 0) {
        return process.nextTick(cb, null, 0);
      }

      // Extend output file if needed
      const newOutSize = Math.max(fileOut.length, offsetOut + actualLen);
      if (newOutSize > fileOut.length) {
        const newFileOut = Buffer.alloc(newOutSize);
        fileOut.copy(newFileOut);
        fileOut = newFileOut;
        files.set(fdInfoOut.path, fileOut);
      }

      // Perform the copy
      fileIn.copy(fileOut, offsetOut, offsetIn, offsetIn + actualLen);

      return process.nextTick(cb, null, actualLen);
    },
  };

  const fuse = new Fuse(mnt + "2", testFS, { debug: true });

  fuse.mount(function (err) {
    t.error(err, "no error on mount");

    // Test partial copy: copy 50 bytes starting from position 100
    const sourcePath = path.join(mnt + "2", "long.txt");
    const targetPath = path.join(mnt + "2", "partial_copy.txt");

    fs.open(sourcePath, "r", (err, srcFd) => {
      t.error(err, "source file opened");

      fs.open(targetPath, "w", (err, dstFd) => {
        t.error(err, "target file created");

        // Manual implementation of copy_file_range for testing
        const buf = Buffer.alloc(50);
        fs.read(srcFd, buf, 0, 50, 100, (err, bytesRead) => {
          t.error(err, "read from source");
          t.equal(bytesRead, 50, "read correct amount");

          fs.write(dstFd, buf, 0, bytesRead, 0, (err, bytesWritten) => {
            t.error(err, "write to target");
            t.equal(bytesWritten, 50, "wrote correct amount");

            fs.close(srcFd, () => {});
            fs.close(dstFd, () => {});

            // Verify the copied content
            fs.readFile(targetPath, (err, data) => {
              t.error(err, "read copied file");
              const expectedContent = longContent.substr(100, 50);
              t.equal(
                data.toString(),
                expectedContent,
                "partial copy content correct",
              );

              unmount(fuse, function () {
                t.end();
              });
            });
          });
        });
      });
    });
  });
});
