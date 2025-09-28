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

      const recordedCalls: {
        ino: Ino;
        offset: bigint;
        context: RequestContext;
        fi?: FileInfo;
        optionsSize: number;
        result: ReaddirResult | undefined;
      }[] = [];

      const defaultOperations = new FileSystemOperations(filesystem, {});

      const recordingReaddir: ReaddirHandler = async (ino, offset, context, fi, options) => {
        const result = await defaultOperations.readdir(ino, offset, context, fi, options);
        recordedCalls.push({
          ino,
          offset,
          context,
          fi,
          optionsSize: options?.size ?? 0,
          result,
        });
        if (!result.hasMore) {
          readdirDone.resolve();
        }
        return result;
      };

      filesystemOperations.overrideOperationsWith({ readdir: recordingReaddir });

      try {
        const names = await fs.readdir(mountPoint);
        await readdirDone.promise;

        const rootInode = filesystem.getRoot();

        // fs.readdir typically filters out '.' and '..'
        expect(new Set(names)).toEqual(new Set(['test-file', 'notes']));

        // Assertions for the recorded calls
        expect(recordedCalls.length).toBeGreaterThanOrEqual(1);

        // First call to readdir
        const firstCall = recordedCalls[0];
        expect(firstCall.ino).toBe(rootInode.id);
        expect(firstCall.offset).toBe(0n); // First call should start at 0
        expect(firstCall.context.uid).toBe(1000);
        expect(firstCall.context.gid).toBe(1000);
        expect(firstCall.fi?.fh).toBeDefined();
        expect(typeof firstCall.fi?.fh).toBe('bigint');
        expect(firstCall.optionsSize).toBe(4096); // Assuming default buffer size

        // The first call should contain '.' and '..' and potentially other entries
        expect(firstCall.result).toBeDefined();
        expect(firstCall.result!.entries.length).toBeGreaterThanOrEqual(2); // At least '.' and '..'
        expect(firstCall.result!.entries[0].name).toBe('.');
        expect(firstCall.result!.entries[1].name).toBe('..');

        // Verify subsequent calls and offsets
        for (let i = 1; i < recordedCalls.length; i++) {
          const prevCall = recordedCalls[i - 1];
          const currentCall = recordedCalls[i];
          expect(currentCall.ino).toBe(rootInode.id);
          expect(currentCall.offset).toBe(prevCall.result!.nextOffset);
        }

        // The last call should have hasMore: false
        const lastCall = recordedCalls[recordedCalls.length - 1];
        expect(lastCall.result!.hasMore).toBe(false);

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
