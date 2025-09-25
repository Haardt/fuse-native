import { setattrWrapper, validateSetattr } from '../ops/setattr.ts';
import { FuseErrno } from '../errors.ts';
import {
  FUSE_SET_ATTR_ATIME,
  FUSE_SET_ATTR_ATIME_NOW,
  FUSE_SET_ATTR_CTIME,
  FUSE_SET_ATTR_GID,
  FUSE_SET_ATTR_MODE,
  FUSE_SET_ATTR_MTIME,
  FUSE_SET_ATTR_MTIME_NOW,
  FUSE_SET_ATTR_SIZE,
  FUSE_SET_ATTR_UID,
} from '../constants.ts';
import {
  createDev,
  createGid,
  createIno,
  createMode,
  createUid,
  getCurrentTimestamp,
  type RequestContext,
  type SetattrOptions,
  type StatResult,
} from '../types.ts';

function createSampleStat(): StatResult {
  const ts = getCurrentTimestamp();
  return {
    ino: createIno(321n),
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

describe('Setattr Operation', () => {
  const ino = createIno(55n);
  const context: RequestContext = {
    uid: createUid(2000),
    gid: createGid(2000),
    pid: 4444,
    umask: createMode(0o022),
  };

  it('normalizes attributes and forwards to handler', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat, timeout: 3.75 });

    const updateTimestamp = getCurrentTimestamp();
    const attr = {
      mode: 0o100755,
      uid: 1234,
      gid: 5678,
      size: 512n,
      atime: updateTimestamp,
      mtime: updateTimestamp,
      ctime: updateTimestamp,
    };

    const valid =
      FUSE_SET_ATTR_MODE |
      FUSE_SET_ATTR_UID |
      FUSE_SET_ATTR_GID |
      FUSE_SET_ATTR_SIZE |
      FUSE_SET_ATTR_ATIME |
      FUSE_SET_ATTR_MTIME |
      FUSE_SET_ATTR_CTIME;
    const options: SetattrOptions = { valid };

    const result = await setattrWrapper({ setattr: handler }, ino, attr, context, options);

    expect(handler).toHaveBeenCalledWith(
      ino,
      {
        mode: createMode(0o100755),
        uid: createUid(1234),
        gid: createGid(5678),
        size: 512n,
        atime: updateTimestamp,
        mtime: updateTimestamp,
        ctime: updateTimestamp,
      },
      context,
      options
    );
    expect(result).toEqual({ attr: stat, timeout: 3.75 });
  });

  it('supports atime/mtime now flags without explicit timestamps', async () => {
    const stat = createSampleStat();
    const handler = jest.fn().mockResolvedValue({ attr: stat });

    const attr = {};
    const valid = FUSE_SET_ATTR_ATIME_NOW | FUSE_SET_ATTR_MTIME_NOW;
    const options: SetattrOptions = { valid, atimeNow: true, mtimeNow: true };

    const result = await setattrWrapper({ setattr: handler }, ino, attr, context, options);

    expect(handler).toHaveBeenCalledWith(ino, {}, context, options);
    expect(result.timeout).toBe(1);
  });

  it('throws when handler missing', async () => {
    const options: SetattrOptions = { valid: FUSE_SET_ATTR_SIZE };
    await expect(setattrWrapper({}, ino, { size: 1n }, context, options)).rejects.toMatchObject({
      code: 'ENOSYS',
      name: 'FuseErrno',
    });
  });

  it('throws when required attribute value is absent', async () => {
    const handler = jest.fn();
    const options: SetattrOptions = { valid: FUSE_SET_ATTR_SIZE };

    await expect(setattrWrapper({ setattr: handler }, ino, {}, context, options)).rejects.toBeInstanceOf(
      FuseErrno
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('throws for invalid attribute types', async () => {
    const handler = jest.fn();
    const options: SetattrOptions = { valid: FUSE_SET_ATTR_SIZE };

    await expect(
      setattrWrapper({ setattr: handler }, ino, { size: 1 }, context, options)
    ).rejects.toBeInstanceOf(FuseErrno);
    expect(handler).not.toHaveBeenCalled();
  });

  it('validateSetattr enforces inputs', () => {
    expect(() => validateSetattr(123 as any, {}, {})).toThrow(FuseErrno);
  });
});
