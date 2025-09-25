import { getattrWrapper, validateGetattr } from '../ops/getattr.ts';
import { FuseErrno } from '../errors.ts';
import {
  createDev,
  createFd,
  createFlags,
  createGid,
  createIno,
  createMode,
  createUid,
  getCurrentTimestamp,
  type StatResult,
  type FileInfo,
  type RequestContext,
} from '../types.ts';

function createSampleStat(): StatResult {
  const timestamp = getCurrentTimestamp();
  return {
    ino: createIno(42n),
    mode: createMode(0o40755),
    nlink: 2,
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

describe('Getattr Operation', () => {
  it('calls getattr handler with correct arguments and returns result', async () => {
    const ino = createIno(42n);
    const context: RequestContext = {
      uid: createUid(1000),
      gid: createGid(1000),
      pid: 1234,
      umask: createMode(0o022),
    };
    const fi: FileInfo = {
      fh: createFd(1),
      flags: createFlags(0),
    };
    const options = { timeout: 500 };
    const stat = createSampleStat();

    const mockGetattr = jest.fn().mockResolvedValue({ attr: stat, timeout: 2.5 });
    const handlers = { getattr: mockGetattr };

    const result = await getattrWrapper(handlers, ino, context, fi, options);

    expect(mockGetattr).toHaveBeenCalledWith(ino, context, fi, options);
    expect(result).toEqual({ attr: stat, timeout: 2.5 });
  });

  it('defaults timeout to 1 second when not provided', async () => {
    const stat = createSampleStat();
    const handlers = {
      getattr: jest.fn().mockResolvedValue({ attr: stat }),
    };

    const result = await getattrWrapper(handlers, createIno(7n));

    expect(result.attr).toEqual(stat);
    expect(result.timeout).toBe(1);
  });

  it('throws if no getattr handler is registered', async () => {
    await expect(getattrWrapper({}, createIno(1n))).rejects.toMatchObject({
      code: 'ENOSYS',
      name: 'FuseErrno',
    });
  });

  it('validates inode input', () => {
    try {
      validateGetattr(123 as any);
    } catch (error) {
      expect(error).toBeInstanceOf(FuseErrno);
      expect((error as FuseErrno).code).toBe('EINVAL');
      return;
    }
    throw new Error('Expected validateGetattr to throw FuseErrno');
  });

  it('throws when handler returns malformed stat result', async () => {
    const handlers = {
      getattr: jest.fn().mockResolvedValue({ attr: { ino: 1n } as any, timeout: 1 }),
    };

    await expect(getattrWrapper(handlers, createIno(5n))).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });

  it('throws when timeout is invalid', async () => {
    const stat = createSampleStat();
    const handlers = {
      getattr: jest.fn().mockResolvedValue({ attr: stat, timeout: -1 }),
    };

    await expect(getattrWrapper(handlers, createIno(9n))).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });
});
