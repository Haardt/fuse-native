import { unlinkWrapper, validateUnlink } from '../ts/ops/unlink.js';
import { FuseErrno } from '../ts/errors';

describe('Unlink Operation', () => {
  it('calls unlink handler with correct arguments and succeeds', async () => {
    const mockUnlink = jest.fn().mockResolvedValue(undefined);
    const handlers = { unlink: mockUnlink };
    const mockContext = { uid: 1000, gid: 1000, pid: 1234, umask: 0o022 };

    await unlinkWrapper(handlers, 42n, 'testfile.txt', mockContext);

    expect(mockUnlink).toHaveBeenCalledWith(42n, 'testfile.txt', mockContext, {});
  });

  it('throws if no unlink handler is provided', async () => {
    await expect(unlinkWrapper({}, 42n, 'test')).rejects.toThrow(FuseErrno);
    await expect(unlinkWrapper({}, 42n, 'test')).rejects.toMatchObject({ code: 'ENOSYS' });
  });

  it('throws if handler rejects with error', async () => {
    const mockUnlink = jest.fn().mockRejectedValue(new Error('Permission denied'));
    const handlers = { unlink: mockUnlink };

    await expect(unlinkWrapper(handlers, 42n, 'test')).rejects.toThrow('Permission denied');
  });

  it('throws validation error for invalid parent ino', () => {
    expect(() => validateUnlink(NaN as any, 'valid.txt')).toThrow('Inode must be a BigInt');
  });

  it('throws validation error for empty name', () => {
    const fail = () => validateUnlink(42n, '');
    expect(fail).toThrow(FuseErrno);
    try {
      fail();
    } catch (error) {
      expect(error).toBeInstanceOf(FuseErrno);
      expect((error as FuseErrno).code).toBe('EINVAL');
      return;
    }
    throw new Error('Expected validateUnlink to throw FuseErrno');
  });

  it('throws validation error for too long name', () => {
    const longName = 'a'.repeat(300);
    const fail = () => validateUnlink(42n, longName);
    expect(fail).toThrow(FuseErrno);
    try {
      fail();
    } catch (error) {
      expect(error).toBeInstanceOf(FuseErrno);
      expect((error as FuseErrno).code).toBe('EINVAL');
      return;
    }
    throw new Error('Expected validateUnlink to throw FuseErrno');
  });
});
