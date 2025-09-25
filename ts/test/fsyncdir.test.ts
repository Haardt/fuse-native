import { fsyncdirWrapper, validateFsyncdir } from '../ops/fsyncdir.ts';
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

describe('Fsyncdir Operation', () => {
  const ino = createIno(42n);
  const fi = createSampleFileInfo();
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: 0o022 as any,
  };

  describe('validateFsyncdir', () => {
    it('accepts valid parameters', () => {
      expect(() => validateFsyncdir(ino, true, fi)).not.toThrow();
      expect(() => validateFsyncdir(ino, false, fi)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateFsyncdir(123 as any, true, fi)).toThrow(FuseErrno);
    });

    it('rejects invalid datasync parameter', () => {
      expect(() => validateFsyncdir(ino, 'true' as any, fi)).toThrow(FuseErrno);
      expect(() => validateFsyncdir(ino, 1 as any, fi)).toThrow(FuseErrno);
      expect(() => validateFsyncdir(ino, null as any, fi)).toThrow(FuseErrno);
    });

    it('rejects invalid file info', () => {
      expect(() => validateFsyncdir(ino, true, null as any)).toThrow(FuseErrno);
      expect(() => validateFsyncdir(ino, true, 'invalid' as any)).toThrow(FuseErrno);
    });

    it('rejects file info without fh', () => {
      const invalidFi = { flags: createFlags(0) };
      expect(() => validateFsyncdir(ino, true, invalidFi as any)).toThrow(FuseErrno);
    });

    it('rejects file info without flags', () => {
      const invalidFi = { fh: createFd(5) };
      expect(() => validateFsyncdir(ino, true, invalidFi as any)).toThrow(FuseErrno);
    });

    it('rejects file info with invalid fh', () => {
      const invalidFi = { fh: 'invalid' as any, flags: createFlags(0) };
      expect(() => validateFsyncdir(ino, true, invalidFi)).toThrow(FuseErrno);
    });

    it('rejects file info with invalid flags', () => {
      const invalidFi = { fh: createFd(5), flags: 'invalid' as any };
      expect(() => validateFsyncdir(ino, true, invalidFi)).toThrow(FuseErrno);
    });
  });

  describe('fsyncdirWrapper', () => {
    it('calls fsyncdir handler when available with datasync=true', async () => {
      const mockFsyncdir = jest.fn().mockResolvedValue(undefined);
      const handlers = { fsyncdir: mockFsyncdir };

      const result = await fsyncdirWrapper(handlers, ino, true, fi, context);

      expect(mockFsyncdir).toHaveBeenCalledWith(ino, true, fi, context, {});
      expect(result).toBeUndefined();
    });

    it('calls fsyncdir handler when available with datasync=false', async () => {
      const mockFsyncdir = jest.fn().mockResolvedValue(undefined);
      const handlers = { fsyncdir: mockFsyncdir };

      const result = await fsyncdirWrapper(handlers, ino, false, fi, context);

      expect(mockFsyncdir).toHaveBeenCalledWith(ino, false, fi, context, {});
      expect(result).toBeUndefined();
    });

    it('throws ENOSYS when no fsyncdir handler is available', async () => {
      await expect(fsyncdirWrapper({}, ino, true, fi, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('passes options through correctly', async () => {
      const mockFsyncdir = jest.fn().mockResolvedValue(undefined);
      const handlers = { fsyncdir: mockFsyncdir };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await fsyncdirWrapper(handlers, ino, true, fi, context, options);

      expect(mockFsyncdir).toHaveBeenCalledWith(ino, true, fi, context, options);
    });

    it('throws when fsyncdir handler throws', async () => {
      const handlers = {
        fsyncdir: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(fsyncdirWrapper(handlers, ino, true, fi, context))
        .rejects.toThrow('test error');
    });

    it('handles different datasync values correctly', async () => {
      const mockFsyncdir = jest.fn().mockResolvedValue(undefined);
      const handlers = { fsyncdir: mockFsyncdir };

      // Test datasync = true
      await fsyncdirWrapper(handlers, ino, true, fi, context);
      expect(mockFsyncdir).toHaveBeenLastCalledWith(ino, true, fi, context, {});

      // Reset mock
      mockFsyncdir.mockClear();

      // Test datasync = false
      await fsyncdirWrapper(handlers, ino, false, fi, context);
      expect(mockFsyncdir).toHaveBeenLastCalledWith(ino, false, fi, context, {});
    });
  });
});