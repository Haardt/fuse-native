// ts/test/integration/integration-setup.ts
import { createRequire } from 'node:module';
import {
    FuseNative,
    type FuseOperationHandlers,
    type FuseSessionOptions,
} from '../../index.ts';

import fs from "fs";

const requireCompat = createRequire(import.meta.url);

export const fuseIntegrationSessionSetup = async (
    operations: FuseOperationHandlers,
    sessionOptions: FuseSessionOptions
) => {
    let binding: any;
    try {
        // Pfad bleibt relativ zu DIESER Datei
        binding = requireCompat('../../../build/Release/fuse-native.node');
    } catch (error) {
        console.error('Failed to load native binding:', error);
        throw error;
    }

    const mountPoint = '/tmp/fuse-integration-test' + Math.floor(Math.random() * 1_000_000);
    fs.mkdirSync(mountPoint);
    const fuseNative = new FuseNative(binding)

    const session = await fuseNative.createSession(mountPoint, operations, sessionOptions);
    return { fuseNative, session, binding, mountPoint };
};

export const defer = <T = void>() => {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (e?: any) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};