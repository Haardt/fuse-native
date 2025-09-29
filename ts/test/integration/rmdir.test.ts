/**
 * @file ts/test/integration/rmdir.test.ts
 * @brief Integration test for the rmdir operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type BaseOperationOptions,
  type RmdirHandler,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE rmdir Bridge Integration', () => {
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

  test('should call rmdir with correct parameters and remove a directory', async () => {
    const rmdirDone = defer<void>();

    let recordedParent: Ino = 0n as Ino;
    let recordedName: string = '';
    let recordedContext: RequestContext = {} as RequestContext;

    const recordingRmdir: RmdirHandler = async (parent, name, context, options) => {
      recordedParent = parent;
      recordedName = name;
      recordedContext = context;
      rmdirDone.resolve();
      return new FileSystemOperations(filesystem, {}).rmdir(parent, name, context, options);
    };

    filesystemOperations.overrideOperationsWith({ rmdir: recordingRmdir });

    // First create a directory to remove
    const dirName = 'directory-to-remove';
    const dirPath = `${mountPoint}/${dirName}`;
    await fs.mkdir(dirPath, { mode: 0o755 });

    // Now remove it
    await fs.rmdir(dirPath);
    await rmdirDone.promise;

    const rootInode = filesystem.getRoot();

    expect(recordedParent).toBe(rootInode.id);
    expect(recordedName).toBe(dirName);
    expect(recordedContext.uid).toBe(1000);
    expect(recordedContext.gid).toBe(1000);

    // Verify that the directory was removed from the filesystem
    expect(() => filesystem.resolvePath(`/${dirName}`)).toThrow('ENOENT');

    // Verify that the directory is no longer in the root's data
    const rootData = rootInode.data as Map<string, any>;
    expect(rootData.has(dirName)).toBe(false);

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });

  test('should fail when trying to remove non-empty directory', async () => {
    // Create a parent directory
    const parentDirPath = `${mountPoint}/parent-dir`;
    await fs.mkdir(parentDirPath, { mode: 0o755 });

    // Create a child directory in it
    const childDirPath = `${mountPoint}/parent-dir/child-dir`;
    await fs.mkdir(childDirPath, { mode: 0o755 });

    // Try to remove the parent directory (should fail because it's not empty)
    await expect(fs.rmdir(parentDirPath)).rejects.toThrow();

    // Verify that both directories still exist
    const parentDirInode = filesystem.resolvePath('/parent-dir');
    const childDirInode = filesystem.resolvePath('/parent-dir/child-dir');

    expect(parentDirInode).toBeDefined();
    expect(parentDirInode.type).toBe('directory');
    expect(childDirInode).toBeDefined();
    expect(childDirInode.type).toBe('directory');

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });

  test('should fail when trying to remove non-existent directory', async () => {
    const nonExistentDirPath = `${mountPoint}/non-existent-dir`;

    // Try to remove a directory that doesn't exist
    await expect(fs.rmdir(nonExistentDirPath)).rejects.toThrow();

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
