/**
 * @file ts/test/integration/read-write-roundtrip.test.ts
 * @brief Integration test: write then read (full & partial)
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type ReadOptions,
  type WriteOptions,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

describe('FUSE write→read Roundtrip Integration', () => {
  const filesystem = new FileSystem();
  const filesystemOperations = new FileSystemOperations(filesystem, {});
  const defaultOps = new FileSystemOperations(filesystem, {});
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

  test('should write content to a new file and read it back (full & partial)', async () => {
    const writeDone = defer<void>();
    const readFullDone = defer<void>();
    const readSliceDone = defer<void>();

    const newFileName = `roundtrip-${Math.random().toString(36).slice(2)}.txt`;
    const newFilePath = `${mountPoint}/${newFileName}`;
    const content = 'Roundtrip FUSE read/write ✓ — with emoji 🚀';
    const slice = 'FUSE';
    const sliceOffset = content.indexOf(slice);
    const sliceSize = slice.length;

    // --- capture write ---
    let wroteIno: Ino = 0n as Ino;
    let wroteData = '';
    let wroteOffset = 0n;

    const recordingWrite = async (ino: Ino, data: ArrayBuffer, ctx: RequestContext, opts: WriteOptions) => {
      wroteIno = ino;
      wroteData += Buffer.from(data).toString();
      wroteOffset = opts.offset;
      const n = await defaultOps.write(ino, data, ctx, opts);
      writeDone.resolve();
      return n;
    };

    // --- capture reads (full + slice), tolerating prefetch ---
    let fullReadIno: Ino = 0n as Ino;
    let fullReadCovered = false;
    let sliceReadIno: Ino = 0n as Ino;
    let sliceReadCovered = false;

    const recordingRead = async (ino: Ino, ctx: RequestContext, opts: ReadOptions) => {
      const start = Number(opts.offset);
      const end = start + opts.size;

      // full file coverage? (at least the part we will read via fs.readFile)
      if (!fullReadCovered && start <= 0 && end >= content.length) {
        fullReadIno = ino;
        fullReadCovered = true;
        readFullDone.resolve();
      }

      // slice coverage?
      if (!sliceReadCovered && start <= sliceOffset && end >= sliceOffset + sliceSize) {
        sliceReadIno = ino;
        sliceReadCovered = true;
        readSliceDone.resolve();
      }

      return defaultOps.read(ino, ctx, opts);
    };

    filesystemOperations.overrideOperationsWith({
      write: recordingWrite,
      read: recordingRead,
    });

    // --- write new file ---
    const fh = await fs.open(newFilePath, 'w');
    await fh.write(content);
    await fh.close();
    await writeDone.promise;

    // inode lookup for assertions
    const inode = filesystem.resolvePath(`/${newFileName}`);
    expect(wroteIno).toBe(inode.id);
    expect(wroteOffset).toBe(0n);
    expect(wroteData).toBe(content);

    // --- read back the entire file ---
    const full = await fs.readFile(newFilePath);
    expect(full.toString()).toBe(content);
    // warte bis unser read-override "volle Abdeckung" gesehen hat
    await readFullDone.promise;
    expect(fullReadIno).toBe(inode.id);

    // --- read back a slice via pread(position) ---
    const sliceBuf = Buffer.alloc(sliceSize);
    const rfh = await fs.open(newFilePath, 'r');
    const { bytesRead } = await rfh.read({
      buffer: sliceBuf,
      offset: 0,
      length: sliceSize,
      position: sliceOffset,
    });
    await rfh.close();

    expect(bytesRead).toBe(sliceSize);
    expect(sliceBuf.toString()).toBe(slice);
    await readSliceDone.promise;
    expect(sliceReadIno).toBe(inode.id);

    // cleanup overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
