/**
 * @file ts/test/integration/write_buf.test.ts
 * @brief Integration test for the write_buf operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type WriteBufHandler,
  type RequestContext,
  type WriteOptions,
  type FuseBuf,
  FuseBufFlags,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

const flattenBufvec = (bufvec: Parameters<WriteBufHandler>[1]): Buffer => {
  const startIdx = Math.min(bufvec.idx, bufvec.buf.length === 0 ? 0 : bufvec.buf.length - 1);
  const chunks: Buffer[] = [];
  for (let i = startIdx; i < bufvec.buf.length; i++) {
    const entry = bufvec.buf[i]!;
    if (!(entry.mem instanceof ArrayBuffer)) {
      continue;
    }
    const skip = i === startIdx ? bufvec.off : 0;
    const view = new Uint8Array(entry.mem, skip, entry.size - skip);
    chunks.push(Buffer.from(view));
  }
  return Buffer.concat(chunks);
};

describe('FUSE write_buf Bridge Integration', () => {
  const filesystem = new FileSystem();
  const filesystemOperations = new FileSystemOperations(filesystem, {});
  const defaultOperations = new FileSystemOperations(filesystem, {});
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

  test('should route writes through write_buf handler', async () => {
    const ready = defer<void>();
    let recordedIno: Ino = 0n as Ino;
    let recordedContext: RequestContext | null = null;
    let recordedOptions: WriteOptions | null = null;
    let capturedBufvec: Parameters<WriteBufHandler>[1] | null = null;

    const customWriteBuf: WriteBufHandler = async (ino, bufvec, context, options) => {
      recordedIno = ino;
      recordedContext = context;
      recordedOptions = options;
      capturedBufvec = bufvec;
      ready.resolve();
      return defaultOperations.write_buf!(ino, bufvec, context, options);
    };

    filesystemOperations.overrideOperationsWith({ write_buf: customWriteBuf });

    const fileName = `${mountPoint}/write-buf.txt`;
    await fs.writeFile(fileName, 'write_buf data');
    await ready.promise;

    const inode = filesystem.resolvePath('/write-buf.txt');
    expect(recordedIno).toBe(inode.id);
    expect(recordedContext).not.toBeNull();
    expect(recordedOptions).not.toBeNull();
    const options = recordedOptions!;
    expect(options.offset).toBe(0n);

    expect(capturedBufvec).not.toBeNull();
    const bufvec = capturedBufvec!;
    expect(bufvec.count).toBeGreaterThanOrEqual(1);
    bufvec.buf.forEach((entry: FuseBuf) => {
      expect(entry.flags & FuseBufFlags.IS_FD).toBe(0);
    });

    const flattened = flattenBufvec(bufvec);
    expect(inode.data instanceof Buffer ? inode.data.toString() : '').toBe(flattened.toString());

    filesystemOperations.overrideOperationsWith({});
  });
});
