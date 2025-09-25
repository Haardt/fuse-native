import { mkdirWrapper, validateMkdir } from '../ops/mkdir.ts';
import { FuseErrno } from '../errors.ts';
import {
  createDev,
  createGid,
  createIno,
  createMode,
  createUid,
  getCurrentTimestamp,
  type RequestContext,
  type StatResult,
} from '../types.ts';

function createSampleStat(): StatResult {
  const ts = getCurrentTimestamp();
  return {
    ino: createIno(100n),
    mode: createMode(0o40755),
    nlink: 2,
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

describe('Mkdir Operation', () => {
  const parent = createIno(42n);
  const name = 'new-dir';
  const mode = createMode(0o40755);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: createMode(0o022),
  };
  const options = { timeout: 250 };

  it('calls mkdir handler with correct arguments and returns result', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat, timeout: 3.5 });

    const result = await mkdirWrapper({ mkdir: handler }, parent, name, mode, context, options);

    expect(handler).toHaveBeenCalledWith(parent, name, mode, context, options);
    expect(result).toEqual({ attr: stat, timeout: 3.5 });
  });

  it('defaults timeout to 1 second when not provided', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat });

    const result = await mkdirWrapper({ mkdir: handler }, parent, name, mode);

    expect(result.attr).toEqual(stat);
    expect(result.timeout).toBe(1);
  });

  it('throws if no mkdir handler is registered', async () => {
    await expect(mkdirWrapper({}, parent, name, mode)).rejects.toMatchObject({
      code: 'ENOSYS',
      name: 'FuseErrno',
    });
  });

  it('validates parent inode', () => {
    expect(() => validateMkdir(123 as any, name, mode)).toThrow(FuseErrno);
  });

  it('rejects non-directory modes', () => {
    expect(() => validateMkdir(parent, name, 0o100644)).toThrow(FuseErrno);
  });

  it('throws when handler returns malformed stat', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: { ino: 1n } as any, timeout: 1 });

    await expect(mkdirWrapper({ mkdir: handler }, parent, name, mode)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });

  it('throws when handler returns invalid timeout', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: createSampleStat(), timeout: -1 });

    await expect(mkdirWrapper({ mkdir: handler }, parent, name, mode)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });
});
