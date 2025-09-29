/**
 * @file ts/test/integration/rename.test.ts
 * @brief Integration test for the rename operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type BaseOperationOptions,
  type RenameHandler,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE rename Bridge Integration', () => {
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

  test('should call rename with correct parameters and rename a file', async () => {
    const renameDone = defer<void>();

    let recordedParent: Ino = 0n as Ino;
    let recordedName: string = '';
    let recordedNewParent: Ino = 0n as Ino;
    let recordedNewName: string = '';
    let recordedFlags: number = 0;
    let recordedContext: RequestContext = {} as RequestContext;

    const recordingRename: RenameHandler = async (parent, name, newparent, newname, flags, context, options) => {
      recordedParent = parent;
      recordedName = name;
      recordedNewParent = newparent;
      recordedNewName = newname;
      recordedFlags = flags;
      recordedContext = context;
      renameDone.resolve();
      return new FileSystemOperations(filesystem, {}).rename(parent, name, newparent, newname, flags, context, options);
    };

    filesystemOperations.overrideOperationsWith({ rename: recordingRename });

    // First create a file to rename
    const oldFileName = 'old-file.txt';
    const newFileName = 'new-file.txt';
    const oldFilePath = `${mountPoint}/${oldFileName}`;
    const newFilePath = `${mountPoint}/${newFileName}`;

    const fileHandle = await fs.open(oldFilePath, 'w');
    await fileHandle.close();

    // Now rename it
    await fs.rename(oldFilePath, newFilePath);
    await renameDone.promise;

    const rootInode = filesystem.getRoot();

    expect(recordedParent).toBe(rootInode.id);
    expect(recordedName).toBe(oldFileName);
    expect(recordedNewParent).toBe(rootInode.id);
    expect(recordedNewName).toBe(newFileName);
    expect(recordedFlags).toBe(0);
    expect(recordedContext.uid).toBe(1000);
    expect(recordedContext.gid).toBe(1000);

    // Verify that the old file no longer exists
    expect(() => filesystem.resolvePath(`/${oldFileName}`)).toThrow('ENOENT');

    // Verify that the new file exists
    const newFileInode = filesystem.resolvePath(`/${newFileName}`);
    expect(newFileInode).toBeDefined();
    expect(newFileInode.type).toBe('file');

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });

  test('should rename a directory', async () => {
    const renameDone = defer<void>();

    const recordingRename: RenameHandler = async (parent, name, newparent, newname, flags, context, options) => {
      renameDone.resolve();
      return new FileSystemOperations(filesystem, {}).rename(parent, name, newparent, newname, flags, context, options);
    };

    filesystemOperations.overrideOperationsWith({ rename: recordingRename });

    // First create a directory to rename
    const oldDirName = 'old-directory';
    const newDirName = 'new-directory';
    const oldDirPath = `${mountPoint}/${oldDirName}`;
    const newDirPath = `${mountPoint}/${newDirName}`;

    await fs.mkdir(oldDirPath, { mode: 0o755 });

    // Now rename it
    await fs.rename(oldDirPath, newDirPath);
    await renameDone.promise;

    // Verify that the old directory no longer exists
    expect(() => filesystem.resolvePath(`/${oldDirName}`)).toThrow('ENOENT');

    // Verify that the new directory exists
    const newDirInode = filesystem.resolvePath(`/${newDirName}`);
    expect(newDirInode).toBeDefined();
    expect(newDirInode.type).toBe('directory');

    // Verify that . and .. entries are correctly updated
    const dirData = newDirInode.data as Map<string, any>;
    expect(dirData.has('.')).toBe(true);
    expect(dirData.has('..')).toBe(true);
    expect(dirData.get('.')).toBe(newDirInode);

    const rootInode = filesystem.getRoot();
    expect(dirData.get('..')).toBe(rootInode);

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });

  test('should fail when trying to rename to an existing name', async () => {
    // Create two files
    const existingFilePath = `${mountPoint}/existing-file.txt`;
    const newFilePath = `${mountPoint}/new-file.txt`;

    const fileHandle1 = await fs.open(existingFilePath, 'w');
    await fileHandle1.close();

    const fileHandle2 = await fs.open(newFilePath, 'w');
    await fileHandle2.close();

    // Try to rename existing-file.txt to new-file.txt (should fail)
    await expect(fs.rename(existingFilePath, newFilePath)).rejects.toThrow();

    // Verify that both files still exist
    const existingFileInode = filesystem.resolvePath('/existing-file.txt');
    const newFileInode = filesystem.resolvePath('/new-file.txt');

    expect(existingFileInode).toBeDefined();
    expect(existingFileInode.type).toBe('file');
    expect(newFileInode).toBeDefined();
    expect(newFileInode.type).toBe('file');

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
