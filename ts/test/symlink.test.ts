import { symlinkWrapper, validateSymlink } from '../ops/symlink.ts';
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
    ino: createIno(321n),
    mode: createMode(0o120777),
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

describe('Symlink Operation', () => {
  const target = '../target/file';
  const parent = createIno(55n);
  const name = 'link-name';
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: createMode(0o022),
  };
  const options = { timeout: 100 };

  it('calls symlink handler and returns entry data', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat, timeout: 2.0 });

    const result = await symlinkWrapper({ symlink: handler }, target, parent, name, context, options);

    expect(handler).toHaveBeenCalledWith(target, parent, name, context, options);
    expect(result).toEqual({ attr: stat, timeout: 2.0 });
  });

  it('defaults timeout to 1 second when not provided', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat });

    const result = await symlinkWrapper({ symlink: handler }, target, parent, name);

    expect(result.attr).toEqual(stat);
    expect(result.timeout).toBe(1);
  });

  it('throws if handler missing', async () => {
    await expect(symlinkWrapper({}, target, parent, name)).rejects.toMatchObject({
      code: 'ENOSYS',
      name: 'FuseErrno',
    });
  });

  it('validates target string', () => {
    expect(() => validateSymlink('', parent, name)).toThrow(FuseErrno);
    expect(() => validateSymlink('\0bad', parent, name)).toThrow(FuseErrno);
  });

  it('validates parent inode', () => {
    expect(() => validateSymlink(target, 123 as any, name)).toThrow(FuseErrno);
  });

  it('validates link name', () => {
    expect(() => validateSymlink(target, parent, '')).toThrow(FuseErrno);
    expect(() => validateSymlink(target, parent, 'bad\0name')).toThrow(FuseErrno);
  });

  it('throws when handler returns malformed data', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: { ino: 1n } as any });

    await expect(symlinkWrapper({ symlink: handler }, target, parent, name)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });

  it('throws when handler returns invalid timeout', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: createSampleStat(), timeout: -1 });

    await expect(symlinkWrapper({ symlink: handler }, target, parent, name)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });
});
