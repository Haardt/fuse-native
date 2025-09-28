/**
 * @file ts/test/integration/read.test.ts
 * @brief Integration test for the read operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type FileInfo,
  type ReadOptions,
} from '../../index.ts';
import { O_RDONLY } from '../../constants.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem, DEFAULT_FILESYSTEM_SEED } from './filesystem.ts';
import type { SeedingFilesystem } from './filesystem.ts';

describe('FUSE read Bridge Integration', () => {
  const fileContent1 = 'Hello, FUSE read!';
  const fileContent2 = 'Another file for partial read.';
  const customFilesystemSeed: SeedingFilesystem = {
    ...DEFAULT_FILESYSTEM_SEED,
    '/test-file-read-1': {
      type: 'file',
      mode: 0o644,
      content: fileContent1,
    },
    '/test-file-read-2': {
      type: 'file',
      mode: 0o644,
      content: fileContent2,
    },
  };
  const filesystem = new FileSystem(customFilesystemSeed);
  let session: FuseSession | undefined;
  let fuse: FuseNative | undefined;
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

  test('should call read with correct parameters and return file content', async () => {
    const readDone = defer<void>();

    let recordedIno: Ino = 0n as Ino;
    let recordedContext: RequestContext = {} as RequestContext;
    let recordedOptions: ReadOptions | undefined;

    const recordingRead = async (ino: Ino, context: RequestContext, options: ReadOptions): Promise<Buffer> => {
      // We are interested in the first read at offset 0
      if (options.offset === 0n) {
        recordedIno = ino;
        recordedContext = context;
        recordedOptions = options;
        readDone.resolve();
      }
      return new FileSystemOperations(filesystem, {}).read(ino, context, options);
    };

    filesystemOperations.overrideOperationsWith({ read: recordingRead });

    const testFile = `${mountPoint}/test-file-read-1`;
    const buffer = await fs.readFile(testFile);
    await readDone.promise;

    const testFileInode = filesystem.resolvePath('/test-file-read-1');

    expect(recordedIno).toBe(testFileInode.id);
    expect(recordedContext.uid).toBe(1000);
    expect(recordedContext.gid).toBe(1000);
    expect(recordedOptions).toBeDefined();
    expect(recordedOptions?.offset).toBe(0n);
    expect(recordedOptions?.size).toBeGreaterThanOrEqual(fileContent1.length);
    expect(recordedOptions?.fi).toBeDefined();
    expect(typeof recordedOptions?.fi?.fh).toBe('bigint');
    expect(recordedOptions?.fi?.fh).toBeGreaterThan(0n);

    expect(buffer.toString()).toBe(fileContent1);

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });

  test('should read a specific range of a file', async () => {
    const readDone = defer<void>();
    const partialContent = 'file';

    const offset = fileContent2.indexOf(partialContent);
    expect(offset).toBeGreaterThanOrEqual(0);

    const size = partialContent.length;

    let recordedIno: Ino = 0n as Ino;
    let recordedOptions: ReadOptions | undefined;

    const recordingRead = async (ino: Ino, context: RequestContext, options: ReadOptions): Promise<Buffer> => {
      const start = Number(options.offset);
      const end   = start + options.size;
      const wantStart = offset;
      const wantEnd   = offset + size;

      // löse aus, sobald die Ziel-Range komplett in diesem Read enthalten ist
      if (start <= wantStart && end >= wantEnd) {
        recordedIno = ino;
        recordedOptions = options;
        readDone.resolve();
      }
      return new FileSystemOperations(filesystem, {}).read(ino, context, options);
    };

    filesystemOperations.overrideOperationsWith({ read: recordingRead });

    const testFile = `${mountPoint}/test-file-read-2`;
    const buffer = Buffer.alloc(size);
    const fh = await fs.open(testFile, 'r');

    const { bytesRead } = await fh.read({
      buffer,
      offset: 0,        // in den Zielpuffer ab 0
      length: size,     // genau size Bytes
      position: offset, // gewünschte Dateiposition
    });

    await readDone.promise;

    const testFileInode = filesystem.resolvePath('/test-file-read-2');

    expect(bytesRead).toBe(size);
    expect(buffer.toString()).toBe(partialContent);

    expect(recordedIno).toBe(testFileInode.id);
    expect(recordedOptions).toBeDefined();

    // statt "== offset": Range-Abdeckung prüfen
    const start = Number(recordedOptions!.offset);
    const end   = start + recordedOptions!.size;
    expect(start).toBeLessThanOrEqual(offset);
    expect(end).toBeGreaterThanOrEqual(offset + size);

    await fh.close();

    filesystemOperations.overrideOperationsWith({});
  });

  test('should read a large file correctly', async () => {
    const fileContent = 'a'.repeat(10000);
    const fileName = `/test-big-file-${Math.random().toString(36).substring(7)}`;
    filesystem.addFile(fileName, fileContent);

    const testFile = `${mountPoint}${fileName}`;
    const recordedReads: { offset: bigint; size: number }[] = [];

    const recordingRead = async (ino: Ino, context: RequestContext, options: ReadOptions): Promise<Buffer> => {
      recordedReads.push({ offset: options.offset, size: options.size });
      return new FileSystemOperations(filesystem, {}).read(ino, context, options);
    };

    filesystemOperations.overrideOperationsWith({ read: recordingRead });

    const buffer = await fs.readFile(testFile);

    expect(buffer.toString()).toBe(fileContent);
    expect(recordedReads.length).toBeGreaterThan(0);

    // Verify that the reads were sequential and covered the whole file
    let currentOffset = 0n;
    for (const readCall of recordedReads) {
      expect(readCall.offset).toBe(currentOffset);
      expect(readCall.size).toBeGreaterThan(0);
      const returnedSize = Math.min(readCall.size, fileContent.length - Number(currentOffset));
      currentOffset += BigInt(returnedSize);
    }
    expect(currentOffset).toBe(BigInt(fileContent.length));

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
