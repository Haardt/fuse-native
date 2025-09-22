const tape = require('tape')
const Fuse = require('../')

tape('write_buf signature validation', function (t) {
  const fuse = new Fuse('/tmp/test', {})

  // Mock the write_buf operation to capture the signature
  let capturedArgs = null
  fuse.ops.write_buf = function(...args) {
    capturedArgs = args
    // Call the callback with success
    const cb = args[args.length - 1]
    if (typeof cb === 'function') {
      process.nextTick(cb, 0)
    }
  }

  // Create a mock signal function
  const mockSignal = function(err) {
    t.equal(typeof err, 'number', 'signal should receive error code')
  }

  // Test the _op_write_buf method directly
  fuse._op_write_buf(mockSignal, '/test/path', Buffer.from('test data'), 0, 0, 42)

  // Verify the signature
  t.ok(capturedArgs, 'write_buf should have been called')
  t.equal(capturedArgs.length, 5, 'write_buf should receive 5 arguments')
  t.equal(capturedArgs[0], '/test/path', 'first argument should be path')
  t.equal(capturedArgs[1], 42, 'second argument should be file descriptor')
  t.ok(Buffer.isBuffer(capturedArgs[2]), 'third argument should be buffer')
  t.equal(capturedArgs[3], 0, 'fourth argument should be offset')
  t.equal(typeof capturedArgs[4], 'function', 'fifth argument should be callback')

  t.end()
})

tape('read_buf signature validation', function (t) {
  const fuse = new Fuse('/tmp/test', {})

  // Mock the read_buf operation to capture the signature
  let capturedArgs = null
  fuse.ops.read_buf = function(...args) {
    capturedArgs = args
    // Call the callback with success
    const cb = args[args.length - 1]
    if (typeof cb === 'function') {
      process.nextTick(cb, 0)
    }
  }

  // Create a mock signal function
  const mockSignal = function(err) {
    t.equal(typeof err, 'number', 'signal should receive error code')
  }

  // Test the _op_read_buf method directly
  const mockBufp = Buffer.alloc(1024)
  fuse._op_read_buf(mockSignal, '/test/path', mockBufp, 1024, 0, 0, 42)

  // Verify the signature
  t.ok(capturedArgs, 'read_buf should have been called')
  t.equal(capturedArgs.length, 6, 'read_buf should receive 6 arguments')
  t.equal(capturedArgs[0], '/test/path', 'first argument should be path')
  t.equal(capturedArgs[1], 42, 'second argument should be file descriptor')
  t.same(capturedArgs[2], mockBufp, 'third argument should be buffer pointer')
  t.equal(capturedArgs[3], 1024, 'fourth argument should be length')
  t.equal(capturedArgs[4], 0, 'fifth argument should be offset')
  t.equal(typeof capturedArgs[5], 'function', 'sixth argument should be callback')

  t.end()
})

tape('write_buf callback validation', function (t) {
  const fuse = new Fuse('/tmp/test', {})

  // Mock write_buf that calls callback with different signatures
  fuse.ops.write_buf = function(path, fd, buf, offset, cb) {
    t.equal(typeof cb, 'function', 'callback should be a function')
    t.equal(path, '/test/path', 'path should be correct')
    t.equal(fd, 42, 'fd should be correct')
    t.ok(Buffer.isBuffer(buf), 'buf should be a buffer')
    t.equal(offset, 100, 'offset should be correct')

    // Call with success
    process.nextTick(cb, 0)
  }

  const mockSignal = function(err) {
    t.equal(err, 0, 'should signal success')
    t.end()
  }

  fuse._op_write_buf(mockSignal, '/test/path', Buffer.from('test'), 100, 0, 42)
})

tape('read_buf callback validation', function (t) {
  const fuse = new Fuse('/tmp/test', {})

  // Mock read_buf that calls callback with different signatures
  fuse.ops.read_buf = function(path, fd, bufp, len, offset, cb) {
    t.equal(typeof cb, 'function', 'callback should be a function')
    t.equal(path, '/test/path', 'path should be correct')
    t.equal(fd, 42, 'fd should be correct')
    t.ok(Buffer.isBuffer(bufp), 'bufp should be a buffer')
    t.equal(len, 1024, 'len should be correct')
    t.equal(offset, 100, 'offset should be correct')

    // Call with success
    process.nextTick(cb, 0)
  }

  const mockSignal = function(err) {
    t.equal(err, 0, 'should signal success')
    t.end()
  }

  const mockBufp = Buffer.alloc(1024)
  fuse._op_read_buf(mockSignal, '/test/path', mockBufp, 1024, 100, 0, 42)
})

tape('write_buf error handling', function (t) {
  const fuse = new Fuse('/tmp/test', {})

  fuse.ops.write_buf = function(path, fd, buf, offset, cb) {
    // Simulate an I/O error
    process.nextTick(cb, Fuse.EIO)
  }

  const mockSignal = function(err) {
    t.equal(err, Fuse.EIO, 'should signal EIO error')
    t.end()
  }

  fuse._op_write_buf(mockSignal, '/test/path', Buffer.from('test'), 0, 0, 42)
})

tape('read_buf error handling', function (t) {
  const fuse = new Fuse('/tmp/test', {})

  fuse.ops.read_buf = function(path, fd, bufp, len, offset, cb) {
    // Simulate an I/O error
    process.nextTick(cb, Fuse.EIO)
  }

  const mockSignal = function(err) {
    t.equal(err, Fuse.EIO, 'should signal EIO error')
    t.end()
  }

  const mockBufp = Buffer.alloc(1024)
  fuse._op_read_buf(mockSignal, '/test/path', mockBufp, 1024, 0, 0, 42)
})
