import { chownWrapper, validateChown } from '../ts/ops/chown.js';
import { FuseErrno } from '../ts/errors.js';
import {
  createDev,
  createGid,
  createIno,
  createMode,
  createUid,
  getCurrentTimestamp,
  type RequestContext,
  type StatResult,
} from '../ts/types.js';

function createSampleStat(): StatResult {
  const ts = getCurrentTimestamp();
  return {
    ino: createIno(123n),
    mode: createMode(0o100644),
    nlink: 1,
    uid: createUid(1000),
    gid: createGid(1000),
    rdev: createDev(0n),
    size: 0n,
    blksize: 4096,
    blocks: 0n,
    atime: ts,
    mtime: ts,
    ctime: ts,
  };
}

describe('Chown Operation', () => {
  const ino = createIno(77n);
  const uid = createUid(2000);
  const gid = createGid(3000);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 3333,
    umask: createMode(0o022),
  };
  const options = { timeout: 500 };

  it('calls chown handler and returns attr result', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat, timeout: 2.5 });

    const result = await chownWrapper({ chown: handler }, ino, uid, null, context, options);

    expect(handler).toHaveBeenCalledWith(ino, uid, null, context, options);
    expect(result).toEqual({ attr: stat, timeout: 2.5 });
  });

  it('defaults timeout to 1 second when not provided', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat });

    const result = await chownWrapper({ chown: handler }, ino, null, gid);

    expect(result.attr).toEqual(stat);
    expect(result.timeout).toBe(1);
  });

  it('throws if handler missing', async () => {
    await expect(chownWrapper({}, ino, uid, gid)).rejects.toMatchObject({
      code: 'ENOSYS',
      name: 'FuseErrno',
    });
  });

  it('validates inode and ownership inputs', () => {
    expect(() => validateChown(123 as any, uid, gid)).toThrow(FuseErrno);
    expect(() => validateChown(ino, null, null)).toThrow(FuseErrno);
    expect(() => validateChown(ino, -1, gid)).toThrow(FuseErrno);
    expect(() => validateChown(ino, uid, -5)).toThrow(FuseErrno);
  });

  it('throws when handler returns malformed result', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: { ino: 1n } as any });

    await expect(chownWrapper({ chown: handler }, ino, uid, gid)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });

  it('throws when handler returns invalid timeout', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: createSampleStat(), timeout: -1 });

    await expect(chownWrapper({ chown: handler }, ino, uid, gid)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });
});
