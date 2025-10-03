/**
 * @file ts/test/integration/read_buf.test.ts
 * @brief Integration test for the read_buf operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type ReadBufHandler,
  type RequestContext,
  type ReadOptions,
  FuseBufFlags,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem, type SeedingFilesystem, DEFAULT_FILESYSTEM_SEED } from './filesystem.ts';

const toArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  const out = new ArrayBuffer(buffer.length);
  new Uint8Array(out).set(buffer);
  return out;
};

describe('FUSE read_buf Bridge Integration', () => {
  const fileContent = 'read_buf says hallo';
  const customSeed: SeedingFilesystem = {
    ...DEFAULT_FILESYSTEM_SEED,
    '/read-buf.txt': {
      type: 'file',
      mode: 0o644,
      content: fileContent,
    },
  };

  const filesystem = new FileSystem(customSeed);
  const filesystemOperations = new FileSystemOperations(filesystem, {});
  let session: FuseSession | undefined;
  let fuse: FuseNative | undefined;
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

  test('should use read_buf handler when provided', async () => {
    const ready = defer<void>();
    const observedChunks: Array<{ size: number; flags: number }> = [];
    let recordedIno: Ino = 0n as Ino;
    let recordedContext: RequestContext | null = null;
    let recordedOptions: ReadOptions | null = null;

    const customReadBuf: ReadBufHandler = async (ino, context, options) => {
      recordedIno = ino;
      recordedContext = context;
      recordedOptions = options;

      const first = Buffer.from('read_');
      const second = Buffer.from('buf says hallo');
      observedChunks.push({ size: first.length, flags: FuseBufFlags.NONE });
      observedChunks.push({ size: second.length, flags: FuseBufFlags.NONE });

      ready.resolve();

      return {
        count: 2,
        idx: 0,
        off: 0,
        buf: [
          {
            size: first.length,
            flags: FuseBufFlags.NONE,
            mem: toArrayBuffer(first),
            memSize: first.length,
          },
          {
            size: second.length,
            flags: FuseBufFlags.NONE,
            mem: toArrayBuffer(second),
            memSize: second.length,
          },
        ],
      };
    };

    filesystemOperations.overrideOperationsWith({ read_buf: customReadBuf });

    const filePath = `${mountPoint}/read-buf.txt`;
    const result = await fs.readFile(filePath, { encoding: 'utf8' });
    await ready.promise;

    const inode = filesystem.resolvePath('/read-buf.txt');
    expect(recordedIno).toBe(inode.id);
    expect(recordedContext).not.toBeNull();
    expect(recordedOptions).not.toBeNull();
    const options = recordedOptions!;
    expect(options.offset).toBe(0n);
    expect(options.size).toBeGreaterThan(0);
    expect(result).toBe('read_buf says hallo');
    expect(observedChunks).toHaveLength(2);
    expect(observedChunks[0]).toEqual({ size: 5, flags: FuseBufFlags.NONE });
    expect(observedChunks[1]).toEqual({ size: 'buf says hallo'.length, flags: FuseBufFlags.NONE });

    filesystemOperations.overrideOperationsWith({});
  });
});
