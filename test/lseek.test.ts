import { lseekWrapper, validateLseek } from '../ts/ops/lseek.js';
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

describe('Lseek Operation', () => {
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

  describe('validateLseek', () => {
    it('accepts valid parameters', () => {
      expect(() => validateLseek(ino, fi, 0n, 0)).not.toThrow(); // SEEK_SET
      expect(() => validateLseek(ino, fi, 1024n, 1)).not.toThrow(); // SEEK_CUR
      expect(() => validateLseek(ino, fi, -1024n, 2)).not.toThrow(); // SEEK_END
      expect(() => validateLseek(ino, fi, BigInt(Number.MAX_SAFE_INTEGER), 0)).not.toThrow();
    });

    it('accepts all valid whence values', () => {
      expect(() => validateLseek(ino, fi, 0n, 0)).not.toThrow(); // SEEK_SET
      expect(() => validateLseek(ino, fi, 0n, 1)).not.toThrow(); // SEEK_CUR
      expect(() => validateLseek(ino, fi, 0n, 2)).not.toThrow(); // SEEK_END
    });

    it('accepts various offset values', () => {
      expect(() => validateLseek(ino, fi, 0n, 0)).not.toThrow();
      expect(() => validateLseek(ino, fi, 1024n, 0)).not.toThrow();
      expect(() => validateLseek(ino, fi, -1024n, 0)).not.toThrow();
      expect(() => validateLseek(ino, fi, BigInt(Number.MAX_SAFE_INTEGER), 0)).not.toThrow();
      expect(() => validateLseek(ino, fi, BigInt(Number.MIN_SAFE_INTEGER), 0)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateLseek(123 as any, fi, 0n, 0)).toThrow(FuseErrno);
    });

    it('rejects invalid file info', () => {
      expect(() => validateLseek(ino, null as any, 0n, 0)).toThrow(FuseErrno);
      expect(() => validateLseek(ino, {} as any, 0n, 0)).toThrow(FuseErrno);
    });

    it('rejects file info without fh', () => {
      const invalidFi = { flags: createFlags(0) };
      expect(() => validateLseek(ino, invalidFi as any, 0n, 0)).toThrow(FuseErrno);
    });

    it('rejects file info without flags', () => {
      const invalidFi = { fh: createFd(5) };
      expect(() => validateLseek(ino, invalidFi as any, 0n, 0)).toThrow(FuseErrno);
    });

    it('rejects invalid offset', () => {
      expect(() => validateLseek(ino, fi, 'invalid' as any, 0)).toThrow(FuseErrno);
      expect(() => validateLseek(ino, fi, 1024 as any, 0)).toThrow(FuseErrno);
      expect(() => validateLseek(ino, fi, 1.5 as any, 0)).toThrow(FuseErrno);
    });

    it('rejects invalid whence', () => {
      expect(() => validateLseek(ino, fi, 0n, 'invalid' as any)).toThrow(FuseErrno);
      expect(() => validateLseek(ino, fi, 0n, -1)).toThrow(FuseErrno);
      expect(() => validateLseek(ino, fi, 0n, 3)).toThrow(FuseErrno);
      expect(() => validateLseek(ino, fi, 0n, 1.5)).toThrow(FuseErrno);
    });
  });

  describe('lseekWrapper', () => {
    it('calls lseek handler and returns the new offset', async () => {
      const mockLseek = jest.fn().mockResolvedValue(1024n);
      const handlers = { lseek: mockLseek };

      const result = await lseekWrapper(handlers, ino, fi, 0n, 0, context);

      expect(result).toBe(1024n);
      expect(mockLseek).toHaveBeenCalledWith(ino, fi, 0n, 0, context, {});
    });

    it('handles different whence values', async () => {
      const mockLseek = jest.fn().mockResolvedValue(2048n);
      const handlers = { lseek: mockLseek };

      // Test SEEK_SET
      await lseekWrapper(handlers, ino, fi, 1024n, 0, context);
      expect(mockLseek).toHaveBeenLastCalledWith(ino, fi, 1024n, 0, context, {});

      mockLseek.mockClear();

      // Test SEEK_CUR
      await lseekWrapper(handlers, ino, fi, 512n, 1, context);
      expect(mockLseek).toHaveBeenLastCalledWith(ino, fi, 512n, 1, context, {});

      mockLseek.mockClear();

      // Test SEEK_END
      await lseekWrapper(handlers, ino, fi, -1024n, 2, context);
      expect(mockLseek).toHaveBeenLastCalledWith(ino, fi, -1024n, 2, context, {});
    });

    it('handles various offset values', async () => {
      const mockLseek = jest.fn().mockResolvedValue(0n);
      const handlers = { lseek: mockLseek };

      // Zero offset
      await lseekWrapper(handlers, ino, fi, 0n, 0, context);
      expect(mockLseek).toHaveBeenCalledWith(ino, fi, 0n, 0, context, {});

      mockLseek.mockClear();

      // Positive offset
      await lseekWrapper(handlers, ino, fi, 4096n, 0, context);
      expect(mockLseek).toHaveBeenCalledWith(ino, fi, 4096n, 0, context, {});

      mockLseek.mockClear();

      // Negative offset
      await lseekWrapper(handlers, ino, fi, -2048n, 0, context);
      expect(mockLseek).toHaveBeenCalledWith(ino, fi, -2048n, 0, context, {});
    });

    it('passes options through correctly', async () => {
      const mockLseek = jest.fn().mockResolvedValue(8192n);
      const handlers = { lseek: mockLseek };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      const result = await lseekWrapper(handlers, ino, fi, 0n, 0, context, options);

      expect(result).toBe(8192n);
      expect(mockLseek).toHaveBeenCalledWith(ino, fi, 0n, 0, context, options);
    });

    it('throws ENOSYS when no lseek handler is available', async () => {
      await expect(lseekWrapper({}, ino, fi, 0n, 0, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('throws when lseek handler throws', async () => {
      const handlers = {
        lseek: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(lseekWrapper(handlers, ino, fi, 0n, 0, context))
        .rejects.toThrow('test error');
    });

    it('throws when lseek handler returns invalid result', async () => {
      const handlers = {
        lseek: jest.fn().mockResolvedValue('invalid'),
      };

      await expect(lseekWrapper(handlers, ino, fi, 0n, 0, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('throws when lseek handler returns negative offset', async () => {
      const handlers = {
        lseek: jest.fn().mockResolvedValue(-1n),
      };

      await expect(lseekWrapper(handlers, ino, fi, 0n, 0, context))
        .rejects.toMatchObject({
          code: 'EINVAL',
        });
    });

    it('handles lseek handler returning zero offset', async () => {
      const mockLseek = jest.fn().mockResolvedValue(0n);
      const handlers = { lseek: mockLseek };

      const result = await lseekWrapper(handlers, ino, fi, 0n, 0, context);

      expect(result).toBe(0n);
    });

    it('supports different file handles', async () => {
      const mockLseek = jest.fn().mockResolvedValue(16384n);
      const handlers = { lseek: mockLseek };

      const differentFi: FileInfo = {
        fh: createFd(10),
        flags: createFlags(0x100), // O_RDONLY
      };

      const result = await lseekWrapper(handlers, ino, differentFi, 0n, 0, context);

      expect(result).toBe(16384n);
      expect(mockLseek).toHaveBeenCalledWith(ino, differentFi, 0n, 0, context, {});
    });

    it('handles large file offsets', async () => {
      const mockLseek = jest.fn().mockResolvedValue(BigInt(Number.MAX_SAFE_INTEGER) * 2n);
      const handlers = { lseek: mockLseek };

      const largeOffset = BigInt(Number.MAX_SAFE_INTEGER);
      const result = await lseekWrapper(handlers, ino, fi, largeOffset, 0, context);

      expect(result).toBe(BigInt(Number.MAX_SAFE_INTEGER) * 2n);
      expect(mockLseek).toHaveBeenCalledWith(ino, fi, largeOffset, 0, context, {});
    });
  });
});