/**
 * @file ts/test/integration/write.test.ts
 * @brief Integration test for the write operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type WriteOptions,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

const shouldLogTestOps = (() => {
  const level = process.env.FUSE_TS_LOG?.toUpperCase() ?? '';
  return level === 'DEBUG' || level === 'TRACE';
})();

const logTestOp = (op: string, phase: string, fields?: Record<string, unknown>) => {
  if (!shouldLogTestOps) {
    return;
  }
  const prefix = `[ts-fuse-test] ${op} ${phase}`;
  if (fields) {
    console.debug(prefix, fields);
  } else {
    console.debug(prefix);
  }
};

describe('FUSE write Bridge Integration', () => {
  const filesystem = new FileSystem();
  let session: FuseSession | undefined;
  let fuse: FuseNative | undefined;
  const defaultOperations = new FileSystemOperations(filesystem, {});
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
    await session?.unmount();
    await fuse?.shutdownDispatcher(750);
    await session?.destroy();
  });

  test('should call write with correct parameters and write data to a file', async () => {
    const writeDone = defer<void>();
    let recordedIno: Ino = 0n as Ino;
    let recordedData: ArrayBuffer = new ArrayBuffer(0);
    let recordedOptions: WriteOptions | undefined;

    const recordingWrite = async (ino: Ino, data: ArrayBuffer, context: RequestContext, options: WriteOptions): Promise<number> => {
      recordedIno = ino;
      recordedData = data;
      recordedOptions = options;
      logTestOp('write', 'override', {
        ino: ino.toString(),
        offset: options.offset.toString(),
        size: data.byteLength,
        uid: context.uid,
        gid: context.gid,
      });
      try {
        return await defaultOperations.write(ino, data, context, options);
      } finally {
        writeDone.resolve();
      }
    };
    filesystemOperations.overrideOperationsWith({ write: recordingWrite });

    const newFileName = 'new-write-file.txt';
    const newFilePath = `${mountPoint}/${newFileName}`;
    const fileContent = 'Hello, write!';

    const fileHandle = await fs.open(newFilePath, 'w');
    await fileHandle.write(fileContent);
    await fileHandle.close();

    await writeDone.promise;

    const newFileInode = filesystem.resolvePath(`/${newFileName}`);

    expect(recordedIno).toBe(newFileInode.id);
    expect(Buffer.from(recordedData).toString()).toBe(fileContent);
    expect(recordedOptions).toBeDefined();
    expect(recordedOptions?.offset).toBe(0n);
    // Verify that the file content is correct in the filesystem
    if (!(newFileInode.data instanceof Buffer)) {
      throw new Error('Expected written inode data to be a Buffer instance');
    }
    expect(newFileInode.data.toString()).toBe(fileContent);
    expect(newFileInode.size).toBe(BigInt(fileContent.length));

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
