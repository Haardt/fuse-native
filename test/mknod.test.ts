import { mknodWrapper, validateMknod } from '../ts/ops/mknod.js';
import { FuseErrno } from '../ts/errors.js';
import {
  createDev,
  createGid,
  createIno,
  createMode,
  createUid,
  getCurrentTimestamp,
  type Dev,
  type RequestContext,
  type StatResult,
} from '../ts/types.js';

describe('Mknod Operation', () => {
  function createSampleStat(): StatResult {
    const timestamp = getCurrentTimestamp();
    return {
      ino: createIno(99n),
      mode: createMode(0o100644),
      nlink: 1,
      uid: createUid(1000),
      gid: createGid(1000),
      rdev: createDev(0n),
      size: 0n,
      blksize: 4096,
      blocks: 0n,
      atime: timestamp,
      mtime: timestamp,
      ctime: timestamp,
    };
  }

  const parent = createIno(42n);
  const name = 'device';
  const mode = createMode(0o100600);
  const rdev: Dev = createDev(7n);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: createMode(0o022),
  };
  const options = { timeout: 500 };

  it('calls mknod handler with correct arguments and returns result', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat, timeout: 2.5 });
    const handlers = { mknod: handler };

    const result = await mknodWrapper(handlers, parent, name, mode, rdev, context, options);

    expect(handler).toHaveBeenCalledWith(parent, name, mode, rdev, context, options);
    expect(result).toEqual({ attr: stat, timeout: 2.5 });
  });

  it('defaults timeout to 1 second when not provided', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat });

    const result = await mknodWrapper({ mknod: handler }, parent, name, mode, rdev);
    expect(result.attr).toEqual(stat);
    expect(result.timeout).toBe(1);
  });

  it('throws if no mknod handler is registered', async () => {
    await expect(mknodWrapper({}, parent, name, mode, rdev)).rejects.toMatchObject({
      code: 'ENOSYS',
      name: 'FuseErrno',
    });
  });

  it('validates inode input', () => {
    expect(() => validateMknod(123 as any, name, mode, rdev)).toThrow(FuseErrno);
  });

  it('rejects directory mode', () => {
    expect(() => validateMknod(parent, name, 0o40755, rdev)).toThrow(FuseErrno);
  });

  it('rejects non-BigInt device id', () => {
    expect(() => validateMknod(parent, name, mode, 1 as any)).toThrow(FuseErrno);
  });

  it('throws when handler returns malformed result', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: { ino: 1n } as any });

    await expect(mknodWrapper({ mknod: handler }, parent, name, mode, rdev)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });

  it('throws when handler returns invalid timeout', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: createSampleStat(), timeout: -1 });

    await expect(mknodWrapper({ mknod: handler }, parent, name, mode, rdev)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });
});
