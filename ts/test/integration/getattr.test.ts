/**
 * @file getattr.test.ts
 * @brief Integration tests for FUSE Getattr Bridge functionality
 *
 * Verifies that the seeded in-memory filesystem provides deterministic
 * attributes through the default getattr implementation.
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import type { BigIntStats } from 'fs';
import {
  FuseNative,
  type FuseSession,
  type GetattrHandler,
  type Ino,
  type RequestContext,
  type StatResult,
  type Timeout,
  StatUtils,
} from '../../index.ts';
import { S_IFDIR } from '../../constants.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE Getattr Bridge Integration', () => {
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

  describe('Complete Parameter Round-trip Testing', () => {
    test('should read seeded root attributes through getattr', async () => {
      try {
        const stat = (await fs.stat(mountPoint, { bigint: true })) as BigIntStats;

        const rootInode = filesystem.getRoot();
        const expectedStat = filesystem.inodeToStat(rootInode);

        expect(stat.ino).toBe(rootInode.id);
        expect(stat.mode).toBe(StatUtils.toBigInt(S_IFDIR | 0o755));
        expect(stat.nlink).toBe(BigInt(expectedStat.nlink));
        expect(stat.size).toBe(expectedStat.size);
        expect(stat.mtimeNs).toBe(expectedStat.mtime);
        expect(stat.ctimeNs).toBe(expectedStat.ctime);
        expect(Number(stat.uid)).toBe(Number(expectedStat.uid));
        expect(Number(stat.gid)).toBe(Number(expectedStat.gid));
      } finally {
        filesystemOperations.overrideOperationsWith({});
        await session?.unmount();
        await fuse?.shutdownDispatcher(0);
        await session?.destroy();
      }
    });
  });
});
