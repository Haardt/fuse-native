import { readlinkWrapper, validateReadlink } from '../ops/readlink.ts';
import { FuseErrno } from '../errors.ts';
import { createIno, createMode, createUid, createGid, type RequestContext } from '../types.ts';

describe('Readlink Operation', () => {
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: createMode(0o022),
  };

  it('calls readlink handler and returns target path', async () => {
    const handlers = {
      readlink: jest.fn().mockResolvedValue('/target/path'),
    };

    const result = await readlinkWrapper(handlers, createIno(5n), context);

    expect(handlers.readlink).toHaveBeenCalledWith(createIno(5n), context, {});
    expect(result).toBe('/target/path');
  });

  it('throws if no readlink handler is registered', async () => {
    await expect(readlinkWrapper({}, createIno(1n))).rejects.toMatchObject({
      code: 'ENOSYS',
      name: 'FuseErrno',
    });
  });

  it('validates inode input', () => {
    expect(() => validateReadlink(123 as any)).toThrow(FuseErrno);
  });

  it('throws when handler returns non-string', async () => {
    const handlers = {
      readlink: jest.fn().mockResolvedValue(42 as any),
    };

    await expect(readlinkWrapper(handlers, createIno(2n))).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });

  it('throws when handler returns empty string', async () => {
    const handlers = {
      readlink: jest.fn().mockResolvedValue(''),
    };

    await expect(readlinkWrapper(handlers, createIno(3n))).rejects.toMatchObject({
      code: 'EIO',
      name: 'FuseErrno',
    });
  });

  it('throws when handler returns path exceeding PATH_MAX', async () => {
    const longPath = `/${'a'.repeat(5000)}`;
    const handlers = {
      readlink: jest.fn().mockResolvedValue(longPath),
    };

    await expect(readlinkWrapper(handlers, createIno(4n))).rejects.toMatchObject({
      code: 'ENAMETOOLONG',
      name: 'FuseErrno',
    });
  });
});
