/**
 * @file access.test.ts
 * @brief Integration tests for ACCESS operation
 */

import { describe, test, expect } from '@jest/globals';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';
import { FuseErrno } from '../../errors.ts';
import { DirentType } from '../../constants.ts';
import { createIno, createMode, createUid, createGid, getCurrentTimestamp } from '../../index.ts';
import { accessWrapper } from '../../ops/access.ts';

const shouldLogFuseOps = (() => {
  const level = process.env.FUSE_TS_LOG?.toUpperCase() ?? '';
  return level === 'DEBUG' || level === 'TRACE';
})();

const logFuseOp = (op: string, phase: string, fields?: Record<string, unknown>) => {
  if (!shouldLogFuseOps) {
    return;
  }
  const prefix = `[ts-fuse] ${op} ${phase}`;
  if (fields) {
    console.debug(prefix, fields);
  } else {
    console.debug(prefix);
  }
};

test('ACCESS - Basic access check', async () => {
  const fs = new FileSystem();
  const ops = new FileSystemOperations(fs);

  // Create a test file
  const now = getCurrentTimestamp();
  const testFile: any = {
    id: createIno(2n),
    type: 'file',
    mode: createMode(0o644), // -rw-r--r--
    uid: createUid(1000),
    gid: createGid(1000),
    size: 0n,
    atime: now,
    mtime: now,
    ctime: now,
    nlink: 1,
    generation: 0n,
    data: Buffer.from(''),
  };

  fs['inodes'].set(testFile.id, testFile);

  // Test R_OK (read permission)
  const accessROk = await accessWrapper(
    { access: ops.access.bind(ops) },
    testFile.id,
    4, // R_OK = 4
    {
      uid: createUid(1000),
      gid: createGid(1000),
      pid: 1234,
      umask: createMode(0o022),
    }
  );

  // Should succeed (no error thrown)
  logFuseOp('access', 'test', { result: 'success', mask: 4 });

  // Test W_OK (write permission)
  const accessWOk = await accessWrapper(
    { access: ops.access.bind(ops) },
    testFile.id,
    2, // W_OK = 2
    {
      uid: createUid(1000),
      gid: createGid(1000),
      pid: 1234,
      umask: createMode(0o022),
    }
  );

  // Should succeed (no error thrown)
  logFuseOp('access', 'test', { result: 'success', mask: 2 });

  // Test X_OK (execute permission) - should fail for regular file (mode 0o644 has no execute for owner)
  try {
    await accessWrapper(
      { access: ops.access.bind(ops) },
      testFile.id,
      1, // X_OK = 1
      {
        uid: createUid(1000),
        gid: createGid(1000),
        pid: 1234,
        umask: createMode(0o022),
      }
    );
    throw new Error('Expected access to fail for execute permission');
  } catch (error) {
    if (error instanceof FuseErrno && error.errno === -13) { // EACCES
      logFuseOp('access', 'test', { result: 'expected failure', mask: 1, errno: error.errno });
    } else {
      throw error;
    }
  }
});

test('ACCESS - Access denied for other user', async () => {
  const fs = new FileSystem();
  const ops = new FileSystemOperations(fs);

  // Create a test file with restrictive permissions
  const now = getCurrentTimestamp();
  const testFile: any = {
    id: createIno(2n),
    type: 'file',
    mode: createMode(0o600), // -rw-------
    uid: createUid(1000),
    gid: createGid(1000),
    size: 0n,
    atime: now,
    mtime: now,
    ctime: now,
    nlink: 1,
    generation: 0n,
    data: Buffer.from(''),
  };

  fs['inodes'].set(testFile.id, testFile);

  // Test access as different user - should fail (mode 0o600 has no permissions for others)
  try {
    await accessWrapper(
      { access: ops.access.bind(ops) },
      testFile.id,
      4, // R_OK = 4
      {
        uid: createUid(1001), // Different user
        gid: createGid(1000),
        pid: 1234,
        umask: createMode(0o022),
      }
    );
    throw new Error('Expected access to fail for different user');
  } catch (error) {
    if (error instanceof FuseErrno && error.errno === -13) { // EACCES
      logFuseOp('access', 'test', { result: 'expected failure', errno: error.errno });
    } else {
      throw error;
    }
  }
});

test('ACCESS - F_OK (existence check)', async () => {
  const fs = new FileSystem();
  const ops = new FileSystemOperations(fs);

  // Test F_OK on existing file
  const now = getCurrentTimestamp();
  const testFile: any = {
    id: createIno(2n),
    type: 'file',
    mode: createMode(0o644),
    uid: createUid(1000),
    gid: createGid(1000),
    size: 0n,
    atime: now,
    mtime: now,
    ctime: now,
    nlink: 1,
    generation: 0n,
    data: Buffer.from(''),
  };

  fs['inodes'].set(testFile.id, testFile);

  const accessFOk = await accessWrapper(
    { access: ops.access.bind(ops) },
    testFile.id,
    0, // F_OK = 0
    {
      uid: createUid(1000),
      gid: createGid(1000),
      pid: 1234,
      umask: createMode(0o022),
    }
  );

  // Should succeed (no error thrown)
  logFuseOp('access', 'test', { result: 'success', mask: 0 });

  // Test F_OK on non-existing file
  try {
    await accessWrapper(
      { access: ops.access.bind(ops) },
      createIno(999n),
      0, // F_OK = 0
      {
        uid: createUid(1000),
        gid: createGid(1000),
        pid: 1234,
        umask: createMode(0o022),
      }
    );
    throw new Error('Expected access to fail for non-existing file');
  } catch (error) {
    if (error instanceof FuseErrno && error.errno === -2) { // ENOENT
      logFuseOp('access', 'test', { result: 'expected failure', errno: error.errno });
    } else {
      throw error;
    }
  }
});

test('ACCESS - Combined access mask', async () => {
  const fs = new FileSystem();
  const ops = new FileSystemOperations(fs);

  // Create a test file
  const now = getCurrentTimestamp();
  const testFile: any = {
    id: createIno(2n),
    type: 'file',
    mode: createMode(0o644), // -rw-r--r--
    uid: createUid(1000),
    gid: createGid(1000),
    size: 0n,
    atime: now,
    mtime: now,
    ctime: now,
    nlink: 1,
    generation: 0n,
    data: Buffer.from(''),
  };

  fs['inodes'].set(testFile.id, testFile);

  // Test R_OK | W_OK (read + write permission)
  const accessRWOk = await accessWrapper(
    { access: ops.access.bind(ops) },
    testFile.id,
    6, // R_OK | W_OK = 4 | 2 = 6
    {
      uid: createUid(1000),
      gid: createGid(1000),
      pid: 1234,
      umask: createMode(0o022),
    }
  );

  // Should succeed (no error thrown)
  logFuseOp('access', 'test', { result: 'success', mask: 6 });

  // Test R_OK | X_OK (read + execute permission) - should fail for regular file (no execute permission)
  try {
    await accessWrapper(
      { access: ops.access.bind(ops) },
      testFile.id,
      5, // R_OK | X_OK = 4 | 1 = 5
      {
        uid: createUid(1000),
        gid: createGid(1000),
        pid: 1234,
        umask: createMode(0o022),
      }
    );
    throw new Error('Expected access to fail for execute permission');
  } catch (error) {
    if (error instanceof FuseErrno && error.errno === -13) { // EACCES
      logFuseOp('access', 'test', { result: 'expected failure', mask: 5, errno: error.errno });
    } else {
      throw error;
    }
  }
});

test('ACCESS - Override handler', async () => {
  const fs = new FileSystem();
  const ops = new FileSystemOperations(fs);

  // Create a test file
  const now = getCurrentTimestamp();
  const testFile: any = {
    id: createIno(2n),
    type: 'file',
    mode: createMode(0o644),
    uid: createUid(1000),
    gid: createGid(1000),
    size: 0n,
    atime: now,
    mtime: now,
    ctime: now,
    nlink: 1,
    generation: 0n,
    data: Buffer.from(''),
  };

  fs['inodes'].set(testFile.id, testFile);

  // Override access handler to always deny access
  ops.overrideOperationsWith({
    access: async (ino, mask, context, options) => {
      logFuseOp('access', 'override', { ino: ino.toString(), mask });
      throw new FuseErrno('EACCES');
    }
  });

  // Test that override handler is called and denies access
  try {
    await accessWrapper(
      { access: ops.access.bind(ops) },
      testFile.id,
      4, // R_OK = 4
      {
        uid: createUid(1000),
        gid: createGid(1000),
        pid: 1234,
        umask: createMode(0o022),
      }
    );
    throw new Error('Expected access to be denied by override handler');
  } catch (error) {
    if (error instanceof FuseErrno && error.errno === -13) { // EACCES
      logFuseOp('access', 'test', { result: 'override denied access', errno: error.errno });
    } else {
      throw error;
    }
  }
});

test('ACCESS - Invalid parameters', async () => {
  const fs = new FileSystem();
  const ops = new FileSystemOperations(fs);

  // Test invalid mask
  try {
    await accessWrapper(
      { access: ops.access.bind(ops) },
      createIno(1n),
      -1, // Invalid negative mask
      {
        uid: createUid(1000),
        gid: createGid(1000),
        pid: 1234,
        umask: createMode(0o022),
      }
    );
    throw new Error('Expected validation error for negative mask');
  } catch (error) {
    if (error instanceof FuseErrno && error.errno === -22) { // EINVAL
      logFuseOp('access', 'test', { result: 'validation error', errno: error.errno });
    } else {
      throw error;
    }
  }
});
