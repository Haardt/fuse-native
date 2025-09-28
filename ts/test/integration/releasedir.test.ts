/**
 * @file ts/test/integration/releasedir.test.ts
 * @brief Integration test for the releasedir operation
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

describe('FUSE releasedir Bridge Integration', () => {
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

  test('should call releasedir with correct parameters on dir.close()', async () => {
    const releasedirDone = defer<void>();

    let recordedIno: Ino = 0n as Ino;
    let recordedFi: FileInfo | undefined;
    let recordedContext: RequestContext = {} as RequestContext;

    const recordingReleasedir = async (ino: Ino, fi: FileInfo, context: RequestContext, options?: BaseOperationOptions): Promise<void> => {
      recordedIno = ino;
      recordedFi = fi;
      recordedContext = context;
      releasedirDone.resolve();
    };

    filesystemOperations.overrideOperationsWith({ releasedir: recordingReleasedir });

    const dir = await fs.opendir(mountPoint);
    await dir.close();
    await releasedirDone.promise;

    const rootInode = filesystem.getRoot();

    expect(recordedIno).toBe(rootInode.id);
    expect(recordedFi).toBeDefined();
    expect(typeof recordedFi?.fh).toBe('bigint');
    expect(recordedFi!.fh).toBeGreaterThan(0n);

    // The context for releasedir is not guaranteed to be the same as for opendir,
    // so we don't assert on uid and gid.

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
