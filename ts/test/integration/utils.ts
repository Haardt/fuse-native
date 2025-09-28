/**
 * @file ts/test/integration/utils.ts
 * @brief Utilities for integration tests
 */

import * as fs from 'fs/promises';
import { posix as path } from 'path';

import {
  type FuseOperationHandlers,
  type FuseSessionOptions,
} from '../../index.ts';

import { fuseIntegrationSessionSetup } from './integration-setup.ts';

export async function mount(operations: FuseOperationHandlers, sessionOptions: FuseSessionOptions = {}) {
  const { mountPoint } = await fuseIntegrationSessionSetup(operations, sessionOptions);
  return [__dirname, mountPoint];
}

export async function tmp() {
  return await fs.mkdtemp(path.join('/tmp', 'fuse-native-test-'));
}


export async function unmount(session: any, mountpoint: string) {
  await session.unmount();
}

export async function cleanup(tmpDir: string) {
  await fs.rm(tmpDir, { recursive: true, force: true });
}

export async function writeFile(mountpoint: string, filePath: string, content: string) {
  await fs.writeFile(path.join(mountpoint, filePath), content);
}

export async function find(mountpoint: string, filePath: string) {
  // TODO: implement
}
