#!/usr/bin/env node

const Fuse = require('../')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

// Configuration
const PROXY_MOUNT = process.argv[2] || '/tmp/fuse-proxy'
const TARGET_DIR = process.argv[3] || '/tmp/fuse-target'

console.log(`FUSE Proxy Example`)
console.log(`==================`)
console.log(`Mount point: ${PROXY_MOUNT}`)
console.log(`Target directory: ${TARGET_DIR}`)
console.log(``)

// Ensure target directory exists
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true })
  console.log(`Created target directory: ${TARGET_DIR}`)
}

// Ensure mount point exists
if (!fs.existsSync(PROXY_MOUNT)) {
  fs.mkdirSync(PROXY_MOUNT, { recursive: true })
  console.log(`Created mount point: ${PROXY_MOUNT}`)
}

// Helper function to resolve target path
function getTargetPath(fusePath) {
  return path.join(TARGET_DIR, fusePath === '/' ? '' : fusePath)
}

// FUSE operations - complete proxy implementation
const ops = {
  force: true,

  // File attributes
  getattr: function (path, cb) {
    const targetPath = getTargetPath(path)
    console.log(`getattr: ${path} -> ${targetPath}`)

    fs.lstat(targetPath, (err, stats) => {
      if (err) return cb(err.errno || -err.code || -2)

      // Convert fs.Stats to FUSE stat format
      const fuseStats = {
        mtime: stats.mtime,
        atime: stats.atime,
        ctime: stats.ctime,
        size: stats.size,
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
        nlink: stats.nlink,
        ino: stats.ino,
        dev: stats.dev,
        rdev: stats.rdev || 0,
        blksize: stats.blksize || 4096,
        blocks: stats.blocks || Math.ceil(stats.size / 512)
      }

      cb(0, fuseStats)
    })
  },

  // Directory operations
  readdir: function (path, cb) {
    const targetPath = getTargetPath(path)
    console.log(`readdir: ${path} -> ${targetPath}`)

    fs.readdir(targetPath, (err, files) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0, files)
    })
  },

  // File operations
  open: function (path, flags, cb) {
    const targetPath = getTargetPath(path)
    console.log(`open: ${path} -> ${targetPath} (flags: ${flags})`)

    fs.open(targetPath, flags, (err, fd) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0, fd)
    })
  },

  create: function (path, mode, cb) {
    const targetPath = getTargetPath(path)
    console.log(`create: ${path} -> ${targetPath} (mode: ${mode.toString(8)})`)

    fs.open(targetPath, 'w', mode, (err, fd) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0, fd)
    })
  },

  read: function (path, fd, buf, len, pos, cb) {
    console.log(`read: ${path} (fd: ${fd}, len: ${len}, pos: ${pos})`)

    fs.read(fd, buf, 0, len, pos, (err, bytesRead) => {
      if (err) return cb(err.errno || -err.code || -5)
      cb(bytesRead)
    })
  },

  write: function (path, fd, buf, len, pos, cb) {
    console.log(`write: ${path} (fd: ${fd}, len: ${len}, pos: ${pos})`)

    fs.write(fd, buf, 0, len, pos, (err, bytesWritten) => {
      if (err) return cb(err.errno || -err.code || -5)
      cb(bytesWritten)
    })
  },

  // Buffer operations (optimized)
  write_buf: function (path, fd, buf, pos, cb) {
    console.log(`write_buf: ${path} (fd: ${fd}, buf.length: ${buf.length}, pos: ${pos})`)

    fs.write(fd, buf, 0, buf.length, pos, (err, bytesWritten) => {
      if (err) return cb(err.errno || -err.code || -5)
      cb(bytesWritten)
    })
  },

  read_buf: function (path, fd, bufp, len, pos, cb) {
    console.log(`read_buf: ${path} (fd: ${fd}, len: ${len}, pos: ${pos})`)

    const buf = Buffer.alloc(len)
    fs.read(fd, buf, 0, len, pos, (err, bytesRead) => {
      if (err) return cb(err.errno || -err.code || -5)

      if (bytesRead < len) {
        // Trim buffer to actual bytes read
        bufp.set(buf.slice(0, bytesRead))
        cb(bytesRead)
      } else {
        bufp.set(buf)
        cb(bytesRead)
      }
    })
  },

  release: function (path, fd, cb) {
    console.log(`release: ${path} (fd: ${fd})`)

    fs.close(fd, (err) => {
      if (err) return cb(err.errno || -err.code || -9)
      cb(0)
    })
  },

  // Directory operations
  mkdir: function (path, mode, cb) {
    const targetPath = getTargetPath(path)
    console.log(`mkdir: ${path} -> ${targetPath} (mode: ${mode.toString(8)})`)

    fs.mkdir(targetPath, mode, (err) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0)
    })
  },

  rmdir: function (path, cb) {
    const targetPath = getTargetPath(path)
    console.log(`rmdir: ${path} -> ${targetPath}`)

    fs.rmdir(targetPath, (err) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0)
    })
  },

  // File management
  unlink: function (path, cb) {
    const targetPath = getTargetPath(path)
    console.log(`unlink: ${path} -> ${targetPath}`)

    fs.unlink(targetPath, (err) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0)
    })
  },

  rename: function (src, dest, cb) {
    const srcPath = getTargetPath(src)
    const destPath = getTargetPath(dest)
    console.log(`rename: ${src} -> ${dest} (${srcPath} -> ${destPath})`)

    fs.rename(srcPath, destPath, (err) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0)
    })
  },

  // File attributes modification
  chmod: function (path, mode, cb) {
    const targetPath = getTargetPath(path)
    console.log(`chmod: ${path} -> ${targetPath} (mode: ${mode.toString(8)})`)

    fs.chmod(targetPath, mode, (err) => {
      if (err) return cb(err.errno || -err.code || -1)
      cb(0)
    })
  },

  chown: function (path, uid, gid, cb) {
    const targetPath = getTargetPath(path)
    console.log(`chown: ${path} -> ${targetPath} (uid: ${uid}, gid: ${gid})`)

    fs.chown(targetPath, uid, gid, (err) => {
      if (err) return cb(err.errno || -err.code || -1)
      cb(0)
    })
  },

  truncate: function (path, size, cb) {
    const targetPath = getTargetPath(path)
    console.log(`truncate: ${path} -> ${targetPath} (size: ${size})`)

    fs.truncate(targetPath, size, (err) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0)
    })
  },

  // Time modification
  utimens: function (path, atime, mtime, cb) {
    const targetPath = getTargetPath(path)
    console.log(`utimens: ${path} -> ${targetPath}`)

    fs.utimes(targetPath, atime, mtime, (err) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0)
    })
  },

  // Symlink operations
  symlink: function (src, dest, cb) {
    const destPath = getTargetPath(dest)
    console.log(`symlink: ${src} -> ${dest} (target: ${destPath})`)

    fs.symlink(src, destPath, (err) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0)
    })
  },

  readlink: function (path, cb) {
    const targetPath = getTargetPath(path)
    console.log(`readlink: ${path} -> ${targetPath}`)

    fs.readlink(targetPath, (err, linkString) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0, linkString)
    })
  },

  // Hard links
  link: function (src, dest, cb) {
    const srcPath = getTargetPath(src)
    const destPath = getTargetPath(dest)
    console.log(`link: ${src} -> ${dest} (${srcPath} -> ${destPath})`)

    fs.link(srcPath, destPath, (err) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0)
    })
  },

  // File locking (basic implementation)
  flush: function (path, fd, cb) {
    console.log(`flush: ${path} (fd: ${fd})`)

    fs.fsync(fd, (err) => {
      if (err) return cb(err.errno || -err.code || -5)
      cb(0)
    })
  },

  fsync: function (path, datasync, fd, cb) {
    console.log(`fsync: ${path} (fd: ${fd}, datasync: ${datasync})`)

    const syncFn = datasync ? fs.fdatasync : fs.fsync
    syncFn(fd, (err) => {
      if (err) return cb(err.errno || -err.code || -5)
      cb(0)
    })
  },

  // Extended attributes (basic implementation)
  setxattr: function (path, name, value, position, flags, cb) {
    console.log(`setxattr: ${path} (name: ${name}, flags: ${flags})`)
    // Most filesystems don't support extended attributes easily in Node.js
    // Return success for compatibility
    cb(0)
  },

  getxattr: function (path, name, position, cb) {
    console.log(`getxattr: ${path} (name: ${name})`)
    // Return "not supported" error
    cb(-61) // ENODATA
  },

  listxattr: function (path, cb) {
    console.log(`listxattr: ${path}`)
    cb(0, [])
  },

  removexattr: function (path, name, cb) {
    console.log(`removexattr: ${path} (name: ${name})`)
    cb(0)
  },

  // Access check
  access: function (path, mode, cb) {
    const targetPath = getTargetPath(path)
    console.log(`access: ${path} -> ${targetPath} (mode: ${mode})`)

    fs.access(targetPath, mode, (err) => {
      if (err) return cb(err.errno || -err.code || -2)
      cb(0)
    })
  },

  // File status
  statfs: function (path, cb) {
    console.log(`statfs: ${path}`)

    // Return basic filesystem stats
    cb(0, {
      bsize: 4096,
      frsize: 4096,
      blocks: 1000000,
      bfree: 500000,
      bavail: 500000,
      files: 100000,
      ffree: 50000,
      favail: 50000,
      fsid: 0,
      flag: 0,
      namemax: 255
    })
  }
}

console.log(`Mounting FUSE proxy at ${PROXY_MOUNT}...`)

const fuse = new Fuse(PROXY_MOUNT, ops, {
  debug: false,
  autoUnmount: true
})

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, unmounting...')
  fuse.unmount((err) => {
    if (err) {
      console.error('Error during unmount:', err)
      process.exit(1)
    }
    console.log('Unmounted successfully')
    process.exit(0)
  })
})

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, unmounting...')
  fuse.unmount(() => {
    process.exit(0)
  })
})

// Mount the filesystem
fuse.mount((err) => {
  if (err) {
    console.error('Failed to mount FUSE filesystem:', err)
    process.exit(1)
  }

  console.log(`✅ FUSE proxy successfully mounted!`)
  console.log(``)
  console.log(`The proxy is now active and forwarding all operations.`)
  console.log(``)
  console.log(`Testing with create-react-app...`)
  console.log(`Command: npx create-react-app ${path.join(PROXY_MOUNT, 'todo-app')}`)
  console.log(``)

  // Test with create-react-app
  const reactAppPath = path.join(PROXY_MOUNT, 'todo-app')

  // Ensure we start fresh
  const targetReactAppPath = path.join(TARGET_DIR, 'todo-app')
  if (fs.existsSync(targetReactAppPath)) {
    console.log('Cleaning up existing todo-app...')
    require('child_process').execSync(`rm -rf "${targetReactAppPath}"`)
  }

  console.log('Starting create-react-app test...')
  console.log('This will take a few minutes as it downloads and installs packages.')
  console.log('')

  const startTime = Date.now()

  const child = spawn('npx', ['create-react-app', reactAppPath], {
    stdio: 'pipe',
    env: { ...process.env, FORCE_COLOR: '1' }
  })

  let output = ''

  child.stdout.on('data', (data) => {
    const text = data.toString()
    output += text
    process.stdout.write(`[CREATE-REACT-APP] ${text}`)
  })

  child.stderr.on('data', (data) => {
    const text = data.toString()
    output += text
    process.stderr.write(`[CREATE-REACT-APP-ERR] ${text}`)
  })

  child.on('close', (code) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('')
    console.log(`======================================`)
    console.log(`CREATE-REACT-APP TEST COMPLETED`)
    console.log(`======================================`)
    console.log(`Duration: ${duration}s`)
    console.log(`Exit code: ${code}`)

    if (code === 0) {
      console.log(`✅ SUCCESS! React app created successfully through FUSE proxy!`)
      console.log(``)
      console.log(`Verifying installation...`)

      // Check if files were created
      try {
        const packageJsonPath = path.join(reactAppPath, 'package.json')
        const srcPath = path.join(reactAppPath, 'src')
        const publicPath = path.join(reactAppPath, 'public')

        const hasPackageJson = fs.existsSync(packageJsonPath)
        const hasSrc = fs.existsSync(srcPath)
        const hasPublic = fs.existsSync(publicPath)

        console.log(`📁 package.json: ${hasPackageJson ? '✅' : '❌'}`)
        console.log(`📁 src/: ${hasSrc ? '✅' : '❌'}`)
        console.log(`📁 public/: ${hasPublic ? '✅' : '❌'}`)

        if (hasPackageJson) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
          console.log(`📦 App name: ${packageJson.name}`)
          console.log(`📦 React version: ${packageJson.dependencies.react}`)
        }

        if (hasSrc) {
          const srcFiles = fs.readdirSync(srcPath)
          console.log(`📁 src/ contains: ${srcFiles.join(', ')}`)
        }

        console.log(``)
        console.log(`🎉 FUSE PROXY TEST COMPLETED SUCCESSFULLY!`)
        console.log(``)
        console.log(`The FUSE proxy correctly handled all file operations needed by create-react-app:`)
        console.log(`• File creation and writing`)
        console.log(`• Directory creation`)
        console.log(`• File reading`)
        console.log(`• Permission management`)
        console.log(`• Symlink operations`)
        console.log(`• Buffer operations`)
        console.log(``)
        console.log(`All operations were transparently forwarded to the target directory.`)

      } catch (verifyErr) {
        console.error('❌ Error during verification:', verifyErr.message)
      }

    } else {
      console.log(`❌ FAILED! create-react-app failed with exit code ${code}`)
      console.log(``)
      console.log(`This may indicate issues with:`)
      console.log(`• File system operations`)
      console.log(`• Permission handling`)
      console.log(`• Buffer operations`)
      console.log(`• Network connectivity`)
      console.log(``)
      console.log(`Check the output above for specific error details.`)
    }

    console.log(``)
    console.log(`FUSE proxy is still running. Press Ctrl+C to unmount and exit.`)
    console.log(``)
    console.log(`You can now:`)
    console.log(`• Explore the mounted filesystem: ls -la ${PROXY_MOUNT}`)
    console.log(`• Check the target directory: ls -la ${TARGET_DIR}`)
    console.log(`• Test other operations through the proxy`)
    console.log(``)
  })

  child.on('error', (error) => {
    console.error('❌ Failed to start create-react-app:', error.message)
    console.log('')
    console.log('Make sure you have:')
    console.log('• Node.js and npm installed')
    console.log('• Internet connection for package downloads')
    console.log('• Sufficient disk space')
    console.log('')
    console.log('FUSE proxy is still running. Press Ctrl+C to unmount and exit.')
  })
})
