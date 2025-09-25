import { getlkWrapper, setlkWrapper, validateGetlk, validateSetlk } from '../ops/lock.ts';
import { FuseErrno } from '../errors.ts';
import {
  createFd,
  createFlags,
  createGid,
  createIno,
  createUid,
  type FileInfo,
  type FileLock,
  LockType,
  type RequestContext,
} from '../types.ts';

describe('Lock Operations', () => {
  const ino = createIno(42n);
  const fi: FileInfo = {
    fh: createFd(5),
    flags: createFlags(0),
  };
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: 0o022 as any,
  };

  const sampleLock: FileLock = {
    type: LockType.WRITE,
    start: 0n,
    end: 100n,
    pid: 1234,
  };

  describe('validateGetlk', () => {
    it('accepts valid parameters', () => {
      expect(() => validateGetlk(ino, fi, sampleLock)).not.toThrow();
    });

    it('accepts read lock', () => {
      const readLock: FileLock = { ...sampleLock, type: LockType.READ };
      expect(() => validateGetlk(ino, fi, readLock)).not.toThrow();
    });

    it('accepts write lock', () => {
      const writeLock: FileLock = { ...sampleLock, type: LockType.WRITE };
      expect(() => validateGetlk(ino, fi, writeLock)).not.toThrow();
    });

    it('accepts zero-length lock', () => {
      const zeroLock: FileLock = { ...sampleLock, start: 50n, end: 50n };
      expect(() => validateGetlk(ino, fi, zeroLock)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateGetlk(123 as any, fi, sampleLock)).toThrow(FuseErrno);
    });

    it('rejects invalid file info', () => {
      expect(() => validateGetlk(ino, null as any, sampleLock)).toThrow(FuseErrno);
      expect(() => validateGetlk(ino, {} as any, sampleLock)).toThrow(FuseErrno);
    });

    it('rejects file info without fh', () => {
      const invalidFi = { flags: createFlags(0) };
      expect(() => validateGetlk(ino, invalidFi as any, sampleLock)).toThrow(FuseErrno);
    });

    it('rejects file info without flags', () => {
      const invalidFi = { fh: createFd(5) };
      expect(() => validateGetlk(ino, invalidFi as any, sampleLock)).toThrow(FuseErrno);
    });

    it('rejects invalid lock object', () => {
      expect(() => validateGetlk(ino, fi, null as any)).toThrow(FuseErrno);
      expect(() => validateGetlk(ino, fi, {} as any)).toThrow(FuseErrno);
    });

    it('rejects lock with invalid type', () => {
      const invalidLock = { ...sampleLock, type: 'invalid' as any };
      expect(() => validateGetlk(ino, fi, invalidLock)).toThrow(FuseErrno);
    });

    it('rejects lock with invalid start', () => {
      const invalidLock = { ...sampleLock, start: 'invalid' as any };
      expect(() => validateGetlk(ino, fi, invalidLock)).toThrow(FuseErrno);
    });

    it('rejects lock with invalid end', () => {
      const invalidLock = { ...sampleLock, end: 'invalid' as any };
      expect(() => validateGetlk(ino, fi, invalidLock)).toThrow(FuseErrno);
    });

    it('rejects lock with invalid pid', () => {
      const invalidLock = { ...sampleLock, pid: 'invalid' as any };
      expect(() => validateGetlk(ino, fi, invalidLock)).toThrow(FuseErrno);
    });

    it('rejects lock with negative start', () => {
      const invalidLock = { ...sampleLock, start: -1n };
      expect(() => validateGetlk(ino, fi, invalidLock)).toThrow(FuseErrno);
    });

    it('rejects lock with negative end', () => {
      const invalidLock = { ...sampleLock, end: -1n };
      expect(() => validateGetlk(ino, fi, invalidLock)).toThrow(FuseErrno);
    });

    it('rejects lock with start > end', () => {
      const invalidLock = { ...sampleLock, start: 100n, end: 50n };
      expect(() => validateGetlk(ino, fi, invalidLock)).toThrow(FuseErrno);
    });
  });

  describe('validateSetlk', () => {
    it('accepts valid parameters', () => {
      expect(() => validateSetlk(ino, fi, sampleLock, false)).not.toThrow();
      expect(() => validateSetlk(ino, fi, sampleLock, true)).not.toThrow();
    });

    it('accepts all validation from validateGetlk', () => {
      // Should have same validation as getlk
      expect(() => validateSetlk(ino, fi, sampleLock, false)).not.toThrow();
    });

    it('rejects invalid sleep parameter', () => {
      expect(() => validateSetlk(ino, fi, sampleLock, 'invalid' as any)).toThrow(FuseErrno);
      expect(() => validateSetlk(ino, fi, sampleLock, null as any)).toThrow(FuseErrno);
    });
  });

  describe('getlkWrapper', () => {
    it('calls getlk handler when available and returns lock info', async () => {
      const mockGetlk = jest.fn().mockResolvedValue({
        type: LockType.READ,
        start: 10n,
        end: 50n,
        pid: 5678,
      });
      const handlers = { getlk: mockGetlk };

      const result = await getlkWrapper(handlers, ino, fi, sampleLock, context);

      expect(mockGetlk).toHaveBeenCalledWith(ino, fi, sampleLock, context, {});
      expect(result).toEqual({
        type: LockType.READ,
        start: 10n,
        end: 50n,
        pid: 5678,
      });
    });

    it('throws ENOSYS when no getlk handler is available', async () => {
      await expect(getlkWrapper({}, ino, fi, sampleLock, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('passes options through correctly', async () => {
      const mockGetlk = jest.fn().mockResolvedValue(sampleLock);
      const handlers = { getlk: mockGetlk };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await getlkWrapper(handlers, ino, fi, sampleLock, context, options);

      expect(mockGetlk).toHaveBeenCalledWith(ino, fi, sampleLock, context, options);
    });

    it('throws when getlk handler throws', async () => {
      const handlers = {
        getlk: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(getlkWrapper(handlers, ino, fi, sampleLock, context))
        .rejects.toThrow('test error');
    });

    it('throws when getlk handler returns invalid result', async () => {
      const handlers = {
        getlk: jest.fn().mockResolvedValue(null),
      };

      await expect(getlkWrapper(handlers, ino, fi, sampleLock, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('throws when getlk handler returns invalid lock', async () => {
      const handlers = {
        getlk: jest.fn().mockResolvedValue({ invalid: 'lock' }),
      };

      await expect(getlkWrapper(handlers, ino, fi, sampleLock, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });
  });

  describe('setlkWrapper', () => {
    it('calls setlk handler when available with sleep=false', async () => {
      const mockSetlk = jest.fn().mockResolvedValue(undefined);
      const handlers = { setlk: mockSetlk };

      const result = await setlkWrapper(handlers, ino, fi, sampleLock, false, context);

      expect(mockSetlk).toHaveBeenCalledWith(ino, fi, sampleLock, false, context, {});
      expect(result).toBeUndefined();
    });

    it('calls setlk handler when available with sleep=true', async () => {
      const mockSetlk = jest.fn().mockResolvedValue(undefined);
      const handlers = { setlk: mockSetlk };

      const result = await setlkWrapper(handlers, ino, fi, sampleLock, true, context);

      expect(mockSetlk).toHaveBeenCalledWith(ino, fi, sampleLock, true, context, {});
      expect(result).toBeUndefined();
    });

    it('throws ENOSYS when no setlk handler is available', async () => {
      await expect(setlkWrapper({}, ino, fi, sampleLock, false, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('passes options through correctly', async () => {
      const mockSetlk = jest.fn().mockResolvedValue(undefined);
      const handlers = { setlk: mockSetlk };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await setlkWrapper(handlers, ino, fi, sampleLock, false, context, options);

      expect(mockSetlk).toHaveBeenCalledWith(ino, fi, sampleLock, false, context, options);
    });

    it('throws when setlk handler throws', async () => {
      const handlers = {
        setlk: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(setlkWrapper(handlers, ino, fi, sampleLock, false, context))
        .rejects.toThrow('test error');
    });
  });
});