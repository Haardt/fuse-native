import { flockWrapper, validateFlock } from '../ts/ops/flock.js';
import { FuseErrno } from '../ts/errors.js';
import {
  createFd,
  createFlags,
  createGid,
  createIno,
  createUid,
  type FileInfo,
  type RequestContext,
} from '../ts/types.js';

describe('Flock Operation', () => {
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

  describe('validateFlock', () => {
    it('accepts valid parameters', () => {
      expect(() => validateFlock(ino, fi, 1)).not.toThrow(); // LOCK_SH
      expect(() => validateFlock(ino, fi, 2)).not.toThrow(); // LOCK_EX
      expect(() => validateFlock(ino, fi, 8)).not.toThrow(); // LOCK_UN
      expect(() => validateFlock(ino, fi, 0)).not.toThrow(); // No operation
    });

    it('accepts various flock operations', () => {
      expect(() => validateFlock(ino, fi, 0)).not.toThrow();
      expect(() => validateFlock(ino, fi, 1)).not.toThrow();
      expect(() => validateFlock(ino, fi, 2)).not.toThrow();
      expect(() => validateFlock(ino, fi, 4)).not.toThrow();
      expect(() => validateFlock(ino, fi, 8)).not.toThrow();
      expect(() => validateFlock(ino, fi, 0xFFFF)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateFlock(123 as any, fi, 1)).toThrow(FuseErrno);
    });

    it('rejects invalid file info', () => {
      expect(() => validateFlock(ino, null as any, 1)).toThrow(FuseErrno);
      expect(() => validateFlock(ino, {} as any, 1)).toThrow(FuseErrno);
    });

    it('rejects file info without fh', () => {
      const invalidFi = { flags: createFlags(0) };
      expect(() => validateFlock(ino, invalidFi as any, 1)).toThrow(FuseErrno);
    });

    it('rejects file info without flags', () => {
      const invalidFi = { fh: createFd(5) };
      expect(() => validateFlock(ino, invalidFi as any, 1)).toThrow(FuseErrno);
    });

    it('rejects invalid operation', () => {
      expect(() => validateFlock(ino, fi, 'invalid' as any)).toThrow(FuseErrno);
      expect(() => validateFlock(ino, fi, -1)).toThrow(FuseErrno);
      expect(() => validateFlock(ino, fi, 1.5)).toThrow(FuseErrno);
    });
  });

  describe('flockWrapper', () => {
    it('calls flock handler and returns successfully', async () => {
      const mockFlock = jest.fn().mockResolvedValue(undefined);
      const handlers = { flock: mockFlock };

      await expect(flockWrapper(handlers, ino, fi, 1, context)).resolves.toBeUndefined();

      expect(mockFlock).toHaveBeenCalledWith(ino, fi, 1, context, {});
    });

    it('handles different flock operations', async () => {
      const mockFlock = jest.fn().mockResolvedValue(undefined);
      const handlers = { flock: mockFlock };

      // Test LOCK_SH (shared lock)
      await flockWrapper(handlers, ino, fi, 1, context);
      expect(mockFlock).toHaveBeenLastCalledWith(ino, fi, 1, context, {});

      mockFlock.mockClear();

      // Test LOCK_EX (exclusive lock)
      await flockWrapper(handlers, ino, fi, 2, context);
      expect(mockFlock).toHaveBeenLastCalledWith(ino, fi, 2, context, {});

      mockFlock.mockClear();

      // Test LOCK_UN (unlock)
      await flockWrapper(handlers, ino, fi, 8, context);
      expect(mockFlock).toHaveBeenLastCalledWith(ino, fi, 8, context, {});
    });

    it('handles various operation flags', async () => {
      const mockFlock = jest.fn().mockResolvedValue(undefined);
      const handlers = { flock: mockFlock };

      // Test with LOCK_NB (non-blocking)
      await flockWrapper(handlers, ino, fi, 1 | 4, context); // LOCK_SH | LOCK_NB
      expect(mockFlock).toHaveBeenCalledWith(ino, fi, 5, context, {});

      mockFlock.mockClear();

      // Test with LOCK_EX | LOCK_NB
      await flockWrapper(handlers, ino, fi, 2 | 4, context);
      expect(mockFlock).toHaveBeenCalledWith(ino, fi, 6, context, {});
    });

    it('passes options through correctly', async () => {
      const mockFlock = jest.fn().mockResolvedValue(undefined);
      const handlers = { flock: mockFlock };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await flockWrapper(handlers, ino, fi, 1, context, options);

      expect(mockFlock).toHaveBeenCalledWith(ino, fi, 1, context, options);
    });

    it('throws ENOSYS when no flock handler is available', async () => {
      await expect(flockWrapper({}, ino, fi, 1, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('throws when flock handler throws', async () => {
      const handlers = {
        flock: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(flockWrapper(handlers, ino, fi, 1, context))
        .rejects.toThrow('test error');
    });

    it('handles flock handler returning any value (void operation)', async () => {
      const handlers = {
        flock: jest.fn().mockResolvedValue('unexpected'),
      };

      // Flock is a void operation, so any return value is ignored
      await expect(flockWrapper(handlers, ino, fi, 1, context)).resolves.toBeUndefined();
    });

    it('handles flock handler returning undefined explicitly', async () => {
      const mockFlock = jest.fn().mockResolvedValue(undefined);
      const handlers = { flock: mockFlock };

      await expect(flockWrapper(handlers, ino, fi, 1, context)).resolves.toBeUndefined();
    });

    it('supports different file handles', async () => {
      const mockFlock = jest.fn().mockResolvedValue(undefined);
      const handlers = { flock: mockFlock };

      const differentFi: FileInfo = {
        fh: createFd(10),
        flags: createFlags(0x100), // O_RDONLY
      };

      await flockWrapper(handlers, ino, differentFi, 2, context);

      expect(mockFlock).toHaveBeenCalledWith(ino, differentFi, 2, context, {});
    });
  });
});