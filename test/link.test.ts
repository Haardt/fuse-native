import { linkWrapper, validateLink } from '../ts/ops/link.js';
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
    ino: createIno(321n),
    mode: createMode(0o100644),
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

describe('Link Operation', () => {
  const ino = createIno(123n);
  const newparent = createIno(55n);
  const newname = 'link-name';
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: createMode(0o022),
  };
  const options = { timeout: 100 };

  it('calls link handler and returns entry data', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat, timeout: 2.0 });

    const result = await linkWrapper({ link: handler }, ino, newparent, newname, context, options);

    expect(handler).toHaveBeenCalledWith(ino, newparent, newname, context, options);
    expect(result).toEqual({ attr: stat, timeout: 2.0 });
  });

  it('defaults timeout to 1 second when not provided', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat });

    const result = await linkWrapper({ link: handler }, ino, newparent, newname);

    expect(result.attr).toEqual(stat);
    expect(result.timeout).toBe(1);
  });

  it('throws if handler missing', async () => {
    await expect(linkWrapper({}, ino, newparent, newname)).rejects.toMatchObject({
      code: 'ENOSYS',
      name: 'FuseErrno',
    });
  });

  it('validates target inode', () => {
    expect(() => validateLink(123 as any, newparent, newname)).toThrow(FuseErrno);
  });

  it('validates new parent inode', () => {
    expect(() => validateLink(ino, 456 as any, newname)).toThrow(FuseErrno);
  });

  it('validates new link name', () => {
    expect(() => validateLink(ino, newparent, '')).toThrow(FuseErrno);
    expect(() => validateLink(ino, newparent, 'bad\0name')).toThrow(FuseErrno);
  });

  it('throws when handler returns malformed data', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: { ino: 1n } as any });

    await expect(linkWrapper({ link: handler }, ino, newparent, newname)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });

  it('throws when handler returns invalid timeout', async () => {
    const handler = jest.fn().mockResolvedValue({ attr: createSampleStat(), timeout: -1 });

    await expect(linkWrapper({ link: handler }, ino, newparent, newname)).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });
});