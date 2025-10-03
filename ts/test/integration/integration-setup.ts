// ts/test/integration/integration-setup.ts
import {createRequire} from 'node:module';
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
      // Try to load from the build directory relative to the project root
      binding = requireCompat('../../../build/Release/fuse-native.node');
    } catch (error) {
      console.error('Failed to load **release** native binding:', error instanceof Error ? error.message : String(error));
    }
    try {
      // Try debug build if release not available
      if (binding === undefined) {
        binding = requireCompat('../../../build/Debug/fuse-native.node');
      }
    } catch (error) {
      console.error('Failed to load **debug** native binding:', error instanceof Error ? error.message : String(error));
    }
    if (binding === undefined) {
      throw new Error('Failed to load native binding');
    }
    const mountPoint = '/tmp/fuse-integration-test' + Math.floor(Math.random() * 1_000_000);
    fs.mkdirSync(mountPoint);
    const fuseNative = new FuseNative(binding)

    const options: FuseSessionOptions = {
      ...sessionOptions,
      debug: true,
      singleThreaded: true,
      autoUnmount: false,
      allowOther: false,
    };

    const session = await fuseNative.createSession(mountPoint, operations, options);
    return {fuseNative, session, binding, mountPoint};
  }
;

export const defer = <T = void>() => {
  let resolve!: (v: T | PromiseLike<T>) => void;
  let reject!: (e?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};
