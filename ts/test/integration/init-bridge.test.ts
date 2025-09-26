/**
 * @file init-bridge.test.ts
 * @brief Integration tests for FUSE Init Bridge functionality
 *
 * This test suite validates the complete FUSE_INIT operation chain:
 * FUSE3 → C++ → TypeScript callback → modifications applied back to FUSE3
 */

import {describe, test, expect, beforeAll} from '@jest/globals';
import type {
    BaseOperationOptions,
    ConnectionInfo,
    FuseConfig,
    InitCallback,
    InitHandler,
    InitResult
} from "../../index.ts";
import {defer, fuseIntegrationSessionSetup} from "./integration-setup.ts";

// Import the native binding
let binding: any;

beforeAll(() => {
});

describe('FUSE Init Bridge Integration', () => {
    describe('Complete Parameter Round-trip Testing', () => {
        test('should handle complete connection info parameter modifications', async () => {
            // Test all connection info parameters
            let connectionInfoResult: ConnectionInfo = {} as ConnectionInfo;
            let configResult: FuseConfig = {} as FuseConfig;

            let connectionInfoInitResult: ConnectionInfo = {} as ConnectionInfo;
            let configInitResult: FuseConfig = {} as FuseConfig;

            const testCallback: InitCallback = (connectionInfo, config) => {
                connectionInfoResult = connectionInfo
                configResult = config
                return Promise.resolve()
            }

            const initDone = defer<void>();
            const testHandler: InitHandler = async (connInfo: ConnectionInfo,
                config: FuseConfig,
                options?: BaseOperationOptions) : Promise<InitResult> => {
                connectionInfoInitResult = connInfo
                configInitResult = config
                console.log(connInfo, config, options)
                initDone.resolve()
                return {connectionInfo: {}, config: {}}
            }

            const sessionWrap = await fuseIntegrationSessionSetup({ init: testHandler }, {});
            try {
                console.log('Bevor mount');
                await sessionWrap.session.mount();
                console.log('After mount');

                // <— warte, bis init-Handler wirklich durch ist
                await initDone.promise;
                console.log('Test finished');

            } finally {
                await sessionWrap.session.unmount();
                await sessionWrap.fuseNative.shutdownDispatcher(0)
                await sessionWrap.session.destroy();
            }
        });
    });
});
