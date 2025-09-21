const fs = require('fs')
const tape = require('tape')
const Fuse = require('../')
const { unmount } = require('./helpers')
const createMountpoint = require('./fixtures/mnt')

const mnt = createMountpoint()

tape('destroy', function (t) {
  let destroyed = false
  const ops = {
    destroy: function (cb) {
      destroyed = true
      cb(0)
    }
  }

  const fuse = new Fuse(mnt, ops, { force: true })
  fuse.mount(function (err) {
    t.error(err, 'no error')
    unmount(fuse, function () {
      t.ok(destroyed, 'destroy was called')
      t.end()
    })
  })
})

tape('copy_file_range', function (t) {
  const HELLO = Buffer.from('hello world')
  const a = Buffer.alloc(HELLO.length)
  const b = Buffer.alloc(HELLO.length)

  const ops = {
    readdir: function (path, cb) {
      if (path === '/') return cb(0, ['a.txt', 'b.txt'])
      return cb(0)
    },
    getattr: function (path, cb) {
      if (path === '/') return cb(0, { mode: 16877, size: 4096 })
      if (path === '/a.txt' || path === '/b.txt') return cb(0, { mode: 33188, size: HELLO.length })
      return cb(Fuse.ENOENT)
    },
    open: function (path, flags, cb) {
      return cb(0, 42)
    },
    create: function (path, mode, cb) {
      return cb(0, 42)
    },
    flush: function (path, fd, cb) {
      return cb(0)
    },
    release: function (path, fd, cb) {
      return cb(0)
    },
    read: function (path, fd, buf, len, pos, cb) {
      const data = path === '/a.txt' ? a : b
      const slice = data.slice(pos, pos + len)
      slice.copy(buf)
      return cb(slice.length)
    },
    write: function (path, fd, buf, len, pos, cb) {
      const data = path === '/a.txt' ? a : b
      const slice = buf.slice(0, len)
      slice.copy(data, pos)
      return cb(len)
    },
    copy_file_range: function (pathIn, fdIn, offIn, pathOut, fdOut, offOut, len, flags, cb) {
      const from = pathIn === '/a.txt' ? a : b
      const to = pathOut === '/a.txt' ? a : b
      const slice = from.slice(offIn, offIn + len)
      slice.copy(to, offOut)
      cb(0, slice.length)
    }
  }

  const fuse = new Fuse(mnt, ops, { force: true, debug: false })
  fuse.mount(function (err) {
    t.error(err, 'no error')

    fs.writeFile(mnt + '/a.txt', HELLO, function (err) {
      t.error(err, 'no error')
      fs.copyFile(mnt + '/a.txt', mnt + '/b.txt', function (err) {
        t.error(err, 'no error')
        fs.readFile(mnt + '/b.txt', function (err, data) {
          t.error(err, 'no error')
          t.same(data, HELLO, 'copied content is the same')
          unmount(fuse, function () {
            t.end()
          })
        })
      })
    })
  })
})
