/**
 * @file ts/test/integration/write.test.ts
 * @brief Integration test for the write operation
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'fs/promises';
import {
  FuseNative,
  FuseErrno,
  getCurrentTimestamp,
  type FuseSession,
  type Ino,
  type RequestContext,
  type SetattrOptions,
  type StatResult,
  type WriteOptions,
} from '../../index.ts';
import { defer, fuseIntegrationSessionSetup } from './integration-setup.ts';
import { FileSystemOperations } from './file-system-operations.ts';
import { FileSystem } from './filesystem.ts';

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
      try {
        return await defaultOperations.write(ino, data, context, options);
      } finally {
        writeDone.resolve();
      }
    };

    const passthroughSetattr = async (
      ino: Ino,
      attr: Partial<StatResult>,
      _context: RequestContext,
      options?: SetattrOptions,
    ): Promise<{ attr: StatResult; timeout: number }> => {
      const inode = filesystem.getInode(ino);
      if (!inode) {
        throw new FuseErrno('ENOENT');
      }

      const now = getCurrentTimestamp();
      const applyCurrentTime = () => {
        inode.ctime = now;
      };

      if (attr.mode !== undefined) {
        inode.mode = attr.mode;
        applyCurrentTime();
      }
      if (attr.uid !== undefined) {
        inode.uid = attr.uid;
        applyCurrentTime();
      }
      if (attr.gid !== undefined) {
        inode.gid = attr.gid;
        applyCurrentTime();
      }
      if (attr.size !== undefined) {
        if (attr.size < 0n) {
          throw new FuseErrno('EINVAL');
        }
        if (inode.type !== 'file' || !(inode.data instanceof Buffer)) {
          throw new FuseErrno('EISDIR');
        }
        if (attr.size > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new FuseErrno('EFBIG');
        }
        const targetSize = Number(attr.size);
        const newBuffer = Buffer.alloc(targetSize);
        const bytesToCopy = Math.min(targetSize, inode.data.length);
        if (bytesToCopy > 0) {
          inode.data.copy(newBuffer, 0, 0, bytesToCopy);
        }
        inode.data = newBuffer;
        inode.size = BigInt(targetSize);
        applyCurrentTime();
      }

      if (options?.atimeNow) {
        inode.atime = now;
        applyCurrentTime();
      } else if (attr.atime !== undefined) {
        inode.atime = attr.atime;
        applyCurrentTime();
      }

      if (options?.mtimeNow) {
        inode.mtime = now;
        applyCurrentTime();
      } else if (attr.mtime !== undefined) {
        inode.mtime = attr.mtime;
        applyCurrentTime();
      }

      if (attr.ctime !== undefined) {
        inode.ctime = attr.ctime;
      }

      return { attr: filesystem.inodeToStat(inode), timeout: 1.0 };
    };

    filesystemOperations.overrideOperationsWith({ write: recordingWrite, setattr: passthroughSetattr });

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
