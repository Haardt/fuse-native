/**
 * @file ts/test/integration/create.test.ts
 * @brief Integration test for the create operation
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
  type CreateHandler,
} from '../../index.ts';
import { S_IFMT, S_IFREG } from '../../constants.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE create Bridge Integration', () => {
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

  test('should call create with correct parameters and create a new file', async () => {
    const createDone = defer<void>();

    let recordedParent: Ino = 0n as Ino;
    let recordedName: string = '';
    let recordedMode: number = 0;
    let recordedContext: RequestContext = {} as RequestContext;

    const recordingCreate: CreateHandler = async (parent, name, mode, context, options) => {
      recordedParent = parent;
      recordedName = name;
      recordedMode = mode;
      recordedContext = context;
      createDone.resolve();
      return new FileSystemOperations(filesystem, {}).create(parent, name, mode, context, options);
    };

    filesystemOperations.overrideOperationsWith({ create: recordingCreate });

    const newFileName = 'new-file.txt';
    const newFilePath = `${mountPoint}/${newFileName}`;
    const fileHandle = await fs.open(newFilePath, 'w');
    await createDone.promise;

    const rootInode = filesystem.getRoot();

    expect(recordedParent).toBe(rootInode.id);
    expect(recordedName).toBe(newFileName);
    // The mode will include file type bits and be affected by umask.
    // We just check that it's a regular file.
    expect(recordedMode & S_IFMT).toBe(S_IFREG);
    expect(recordedContext.uid).toBe(1000);
    expect(recordedContext.gid).toBe(1000);

    // Verify that the file was created in the filesystem
    const newFileInode = filesystem.resolvePath(`/${newFileName}`);
    expect(newFileInode).toBeDefined();
    expect(newFileInode.type).toBe('file');

    await fileHandle.close();

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
