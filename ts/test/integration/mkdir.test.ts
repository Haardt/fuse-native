/**
 * @file ts/test/integration/mkdir.test.ts
 * @brief Integration test for the mkdir operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type BaseOperationOptions,
  type MkdirHandler,
} from '../../index.ts';
import { S_IFMT, S_IFDIR } from '../../constants.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE mkdir Bridge Integration', () => {
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

  test('should call mkdir with correct parameters and create a new directory', async () => {
    const mkdirDone = defer<void>();

    let recordedParent: Ino = 0n as Ino;
    let recordedName: string = '';
    let recordedMode: number = 0;
    let recordedContext: RequestContext = {} as RequestContext;

    const recordingMkdir: MkdirHandler = async (parent, name, mode, context, options) => {
      recordedParent = parent;
      recordedName = name;
      recordedMode = mode;
      recordedContext = context;
      mkdirDone.resolve();
      return new FileSystemOperations(filesystem, {}).mkdir(parent, name, mode, context, options);
    };

    filesystemOperations.overrideOperationsWith({ mkdir: recordingMkdir });

    const newDirName = 'new-directory';
    const newDirPath = `${mountPoint}/${newDirName}`;
    await fs.mkdir(newDirPath, { mode: 0o755 });
    await mkdirDone.promise;

    const rootInode = filesystem.getRoot();

    expect(recordedParent).toBe(rootInode.id);
    expect(recordedName).toBe(newDirName);
    // The mode contains permission bits (0o755 = 493), file type is implied by mkdir operation
    expect(recordedMode).toBe(493); // 0o755
    expect(recordedContext.uid).toBe(1000);
    expect(recordedContext.gid).toBe(1000);

    // Verify that the directory was created in the filesystem
    const newDirInode = filesystem.resolvePath(`/${newDirName}`);
    expect(newDirInode).toBeDefined();
    expect(newDirInode.type).toBe('directory');

    // Verify that . and .. entries exist
    const dirData = newDirInode.data as Map<string, any>;
    expect(dirData.has('.')).toBe(true);
    expect(dirData.has('..')).toBe(true);
    expect(dirData.get('.')).toBe(newDirInode);
    expect(dirData.get('..')).toBe(rootInode);

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });

  test('should handle directory creation with proper . and .. entries', async () => {
    const mkdirDone = defer<void>();

    const recordingMkdir: MkdirHandler = async (parent, name, mode, context, options) => {
      mkdirDone.resolve();
      return new FileSystemOperations(filesystem, {}).mkdir(parent, name, mode, context, options);
    };

    filesystemOperations.overrideOperationsWith({ mkdir: recordingMkdir });

    const newDirName = 'test-directory';
    const newDirPath = `${mountPoint}/${newDirName}`;
    await fs.mkdir(newDirPath, { mode: 0o755 });
    await mkdirDone.promise;

    // Verify that the directory was created in the filesystem
    const newDirInode = filesystem.resolvePath(`/${newDirName}`);
    expect(newDirInode).toBeDefined();
    expect(newDirInode.type).toBe('directory');

    // Verify that . and .. entries exist and point to correct directories
    const dirData = newDirInode.data as Map<string, any>;
    expect(dirData.has('.')).toBe(true);
    expect(dirData.has('..')).toBe(true);
    expect(dirData.get('.')).toBe(newDirInode);

    const rootInode = filesystem.getRoot();
    expect(dirData.get('..')).toBe(rootInode);

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });

  test('should fail when trying to create directory that already exists', async () => {
    const existingDirPath = `${mountPoint}/existing-dir`;
    await fs.mkdir(existingDirPath, { mode: 0o755 });

    // Try to create the same directory again
    await expect(fs.mkdir(existingDirPath, { mode: 0o755 })).rejects.toThrow();

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
