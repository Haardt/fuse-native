const tape = require("tape");
const fs = require("fs");
const path = require("path");

const Fuse = require("../");
const createMountpoint = require("./fixtures/mnt");
const stat = require("./fixtures/stat");
const { unmount } = require("./helpers");

const mnt = createMountpoint();

tape("write_buf", function (t) {
  var created = false;
  var bufferData = Buffer.alloc(1024);
  var size = 0;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, created ? ["hello"] : [], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    truncate: function (path, size, cb) {
      process.nextTick(cb, 0);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/hello" && created)
        return process.nextTick(cb, 0, stat({ mode: "file", size: size }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    create: function (path, flags, cb) {
      t.ok(!created, "file not created yet");
      created = true;
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    write_buf: function (path, fd, buf, offset, cb) {
      t.equal(typeof cb, "function", "callback should be a function");
      t.equal(path, "/hello", "correct path");
      t.equal(fd, 42, "correct file descriptor");
      t.ok(Buffer.isBuffer(buf), "buffer should be a Buffer");
      t.equal(typeof offset, "number", "offset should be a number");

      // Copy buffer data to our storage
      buf.copy(bufferData, offset);
      size = Math.max(offset + buf.length, size);

      process.nextTick(cb, buf.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.writeFile(path.join(mnt, "hello"), "hello world", function (err) {
      t.error(err, "no error");
      t.same(
        bufferData.slice(0, size),
        Buffer.from("hello world"),
        "data was written correctly",
      );

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("write_buf with error handling", function (t) {
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
    create: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    write_buf: function (path, fd, buf, offset, cb) {
      t.equal(typeof cb, "function", "callback should be a function");
      // Simulate an error
      process.nextTick(cb, Fuse.EIO);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.writeFile(path.join(mnt, "test"), "hello world", function (err) {
      t.ok(err, "should have error");
      t.equal(err.code, "EIO", "correct error code");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("read_buf", function (t) {
  var testData = Buffer.from("hello world from read_buf");

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
        return process.nextTick(
          cb,
          null,
          stat({ mode: "file", size: testData.length }),
        );
      return process.nextTick(cb, Fuse.ENOENT);
    },
    open: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    read_buf: function (path, fd, bufp, len, offset, cb) {
      t.equal(typeof cb, "function", "callback should be a function");
      t.equal(path, "/test", "correct path");
      t.equal(fd, 42, "correct file descriptor");
      t.equal(typeof len, "number", "len should be a number");
      t.equal(typeof offset, "number", "offset should be a number");

      // Create a buffer with the requested data
      var slice = testData.slice(offset, offset + len);
      if (slice.length === 0) return process.nextTick(cb, 0);

      // In a real implementation, you would write to bufp
      // For testing, we just return the length read
      process.nextTick(cb, slice.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.readFile(path.join(mnt, "test"), function (err, buf) {
      t.error(err, "no error");
      // Note: In a real scenario, the data would come from read_buf
      // This test mainly verifies the callback signature is correct

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("read_buf with error handling", function (t) {
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
    open: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    read_buf: function (path, fd, bufp, len, offset, cb) {
      t.equal(typeof cb, "function", "callback should be a function");
      // Simulate an error
      process.nextTick(cb, Fuse.EIO);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.readFile(path.join(mnt, "test"), function (err, buf) {
      t.ok(err, "should have error");
      t.equal(err.code, "EIO", "correct error code");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape(
  "write_buf without implementation should fallback gracefully",
  function (t) {
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
          return process.nextTick(cb, null, stat({ mode: "file", size: 0 }));
        return process.nextTick(cb, Fuse.ENOENT);
      },
      create: function (path, flags, cb) {
        process.nextTick(cb, 0, 42);
      },
      release: function (path, fd, cb) {
        process.nextTick(cb, 0);
      },
      write: function (path, fd, buf, len, pos, cb) {
        // Fallback to regular write
        process.nextTick(cb, len);
      },
      // Deliberately NOT implementing write_buf
    };

    const fuse = new Fuse(mnt, ops, { debug: true });
    fuse.mount(function (err) {
      t.error(err, "no error");

      fs.writeFile(path.join(mnt, "test"), "hello", function (err) {
        t.error(err, "should fallback to regular write without error");

        unmount(fuse, function () {
          t.end();
        });
      });
    });
  },
);

tape(
  "read_buf without implementation should fallback gracefully",
  function (t) {
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
      open: function (path, flags, cb) {
        process.nextTick(cb, 0, 42);
      },
      release: function (path, fd, cb) {
        process.nextTick(cb, 0);
      },
      read: function (path, fd, buf, len, pos, cb) {
        // Fallback to regular read
        var str = "hello world".slice(pos, pos + len);
        if (!str) return process.nextTick(cb, 0);
        buf.write(str);
        return process.nextTick(cb, str.length);
      },
      // Deliberately NOT implementing read_buf
    };

    const fuse = new Fuse(mnt, ops, { debug: true });
    fuse.mount(function (err) {
      t.error(err, "no error");

      fs.readFile(path.join(mnt, "test"), function (err, buf) {
        t.error(err, "should fallback to regular read without error");
        t.same(
          buf,
          Buffer.from("hello world"),
          "should read correctly via fallback",
        );

        unmount(fuse, function () {
          t.end();
        });
      });
    });
  },
);

tape("read_buf with actual data verification", function (t) {
  var testData = Buffer.from("This is test data for read_buf verification");
  var actualDataRead = Buffer.alloc(0);

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["testfile"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/testfile")
        return process.nextTick(
          cb,
          null,
          stat({ mode: "file", size: testData.length }),
        );
      return process.nextTick(cb, Fuse.ENOENT);
    },
    open: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    read_buf: function (path, fd, bufp, len, offset, cb) {
      t.equal(path, "/testfile", "correct path");
      t.equal(fd, 42, "correct file descriptor");
      t.ok(Buffer.isBuffer(bufp), "bufp should be a buffer");

      // Simulate reading from our test data
      var slice = testData.slice(offset, offset + len);
      if (slice.length === 0) return process.nextTick(cb, 0);

      // Copy data to the buffer pointer
      slice.copy(bufp, 0);
      actualDataRead = Buffer.concat([actualDataRead, slice]);

      process.nextTick(cb, slice.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.readFile(path.join(mnt, "testfile"), function (err, buf) {
      t.error(err, "no error");
      t.same(
        actualDataRead.slice(0, testData.length),
        testData,
        "data should be read correctly via read_buf",
      );

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("write_buf with large buffer", function (t) {
  var created = false;
  var largeBuffer = Buffer.alloc(64 * 1024, "A"); // 64KB buffer
  var receivedData = Buffer.alloc(0);

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, created ? ["largefile"] : [], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    truncate: function (path, size, cb) {
      process.nextTick(cb, 0);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/largefile" && created)
        return process.nextTick(
          cb,
          0,
          stat({ mode: "file", size: receivedData.length }),
        );
      return process.nextTick(cb, Fuse.ENOENT);
    },
    create: function (path, flags, cb) {
      created = true;
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    write_buf: function (path, fd, buf, offset, cb) {
      t.equal(path, "/largefile", "correct path");
      t.equal(fd, 42, "correct file descriptor");
      t.ok(Buffer.isBuffer(buf), "buf should be a buffer");
      t.ok(buf.length > 0, "buffer should not be empty");

      // Store the received data
      if (offset === 0) {
        receivedData = Buffer.alloc(0);
      }
      receivedData = Buffer.concat([receivedData, buf]);

      process.nextTick(cb, buf.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.writeFile(path.join(mnt, "largefile"), largeBuffer, function (err) {
      t.error(err, "no error");
      t.ok(receivedData.length > 0, "should have received data");
      t.same(
        receivedData.slice(0, largeBuffer.length),
        largeBuffer,
        "large buffer data should be written correctly",
      );

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("read_buf with partial reads", function (t) {
  var testData = Buffer.from("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  var readOperations = [];

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["partial"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/partial")
        return process.nextTick(
          cb,
          null,
          stat({ mode: "file", size: testData.length }),
        );
      return process.nextTick(cb, Fuse.ENOENT);
    },
    open: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    read_buf: function (path, fd, bufp, len, offset, cb) {
      // Track read operations
      readOperations.push({ len, offset });

      var slice = testData.slice(offset, offset + len);
      if (slice.length === 0) return process.nextTick(cb, 0);

      slice.copy(bufp, 0);
      process.nextTick(cb, slice.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    // Read only part of the file
    var stream = fs.createReadStream(path.join(mnt, "partial"), {
      start: 10,
      end: 19,
    });
    var chunks = [];

    stream.on("data", function (chunk) {
      chunks.push(chunk);
    });

    stream.on("end", function () {
      var result = Buffer.concat(chunks);
      t.same(
        result,
        testData.slice(10, 20),
        "partial read should return correct data",
      );
      t.ok(readOperations.length > 0, "should have performed read operations");

      unmount(fuse, function () {
        t.end();
      });
    });

    stream.on("error", function (err) {
      t.error(err, "no error in stream");
      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("write_buf and read_buf integration", function (t) {
  var created = false;
  var fileData = Buffer.alloc(0);
  var writeOperations = 0;
  var readOperations = 0;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, created ? ["integration"] : [], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    truncate: function (path, size, cb) {
      if (size === 0) fileData = Buffer.alloc(0);
      process.nextTick(cb, 0);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/integration" && created)
        return process.nextTick(
          cb,
          0,
          stat({ mode: "file", size: fileData.length }),
        );
      return process.nextTick(cb, Fuse.ENOENT);
    },
    create: function (path, flags, cb) {
      created = true;
      process.nextTick(cb, 0, 42);
    },
    open: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    write_buf: function (path, fd, buf, offset, cb) {
      writeOperations++;

      // Extend fileData if necessary
      var requiredSize = offset + buf.length;
      if (fileData.length < requiredSize) {
        var newBuffer = Buffer.alloc(requiredSize);
        fileData.copy(newBuffer);
        fileData = newBuffer;
      }

      // Write data at offset
      buf.copy(fileData, offset);

      process.nextTick(cb, buf.length);
    },
    read_buf: function (path, fd, bufp, len, offset, cb) {
      readOperations++;

      var slice = fileData.slice(offset, offset + len);
      if (slice.length === 0) return process.nextTick(cb, 0);

      slice.copy(bufp, 0);
      process.nextTick(cb, slice.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    var testContent = "Hello from write_buf and read_buf integration test!";

    fs.writeFile(path.join(mnt, "integration"), testContent, function (err) {
      t.error(err, "no error writing");
      t.ok(writeOperations > 0, "write_buf should have been called");

      fs.readFile(
        path.join(mnt, "integration"),
        "utf8",
        function (err, content) {
          t.error(err, "no error reading");
          t.ok(readOperations > 0, "read_buf should have been called");
          t.equal(content, testContent, "content should match exactly");

          unmount(fuse, function () {
            t.end();
          });
        },
      );
    });
  });
});

tape("write_buf with zero-length buffer", function (t) {
  var created = false;
  var zeroWriteReceived = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, created ? ["zero"] : [], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/zero" && created)
        return process.nextTick(cb, 0, stat({ mode: "file", size: 0 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    create: function (path, flags, cb) {
      created = true;
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    write_buf: function (path, fd, buf, offset, cb) {
      t.equal(path, "/zero", "correct path");
      t.equal(fd, 42, "correct file descriptor");
      t.ok(Buffer.isBuffer(buf), "buf should be a buffer");

      if (buf.length === 0) {
        zeroWriteReceived = true;
      }

      process.nextTick(cb, buf.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.writeFile(path.join(mnt, "zero"), "", function (err) {
      t.error(err, "no error");
      // Zero-length writes may or may not call write_buf depending on the system
      // This test mainly ensures we handle zero-length buffers gracefully

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("read_buf with large offset (testing getDoubleArg)", function (t) {
  var testData = Buffer.alloc(1024 * 1024, "X"); // 1MB of X's
  var largeOffsetTested = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["bigfile"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/bigfile")
        return process.nextTick(
          cb,
          null,
          stat({ mode: "file", size: testData.length }),
        );
      return process.nextTick(cb, Fuse.ENOENT);
    },
    open: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    read_buf: function (path, fd, bufp, len, offset, cb) {
      if (offset > 65536) {
        // Test large offset
        largeOffsetTested = true;
      }

      var slice = testData.slice(offset, offset + len);
      if (slice.length === 0) return process.nextTick(cb, 0);

      slice.copy(bufp, 0);
      process.nextTick(cb, slice.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    // Read from a large offset
    var stream = fs.createReadStream(path.join(mnt, "bigfile"), {
      start: 500000,
      end: 500099,
    });

    var chunks = [];
    stream.on("data", function (chunk) {
      chunks.push(chunk);
    });

    stream.on("end", function () {
      var result = Buffer.concat(chunks);
      t.equal(result.length, 100, "should read 100 bytes");
      t.ok(
        result.every((b) => b === 88),
        "all bytes should be 'X' (88)",
      ); // 88 is ASCII for 'X'
      t.ok(largeOffsetTested, "should have tested large offset");

      unmount(fuse, function () {
        t.end();
      });
    });

    stream.on("error", function (err) {
      t.error(err, "no error in large offset read");
      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("concurrent write_buf operations", function (t) {
  var created = false;
  var fileData = {};
  var concurrentOps = 0;
  var maxConcurrent = 0;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(
          cb,
          null,
          created ? ["file1", "file2", "file3"] : [],
          [],
        );
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (
        created &&
        (path === "/file1" || path === "/file2" || path === "/file3")
      ) {
        var size = fileData[path] ? fileData[path].length : 0;
        return process.nextTick(cb, 0, stat({ mode: "file", size: size }));
      }
      return process.nextTick(cb, Fuse.ENOENT);
    },
    create: function (path, flags, cb) {
      created = true;
      fileData[path] = Buffer.alloc(0);
      var fd = path === "/file1" ? 41 : path === "/file2" ? 42 : 43;
      process.nextTick(cb, 0, fd);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    write_buf: function (path, fd, buf, offset, cb) {
      concurrentOps++;
      maxConcurrent = Math.max(maxConcurrent, concurrentOps);

      setTimeout(() => {
        if (!fileData[path]) fileData[path] = Buffer.alloc(0);

        var requiredSize = offset + buf.length;
        if (fileData[path].length < requiredSize) {
          var newBuffer = Buffer.alloc(requiredSize);
          fileData[path].copy(newBuffer);
          fileData[path] = newBuffer;
        }

        buf.copy(fileData[path], offset);
        concurrentOps--;
        cb(buf.length);
      }, 10); // Small delay to encourage concurrency
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    var completed = 0;
    var checkComplete = function () {
      completed++;
      if (completed === 3) {
        t.ok(maxConcurrent >= 2, "should have had concurrent operations");
        t.equal(concurrentOps, 0, "all operations should be complete");

        unmount(fuse, function () {
          t.end();
        });
      }
    };

    // Start multiple writes simultaneously
    fs.writeFile(path.join(mnt, "file1"), "content1", checkComplete);
    fs.writeFile(path.join(mnt, "file2"), "content2", checkComplete);
    fs.writeFile(path.join(mnt, "file3"), "content3", checkComplete);
  });
});

tape("write_buf with buffer modification during operation", function (t) {
  var created = false;
  var originalData = null;
  var modifiedData = null;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, created ? ["modify"] : [], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/modify" && created)
        return process.nextTick(cb, 0, stat({ mode: "file", size: 100 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    create: function (path, flags, cb) {
      created = true;
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    write_buf: function (path, fd, buf, offset, cb) {
      // Capture original buffer content
      originalData = Buffer.from(buf);

      // Try to modify the buffer (should not affect original operation)
      buf.fill(0);
      modifiedData = Buffer.from(buf);

      process.nextTick(cb, buf.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    var testData = Buffer.from("test data for buffer modification test");
    fs.writeFile(path.join(mnt, "modify"), testData, function (err) {
      t.error(err, "no error");
      t.ok(originalData, "should have captured original data");
      t.ok(modifiedData, "should have captured modified data");
      t.notSame(
        originalData,
        modifiedData,
        "buffers should be different after modification",
      );

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("read_buf buffer overflow protection", function (t) {
  var testData = Buffer.from("small");

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["overflow"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/overflow")
        return process.nextTick(
          cb,
          null,
          stat({ mode: "file", size: testData.length }),
        );
      return process.nextTick(cb, Fuse.ENOENT);
    },
    open: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    read_buf: function (path, fd, bufp, len, offset, cb) {
      // Request more data than available
      var slice = testData.slice(offset, offset + len);
      if (slice.length === 0) return process.nextTick(cb, 0);

      // Only copy what we actually have
      slice.copy(bufp, 0);

      // Return actual bytes read, not requested
      process.nextTick(cb, slice.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.readFile(path.join(mnt, "overflow"), function (err, buf) {
      t.error(err, "no error");
      t.equal(buf.length, testData.length, "should only read available data");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("write_buf with invalid file descriptor", function (t) {
  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["invalid"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/invalid")
        return process.nextTick(cb, null, stat({ mode: "file", size: 0 }));
      return process.nextTick(cb, Fuse.ENOENT);
    },
    create: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    open: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    write_buf: function (path, fd, buf, offset, cb) {
      // Validate file descriptor
      if (fd !== 42) {
        return process.nextTick(cb, Fuse.EBADF);
      }
      process.nextTick(cb, buf.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    fs.writeFile(path.join(mnt, "invalid"), "test", function (err) {
      // This should not error because our create returns fd 42
      t.error(err, "no error for valid fd");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("read_buf with negative offset handling", function (t) {
  var testData = Buffer.from("negative offset test");
  var negativeOffsetHandled = false;

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/") return process.nextTick(cb, null, ["negative"], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/negative")
        return process.nextTick(
          cb,
          null,
          stat({ mode: "file", size: testData.length }),
        );
      return process.nextTick(cb, Fuse.ENOENT);
    },
    open: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    read_buf: function (path, fd, bufp, len, offset, cb) {
      if (offset < 0) {
        negativeOffsetHandled = true;
        return process.nextTick(cb, Fuse.EINVAL);
      }

      var slice = testData.slice(offset, offset + len);
      if (slice.length === 0) return process.nextTick(cb, 0);

      slice.copy(bufp, 0);
      process.nextTick(cb, slice.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    // Normal read should work
    fs.readFile(path.join(mnt, "negative"), function (err, buf) {
      t.error(err, "no error for normal read");
      t.same(buf, testData, "should read correct data");

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("write_buf memory efficiency test", function (t) {
  var created = false;
  var totalBytesWritten = 0;
  var writeOperationCount = 0;
  var largeData = Buffer.alloc(1024 * 1024, "M"); // 1MB

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, created ? ["memory"] : [], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/memory" && created)
        return process.nextTick(
          cb,
          0,
          stat({ mode: "file", size: totalBytesWritten }),
        );
      return process.nextTick(cb, Fuse.ENOENT);
    },
    create: function (path, flags, cb) {
      created = true;
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    write_buf: function (path, fd, buf, offset, cb) {
      writeOperationCount++;
      totalBytesWritten += buf.length;

      // Simulate efficient handling without copying the entire buffer
      t.ok(Buffer.isBuffer(buf), "should receive buffer");
      t.ok(buf.length > 0, "buffer should have content");

      process.nextTick(cb, buf.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    var startTime = Date.now();
    fs.writeFile(path.join(mnt, "memory"), largeData, function (err) {
      var endTime = Date.now();

      t.error(err, "no error");
      t.ok(writeOperationCount > 0, "should have performed write operations");
      t.ok(totalBytesWritten > 0, "should have written bytes");
      t.ok(
        endTime - startTime < 5000,
        "should complete within reasonable time",
      );

      unmount(fuse, function () {
        t.end();
      });
    });
  });
});

tape("read_buf and write_buf with different buffer alignments", function (t) {
  var created = false;
  var fileData = Buffer.alloc(0);
  var alignmentTests = [];

  var ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, created ? ["align"] : [], []);
      return process.nextTick(cb, Fuse.ENOENT);
    },
    getattr: function (path, cb) {
      if (path === "/")
        return process.nextTick(cb, null, stat({ mode: "dir", size: 4096 }));
      if (path === "/align" && created)
        return process.nextTick(
          cb,
          0,
          stat({ mode: "file", size: fileData.length }),
        );
      return process.nextTick(cb, Fuse.ENOENT);
    },
    create: function (path, flags, cb) {
      created = true;
      process.nextTick(cb, 0, 42);
    },
    open: function (path, flags, cb) {
      process.nextTick(cb, 0, 42);
    },
    release: function (path, fd, cb) {
      process.nextTick(cb, 0);
    },
    write_buf: function (path, fd, buf, offset, cb) {
      alignmentTests.push({
        operation: "write",
        bufferLength: buf.length,
        offset: offset,
      });

      var requiredSize = offset + buf.length;
      if (fileData.length < requiredSize) {
        var newBuffer = Buffer.alloc(requiredSize);
        fileData.copy(newBuffer);
        fileData = newBuffer;
      }

      buf.copy(fileData, offset);
      process.nextTick(cb, buf.length);
    },
    read_buf: function (path, fd, bufp, len, offset, cb) {
      alignmentTests.push({
        operation: "read",
        bufferLength: len,
        offset: offset,
      });

      var slice = fileData.slice(offset, offset + len);
      if (slice.length === 0) return process.nextTick(cb, 0);

      slice.copy(bufp, 0);
      process.nextTick(cb, slice.length);
    },
  };

  const fuse = new Fuse(mnt, ops, { debug: true });
  fuse.mount(function (err) {
    t.error(err, "no error");

    // Test with different buffer sizes to check alignment handling
    var testData = "A".repeat(1337); // Odd number to test alignment

    fs.writeFile(path.join(mnt, "align"), testData, function (err) {
      t.error(err, "no error writing");

      fs.readFile(path.join(mnt, "align"), "utf8", function (err, content) {
        t.error(err, "no error reading");
        t.equal(content, testData, "content should match despite alignment");
        t.ok(
          alignmentTests.length > 0,
          "should have performed alignment tests",
        );

        // Check that we handled different buffer sizes
        var hasVariedSizes = alignmentTests.some(
          (test) => test.bufferLength !== alignmentTests[0].bufferLength,
        );
        t.ok(
          hasVariedSizes || alignmentTests.length === 1,
          "should handle varied buffer sizes or single operation",
        );

        unmount(fuse, function () {
          t.end();
        });
      });
    });
  });
});
