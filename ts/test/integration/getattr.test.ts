/**
 * @file getattr.test.ts
 * @brief Integration tests for FUSE Getattr Bridge functionality
 *
 * This test suite validates the complete FUSE_GETATTR operation chain:
 * FUSE3 → C++ → TypeScript callback → modifications applied back to FUSE3
 */

import {describe, test, expect, beforeAll, afterAll} from '@jest/globals';
import {
  type BaseOperationOptions,
  type ConnectionInfo, createIno,
  type FuseConfig, FuseNative, type FuseSession,
  type GetattrHandler,
  type InitHandler,
  type InitResult,
  type Ino,
  type RequestContext,
  type StatResult, StatUtils,
  type Timeout
} from "../../index.ts";
import {createMode, createUid, createGid, createDev} from "../../index.ts";
import {S_IFDIR} from "../../constants.ts";
import {defer, fuseIntegrationSessionSetup} from "./integration-setup.ts";
import fs from 'fs/promises';
import {FileSystemOperations} from "./file-system-operations.ts";
import {FileSystem} from "./filesystem.ts";

describe('FUSE Getattr Bridge Integration', () => {
  const filesystem: FileSystem = new FileSystem()
  let session: FuseSession | undefined = undefined
  let fuse: FuseNative | undefined = undefined
  const filesystemOperations: FileSystemOperations = new FileSystemOperations(filesystem, {})
  let mountPoint: string = ''

  beforeAll(async () => {
    const sessionWrap = await fuseIntegrationSessionSetup(filesystemOperations, {});
    fuse = sessionWrap.fuseNative
    await sessionWrap.session.mount();
    mountPoint = sessionWrap.mountPoint
    session = sessionWrap.session
  })

  afterAll(async () => {
    session?.unmount()
    session?.destroy()
    fuse?.shutdownDispatcher(0)
  })

  describe('Complete Parameter Round-trip Testing', () => {
    test('should handle complete getattr parameter modifications', async () => {
      let inoResult: Ino = 0n as Ino;
      let contextResult: RequestContext = {} as RequestContext;
      let timeoutResult: Timeout = 0;
      const getattrDone = defer<void>();

      const testAttrHandler: GetattrHandler = async (ino, context, fi, options) => {
        inoResult = ino;
        contextResult = context;
        getattrDone.resolve()
        return {
          attr: {
            ino: ino,
            mode: createMode(S_IFDIR | 0o755),
            nlink: 2,
            uid: createUid(1000),
            gid: createGid(1000),
            rdev: createDev(0n),
            size: 0n,
            blksize: 4096,
            blocks: 8n,
            atime: 1609459200000000000n, // 2021-01-01 00:00:00 UTC in ns
            mtime: 1609459200000000000n,
            ctime: 1609459200000000000n
          },
          timeout: 1.0
        };
      };


      try {
        filesystemOperations.overrideOperationsWith({getattr: testAttrHandler});

        // Trigger getattr by stat'ing the mount point
        const stat = await fs.stat(mountPoint, {bigint: true});
        console.log('Stat result:', stat.ino);

        // Wait for getattr handler to be called
        await getattrDone.promise;
        console.log('Getattr handler called');

        // Verify the parameters passed to the handler
        expect(inoResult).toBe(createIno(1n)); // Root inode
        expect(contextResult.uid).toBe(1000); // Default uid
        expect(contextResult.gid).toBe(1000); // Default gid
        expect(contextResult.pid).toBeGreaterThan(0);

        // Verify the returned attributes
        expect(stat.ino).toBe(1n);
        expect(stat.mode).toBe(S_IFDIR | 0o755);
        expect(stat.nlink).toBe(2);
        expect(stat.size).toBe(4096n);
        expect(timeoutResult).toBe(1.0);

      } finally {
        await session?.unmount();
        await fuse?.shutdownDispatcher(0);
        await session?.destroy();
      }
    });
  })
})
