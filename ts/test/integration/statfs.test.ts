/**
 * @file ts/test/integration/statfs.test.ts
 * @brief Integration test for the statfs operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type StatvfsResult,
  type BaseOperationOptions,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE statfs Bridge Integration', () => {
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

  test('should call statfs with correct parameters and return filesystem stats', async () => {
    const statfsDone = defer<void>();

    let recordedIno: Ino = 0n as Ino;
    let recordedContext: RequestContext = {} as RequestContext;

    const expectedStatvfsResult = {
      blocks: 1024n * 1024n,
      bfree:  1024n * 512n,
      bavail: 1024n * 512n,
      files:  1024n * 1024n,
      ffree:  1024n * 512n,
      bsize:  4096,
      namemax: 255,
      frsize: 4096,
    };

    const recordingStatfs = async (ino: Ino, context: RequestContext, options?: BaseOperationOptions): Promise<StatvfsResult> => {
      recordedIno = ino;
      recordedContext = context;
      statfsDone.resolve();
      return {
        ...expectedStatvfsResult,
        // These are not passed to the kernel, so we don't expect them back
        favail: 0n,
        fsid: 1n,
        flag: 0,
      };
    };

    filesystemOperations.overrideOperationsWith({ statfs: recordingStatfs });

    const stats = await fs.statfs(mountPoint, { bigint: true });
    await statfsDone.promise;

    // For statfs, the ino is typically 0n or 1n (ROOT_INO)
    expect(recordedIno).toBe(1n); // Assuming ROOT_INO is 1n
    expect(recordedContext.uid).toBe(1000);
    expect(recordedContext.gid).toBe(1000);

    expect(stats.bavail).toBe(expectedStatvfsResult.bavail);
    expect(stats.bfree).toBe(expectedStatvfsResult.bfree);
    expect(stats.blocks).toBe(expectedStatvfsResult.blocks);
    expect(stats.bsize).toBe(BigInt(expectedStatvfsResult.bsize));
    expect(stats.ffree).toBe(expectedStatvfsResult.ffree);
    expect(stats.files).toBe(expectedStatvfsResult.files);

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
