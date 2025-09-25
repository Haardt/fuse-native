import { fsyncWrapper, validateFsync } from '../ops/fsync.ts';
import { FuseErrno } from '../errors.ts';
import {
  createFd,
  createFlags,
  createGid,
  createIno,
  createUid,
  type RequestContext,
} from '../types.ts';

function createSampleFileInfo() {
  return {
    fh: createFd(5),
    flags: createFlags(0),
  };
}

describe('Fsync Operation', () => {
  const ino = createIno(42n);
  const fi = createSampleFileInfo();
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: 0o022 as any,
  };

  describe('validateFsync', () => {
    it('accepts valid parameters', () => {
      expect(() => validateFsync(ino, true, fi)).not.toThrow();
      expect(() => validateFsync(ino, false, fi)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateFsync(123 as any, true, fi)).toThrow(FuseErrno);
    });

    it('rejects invalid datasync parameter', () => {
      expect(() => validateFsync(ino, 'true' as any, fi)).toThrow(FuseErrno);
      expect(() => validateFsync(ino, 1 as any, fi)).toThrow(FuseErrno);
      expect(() => validateFsync(ino, null as any, fi)).toThrow(FuseErrno);
    });

    it('rejects invalid file info', () => {
      expect(() => validateFsync(ino, true, null as any)).toThrow(FuseErrno);
      expect(() => validateFsync(ino, true, 'invalid' as any)).toThrow(FuseErrno);
    });

    it('rejects file info without fh', () => {
      const invalidFi = { flags: createFlags(0) };
      expect(() => validateFsync(ino, true, invalidFi as any)).toThrow(FuseErrno);
    });

    it('rejects file info without flags', () => {
      const invalidFi = { fh: createFd(5) };
      expect(() => validateFsync(ino, true, invalidFi as any)).toThrow(FuseErrno);
    });

    it('rejects file info with invalid fh', () => {
      const invalidFi = { fh: 'invalid' as any, flags: createFlags(0) };
      expect(() => validateFsync(ino, true, invalidFi)).toThrow(FuseErrno);
    });

    it('rejects file info with invalid flags', () => {
      const invalidFi = { fh: createFd(5), flags: 'invalid' as any };
      expect(() => validateFsync(ino, true, invalidFi)).toThrow(FuseErrno);
    });
  });

  describe('fsyncWrapper', () => {
    it('calls fsync handler when available with datasync=true', async () => {
      const mockFsync = jest.fn().mockResolvedValue(undefined);
      const handlers = { fsync: mockFsync };

      const result = await fsyncWrapper(handlers, ino, true, fi, context);

      expect(mockFsync).toHaveBeenCalledWith(ino, true, fi, context, {});
      expect(result).toBeUndefined();
    });

    it('calls fsync handler when available with datasync=false', async () => {
      const mockFsync = jest.fn().mockResolvedValue(undefined);
      const handlers = { fsync: mockFsync };

      const result = await fsyncWrapper(handlers, ino, false, fi, context);

      expect(mockFsync).toHaveBeenCalledWith(ino, false, fi, context, {});
      expect(result).toBeUndefined();
    });

    it('throws ENOSYS when no fsync handler is available', async () => {
      await expect(fsyncWrapper({}, ino, true, fi, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('passes options through correctly', async () => {
      const mockFsync = jest.fn().mockResolvedValue(undefined);
      const handlers = { fsync: mockFsync };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await fsyncWrapper(handlers, ino, true, fi, context, options);

      expect(mockFsync).toHaveBeenCalledWith(ino, true, fi, context, options);
    });

    it('throws when fsync handler throws', async () => {
      const handlers = {
        fsync: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(fsyncWrapper(handlers, ino, true, fi, context))
        .rejects.toThrow('test error');
    });

    it('handles different datasync values correctly', async () => {
      const mockFsync = jest.fn().mockResolvedValue(undefined);
      const handlers = { fsync: mockFsync };

      // Test datasync = true
      await fsyncWrapper(handlers, ino, true, fi, context);
      expect(mockFsync).toHaveBeenLastCalledWith(ino, true, fi, context, {});

      // Reset mock
      mockFsync.mockClear();

      // Test datasync = false
      await fsyncWrapper(handlers, ino, false, fi, context);
      expect(mockFsync).toHaveBeenLastCalledWith(ino, false, fi, context, {});
    });
  });
});