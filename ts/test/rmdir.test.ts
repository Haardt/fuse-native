import { rmdirWrapper, validateRmdir } from '../ops/rmdir.ts';
import { FuseErrno } from '../errors.ts';

describe('Rmdir Operation', () => {
  it('calls rmdir handler with correct arguments and succeeds', async () => {
    const mockRmdir = jest.fn().mockResolvedValue(undefined);
    const handlers = { rmdir: mockRmdir };
    const mockContext = { uid: 1000, gid: 1000, pid: 1234, umask: 0o022 };

    await rmdirWrapper(handlers, 42n, 'testdir', mockContext);

    expect(mockRmdir).toHaveBeenCalledWith(42n, 'testdir', mockContext, {});
  });

  it('throws if no rmdir handler is provided', async () => {
    await expect(rmdirWrapper({}, 42n, 'testdir')).rejects.toThrow(FuseErrno);
    await expect(rmdirWrapper({}, 42n, 'testdir')).rejects.toMatchObject({ code: 'ENOSYS' });
  });

  it('throws validation error for invalid parent ino', () => {
    expect(() => validateRmdir(NaN as any, 'valid-dir')).toThrow('Inode must be a BigInt');
  });

  it('throws validation error for empty name', () => {
    expect(() => validateRmdir(42n, '')).toThrow(FuseErrno);
  });

  it('throws validation error for dot directories', () => {
    const dotFail = () => validateRmdir(42n, '.');
    expect(dotFail).toThrow(FuseErrno);
    try {
      dotFail();
    } catch (error) {
      expect(error).toBeInstanceOf(FuseErrno);
      expect((error as FuseErrno).code).toBe('EINVAL');
    }

    const dotDotFail = () => validateRmdir(42n, '..');
    expect(dotDotFail).toThrow(FuseErrno);
    try {
      dotDotFail();
    } catch (error) {
      expect(error).toBeInstanceOf(FuseErrno);
      expect((error as FuseErrno).code).toBe('EINVAL');
      return;
    }

    throw new Error('Expected validateRmdir to throw FuseErrno for dot directories');
  });

  it('throws validation error for too long name', () => {
    const longName = 'a'.repeat(300);
    const fail = () => validateRmdir(42n, longName);
    expect(fail).toThrow(FuseErrno);
    try {
      fail();
    } catch (error) {
      expect(error).toBeInstanceOf(FuseErrno);
      expect((error as FuseErrno).code).toBe('EINVAL');
      return;
    }
    throw new Error('Expected validateRmdir to throw FuseErrno');
  });
});
