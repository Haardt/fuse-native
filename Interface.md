# FUSE3 Interface Documentation

Diese Datei dokumentiert die Methodensignaturen und Parameter aller FUSE3-Funktionen in der Kette:
**FUSE3 (header, c-code) → fuse-native.c → index.d.ts**

## Überblick der implementierten Funktionen

Die folgenden Funktionen sind in fuse-native implementiert:

- init, error, access, statfs, fgetattr, getattr, flush, fsync, fsyncdir
- readdir, truncate, ftruncate, utimens, readlink, chown, chmod, mknod
- setxattr, getxattr, listxattr, removexattr, open, opendir, read, write
- release, releasedir, create, unlink, rename, link, symlink, mkdir, rmdir
- lock, bmap, ioctl, poll, write_buf, read_buf, flock, fallocate, lseek, copy_file_range

---

## Function: init

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 644-645:**
```c
void *(*init) (struct fuse_conn_info *conn,
               struct fuse_config *cfg);
```

**Parameters:**
- `conn`: struct fuse_conn_info*, Connection information structure
- `cfg`: struct fuse_config*, Configuration structure

**fuse-native.c:** Implementiert als `_op_init` (Zeile 565-577)
**index.d.ts:** `init?: (cb: (err: number) => void) => void;`

---

## Function: error

**fuse-native.c:** Implementiert als `_op_error` (Zeile 579-587)
**index.d.ts:** `error?: (cb: (err: number) => void) => void;`

*Hinweis: Diese Funktion ist nicht in der FUSE3-Spezifikation, sondern eine fuse-native spezifische Erweiterung.*

---

## Function: access

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 663:**
```c
int (*access) (const char *, int);
```

**Parameters:**
- `path`: const char*, File path to check access
- `mode`: int, Access mode to check (R_OK, W_OK, X_OK, F_OK)

**fuse-native.c:** `FUSE_METHOD_VOID(access, 2, 0, ...)` (Zeile 351-357)
**index.d.ts:** `access?: (path: string, mode: number, cb: (err: number) => void) => void;`

---

## Function: statfs

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 519:**
```c
int (*statfs) (const char *, struct statvfs *);
```

**Parameters:**
- `path`: const char*, File system path
- `statvfs`: struct statvfs*, File system statistics structure

**fuse-native.c:** `FUSE_METHOD(statfs, 1, 1, ...)` (Zeile 324-332)
**index.d.ts:** `statfs?: (path: string, cb: (err: number, stats?: {...}) => void) => void;`

---

## Function: getattr

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 364:**
```c
int (*getattr) (const char *, struct stat *, struct fuse_file_info *fi);
```

**Parameters:**
- `path`: const char*, File path
- `stat`: struct stat*, File attributes structure
- `fi`: struct fuse_file_info*, File info structure (can be NULL)

**fuse-native.c:** `FUSE_METHOD(getattr, 2, 1, ...)` (Zeile 334-348)
**index.d.ts:** `getattr?: (path: string, cb: (err: number, stat?: Stats) => void) => void;`

---

## Function: fgetattr

**fuse-native.c:** Implementiert als `_op_fgetattr` (Zeile 622-644)
**index.d.ts:** `fgetattr?: (fd: number, cb: (err: number, stat?: Stats) => void) => void;`

*Hinweis: Diese Funktion verwendet die gleiche FUSE getattr-Signatur, aber mit Dateideskriptor.*

---

## Function: flush

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 549:**
```c
int (*flush) (const char *, struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, File path
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD_VOID(flush, 2, 0, ...)` (Zeile 613-623)
**index.d.ts:** `flush?: (path: string, fd: number, cb: (err: number) => void) => void;`

---

## Function: fsync

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 570:**
```c
int (*fsync) (const char *, int, struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, File path
- `datasync`: int, If non-zero, only sync user data, not metadata
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD_VOID(fsync, 3, 0, ...)` (Zeile 625-637)
**index.d.ts:** `fsync?: (path: string, dataSync: boolean, fd: number, cb: (err: number) => void) => void;`

---

## Function: fsyncdir

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 634:**
```c
int (*fsyncdir) (const char *, int, struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, Directory path
- `datasync`: int, If non-zero, only sync user data, not metadata
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD_VOID(fsyncdir, 3, 0, ...)` (Zeile 639-651)
**index.d.ts:** `fsyncdir?: (path: string, dataSync: boolean, fd: number, cb: (err: number) => void) => void;`

---

## Function: readdir

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 616-617:**
```c
int (*readdir) (const char *, void *, fuse_fill_dir_t, off_t,
                struct fuse_file_info *, enum fuse_readdir_flags);
```

**Parameters:**
- `path`: const char*, Directory path
- `buf`: void*, Buffer to fill with directory entries
- `filler`: fuse_fill_dir_t, Function to call for each directory entry
- `offset`: off_t, Offset for directory reading
- `info`: struct fuse_file_info*, File information structure
- `flags`: enum fuse_readdir_flags, Readdir flags

**fuse-native.c:** `FUSE_METHOD(readdir, 1, 2, ...)` (Zeile 481-526)
**index.d.ts:** `readdir?: (path: string, cb: (err: number, names?: string[], stats?: Stats[]) => void) => void;`

---

## Function: truncate

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 440:**
```c
int (*truncate) (const char *, off_t, struct fuse_file_info *fi);
```

**Parameters:**
- `path`: const char*, File path
- `size`: off_t, New file size
- `fi`: struct fuse_file_info*, File information structure (can be NULL)

**fuse-native.c:** `FUSE_METHOD_VOID(truncate, 4, 0, ...)` (Zeile 654-666)
**index.d.ts:** `truncate?: (path: string, size: number, cb: (err: number) => void) => void;`

---

## Function: ftruncate

**fuse-native.c:** Implementiert als `_op_ftruncate` (Zeile 866-871)
**index.d.ts:** `ftruncate?: (path: string, fd: number, size: number, cb: (err: number) => void) => void;`

*Hinweis: Verwendet dieselbe FUSE truncate-Signatur, aber mit explizitem Dateideskriptor.*

---

## Function: utimens

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 722-723:**
```c
int (*utimens) (const char *, const struct timespec tv[2],
                struct fuse_file_info *fi);
```

**Parameters:**
- `path`: const char*, File path
- `tv`: const struct timespec[2], Array with access and modification times
- `fi`: struct fuse_file_info*, File information structure (can be NULL)

**fuse-native.c:** `FUSE_METHOD_VOID(utimens, 6, 0, ...)` (Zeile 409-423)
**index.d.ts:** `utimens?: (path: string, atime: Date, mtime: Date, cb: (err: number) => void) => void;`

---

## Function: readlink

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 374:**
```c
int (*readlink) (const char *, char *, size_t);
```

**Parameters:**
- `path`: const char*, Symbolic link path
- `buf`: char*, Buffer to store link target
- `size`: size_t, Buffer size

**fuse-native.c:** `FUSE_METHOD(readlink, 1, 1, ...)` (Zeile 669-678)
**index.d.ts:** `readlink?: (path: string, cb: (err: number, linkName?: string) => void) => void;`

---

## Function: chown

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 430:**
```c
int (*chown) (const char *, uid_t, gid_t, struct fuse_file_info *fi);
```

**Parameters:**
- `path`: const char*, File path
- `uid`: uid_t, User ID
- `gid`: gid_t, Group ID
- `fi`: struct fuse_file_info*, File information structure (can be NULL)

**fuse-native.c:** `FUSE_METHOD_VOID(chown, 4, 0, ...)` (Zeile 680-694)
**index.d.ts:** `chown?: (path: string, uid: number, gid: number, cb: (err: number) => void) => void;`

---

## Function: chmod

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 420:**
```c
int (*chmod) (const char *, mode_t, struct fuse_file_info *fi);
```

**Parameters:**
- `path`: const char*, File path
- `mode`: mode_t, File permissions
- `fi`: struct fuse_file_info*, File information structure (can be NULL)

**fuse-native.c:** `FUSE_METHOD_VOID(chmod, 3, 0, ...)` (Zeile 696-708)
**index.d.ts:** `chmod?: (path: string, mode: number, cb: (err: number) => void) => void;`

---

## Function: mknod

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 382:**
```c
int (*mknod) (const char *, mode_t, dev_t);
```

**Parameters:**
- `path`: const char*, File path to create
- `mode`: mode_t, File type and permissions
- `dev`: dev_t, Device ID (for special files)

**fuse-native.c:** `FUSE_METHOD_VOID(mknod, 3, 0, ...)` (Zeile 710-718)
**index.d.ts:** `mknod?: (path: string, mode: number, dev: number, cb: (err: number) => void) => void;`

---

## Function: setxattr

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 573:**
```c
int (*setxattr) (const char *, const char *, const char *, size_t, int);
```

**Parameters:**
- `path`: const char*, File path
- `name`: const char*, Extended attribute name
- `value`: const char*, Extended attribute value
- `size`: size_t, Value size
- `flags`: int, Extended attribute flags

**fuse-native.c:** `FUSE_METHOD(setxattr, 5, 1, ...)` (Zeile 528-543 und 562-576)
**index.d.ts:** `setxattr?: (path: string, name: string, value: Buffer, size: number, flags: number, cb: (err: number) => void) => void;`

---

## Function: getxattr

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 576:**
```c
int (*getxattr) (const char *, const char *, char *, size_t);
```

**Parameters:**
- `path`: const char*, File path
- `name`: const char*, Extended attribute name
- `value`: char*, Buffer to store attribute value
- `size`: size_t, Buffer size

**fuse-native.c:** `FUSE_METHOD(getxattr, 4, 1, ...)` (Zeile 545-560 und 578-592)
**index.d.ts:** `getxattr?: (path: string, name: string, position: number, cb: (err: number, buffer?: Buffer) => void) => void;`

---

## Function: listxattr

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 579:**
```c
int (*listxattr) (const char *, char *, size_t);
```

**Parameters:**
- `path`: const char*, File path
- `list`: char*, Buffer to store attribute names
- `size`: size_t, Buffer size

**fuse-native.c:** `FUSE_METHOD(listxattr, 2, 1, ...)` (Zeile 594-603)
**index.d.ts:** `listxattr?: (path: string, cb: (err: number, list?: string[]) => void) => void;`

---

## Function: removexattr

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 582:**
```c
int (*removexattr) (const char *, const char *);
```

**Parameters:**
- `path`: const char*, File path
- `name`: const char*, Extended attribute name to remove

**fuse-native.c:** `FUSE_METHOD_VOID(removexattr, 2, 0, ...)` (Zeile 605-611)
**index.d.ts:** `removexattr?: (path: string, name: string, cb: (err: number) => void) => void;`

---

## Function: open

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 489:**
```c
int (*open) (const char *, struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, File path
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD(open, 2, 1, ...)` (Zeile 359-374)
**index.d.ts:** `open?: (path: string, flags: number, cb: (err: number, fd?: number) => void) => void;`

---

## Function: opendir

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 592:**
```c
int (*opendir) (const char *, struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, Directory path
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD(opendir, 3, 1, ...)` (Zeile 376-393)
**index.d.ts:** `opendir?: (path: string, flags: number, cb: (err: number, fd?: number) => void) => void;`

---

## Function: read

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 500-501:**
```c
int (*read) (const char *, char *, size_t, off_t,
             struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, File path
- `buf`: char*, Buffer to read data into
- `size`: size_t, Number of bytes to read
- `offset`: off_t, File offset
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD(read, 6, 1, ...)` (Zeile 449-463)
**index.d.ts:** `read?: (path: string, fd: number, buffer: Buffer, length: number, position: number, cb: (result: number) => void) => void;`

---

## Function: write

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 512-513:**
```c
int (*write) (const char *, const char *, size_t, off_t,
              struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, File path
- `buf`: const char*, Buffer containing data to write
- `size`: size_t, Number of bytes to write
- `offset`: off_t, File offset
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD(write, 6, 1, ...)` (Zeile 465-479)
**index.d.ts:** `write?: (path: string, fd: number, buffer: Buffer, length: number, position: number, cb: ((error: null, bytesWritten: number) => void) | ((errorCode: number) => void)) => void;`

---

## Function: release

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 563:**
```c
int (*release) (const char *, struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, File path
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD_VOID(release, 2, 0, ...)` (Zeile 425-435)
**index.d.ts:** `release?: (path: string, fd: number, cb: (err: number) => void) => void;`

---

## Function: releasedir

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 624:**
```c
int (*releasedir) (const char *, struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, Directory path
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD_VOID(releasedir, 2, 0, ...)` (Zeile 437-447)
**index.d.ts:** `releasedir?: (path: string, fd: number, cb: (err: number) => void) => void;`

---

## Function: create

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 675:**
```c
int (*create) (const char *, mode_t, struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, File path to create
- `mode`: mode_t, File permissions
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD(create, 2, 1, ...)` (Zeile 395-407)
**index.d.ts:** `create?: (path: string, mode: number, cb: (errorCode: number, fd?: number) => void) => void;`

---

## Function: unlink

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 393:**
```c
int (*unlink) (const char *);
```

**Parameters:**
- `path`: const char*, File path to remove

**fuse-native.c:** `FUSE_METHOD_VOID(unlink, 1, 0, ...)` (Zeile 720-724)
**index.d.ts:** `unlink?: (path: string, cb: (err: number) => void) => void;`

---

## Function: rename

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 410:**
```c
int (*rename) (const char *, const char *, unsigned int flags);
```

**Parameters:**
- `oldpath`: const char*, Old file path
- `newpath`: const char*, New file path
- `flags`: unsigned int, Rename flags (RENAME_EXCHANGE, RENAME_NOREPLACE)

**fuse-native.c:** `FUSE_METHOD_VOID(rename, 3, 0, ...)` (Zeile 726-734)
**index.d.ts:** `rename?: (src: string, dest: string, cb: (err: number) => void) => void;`

---

## Function: link

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 413:**
```c
int (*link) (const char *, const char *);
```

**Parameters:**
- `oldpath`: const char*, Existing file path
- `newpath`: const char*, New link path

**fuse-native.c:** `FUSE_METHOD_VOID(link, 2, 0, ...)` (Zeile 736-742)
**index.d.ts:** `link?: (src: string, dest: string, cb: (err: number) => void) => void;`

---

## Function: symlink

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 399:**
```c
int (*symlink) (const char *, const char *);
```

**Parameters:**
- `target`: const char*, Target path for the symbolic link
- `linkpath`: const char*, Path where symbolic link is created

**fuse-native.c:** `FUSE_METHOD_VOID(symlink, 2, 0, ...)` (Zeile 744-750)
**index.d.ts:** `symlink?: (src: string, dest: string, cb: (err: number) => void) => void;`

---

## Function: mkdir

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 390:**
```c
int (*mkdir) (const char *, mode_t);
```

**Parameters:**
- `path`: const char*, Directory path to create
- `mode`: mode_t, Directory permissions

**fuse-native.c:** `FUSE_METHOD_VOID(mkdir, 2, 0, ...)` (Zeile 752-758)
**index.d.ts:** `mkdir?: (path: string, mode: number, cb: (err: number) => void) => void;`

---

## Function: rmdir

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 396:**
```c
int (*rmdir) (const char *);
```

**Parameters:**
- `path`: const char*, Directory path to remove

**fuse-native.c:** `FUSE_METHOD_VOID(rmdir, 1, 0, ...)` (Zeile 760-764)
**index.d.ts:** `rmdir?: (path: string, cb: (err: number) => void) => void;`

---

## Function: lock

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 707-708:**
```c
int (*lock) (const char *, struct fuse_file_info *, int cmd,
             struct flock *);
```

**Parameters:**
- `path`: const char*, File path
- `info`: struct fuse_file_info*, File information structure
- `cmd`: int, Lock command (F_GETLK, F_SETLK, F_SETLKW)
- `flock`: struct flock*, Lock structure

**fuse-native.c:** `FUSE_METHOD_VOID(lock, 4, 0, ...)` (Zeile 800-814)
**index.d.ts:** `lock?: (path: string, fd: number, cmd: number, flock: Flock, cb: (err: number) => void) => void;`

---

## Function: bmap

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 731:**
```c
int (*bmap) (const char *, size_t blocksize, uint64_t *idx);
```

**Parameters:**
- `path`: const char*, File path
- `blocksize`: size_t, Block size
- `idx`: uint64_t*, Block index pointer

**fuse-native.c:** `FUSE_METHOD(bmap, 2, 2, ...)` (Zeile 816-827)
**index.d.ts:** `bmap?: (path: string, blocksize: number, cb: (err: number, idx?: number) => void) => void;`

---

## Function: ioctl

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 753-754:**
```c
int (*ioctl) (const char *, unsigned int cmd, void *arg,
              struct fuse_file_info *, unsigned int flags, void *data);
```

**Parameters:**
- `path`: const char*, File path
- `cmd`: unsigned int, ioctl command
- `arg`: void*, ioctl argument
- `info`: struct fuse_file_info*, File information structure
- `flags`: unsigned int, ioctl flags
- `data`: void*, ioctl data

**fuse-native.c:** `FUSE_METHOD_VOID(ioctl, 5, 0, ...)` (Zeile 829-847)
**index.d.ts:** `ioctl?: (path: string, cmd: number, arg: Buffer, fd: number, flags: number, data: Buffer, cb: (err: number) => void) => void;`

---

## Function: poll

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 772-773:**
```c
int (*poll) (const char *, struct fuse_file_info *,
             struct fuse_pollhandle *ph, unsigned *reventsp);
```

**Parameters:**
- `path`: const char*, File path
- `info`: struct fuse_file_info*, File information structure
- `ph`: struct fuse_pollhandle*, Poll handle
- `reventsp`: unsigned*, Returned events pointer

**fuse-native.c:** `FUSE_METHOD_VOID(poll, 3, 0, ...)` (Zeile 849-869)
**index.d.ts:** `poll?: (path: string, fd: number, ph: Buffer, reventsp: Buffer, cb: (err: number) => void) => void;`

---

## Function: write_buf

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 784-785:**
```c
int (*write_buf) (const char *, struct fuse_bufvec *buf, off_t off,
                  struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, File path
- `buf`: struct fuse_bufvec*, Buffer vector structure
- `off`: off_t, File offset
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD(write_buf, 5, 1, ...)` (Zeile 871-898)
**index.d.ts:** `write_buf?: (path: string, fd: number, buf: Buffer, offset: number, cb: ((error: null, bytesWritten: number) => void) | ((errorCode: number) => void)) => void;`

---

## Function: read_buf

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 801-802:**
```c
int (*read_buf) (const char *, struct fuse_bufvec **bufp,
                 size_t size, off_t off, struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, File path
- `bufp`: struct fuse_bufvec**, Buffer vector pointer
- `size`: size_t, Buffer size
- `off`: off_t, File offset
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD_VOID(read_buf, 6, 0, ...)` (Zeile 900-945)
**index.d.ts:** `read_buf?: (path: string, fd: number, buffer: Buffer, length: number, offset: number, cb: (result: number) => void) => void;`

---

## Function: flock

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 821:**
```c
int (*flock) (const char *, struct fuse_file_info *, int op);
```

**Parameters:**
- `path`: const char*, File path
- `info`: struct fuse_file_info*, File information structure
- `op`: int, Lock operation (LOCK_SH, LOCK_EX, LOCK_UN, LOCK_NB)

**fuse-native.c:** `FUSE_METHOD_VOID(flock, 2, 0, ...)` (Zeile 766-778)
**index.d.ts:** `flock?: (path: string, fd: number, op: number, cb: (err: number) => void) => void;`

---

## Function: fallocate

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 831-832:**
```c
int (*fallocate) (const char *, int, off_t, off_t,
                  struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, File path
- `mode`: int, Allocation mode
- `offset`: off_t, File offset
- `length`: off_t, Length to allocate
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD_VOID(fallocate, 7, 0, ...)` (Zeile 978-994)
**index.d.ts:** `fallocate?: (path: string, mode: number, offset: number, length: number, fd: number, cb: (err: number) => void) => void;`

---

## Function: lseek

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 855:**
```c
off_t (*lseek) (const char *, off_t off, int whence, struct fuse_file_info *);
```

**Parameters:**
- `path`: const char*, File path
- `off`: off_t, File offset
- `whence`: int, Seek method (SEEK_SET, SEEK_CUR, SEEK_END)
- `info`: struct fuse_file_info*, File information structure

**fuse-native.c:** `FUSE_METHOD_OFFSET(lseek, 5, 2, ...)` (Zeile 780-798)
**index.d.ts:** `lseek?: (path: string, offset: number, whence: number, fd: number, cb: (err: number, newOffset?: number) => void) => void;`

---

## Function: copy_file_range

**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 846-850:**
```c
ssize_t (*copy_file_range) (const char *path_in,
                            struct fuse_file_info *fi_in,
                            off_t offset_in, const char *path_out,
                            struct fuse_file_info *fi_out,
                            off_t offset_out, size_t size, int flags);
```

**Parameters:**
- `path_in`: const char*, Source file path
- `fi_in`: struct fuse_file_info*, Source file information structure
- `offset_in`: off_t, Source file offset
- `path_out`: const char*, Destination file path
- `fi_out`: struct fuse_file_info*, Destination file information structure
- `offset_out`: off_t, Destination file offset
- `size`: size_t, Number of bytes to copy
- `flags`: int, Copy flags

**fuse-native.c:** `FUSE_METHOD_SSIZE(copy_file_range, 10, 1, ...)` (Zeile 947-976)
**index.d.ts:** `copy_file_range?: (path: string, fd: number, offsetIn: number, pathOut: string, fdOut: number, offsetOut: number, len: number, flags: number, cb: (err: number, bytes?: number) => void) => void;`

---

## Nicht implementierte FUSE3-Funktionen

Die folgenden Funktionen sind in der FUSE3-Spezifikation definiert, aber derzeit nicht in fuse-native implementiert:

### destroy
**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 652:**
```c
void (*destroy) (void *private_data);
```
*Hinweis: Diese Funktion wird intern von fuse-native behandelt, ist aber nicht als Operation verfügbar.*

### statx (FUSE3.13+)
**Datei-Path:** ./docs/include/fuse.h
**Snippet Zeile 865-866:**
```c
int (*statx)(const char *path, int flags, int mask, struct statx *stxbuf,
             struct fuse_file_info *fi);
```
*Hinweis: Neuere FUSE3-Funktion für erweiterte Dateiattribute - noch nicht implementiert.*

---

## Wichtige Datenstrukturen

### struct fuse_file_info
**Datei-Path:** ./docs/include/fuse_common.h (Zeile 50-125)**

Wichtige Felder:
- `int32_t flags`: Open flags (O_RDONLY, O_WRONLY, O_RDWR, etc.)
- `uint64_t fh`: File handle, wird vom Dateisystem gesetzt
- `uint64_t lock_owner`: Lock owner identifier
- `uint32_t direct_io`: Enable direct I/O
- `uint32_t keep_cache`: Don't invalidate cache
- `uint32_t flush`: Flush pending writes on close
- `uint32_t nonseekable`: File is not seekable
- `uint32_t flock_release`: Release flock on close
- `uint32_t cache_readdir`: Cache readdir results

### struct fuse_conn_info
**Datei-Path:** ./docs/include/fuse_common.h (Zeile 543-713)**

Wichtige Felder:
- `uint32_t proto_major/proto_minor`: FUSE protocol version
- `uint32_t max_write/max_read`: Maximum write/read size
- `uint32_t capable/want`: Supported/requested capabilities
- `uint32_t max_background`: Maximum background requests
- `uint32_t congestion_threshold`: Congestion control threshold

### struct fuse_bufvec
**Datei-Path:** ./docs/include/fuse_common.h (Zeile 934-954)**

Wichtige Felder:
- `size_t count`: Number of buffers in vector
- `size_t idx`: Current buffer index
- `size_t off`: Current offset in buffer
- `struct fuse_buf buf[]`: Array of buffer structures

---

## Callback-Konventionen

### Standard FUSE Callback: `cb(errorCode, result)`
- **Erfolg:** `cb(0, result)` - errorCode ist 0, result ist das Ergebnis
- **Fehler:** `cb(errorCode)` - negativer Error-Code

### FUSE-Style Callbacks (nur für read/write-Operationen): `cb(result)`
- **Erfolg:** `cb(positiveNumber)` - Anzahl gelesener/geschriebener Bytes
- **Fehler:** `cb(negativeErrorCode)` - negativer Error-Code

### Betroffene Funktionen:
- `read`, `read_buf`: Verwenden FUSE-Style Callbacks
- `write`, `write_buf`: Verwenden gemischte Callbacks (erfolg: `cb(null, bytesWritten)`, fehler: `cb(errorCode)`)

---

## Mapping-Übersicht

| FUSE3 Operation | fuse-native.c | index.d.ts | Callback-Typ |
|-----------------|---------------|------------|---------------|
| init | _op_init | init | Standard |
| getattr | FUSE_METHOD(getattr) | getattr | Standard |
| readdir | FUSE_METHOD(readdir) | readdir | Standard |
| read | FUSE_METHOD(read) | read | FUSE-Style |
| write | FUSE_METHOD(write) | write | Mixed |
| open | FUSE_METHOD(open) | open | Standard |
| create | FUSE_METHOD(create) | create | Standard |
| truncate | FUSE_METHOD_VOID(truncate) | truncate | Standard |
| chmod | FUSE_METHOD_VOID(chmod) | chmod | Standard |
| chown | FUSE_METHOD_VOID(chown) | chown | Standard |
| unlink | FUSE_METHOD_VOID(unlink) | unlink | Standard |
| mkdir | FUSE_METHOD_VOID(mkdir) | mkdir | Standard |
| rmdir | FUSE_METHOD_VOID(rmdir) | rmdir | Standard |
| rename | FUSE_METHOD_VOID(rename) | rename | Standard |
| release | FUSE_METHOD_VOID(release) | release | Standard |
| flush | FUSE_METHOD_VOID(flush) | flush | Standard |
| fsync | FUSE_METHOD_VOID(fsync) | fsync | Standard |

---

## Error Codes (errno-Werte)

Alle Fehlercodes sind negative Werte entsprechend der POSIX errno-Werte:

- `-1`: EPERM (Operation not permitted)
- `-2`: ENOENT (No such file or directory)  
- `-5`: EIO (I/O error)
- `-13`: EACCES (Permission denied)
- `-17`: EEXIST (File exists)
- `-20`: ENOTDIR (Not a directory)
- `-21`: EISDIR (Is a directory)
- `-28`: ENOSPC (No space left on device)
- `-38`: ENOSYS (Function not implemented)
- `-39`: ENOTEMPTY (Directory not empty)

Diese sind in `index.d.ts` als statische Konstanten verfügbar: `Fuse.ENOENT`, `Fuse.EACCES`, etc.