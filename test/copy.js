const tape = require('tape')
const fs = require('fs')
const path = require('path')

const Fuse = require('../')
const createMountpoint = require('./fixtures/mnt')
const stat = require('./fixtures/stat')
const { unmount } = require('./helpers')

const mnt = createMountpoint()
const src = path.join(mnt, 'source.txt')
const dest = path.join(mnt, 'dest.txt')

tape('file copy', function (t) {
  const content = Buffer.from('hello world')
  const files = {
    '/source.txt': {
      content,
      stat: stat({ mode: 'file', size: content.length })
    }
  }

  const ops = {
    force: true,
    readdir: function (path, cb) {
      if (path === '/') return process.nextTick(cb, null, Object.keys(files).map(p => p.slice(1)))
      return process.nextTick(cb, Fuse.ENOENT)
    },
    getattr: function (path, cb) {
      if (path === '/') return process.nextTick(cb, null, stat({ mode: 'dir', size: 4096 }))
      const file = files[path]
      if (!file) return process.nextTick(cb, Fuse.ENOENT)
      return process.nextTick(cb, 0, file.stat)
    },
    open: function (path, flags, cb) {
      return process.nextTick(cb, 0, 42)
    },
    release: function (path, fd, cb) {
      return process.nextTick(cb, 0)
    },
    read: function (path, fd, buf, len, pos, cb) {
      const file = files[path]
      if (!file) return process.nextTick(cb, Fuse.ENOENT)
      const slice = file.content.slice(pos, pos + len)
      slice.copy(buf)
      return process.nextTick(cb, 0, slice.length)
    },
    create: function (path, mode, cb) {
      files[path] = {
        content: Buffer.alloc(0),
        stat: stat({ mode: 'file', size: 0 })
      }
      return process.nextTick(cb, 0, 43)
    },
    write: function (path, fd, buf, len, pos, cb) {
      const file = files[path]
      if (!file) return process.nextTick(cb, Fuse.ENOENT)
      const newContent = Buffer.concat([file.content.slice(0, pos), buf.slice(0, len), file.content.slice(pos + len)])
      file.content = newContent
      file.stat.size = newContent.length
      return process.nextTick(cb, 0, len)
    },
    truncate: function (path, size, cb) {
      const file = files[path]
      if (!file) return process.nextTick(cb, Fuse.ENOENT)
      file.content = file.content.slice(0, size)
      file.stat.size = size
      return process.nextTick(cb, 0)
    },
    lseek: function (path, off, whence, fd, cb) {
      return process.nextTick(cb, 0, off)
    },
    copy_file_range: function (path, fd, offsetIn, pathOut, fdOut, offsetOut, len, flags, cb) {
      return process.nextTick(cb, 0, 0)
    }
  }

  const fuse = new Fuse(mnt, ops, { debug: true })
  fuse.mount(function (err) {
    t.error(err, 'no error')

    fs.copyFile(src, dest, function (err) {
      t.error(err, 'no error on copyFile')
      const destContent = fs.readFileSync(dest)
      t.same(destContent, content, 'destination file has correct content')
      unmount(fuse, function () {
        t.end()
      })
    })
  })
})
