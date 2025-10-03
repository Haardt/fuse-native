import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { FuseNative, type FuseSession } from '../../index.ts';
import { fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE Link Bridge Integration', () => {
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
    session?.unmount();
    session?.destroy();
    fuse?.shutdownDispatcher(0);
  });

  test('should create a hard link', async () => {
    const originalPath = path.join(mountPoint, 'test-file');
    const linkPath = path.join(mountPoint, 'test-file-link');

    await fs.link(originalPath, linkPath);

    const originalStats = await fs.stat(originalPath);
    const linkStats = await fs.stat(linkPath);

    expect(originalStats.ino).toBe(linkStats.ino);
    expect(originalStats.nlink).toBe(2);
    expect(linkStats.nlink).toBe(2);
  });
});
