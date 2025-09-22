const tape = require('tape')
const Fuse = require('../')

// This test specifically validates the fix for the TypeError: cb is not a function issue
// that occurred in the write_buf and read_buf operations

tape('write_buf callback function validation', function (t) {
  const fuse = new Fuse('/tmp/test-mount', {})

  // Track if write_buf was called with correct parameters
  let writeCallbackReceived = false
  let writeCallbackIsFunction = false
  let writeCorrectParameterOrder = false

  fuse.ops.write_buf = function(path, fd, buf, offset, cb) {
    writeCallbackReceived = true
    writeCallbackIsFunction = (typeof cb === 'function')

    // Validate parameter order matches expected signature: path, fd, buf, offset, callback
    writeCorrectParameterOrder = (
      typeof path === 'string' &&
      typeof fd === 'number' &&
      Buffer.isBuffer(buf) &&
      typeof offset === 'number' &&
      typeof cb === 'function'
    )

    // This should not throw "TypeError: cb is not a function"
    try {
      process.nextTick(cb, 0) // Success
    } catch (err) {
      t.fail('write_buf callback invocation failed: ' + err.message)
    }
  }

  // Mock signal function
  const mockSignal = (err) => {
    t.equal(err, 0, 'write_buf should signal success')
    t.ok(writeCallbackReceived, 'write_buf should have been called')
    t.ok(writeCallbackIsFunction, 'callback parameter should be a function')
    t.ok(writeCorrectParameterOrder, 'parameters should be in correct order')
    t.end()
  }

  // Test the internal _op_write_buf method directly with the correct signature
  // This simulates what the native FUSE layer calls
  fuse._op_write_buf(mockSignal, '/test/file', Buffer.from('test data'), 0, 0, 42)
})

tape('read_buf callback function validation', function (t) {
  const fuse = new Fuse('/tmp/test-mount', {})

  // Track if read_buf was called with correct parameters
  let readCallbackReceived = false
  let readCallbackIsFunction = false
  let readCorrectParameterOrder = false

  fuse.ops.read_buf = function(path, fd, bufp, len, offset, cb) {
    readCallbackReceived = true
    readCallbackIsFunction = (typeof cb === 'function')

    // Validate parameter order matches expected signature: path, fd, bufp, len, offset, callback
    readCorrectParameterOrder = (
      typeof path === 'string' &&
      typeof fd === 'number' &&
      Buffer.isBuffer(bufp) &&
      typeof len === 'number' &&
      typeof offset === 'number' &&
      typeof cb === 'function'
    )

    // This should not throw "TypeError: cb is not a function"
    try {
      process.nextTick(cb, len) // Return bytes read
    } catch (err) {
      t.fail('read_buf callback invocation failed: ' + err.message)
    }
  }

  // Mock signal function
  const mockSignal = (err) => {
    t.equal(err, 1024, 'read_buf should signal bytes read')
    t.ok(readCallbackReceived, 'read_buf should have been called')
    t.ok(readCallbackIsFunction, 'callback parameter should be a function')
    t.ok(readCorrectParameterOrder, 'parameters should be in correct order')
    t.end()
  }

  // Test the internal _op_read_buf method directly with the correct signature
  const mockBuffer = Buffer.alloc(1024)
  fuse._op_read_buf(mockSignal, '/test/file', mockBuffer, 1024, 0, 0, 42)
})

tape('write_buf undefined callback handling', function (t) {
  const fuse = new Fuse('/tmp/test-mount', {})

  // Test case where ops.write_buf is not defined (should not crash)
  delete fuse.ops.write_buf

  const mockSignal = (err) => {
    // Should get an error code indicating operation not implemented
    t.equal(typeof err, 'number', 'should receive numeric error code')
    t.notEqual(err, 0, 'should not be success when operation not implemented')
    t.end()
  }

  // This should not throw "TypeError: cb is not a function"
  try {
    fuse._op_write_buf(mockSignal, '/test/file', Buffer.from('test'), 0, 0, 42)
  } catch (err) {
    t.fail('_op_write_buf should not throw when operation not implemented: ' + err.message)
  }
})

tape('read_buf undefined callback handling', function (t) {
  const fuse = new Fuse('/tmp/test-mount', {})

  // Test case where ops.read_buf is not defined (should not crash)
  delete fuse.ops.read_buf

  const mockSignal = (err) => {
    // Should get an error code indicating operation not implemented
    t.equal(typeof err, 'number', 'should receive numeric error code')
    t.notEqual(err, 0, 'should not be success when operation not implemented')
    t.end()
  }

  // This should not throw "TypeError: cb is not a function"
  try {
    const mockBuffer = Buffer.alloc(1024)
    fuse._op_read_buf(mockSignal, '/test/file', mockBuffer, 1024, 0, 0, 42)
  } catch (err) {
    t.fail('_op_read_buf should not throw when operation not implemented: ' + err.message)
  }
})

tape('write_buf parameter count validation', function (t) {
  const fuse = new Fuse('/tmp/test-mount', {})

  // Test the exact error scenario described in the original issue
  fuse.ops.write_buf = function() {
    // Capture actual arguments received
    const args = Array.from(arguments)

    // The fix ensures the callback is always the last argument
    const callback = args[args.length - 1]

    t.equal(typeof callback, 'function', 'last argument should always be the callback function')
    t.equal(args.length, 5, 'write_buf should receive exactly 5 arguments')

    // Verify we can call the callback without "TypeError: cb is not a function"
    callback(0)
  }

  const mockSignal = (err) => {
    t.equal(err, 0, 'should receive success')
    t.end()
  }

  fuse._op_write_buf(mockSignal, '/path', Buffer.from('data'), 0, 0, 123)
})

tape('read_buf parameter count validation', function (t) {
  const fuse = new Fuse('/tmp/test-mount', {})

  fuse.ops.read_buf = function() {
    // Capture actual arguments received
    const args = Array.from(arguments)

    // The fix ensures the callback is always the last argument
    const callback = args[args.length - 1]

    t.equal(typeof callback, 'function', 'last argument should always be the callback function')
    t.equal(args.length, 6, 'read_buf should receive exactly 6 arguments')

    // Verify we can call the callback without "TypeError: cb is not a function"
    callback(0)
  }

  const mockSignal = (err) => {
    t.equal(err, 0, 'should receive success')
    t.end()
  }

  const buf = Buffer.alloc(1024)
  fuse._op_read_buf(mockSignal, '/path', buf, 1024, 0, 0, 123)
})
