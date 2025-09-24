import { flushWrapper, validateFlush } from '../ts/ops/flush.js';
import { FuseErrno } from '../ts/errors.js';
import {
  createFd,
  createFlags,
  createGid,
  createIno,
  createUid,
  type RequestContext,
} from '../ts/types.js';

function createSampleFileInfo() {
  return {
    fh: createFd(5),
    flags: createFlags(0),
  };
}

describe('Flush Operation', () => {
  const ino = createIno(42n);
  const fi = createSampleFileInfo();
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: 0o022 as any,
  };

  describe('validateFlush', () => {
    it('accepts valid parameters', () => {
      expect(() => validateFlush(ino, fi)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateFlush(123 as any, fi)).toThrow(FuseErrno);
    });

    it('rejects invalid file info', () => {
      expect(() => validateFlush(ino, null as any)).toThrow(FuseErrno);
      expect(() => validateFlush(ino, 'invalid' as any)).toThrow(FuseErrno);
    });

    it('rejects file info without fh', () => {
      const invalidFi = { flags: createFlags(0) };
      expect(() => validateFlush(ino, invalidFi as any)).toThrow(FuseErrno);
    });

    it('rejects file info without flags', () => {
      const invalidFi = { fh: createFd(5) };
      expect(() => validateFlush(ino, invalidFi as any)).toThrow(FuseErrno);
    });

    it('rejects file info with invalid fh', () => {
      const invalidFi = { fh: 'invalid' as any, flags: createFlags(0) };
      expect(() => validateFlush(ino, invalidFi)).toThrow(FuseErrno);
    });

    it('rejects file info with invalid flags', () => {
      const invalidFi = { fh: createFd(5), flags: 'invalid' as any };
      expect(() => validateFlush(ino, invalidFi)).toThrow(FuseErrno);
    });
  });

  describe('flushWrapper', () => {
    it('calls flush handler when available', async () => {
      const mockFlush = jest.fn().mockResolvedValue(undefined);
      const handlers = { flush: mockFlush };

      const result = await flushWrapper(handlers, ino, fi, context);

      expect(mockFlush).toHaveBeenCalledWith(ino, fi, context, {});
      expect(result).toBeUndefined();
    });

    it('falls back to release handler when flush handler is not available', async () => {
      const mockRelease = jest.fn().mockResolvedValue(undefined);
      const handlers = { release: mockRelease };

      const result = await flushWrapper(handlers, ino, fi, context);

      expect(mockRelease).toHaveBeenCalledWith(ino, fi, context, {});
      expect(result).toBeUndefined();
    });

    it('prefers flush handler over release handler when both are available', async () => {
      const mockFlush = jest.fn().mockResolvedValue(undefined);
      const mockRelease = jest.fn().mockResolvedValue(undefined);
      const handlers = { flush: mockFlush, release: mockRelease };

      const result = await flushWrapper(handlers, ino, fi, context);

      expect(mockFlush).toHaveBeenCalledWith(ino, fi, context, {});
      expect(mockRelease).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('throws ENOSYS when neither flush nor release handler is available', async () => {
      await expect(flushWrapper({}, ino, fi, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('passes options through correctly', async () => {
      const mockFlush = jest.fn().mockResolvedValue(undefined);
      const handlers = { flush: mockFlush };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await flushWrapper(handlers, ino, fi, context, options);

      expect(mockFlush).toHaveBeenCalledWith(ino, fi, context, options);
    });

    it('throws when flush handler throws', async () => {
      const handlers = {
        flush: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(flushWrapper(handlers, ino, fi, context))
        .rejects.toThrow('test error');
    });

    it('throws when release handler throws', async () => {
      const handlers = {
        release: jest.fn().mockRejectedValue(new Error('release error')),
      };

      await expect(flushWrapper(handlers, ino, fi, context))
        .rejects.toThrow('release error');
    });
  });
});