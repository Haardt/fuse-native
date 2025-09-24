import { chmodWrapper, validateChmod } from '../ts/ops/chmod.js';
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

describe('Chmod Operation', () => {
  const ino = createIno(42n);
  const mode = createMode(0o100755);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 2222,
    umask: createMode(0o022),
  };
  const options = { timeout: 200 };

  it('calls chmod handler and returns attr result', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat, timeout: 3.5 });

    const result = await chmodWrapper({ chmod: handler }, ino, mode, context, options);

    expect(handler).toHaveBeenCalledWith(ino, mode, context, options);
    expect(result).toEqual({ attr: stat, timeout: 3.5 });
  });

  it('defaults timeout to 1 second when not provided', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat });

    const result = await chmodWrapper({ chmod: handler }, ino, mode);

    expect(result.attr).toEqual(stat);
    expect(result.timeout).toBe(1);
  });

  it('throws if handler missing', async () => {
    await expect(chmodWrapper({}, ino, mode)).rejects.toMatchObject({
      code: 'ENOSYS',
      name: 'FuseErrno',
    });
  });

  it('validates inode and mode inputs', () => {
    expect(() => validateChmod(123 as any, mode)).toThrow(FuseErrno);
    expect(() => validateChmod(ino, -1)).toThrow(FuseErrno);
  });

  it('throws when handler returns malformed result', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: { ino: 1n } as any });

    await expect(chmodWrapper({ chmod: handler }, ino, mode)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });

  it('throws when handler returns invalid timeout', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: createSampleStat(), timeout: -1 });

    await expect(chmodWrapper({ chmod: handler }, ino, mode)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });
});
