/**
 * @file ts/test/integration/unlink.test.ts
 * @brief Integration test for the unlink operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type BaseOperationOptions,
  type UnlinkHandler,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE unlink Bridge Integration', () => {
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

  test('should call unlink with correct parameters and remove a file', async () => {
    const unlinkDone = defer<void>();

    let recordedParent: Ino = 0n as Ino;
    let recordedName: string = '';
    let recordedContext: RequestContext = {} as RequestContext;

    const recordingUnlink: UnlinkHandler = async (parent, name, context, options) => {
      recordedParent = parent;
      recordedName = name;
      recordedContext = context;
      unlinkDone.resolve();
      return new FileSystemOperations(filesystem, {}).unlink(parent, name, context, options);
    };

    filesystemOperations.overrideOperationsWith({ unlink: recordingUnlink });

    // First create a file to remove
    const fileName = 'file-to-remove.txt';
    const filePath = `${mountPoint}/${fileName}`;
    const fileHandle = await fs.open(filePath, 'w');
    await fileHandle.close();

    // Now remove it
    await fs.unlink(filePath);
    await unlinkDone.promise;

    const rootInode = filesystem.getRoot();

    expect(recordedParent).toBe(rootInode.id);
    expect(recordedName).toBe(fileName);
    expect(recordedContext.uid).toBe(1000);
    expect(recordedContext.gid).toBe(1000);

    // Verify that the file was removed from the filesystem
    expect(() => filesystem.resolvePath(`/${fileName}`)).toThrow('ENOENT');

    // Verify that the file is no longer in the root's data
    const rootData = rootInode.data as Map<string, any>;
    expect(rootData.has(fileName)).toBe(false);

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });

  test('should fail when trying to unlink a directory', async () => {
    // First create a directory
    const dirPath = `${mountPoint}/directory`;
    await fs.mkdir(dirPath, { mode: 0o755 });

    // Try to unlink the directory (should fail with EISDIR)
    await expect(fs.unlink(dirPath)).rejects.toThrow();

    // Verify that the directory still exists
    const dirInode = filesystem.resolvePath('/directory');
    expect(dirInode).toBeDefined();
    expect(dirInode.type).toBe('directory');

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });

  test('should fail when trying to unlink non-existent file', async () => {
    const nonExistentFilePath = `${mountPoint}/non-existent-file.txt`;

    // Try to unlink a file that doesn't exist
    await expect(fs.unlink(nonExistentFilePath)).rejects.toThrow();

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
