/**
 * @file ts/test/integration/release.test.ts
 * @brief Integration test for the release operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type FileInfo,
  type BaseOperationOptions,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE release Bridge Integration', () => {
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

  test('should call release with correct parameters on file close', async () => {
    const releaseDone = defer<void>();

    let recordedIno: Ino = 0n as Ino;
    let recordedFi: FileInfo | undefined;

    const recordingRelease = async (ino: Ino, fi: FileInfo, context: RequestContext, options?: BaseOperationOptions): Promise<void> => {
      recordedIno = ino;
      recordedFi = fi;
      releaseDone.resolve();
    };

    filesystemOperations.overrideOperationsWith({ release: recordingRelease });

    const testFile = `${mountPoint}/test-file`;
    const fileHandle = await fs.open(testFile, 'r');
    await fileHandle.close();
    await releaseDone.promise;

    const testFileInode = filesystem.resolvePath('/test-file');

    expect(recordedIno).toBe(testFileInode.id);
    expect(recordedFi).toBeDefined();
    expect(typeof recordedFi?.fh).toBe('bigint');
    expect(recordedFi!.fh).toBeGreaterThan(0n);

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
