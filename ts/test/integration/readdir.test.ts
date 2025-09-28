/**
 * @file readdir.test.ts
 * @brief Integration tests for FUSE Readdir Bridge functionality
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type ReaddirHandler,
  type ReaddirResult,
  type Ino,
  type RequestContext,
  type FileInfo,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE Readdir Bridge Integration', () => {
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
  });

  describe('Complete Parameter Round-trip Testing', () => {
    test('should stream seeded directory entries through readdir', async () => {
      const readdirDone = defer<void>();

      let recordedIno: Ino = 0n as Ino;
      let recordedOffset: bigint = -1n;
      let recordedContext: RequestContext = {} as RequestContext;
      let recordedFi: FileInfo | undefined;
      let recordedOptionsSize = 0;
      let recordedResult: ReaddirResult | undefined;

      const defaultOperations = new FileSystemOperations(filesystem, {});

      const recordingReaddir: ReaddirHandler = async (ino, offset, context, fi, options) => {
        recordedIno = ino;
        recordedOffset = offset;
        recordedContext = context;
        recordedFi = fi;
        recordedOptionsSize = options?.size ?? 0;
        const result = await defaultOperations.readdir(ino, offset, context, fi, options);
        recordedResult = result;
        readdirDone.resolve();
        return result;
      };

      filesystemOperations.overrideOperationsWith({ readdir: recordingReaddir });

      try {
        const names = await fs.readdir(mountPoint);
        await readdirDone.promise;

        const rootInode = filesystem.getRoot();

        expect(new Set(names)).toEqual(new Set(['test-file', 'notes']));
        expect(recordedIno).toBe(rootInode.id);
        expect(recordedOffset).toBe(2n);
        expect(recordedContext.uid).toBe(1000);
        expect(recordedContext.gid).toBe(1000);
        expect(recordedFi?.fh).toBeDefined();
        expect(typeof recordedFi?.fh).toBe('bigint');
        expect(recordedOptionsSize).toBe(4096);

        expect(recordedResult).toBeDefined();
        const entries = recordedResult!.entries;
        expect(entries.length).toBe(0);
        expect(recordedResult!.hasMore).toBe(false);

        for (let i = 0; i < entries.length; i += 1) {
          expect(typeof entries[i].nextOffset).toBe('bigint');
          if (i > 0) {
            expect(entries[i].nextOffset).toBeGreaterThan(entries[i - 1].nextOffset);
          }
        }
      } finally {
        console.log('[TEST] finally: unmount+shutdown+destroy');
        filesystemOperations.overrideOperationsWith({});
        await session?.unmount();
        await fuse?.shutdownDispatcher(750);
        await session?.destroy();
        console.log('[TEST] finally done');
      }
    });
  });
});
