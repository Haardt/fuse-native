/**
 * @file getattr.test.ts
 * @brief Integration tests for FUSE Getattr Bridge functionality
 *
 * This test suite validates the complete FUSE_GETATTR operation chain:
 * FUSE3 → C++ → TypeScript callback → modifications applied back to FUSE3
 */

import {describe, test, expect, beforeAll} from '@jest/globals';
import type {
    BaseOperationOptions,
    ConnectionInfo,
    FuseConfig,
    GetattrHandler,
    InitHandler,
    InitResult,
    Ino,
    RequestContext,
    StatResult,
    Timeout
} from "../../index.ts";
import {createIno, createMode, createUid, createGid, createDev} from "../../index.ts";
import {S_IFDIR} from "../../constants.ts";
import {defer, fuseIntegrationSessionSetup} from "./integration-setup.ts";
import fs from 'fs/promises';

// Import the native binding
let binding: any;

beforeAll(() => {
});

describe('FUSE Getattr Bridge Integration', () => {
    describe('Complete Parameter Round-trip Testing', () => {
        test('should handle complete getattr parameter modifications', async () => {
            let inoResult: Ino = 0n as Ino;
            let contextResult: RequestContext = {} as RequestContext;
            let attrResult: StatResult = {} as StatResult;
            let timeoutResult: Timeout = 0;

            const testCallback: GetattrHandler = async (ino, context, fi, options) => {
                inoResult = ino;
                contextResult = context;
                return {
                    attr: {
                        ino: ino,
                        mode: createMode(S_IFDIR | 0o755),
                        nlink: 2,
                        uid: createUid(1000),
                        gid: createGid(1000),
                        rdev: createDev(0n),
                        size: 4096n,
                        blksize: 4096,
                        blocks: 8n,
                        atime: 1609459200000000000n, // 2021-01-01 00:00:00 UTC in ns
                        mtime: 1609459200000000000n,
                        ctime: 1609459200000000000n
                    },
                    timeout: 1.0
                };
            };

            const getattrDone = defer<void>();
            const testHandler: GetattrHandler = async (ino: Ino,
                context: RequestContext,
                fi?: any,
                options?: BaseOperationOptions) : Promise<{ attr: StatResult; timeout: Timeout }> => {
                const result = testCallback(ino, context, fi, options);
                attrResult = result.attr;
                timeoutResult = result.timeout;
                getattrDone.resolve();
                return result;
            };

            const initHandler: InitHandler = async (connInfo: ConnectionInfo, config: FuseConfig, options?: BaseOperationOptions): Promise<InitResult> => {
                return { connectionInfo: {}, config: {} };
            };

            const sessionWrap = await fuseIntegrationSessionSetup({ init: initHandler, getattr: testHandler }, {});
            try {
                console.log('Before mount');
                await sessionWrap.session.mount();
                console.log('After mount');

                // Trigger getattr by stat'ing the mount point
                const stat = await fs.stat(sessionWrap.mountPoint);
                console.log('Stat result:', stat);

                // Wait for getattr handler to be called
                await getattrDone.promise;
                console.log('Getattr handler called');

                // Verify the parameters passed to the handler
                expect(inoResult).toBe(1n); // Root inode
                expect(contextResult.uid).toBe(1000); // Default uid
                expect(contextResult.gid).toBe(1000); // Default gid
                expect(contextResult.pid).toBeGreaterThan(0);

                // Verify the returned attributes
                expect(attrResult.ino).toBe(1n);
                expect(attrResult.mode).toBe(S_IFDIR | 0o755);
                expect(attrResult.nlink).toBe(2);
                expect(attrResult.size).toBe(4096n);
                expect(timeoutResult).toBe(1.0);

            } finally {
                await sessionWrap.session.unmount();
                await sessionWrap.session.destroy();
                await sessionWrap.fuseNative.shutdownDispatcher(0);
            }
        });
    });
});