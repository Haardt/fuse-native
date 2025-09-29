/**
 * @file ts/test/integration/opendir.test.ts
 * @brief Integration test for the opendir operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  type FuseSession,
  type Ino,
  type RequestContext,
  type FileInfo,
  type OpenOptions,
} from '../../index.ts';
import { O_RDONLY, O_DIRECTORY } from '../../constants.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';
import * as FS from "node:fs";

describe('FUSE opendir Bridge Integration', () => {

  const O_ACCMODE = 0x3; // POSIX: nur die unteren 2 Bits
  const O_DIRECTORY_RUNTIME = (FS as any).O_DIRECTORY ?? 0x20000; // Linux-Fallback

  const filesystem = new FileSystem();
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

  test('should call opendir with correct parameters and allow reading directory', async () => {
    const opendirDone = defer<void>();

    let recordedIno: Ino = 0n as Ino;
    let recordedContext: RequestContext = {} as RequestContext;
    let recordedOptions: OpenOptions | undefined;

    const defaultOperations = new FileSystemOperations(filesystem, {});

    const recordingOpendir = async (ino: Ino, context: RequestContext, options?: OpenOptions): Promise<FileInfo> => {
      recordedIno = ino;
      recordedContext = context;
      recordedOptions = options;
      opendirDone.resolve();
      return defaultOperations.opendir(ino, context, options);
    };

    filesystemOperations.overrideOperationsWith({ opendir: recordingOpendir });

    const dir = await fs.opendir(mountPoint);
    await opendirDone.promise;

    const rootInode = filesystem.getRoot();

    expect(recordedIno).toBe(rootInode.id);
    expect(recordedContext.uid).toBe(1000);
    expect(recordedContext.gid).toBe(1000);
    expect(recordedOptions).toBeDefined();
    expect((recordedOptions!.flags! & O_ACCMODE)).toBe(O_RDONLY);
    //expect((recordedOptions!.flags! & O_DIRECTORY_RUNTIME)).toBe(O_DIRECTORY_RUNTIME);
    expect(dir).toBeDefined();
    expect(dir.path).toBe(mountPoint);

    // Verify that we can read the directory entries
    const entries = [];
    for await (const dirent of dir) {
      entries.push(dirent.name);
    }

    // fs.opendir/read will filter out '.' and '..'
    expect(new Set(entries)).toEqual(new Set(['test-file', 'notes']));

    // Reset overrides
    filesystemOperations.overrideOperationsWith({});
  });
});
