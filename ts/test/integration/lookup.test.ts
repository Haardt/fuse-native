/**
 * @file lookup.test.ts
 * @brief Integration tests for FUSE Lookup Bridge functionality
 *
 * Ensures that the seeded in-memory filesystem delivers consistent entry
 * information via the default lookup implementation.
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import type { BigIntStats } from 'fs';
import path from 'path';
import {
  FuseNative,
  type FuseSession,
  type LookupHandler,
  type EntryResult,
  type Ino,
  type RequestContext,
  StatUtils,
} from '../../index.ts';
import { S_IFREG } from '../../constants.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE Lookup Bridge Integration', () => {
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
    test('should read seeded file attributes through lookup', async () => {
      let parentResult: Ino = 0n as Ino;
      let nameResult = '';
      let contextResult: RequestContext = {} as RequestContext;
      let handlerEntry: EntryResult | undefined;
      const lookupDone = defer<void>();

      const defaultLookup = filesystemOperations.getDefaultHandlers().lookup!;

      const recordingLookup: LookupHandler = async (parent, name, context, options) => {
        parentResult = parent;
        nameResult = name;
        contextResult = context;
        const result = await defaultLookup(parent, name, context, options);
        handlerEntry = result;
        lookupDone.resolve();
        return result;
      };

      filesystemOperations.overrideOperationsWith({ lookup: recordingLookup });

      try {
        const filePath = path.join(mountPoint, 'test-file');
        const stat = (await fs.stat(filePath, { bigint: true })) as BigIntStats;
        await lookupDone.promise;

        const rootInode = filesystem.getRoot();
        const fileInode = filesystem.resolvePath('/test-file');
        const expectedStat = filesystem.inodeToStat(fileInode);

        expect(parentResult).toBe(rootInode.id);
        expect(nameResult).toBe('test-file');
        expect(contextResult.uid).toBe(1000);
        expect(contextResult.gid).toBe(1000);
        expect(contextResult.pid).toBeGreaterThan(0);

        expect(handlerEntry).toBeDefined();
        expect(handlerEntry?.ino).toBe(fileInode.id);
        expect(handlerEntry?.generation).toBe(fileInode.generation);
        expect(handlerEntry?.entry_timeout).toBeCloseTo(1.0);
        expect(handlerEntry?.attr_timeout).toBeCloseTo(1.0);
        expect(handlerEntry?.attr).toEqual(expectedStat);

        expect(stat.ino).toBe(fileInode.id);
        expect(stat.mode).toBe(StatUtils.toBigInt(S_IFREG | 0o644));
        expect(stat.size).toBe(expectedStat.size);
        expect(stat.blocks).toBe(expectedStat.blocks);
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
