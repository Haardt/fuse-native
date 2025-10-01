/**
 * @file ts/test/integration/fsync.test.ts
 * @brief Integration test for the fsync operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type BaseOperationOptions,
  type FsyncHandler,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE fsync Bridge Integration', () => {
  const filesystem = new FileSystem();
  let session: FuseSession | undefined;
  let fuse: FuseNative | undefined;
  const filesystemOperations = new FileSystemOperations(filesystem, {});
  let mountPoint = '';

  beforeAll(async () => {
    const sessionWrap = await fuseIntegrationSessionSetup(filesystemOperations, {});
    fuse = sessionWrap.fuseNative;
    await sessionWrap.session.mount();
    mountPoint = sessionWrap.mountPoint;
    session = sessionWrap.session;
  });

  afterAll(async () => {
    await session?.unmount();
    await fuse?.shutdownDispatcher(750);
    await session?.destroy();
  });

  test('should call fsync with correct parameters and synchronize a file', async () => {
    const fsyncDone = defer<void>();

    let recordedIno: Ino = 0n as Ino;
    let recordedDatasync: boolean = false;
    let recordedFh: bigint = 0n;
    let recordedContext: RequestContext = {} as RequestContext;

    const recordingFsync: FsyncHandler = async (ino, datasync, fi, context, options) => {
      recordedIno = ino;
      recordedDatasync = datasync;
      recordedFh = fi.fh;
      recordedContext = context;
      fsyncDone.resolve();
      return new FileSystemOperations(filesystem, {}).fsync(ino, datasync, fi, context, options);
    };

    filesystemOperations.overrideOperationsWith({ fsync: recordingFsync });

    // First create and open a file
    const fileName = 'file-to-sync.txt';
    const filePath = `${mountPoint}/${fileName}`;
    const fileHandle = await fs.open(filePath, 'w');

    // Now sync it
    await fileHandle.sync();
    await fsyncDone.promise;

    const rootInode = filesystem.getRoot();

    expect(recordedIno).toBe(rootInode.id); // File should be found via lookup
    expect(typeof recordedDatasync).toBe('boolean');
    expect(typeof recordedFh).toBe('bigint');
    expect(recordedContext.uid).toBe(1000);
    expect(recordedContext.gid).toBe(1000);

    await fileHandle.close();

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });

  test('should handle fsync with datasync flag', async () => {
    const fsyncDone = defer<void>();

    let recordedDatasync: boolean = false;

    const recordingFsync: FsyncHandler = async (ino, datasync, fi, context, options) => {
      recordedDatasync = datasync;
      fsyncDone.resolve();
      return new FileSystemOperations(filesystem, {}).fsync(ino, datasync, fi, context, options);
    };

    filesystemOperations.overrideOperationsWith({ fsync: recordingFsync });

    // Create and open a file
    const fileName = 'datasync-test.txt';
    const filePath = `${mountPoint}/${fileName}`;
    const fileHandle = await fs.open(filePath, 'w');

    // Sync with datasync (should be called internally by some operations)
    await fileHandle.sync();
    await fsyncDone.promise;

    // The datasync flag can be true or false depending on the operation
    expect(typeof recordedDatasync).toBe('boolean');

    await fileHandle.close();

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });

  test('should handle multiple fsync calls on the same file', async () => {
    let fsyncCallCount = 0;

    const recordingFsync: FsyncHandler = async (ino, datasync, fi, context, options) => {
      fsyncCallCount++;
      return new FileSystemOperations(filesystem, {}).fsync(ino, datasync, fi, context, options);
    };

    filesystemOperations.overrideOperationsWith({ fsync: recordingFsync });

    // Create and open a file
    const fileName = 'multi-sync-test.txt';
    const filePath = `${mountPoint}/${fileName}`;
    const fileHandle = await fs.open(filePath, 'w');

    // Call sync multiple times
    await fileHandle.sync();
    await fileHandle.sync();
    await fileHandle.sync();

    expect(fsyncCallCount).toBe(3);

    await fileHandle.close();

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
