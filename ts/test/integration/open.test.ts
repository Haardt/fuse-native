/**
 * @file ts/test/integration/open.test.ts
 * @brief Integration test for the open operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type FileInfo,
  type OpenOptions,
} from '../../index.ts';
import { O_RDONLY } from '../../constants.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE open Bridge Integration', () => {
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

  test('should call open with correct parameters', async () => {
    const openDone = defer<void>();

    let recordedIno: Ino = 0n as Ino;
    let recordedContext: RequestContext = {} as RequestContext;
    let recordedOptions: OpenOptions | undefined;

    const recordingOpen = async (ino: Ino, context: RequestContext, options?: OpenOptions): Promise<FileInfo> => {
      recordedIno = ino;
      recordedContext = context;
      recordedOptions = options;
      openDone.resolve();
      // We need to call the original open to get a file handle
      return new FileSystemOperations(filesystem, {}).open(ino, context, options);
    };

    filesystemOperations.overrideOperationsWith({ open: recordingOpen });

    const testFile = `${mountPoint}/test-file`;
    const fileHandle = await fs.open(testFile, 'r');
    await openDone.promise;

    const testFileInode = filesystem.resolvePath('/test-file');

    expect(recordedIno).toBe(testFileInode.id);
    expect(recordedContext.uid).toBe(1000);
    expect(recordedContext.gid).toBe(1000);
    expect(recordedOptions).toBeDefined();
    // Check for read-only access mode, ignoring other flags like O_NOFOLLOW
    expect(recordedOptions?.flags & 3).toBe(O_RDONLY);

    expect(fileHandle).toBeDefined();
    expect(fileHandle.fd).toBeGreaterThan(0);

    await fileHandle.close();

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
