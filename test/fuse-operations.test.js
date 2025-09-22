/**
 * Comprehensive FUSE Operations Test Suite
 *
 * Tests all FUSE operations using the in-memory filesystem.
 * Based on AGENTS.md callback conventions:
 * - Success callbacks: cb(0, result) or cb(positiveNumber) for read/write
 * - Error callbacks: cb(negativeNumber)
 */

const MemoryFileSystem = require("./memory-fs");

describe("FUSE Operations Test Suite", () => {
  let fs;

  beforeEach(() => {
    fs = new MemoryFileSystem();
  });

  describe("Core Operations", () => {
    describe("init", () => {
      test("should initialize successfully", (done) => {
        fs.init((err) => {
          expect(err).toBe(0);
          done();
        });
      });
    });

    describe("error", () => {
      test("should handle error operation", (done) => {
        fs.error((err) => {
          expect(err).toBe(0);
          done();
        });
      });
    });

    describe("access", () => {
      test("should allow access to existing file with correct permissions", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.access("/test.txt", 4, (err) => {
          // R_OK
          expect(err).toBe(0);
          done();
        });
      });

      test("should deny access to non-existent file", (done) => {
        fs.access("/nonexistent.txt", 4, (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });

      test("should deny write access to read-only file", (done) => {
        fs._createNode("/readonly.txt", "file", 0o444);
        fs.access("/readonly.txt", 2, (err) => {
          // W_OK
          expect(err).toBe(-13); // EACCES
          done();
        });
      });

      test("should deny execute access to non-executable file", (done) => {
        fs._createNode("/noexec.txt", "file", 0o644);
        fs.access("/noexec.txt", 1, (err) => {
          // X_OK
          expect(err).toBe(-13); // EACCES
          done();
        });
      });
    });

    describe("statfs", () => {
      test("should return filesystem statistics", (done) => {
        fs.statfs("/", (err, stats) => {
          expect(err).toBe(0);
          expect(stats).toHaveProperty("blocks");
          expect(stats).toHaveProperty("bavail");
          expect(stats).toHaveProperty("bfree");
          expect(stats).toHaveProperty("files");
          expect(stats).toHaveProperty("ffree");
          expect(stats.blocks).toBe(1000);
          done();
        });
      });
    });
  });

  describe("File Metadata Operations", () => {
    describe("getattr", () => {
      test("should get attributes of existing file", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.getattr("/test.txt", (err, stats) => {
          expect(err).toBe(0);
          expect(stats).toHaveProperty("mode");
          expect(stats).toHaveProperty("uid");
          expect(stats).toHaveProperty("gid");
          expect(stats).toHaveProperty("size");
          expect(stats).toHaveProperty("atime");
          expect(stats).toHaveProperty("mtime");
          expect(stats).toHaveProperty("ctime");
          expect(stats.size).toBe(0);
          done();
        });
      });

      test("should return error for non-existent file", (done) => {
        fs.getattr("/nonexistent.txt", (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });

      test("should get attributes of directory", (done) => {
        fs._createNode("/testdir", "directory", 0o755);
        fs.getattr("/testdir", (err, stats) => {
          expect(err).toBe(0);
          expect(stats.mode & 0o40000).toBe(0o40000); // Directory flag
          done();
        });
      });
    });

    describe("fgetattr", () => {
      test("should get attributes by file descriptor", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.open("/test.txt", 2, (err, fd) => {
          expect(err).toBe(0);
          fs.fgetattr(fd, (err2, stats) => {
            expect(err2).toBe(0);
            expect(stats).toHaveProperty("mode");
            expect(stats).toHaveProperty("size");
            done();
          });
        });
      });

      test("should return error for invalid file descriptor", (done) => {
        fs.fgetattr(999, (err) => {
          expect(err).toBe(-9); // EBADF
          done();
        });
      });
    });

    describe("utimens", () => {
      test("should update file timestamps", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        const newTime = Math.floor(Date.now() / 1000);
        fs.utimens("/test.txt", newTime, newTime, (err) => {
          expect(err).toBe(0);
          const node = fs._getNode("/test.txt");
          expect(Math.floor(node.atime.getTime() / 1000)).toBe(newTime);
          expect(Math.floor(node.mtime.getTime() / 1000)).toBe(newTime);
          done();
        });
      });

      test("should return error for non-existent file", (done) => {
        const newTime = Math.floor(Date.now() / 1000);
        fs.utimens("/nonexistent.txt", newTime, newTime, (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });
    });

    describe("chmod", () => {
      test("should change file permissions", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.chmod("/test.txt", 0o755, (err) => {
          expect(err).toBe(0);
          const node = fs._getNode("/test.txt");
          expect(node.mode).toBe(0o755);
          done();
        });
      });

      test("should return error for non-existent file", (done) => {
        fs.chmod("/nonexistent.txt", 0o755, (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });
    });

    describe("chown", () => {
      test("should change file ownership", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.chown("/test.txt", 1001, 1001, (err) => {
          expect(err).toBe(0);
          const node = fs._getNode("/test.txt");
          expect(node.uid).toBe(1001);
          expect(node.gid).toBe(1001);
          done();
        });
      });

      test("should return error for non-existent file", (done) => {
        fs.chown("/nonexistent.txt", 1001, 1001, (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });
    });
  });

  describe("File I/O Operations", () => {
    describe("open and release", () => {
      test("should open and release file successfully", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.open("/test.txt", 2, (err, fd) => {
          expect(err).toBe(0);
          expect(typeof fd).toBe("number");
          expect(fd).toBeGreaterThan(0);

          fs.release(fd, (err2) => {
            expect(err2).toBe(0);
            done();
          });
        });
      });

      test("should return error when opening non-existent file", (done) => {
        fs.open("/nonexistent.txt", 2, (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });

      test("should return error when opening directory as file", (done) => {
        fs._createNode("/testdir", "directory", 0o755);
        fs.open("/testdir", 2, (err) => {
          expect(err).toBe(-21); // EISDIR
          done();
        });
      });

      test("should return error when releasing invalid fd", (done) => {
        fs.release(999, (err) => {
          expect(err).toBe(-9); // EBADF
          done();
        });
      });
    });

    describe("create", () => {
      test("should create new file and return file descriptor", (done) => {
        fs.create("/newfile.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          expect(typeof fd).toBe("number");
          expect(fd).toBeGreaterThan(0);
          expect(fs._pathExists("/newfile.txt")).toBe(true);
          done();
        });
      });

      test("should return error when creating existing file", (done) => {
        fs._createNode("/existing.txt", "file", 0o644);
        fs.create("/existing.txt", 0o644, (err) => {
          expect(err).toBe(-17); // EEXIST
          done();
        });
      });

      test("should return error when parent directory does not exist", (done) => {
        fs.create("/nonexistent/file.txt", 0o644, (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });
    });

    describe("read and write", () => {
      test("should write and read data correctly", (done) => {
        const testData = Buffer.from("Hello, World!");
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);

          fs.write(fd, testData, testData.length, 0, (bytesWritten) => {
            expect(bytesWritten).toBe(testData.length);

            const readBuffer = Buffer.alloc(testData.length);
            fs.read(fd, readBuffer, testData.length, 0, (bytesRead) => {
              expect(bytesRead).toBe(testData.length);
              expect(readBuffer.toString()).toBe("Hello, World!");
              done();
            });
          });
        });
      });

      test("should handle partial reads", (done) => {
        const testData = Buffer.from("Hello, World!");
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);

          fs.write(fd, testData, testData.length, 0, (bytesWritten) => {
            expect(bytesWritten).toBe(testData.length);

            const readBuffer = Buffer.alloc(5);
            fs.read(fd, readBuffer, 5, 0, (bytesRead) => {
              expect(bytesRead).toBe(5);
              expect(readBuffer.toString()).toBe("Hello");
              done();
            });
          });
        });
      });

      test("should return error for invalid file descriptor", (done) => {
        const testData = Buffer.from("test");
        fs.write(999, testData, testData.length, 0, (result) => {
          expect(result).toBe(-9); // EBADF
          done();
        });
      });

      test("should handle read at EOF", (done) => {
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);

          const readBuffer = Buffer.alloc(10);
          fs.read(fd, readBuffer, 10, 100, (bytesRead) => {
            expect(bytesRead).toBe(0); // No bytes read at EOF
            done();
          });
        });
      });
    });

    describe("flush and fsync", () => {
      test("should flush file successfully", (done) => {
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.flush(fd, (err2) => {
            expect(err2).toBe(0);
            done();
          });
        });
      });

      test("should fsync file successfully", (done) => {
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.fsync(fd, false, (err2) => {
            expect(err2).toBe(0);
            done();
          });
        });
      });

      test("should return error for invalid file descriptor", (done) => {
        fs.flush(999, (err) => {
          expect(err).toBe(-9); // EBADF
          done();
        });
      });
    });

    describe("truncate and ftruncate", () => {
      test("should truncate file to specified size", (done) => {
        const testData = Buffer.from("Hello, World!");
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.write(fd, testData, testData.length, 0, (bytesWritten) => {
            expect(bytesWritten).toBe(testData.length);

            fs.truncate("/test.txt", 5, (err2) => {
              expect(err2).toBe(0);

              const readBuffer = Buffer.alloc(10);
              fs.read(fd, readBuffer, 10, 0, (bytesRead) => {
                expect(bytesRead).toBe(5);
                expect(readBuffer.slice(0, 5).toString()).toBe("Hello");
                done();
              });
            });
          });
        });
      });

      test("should ftruncate file using file descriptor", (done) => {
        const testData = Buffer.from("Hello, World!");
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.write(fd, testData, testData.length, 0, (bytesWritten) => {
            expect(bytesWritten).toBe(testData.length);

            fs.ftruncate(fd, 5, (err2) => {
              expect(err2).toBe(0);

              const readBuffer = Buffer.alloc(10);
              fs.read(fd, readBuffer, 10, 0, (bytesRead) => {
                expect(bytesRead).toBe(5);
                expect(readBuffer.slice(0, 5).toString()).toBe("Hello");
                done();
              });
            });
          });
        });
      });

      test("should return error when truncating non-existent file", (done) => {
        fs.truncate("/nonexistent.txt", 5, (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });

      test("should return error when truncating directory", (done) => {
        fs._createNode("/testdir", "directory", 0o755);
        fs.truncate("/testdir", 5, (err) => {
          expect(err).toBe(-21); // EISDIR
          done();
        });
      });
    });
  });

  describe("Directory Operations", () => {
    describe("opendir and releasedir", () => {
      test("should open and release directory successfully", (done) => {
        fs._createNode("/testdir", "directory", 0o755);
        fs.opendir("/testdir", 0, (err, fd) => {
          expect(err).toBe(0);
          expect(typeof fd).toBe("number");
          expect(fd).toBeGreaterThan(0);

          fs.releasedir(fd, (err2) => {
            expect(err2).toBe(0);
            done();
          });
        });
      });

      test("should return error when opening non-existent directory", (done) => {
        fs.opendir("/nonexistent", 0, (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });

      test("should return error when opening file as directory", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.opendir("/test.txt", 0, (err) => {
          expect(err).toBe(-20); // ENOTDIR
          done();
        });
      });
    });

    describe("readdir", () => {
      test("should read directory contents", (done) => {
        fs._createNode("/testdir", "directory", 0o755);
        fs._createNode("/testdir/file1.txt", "file", 0o644);
        fs._createNode("/testdir/file2.txt", "file", 0o644);
        fs._createNode("/testdir/subdir", "directory", 0o755);

        fs.readdir("/testdir", (err, entries) => {
          expect(err).toBe(0);
          expect(Array.isArray(entries)).toBe(true);
          expect(entries).toContain(".");
          expect(entries).toContain("..");
          expect(entries).toContain("file1.txt");
          expect(entries).toContain("file2.txt");
          expect(entries).toContain("subdir");
          done();
        });
      });

      test("should return error when reading non-existent directory", (done) => {
        fs.readdir("/nonexistent", (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });

      test("should return error when reading file as directory", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.readdir("/test.txt", (err) => {
          expect(err).toBe(-20); // ENOTDIR
          done();
        });
      });
    });

    describe("fsyncdir", () => {
      test("should fsync directory successfully", (done) => {
        fs._createNode("/testdir", "directory", 0o755);
        fs.opendir("/testdir", 0, (err, fd) => {
          expect(err).toBe(0);
          fs.fsyncdir(fd, false, (err2) => {
            expect(err2).toBe(0);
            done();
          });
        });
      });

      test("should return error for invalid directory descriptor", (done) => {
        fs.fsyncdir(999, false, (err) => {
          expect(err).toBe(-9); // EBADF
          done();
        });
      });
    });

    describe("mkdir", () => {
      test("should create directory successfully", (done) => {
        fs.mkdir("/newdir", 0o755, (err) => {
          expect(err).toBe(0);
          expect(fs._pathExists("/newdir")).toBe(true);
          const node = fs._getNode("/newdir");
          expect(node.type).toBe("directory");
          expect(node.mode).toBe(0o755);
          done();
        });
      });

      test("should return error when creating existing directory", (done) => {
        fs._createNode("/existingdir", "directory", 0o755);
        fs.mkdir("/existingdir", 0o755, (err) => {
          expect(err).toBe(-17); // EEXIST
          done();
        });
      });

      test("should return error when parent directory does not exist", (done) => {
        fs.mkdir("/nonexistent/newdir", 0o755, (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });
    });

    describe("rmdir", () => {
      test("should remove empty directory successfully", (done) => {
        fs._createNode("/emptydir", "directory", 0o755);
        fs.rmdir("/emptydir", (err) => {
          expect(err).toBe(0);
          expect(fs._pathExists("/emptydir")).toBe(false);
          done();
        });
      });

      test("should return error when removing non-empty directory", (done) => {
        fs._createNode("/nonemptydir", "directory", 0o755);
        fs._createNode("/nonemptydir/file.txt", "file", 0o644);
        fs.rmdir("/nonemptydir", (err) => {
          expect(err).toBe(-39); // ENOTEMPTY
          done();
        });
      });

      test("should return error when removing non-existent directory", (done) => {
        fs.rmdir("/nonexistent", (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });

      test("should return error when removing file as directory", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.rmdir("/test.txt", (err) => {
          expect(err).toBe(-20); // ENOTDIR
          done();
        });
      });
    });
  });

  describe("File Management Operations", () => {
    describe("unlink", () => {
      test("should unlink file successfully", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.unlink("/test.txt", (err) => {
          expect(err).toBe(0);
          expect(fs._pathExists("/test.txt")).toBe(false);
          done();
        });
      });

      test("should return error when unlinking non-existent file", (done) => {
        fs.unlink("/nonexistent.txt", (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });

      test("should return error when unlinking directory", (done) => {
        fs._createNode("/testdir", "directory", 0o755);
        fs.unlink("/testdir", (err) => {
          expect(err).toBe(-21); // EISDIR
          done();
        });
      });
    });

    describe("rename", () => {
      test("should rename file successfully", (done) => {
        fs._createNode("/oldname.txt", "file", 0o644);
        fs.rename("/oldname.txt", "/newname.txt", (err) => {
          expect(err).toBe(0);
          expect(fs._pathExists("/oldname.txt")).toBe(false);
          expect(fs._pathExists("/newname.txt")).toBe(true);
          done();
        });
      });

      test("should return error when renaming non-existent file", (done) => {
        fs.rename("/nonexistent.txt", "/newname.txt", (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });
    });

    describe("link", () => {
      test("should create hard link successfully", (done) => {
        fs._createNode("/original.txt", "file", 0o644);
        fs.link("/original.txt", "/linked.txt", (err) => {
          expect(err).toBe(0);
          expect(fs._pathExists("/original.txt")).toBe(true);
          expect(fs._pathExists("/linked.txt")).toBe(true);

          const originalNode = fs._getNode("/original.txt");
          const linkedNode = fs._getNode("/linked.txt");
          expect(originalNode.nlink).toBe(2);
          expect(linkedNode.nlink).toBe(2);
          done();
        });
      });

      test("should return error when linking non-existent file", (done) => {
        fs.link("/nonexistent.txt", "/linked.txt", (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });

      test("should return error when destination already exists", (done) => {
        fs._createNode("/original.txt", "file", 0o644);
        fs._createNode("/existing.txt", "file", 0o644);
        fs.link("/original.txt", "/existing.txt", (err) => {
          expect(err).toBe(-17); // EEXIST
          done();
        });
      });
    });

    describe("symlink and readlink", () => {
      test("should create and read symbolic link successfully", (done) => {
        fs.symlink("/target/file.txt", "/link.txt", (err) => {
          expect(err).toBe(0);
          expect(fs._pathExists("/link.txt")).toBe(true);

          const node = fs._getNode("/link.txt");
          expect(node.type).toBe("symlink");

          fs.readlink("/link.txt", (err2, target) => {
            expect(err2).toBe(0);
            expect(target).toBe("/target/file.txt");
            done();
          });
        });
      });

      test("should return error when reading non-symlink", (done) => {
        fs._createNode("/regular.txt", "file", 0o644);
        fs.readlink("/regular.txt", (err) => {
          expect(err).toBe(-22); // EINVAL
          done();
        });
      });

      test("should return error when creating symlink at existing path", (done) => {
        fs._createNode("/existing.txt", "file", 0o644);
        fs.symlink("/target", "/existing.txt", (err) => {
          expect(err).toBe(-17); // EEXIST
          done();
        });
      });
    });

    describe("mknod", () => {
      test("should create special file successfully", (done) => {
        fs.mknod("/special", 0o100644, 0, (err) => {
          expect(err).toBe(0);
          expect(fs._pathExists("/special")).toBe(true);
          done();
        });
      });

      test("should return error when creating at existing path", (done) => {
        fs._createNode("/existing.txt", "file", 0o644);
        fs.mknod("/existing.txt", 0o100644, 0, (err) => {
          expect(err).toBe(-17); // EEXIST
          done();
        });
      });

      test("should return error when parent directory does not exist", (done) => {
        fs.mknod("/nonexistent/special", 0o100644, 0, (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });
    });
  });

  describe("Extended Attributes Operations", () => {
    describe("setxattr and getxattr", () => {
      test("should set and get extended attribute successfully", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        const attrValue = Buffer.from("test value");

        fs.setxattr("/test.txt", "user.test", attrValue, 0, 0, (err) => {
          expect(err).toBe(0);

          fs.getxattr("/test.txt", "user.test", 0, (err2, value) => {
            expect(err2).toBe(0);
            expect(value.toString()).toBe("test value");
            done();
          });
        });
      });

      test("should return error when getting non-existent attribute", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.getxattr("/test.txt", "user.nonexistent", 0, (err) => {
          expect(err).toBe(-61); // ENODATA
          done();
        });
      });

      test("should handle XATTR_CREATE flag", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        const attrValue = Buffer.from("test value");

        fs.setxattr("/test.txt", "user.test", attrValue, 0, 1, (err) => {
          // XATTR_CREATE
          expect(err).toBe(0);

          // Try to create again - should fail
          fs.setxattr("/test.txt", "user.test", attrValue, 0, 1, (err2) => {
            expect(err2).toBe(-17); // EEXIST
            done();
          });
        });
      });

      test("should handle XATTR_REPLACE flag", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        const attrValue = Buffer.from("test value");

        // Try to replace non-existent attribute - should fail
        fs.setxattr("/test.txt", "user.test", attrValue, 0, 2, (err) => {
          // XATTR_REPLACE
          expect(err).toBe(-61); // ENODATA
          done();
        });
      });
    });

    describe("listxattr", () => {
      test("should list extended attributes", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        const attr1 = Buffer.from("value1");
        const attr2 = Buffer.from("value2");

        fs.setxattr("/test.txt", "user.attr1", attr1, 0, 0, (err) => {
          expect(err).toBe(0);
          fs.setxattr("/test.txt", "user.attr2", attr2, 0, 0, (err2) => {
            expect(err2).toBe(0);

            fs.listxattr("/test.txt", (err3, list) => {
              expect(err3).toBe(0);
              const listStr = list.toString();
              expect(listStr).toContain("user.attr1");
              expect(listStr).toContain("user.attr2");
              done();
            });
          });
        });
      });

      test("should return error for non-existent file", (done) => {
        fs.listxattr("/nonexistent.txt", (err) => {
          expect(err).toBe(-2); // ENOENT
          done();
        });
      });
    });

    describe("removexattr", () => {
      test("should remove extended attribute successfully", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        const attrValue = Buffer.from("test value");

        fs.setxattr("/test.txt", "user.test", attrValue, 0, 0, (err) => {
          expect(err).toBe(0);

          fs.removexattr("/test.txt", "user.test", (err2) => {
            expect(err2).toBe(0);

            fs.getxattr("/test.txt", "user.test", 0, (err3) => {
              expect(err3).toBe(-61); // ENODATA - attribute should be gone
              done();
            });
          });
        });
      });

      test("should return error when removing non-existent attribute", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.removexattr("/test.txt", "user.nonexistent", (err) => {
          expect(err).toBe(-61); // ENODATA
          done();
        });
      });
    });
  });

  describe("Advanced Operations", () => {
    describe("lock", () => {
      test("should handle file locking", (done) => {
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          const flock = {}; // Mock flock structure
          fs.lock(fd, 0, flock, (err2) => {
            expect(err2).toBe(0);
            done();
          });
        });
      });
    });

    describe("bmap", () => {
      test("should handle block mapping", (done) => {
        fs._createNode("/test.txt", "file", 0o644);
        fs.bmap("/test.txt", 4096, 10, (err, blockIdx) => {
          expect(err).toBe(0);
          expect(blockIdx).toBe(10);
          done();
        });
      });
    });

    describe("ioctl", () => {
      test("should handle ioctl operations", (done) => {
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          const inBuf = Buffer.alloc(100);
          const outBuf = Buffer.alloc(100);
          fs.ioctl(fd, 0x123, null, 0, inBuf, outBuf, (err2) => {
            expect(err2).toBe(-25); // ENOTTY
            done();
          });
        });
      });
    });

    describe("poll", () => {
      test("should handle poll operations", (done) => {
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.poll(fd, null, null, (err2, revents) => {
            expect(err2).toBe(0);
            expect(revents).toBe(1); // POLLIN
            done();
          });
        });
      });
    });

    describe("write_buf and read_buf", () => {
      test("should handle buffer write and read operations", (done) => {
        const testData = Buffer.from("Buffer test data");
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);

          fs.write_buf(fd, testData, testData.length, 0, (bytesWritten) => {
            expect(bytesWritten).toBe(testData.length);

            const readBuffer = Buffer.alloc(testData.length);
            fs.read_buf(fd, readBuffer, testData.length, 0, (bytesRead) => {
              expect(bytesRead).toBe(testData.length);
              expect(readBuffer.toString()).toBe("Buffer test data");
              done();
            });
          });
        });
      });
    });

    describe("flock", () => {
      test("should handle file locking with flock", (done) => {
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.flock(fd, 1, (err2) => {
            // LOCK_SH
            expect(err2).toBe(0);
            done();
          });
        });
      });
    });

    describe("fallocate", () => {
      test("should allocate space for file", (done) => {
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.fallocate(fd, 0, 0, 1024, (err2) => {
            expect(err2).toBe(0);

            // Verify file was extended
            const node = fs.fileDescriptors.get(fd);
            const fileNode = fs._getNode(node.path);
            expect(fileNode.content.length).toBeGreaterThanOrEqual(1024);
            done();
          });
        });
      });

      test("should return error for invalid file descriptor", (done) => {
        fs.fallocate(999, 0, 0, 1024, (err) => {
          expect(err).toBe(-9); // EBADF
          done();
        });
      });
    });

    describe("lseek", () => {
      test("should seek to absolute position (SEEK_SET)", (done) => {
        const testData = Buffer.from("Hello, World!");
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.write(fd, testData, testData.length, 0, (bytesWritten) => {
            expect(bytesWritten).toBe(testData.length);

            fs.lseek(fd, 7, 0, (err2, newPos) => {
              // SEEK_SET
              expect(err2).toBe(0);
              expect(newPos).toBe(7);
              done();
            });
          });
        });
      });

      test("should seek relative to current position (SEEK_CUR)", (done) => {
        const testData = Buffer.from("Hello, World!");
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.write(fd, testData, testData.length, 0, (bytesWritten) => {
            expect(bytesWritten).toBe(testData.length);

            // Set initial position
            fs.lseek(fd, 5, 0, (err2, pos1) => {
              // SEEK_SET to 5
              expect(err2).toBe(0);
              expect(pos1).toBe(5);

              // Seek relative to current position
              fs.lseek(fd, 3, 1, (err3, pos2) => {
                // SEEK_CUR +3
                expect(err3).toBe(0);
                expect(pos2).toBe(8);
                done();
              });
            });
          });
        });
      });

      test("should seek relative to end of file (SEEK_END)", (done) => {
        const testData = Buffer.from("Hello, World!");
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.write(fd, testData, testData.length, 0, (bytesWritten) => {
            expect(bytesWritten).toBe(testData.length);

            fs.lseek(fd, -5, 2, (err2, newPos) => {
              // SEEK_END -5
              expect(err2).toBe(0);
              expect(newPos).toBe(testData.length - 5);
              done();
            });
          });
        });
      });

      test("should return error for invalid whence value", (done) => {
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.lseek(fd, 0, 99, (err2) => {
            // Invalid whence
            expect(err2).toBe(-22); // EINVAL
            done();
          });
        });
      });

      test("should return error for negative position", (done) => {
        fs.create("/test.txt", 0o644, (err, fd) => {
          expect(err).toBe(0);
          fs.lseek(fd, -10, 0, (err2) => {
            // SEEK_SET to negative
            expect(err2).toBe(-22); // EINVAL
            done();
          });
        });
      });

      test("should return error for invalid file descriptor", (done) => {
        fs.lseek(999, 0, 0, (err) => {
          expect(err).toBe(-9); // EBADF
          done();
        });
      });
    });

    describe("copy_file_range", () => {
      test("should copy data between files", (done) => {
        const sourceData = Buffer.from("Source file content for copying");
        const destData = Buffer.from("Destination file content");

        fs.create("/source.txt", 0o644, (err1, sourceFd) => {
          expect(err1).toBe(0);
          fs.create("/dest.txt", 0o644, (err2, destFd) => {
            expect(err2).toBe(0);

            // Write source data
            fs.write(
              sourceFd,
              sourceData,
              sourceData.length,
              0,
              (bytesWritten) => {
                expect(bytesWritten).toBe(sourceData.length);

                // Write dest data
                fs.write(
                  destFd,
                  destData,
                  destData.length,
                  0,
                  (bytesWritten2) => {
                    expect(bytesWritten2).toBe(destData.length);

                    // Copy 10 bytes from source offset 7 to dest offset 5
                    fs.copy_file_range(
                      sourceFd,
                      7,
                      destFd,
                      5,
                      10,
                      0,
                      (err3, bytesCopied) => {
                        expect(err3).toBe(0);
                        expect(bytesCopied).toBe(10);

                        // Verify the copy worked
                        const readBuffer = Buffer.alloc(destData.length + 10);
                        fs.read(
                          destFd,
                          readBuffer,
                          readBuffer.length,
                          0,
                          (bytesRead) => {
                            const destContent = readBuffer
                              .slice(0, bytesRead)
                              .toString();
                            const expectedCopy = sourceData
                              .slice(7, 17)
                              .toString();
                            expect(destContent.substring(5, 15)).toBe(
                              expectedCopy,
                            );
                            done();
                          },
                        );
                      },
                    );
                  },
                );
              },
            );
          });
        });
      });

      test("should handle copy at end of source file", (done) => {
        const sourceData = Buffer.from("Short");

        fs.create("/source.txt", 0o644, (err1, sourceFd) => {
          expect(err1).toBe(0);
          fs.create("/dest.txt", 0o644, (err2, destFd) => {
            expect(err2).toBe(0);

            fs.write(
              sourceFd,
              sourceData,
              sourceData.length,
              0,
              (bytesWritten) => {
                expect(bytesWritten).toBe(sourceData.length);

                // Try to copy beyond end of source
                fs.copy_file_range(
                  sourceFd,
                  10,
                  destFd,
                  0,
                  10,
                  0,
                  (err3, bytesCopied) => {
                    expect(err3).toBe(0);
                    expect(bytesCopied).toBe(0); // No bytes copied
                    done();
                  },
                );
              },
            );
          });
        });
      });

      test("should return error for invalid file descriptors", (done) => {
        fs.copy_file_range(999, 0, 998, 0, 10, 0, (err) => {
          expect(err).toBe(-9); // EBADF
          done();
        });
      });
    });
  });

  describe("Integration Tests", () => {
    test("should handle complete file lifecycle", (done) => {
      const testData = Buffer.from("Complete lifecycle test data");

      // Create file
      fs.create("/lifecycle.txt", 0o644, (err1, fd) => {
        expect(err1).toBe(0);

        // Write data
        fs.write(fd, testData, testData.length, 0, (bytesWritten) => {
          expect(bytesWritten).toBe(testData.length);

          // Flush data
          fs.flush(fd, (err2) => {
            expect(err2).toBe(0);

            // Get file attributes
            fs.fgetattr(fd, (err3, stats) => {
              expect(err3).toBe(0);
              expect(stats.size).toBe(testData.length);

              // Set extended attribute
              const attrValue = Buffer.from("lifecycle attr");
              fs.setxattr(
                "/lifecycle.txt",
                "user.test",
                attrValue,
                0,
                0,
                (err4) => {
                  expect(err4).toBe(0);

                  // Read data back
                  const readBuffer = Buffer.alloc(testData.length);
                  fs.read(fd, readBuffer, testData.length, 0, (bytesRead) => {
                    expect(bytesRead).toBe(testData.length);
                    expect(readBuffer.toString()).toBe(testData.toString());

                    // Release file descriptor
                    fs.release(fd, (err5) => {
                      expect(err5).toBe(0);

                      // Verify extended attribute still exists
                      fs.getxattr(
                        "/lifecycle.txt",
                        "user.test",
                        0,
                        (err6, value) => {
                          expect(err6).toBe(0);
                          expect(value.toString()).toBe("lifecycle attr");

                          // Finally unlink the file
                          fs.unlink("/lifecycle.txt", (err7) => {
                            expect(err7).toBe(0);
                            expect(fs._pathExists("/lifecycle.txt")).toBe(
                              false,
                            );
                            done();
                          });
                        },
                      );
                    });
                  });
                },
              );
            });
          });
        });
      });
    });

    test("should handle directory operations with files", (done) => {
      // Create directory
      fs.mkdir("/testdir", 0o755, (err1) => {
        expect(err1).toBe(0);

        // Create files in directory
        fs.create("/testdir/file1.txt", 0o644, (err2, fd1) => {
          expect(err2).toBe(0);
          fs.create("/testdir/file2.txt", 0o644, (err3, fd2) => {
            expect(err3).toBe(0);

            // Write to files
            const data1 = Buffer.from("File 1 content");
            const data2 = Buffer.from("File 2 content");

            fs.write(fd1, data1, data1.length, 0, (bytes1) => {
              expect(bytes1).toBe(data1.length);
              fs.write(fd2, data2, data2.length, 0, (bytes2) => {
                expect(bytes2).toBe(data2.length);

                // Release file descriptors
                fs.release(fd1, (err4) => {
                  expect(err4).toBe(0);
                  fs.release(fd2, (err5) => {
                    expect(err5).toBe(0);

                    // Read directory
                    fs.readdir("/testdir", (err6, entries) => {
                      expect(err6).toBe(0);
                      expect(entries).toContain("file1.txt");
                      expect(entries).toContain("file2.txt");

                      // Clean up
                      fs.unlink("/testdir/file1.txt", (err7) => {
                        expect(err7).toBe(0);
                        fs.unlink("/testdir/file2.txt", (err8) => {
                          expect(err8).toBe(0);
                          fs.rmdir("/testdir", (err9) => {
                            expect(err9).toBe(0);
                            done();
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
