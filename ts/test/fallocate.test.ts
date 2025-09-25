import { fallocateWrapper, validateFallocate } from '../ops/fallocate.ts';
import { FuseErrno } from '../errors.ts';
import {
  createFd,
  createFlags,
  createGid,
  createIno,
  createUid,
  type FileInfo,
  type RequestContext,
} from '../types.ts';

describe('Fallocate Operation', () => {
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

  describe('validateFallocate', () => {
    it('accepts valid parameters', () => {
      expect(() => validateFallocate(ino, fi, 0, 0n, 1024n)).not.toThrow();
      expect(() => validateFallocate(ino, fi, 1, 4096n, 8192n)).not.toThrow();
      expect(() => validateFallocate(ino, fi, 0xFFFF, 0n, 0n)).not.toThrow();
    });

    it('accepts various mode values', () => {
      expect(() => validateFallocate(ino, fi, 0, 0n, 1024n)).not.toThrow(); // Default allocation
      expect(() => validateFallocate(ino, fi, 1, 0n, 1024n)).not.toThrow(); // FALLOC_FL_KEEP_SIZE
      expect(() => validateFallocate(ino, fi, 2, 0n, 1024n)).not.toThrow(); // FALLOC_FL_PUNCH_HOLE
      expect(() => validateFallocate(ino, fi, 4, 0n, 1024n)).not.toThrow(); // FALLOC_FL_NO_HIDE_STALE
    });

    it('accepts various offset and length values', () => {
      expect(() => validateFallocate(ino, fi, 0, 0n, 0n)).not.toThrow();
      expect(() => validateFallocate(ino, fi, 0, 1024n, 4096n)).not.toThrow();
      expect(() => validateFallocate(ino, fi, 0, BigInt(Number.MAX_SAFE_INTEGER), 1024n)).not.toThrow();
      expect(() => validateFallocate(ino, fi, 0, 0n, BigInt(Number.MAX_SAFE_INTEGER))).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateFallocate(123 as any, fi, 0, 0n, 1024n)).toThrow(FuseErrno);
    });

    it('rejects invalid file info', () => {
      expect(() => validateFallocate(ino, null as any, 0, 0n, 1024n)).toThrow(FuseErrno);
      expect(() => validateFallocate(ino, {} as any, 0, 0n, 1024n)).toThrow(FuseErrno);
    });

    it('rejects file info without fh', () => {
      const invalidFi = { flags: createFlags(0) };
      expect(() => validateFallocate(ino, invalidFi as any, 0, 0n, 1024n)).toThrow(FuseErrno);
    });

    it('rejects file info without flags', () => {
      const invalidFi = { fh: createFd(5) };
      expect(() => validateFallocate(ino, invalidFi as any, 0, 0n, 1024n)).toThrow(FuseErrno);
    });

    it('rejects invalid mode', () => {
      expect(() => validateFallocate(ino, fi, 'invalid' as any, 0n, 1024n)).toThrow(FuseErrno);
      expect(() => validateFallocate(ino, fi, -1, 0n, 1024n)).toThrow(FuseErrno);
      expect(() => validateFallocate(ino, fi, 1.5, 0n, 1024n)).toThrow(FuseErrno);
    });

    it('rejects invalid offset', () => {
      expect(() => validateFallocate(ino, fi, 0, 'invalid' as any, 1024n)).toThrow(FuseErrno);
      expect(() => validateFallocate(ino, fi, 0, -1n, 1024n)).toThrow(FuseErrno);
      expect(() => validateFallocate(ino, fi, 0, 1.5 as any, 1024n)).toThrow(FuseErrno);
    });

    it('rejects invalid length', () => {
      expect(() => validateFallocate(ino, fi, 0, 0n, 'invalid' as any)).toThrow(FuseErrno);
      expect(() => validateFallocate(ino, fi, 0, 0n, -1n)).toThrow(FuseErrno);
      expect(() => validateFallocate(ino, fi, 0, 0n, 1.5 as any)).toThrow(FuseErrno);
    });
  });

  describe('fallocateWrapper', () => {
    it('calls fallocate handler and returns successfully', async () => {
      const mockFallocate = jest.fn().mockResolvedValue(undefined);
      const handlers = { fallocate: mockFallocate };

      await expect(fallocateWrapper(handlers, ino, fi, 0, 0n, 1024n, context)).resolves.toBeUndefined();

      expect(mockFallocate).toHaveBeenCalledWith(ino, fi, 0, 0n, 1024n, context, {});
    });

    it('handles different fallocate modes', async () => {
      const mockFallocate = jest.fn().mockResolvedValue(undefined);
      const handlers = { fallocate: mockFallocate };

      // Test default allocation
      await fallocateWrapper(handlers, ino, fi, 0, 0n, 1024n, context);
      expect(mockFallocate).toHaveBeenLastCalledWith(ino, fi, 0, 0n, 1024n, context, {});

      mockFallocate.mockClear();

      // Test with FALLOC_FL_KEEP_SIZE
      await fallocateWrapper(handlers, ino, fi, 1, 4096n, 8192n, context);
      expect(mockFallocate).toHaveBeenLastCalledWith(ino, fi, 1, 4096n, 8192n, context, {});

      mockFallocate.mockClear();

      // Test with FALLOC_FL_PUNCH_HOLE
      await fallocateWrapper(handlers, ino, fi, 2, 0n, 1024n, context);
      expect(mockFallocate).toHaveBeenLastCalledWith(ino, fi, 2, 0n, 1024n, context, {});
    });

    it('handles various offset and length combinations', async () => {
      const mockFallocate = jest.fn().mockResolvedValue(undefined);
      const handlers = { fallocate: mockFallocate };

      // Zero offset and length
      await fallocateWrapper(handlers, ino, fi, 0, 0n, 0n, context);
      expect(mockFallocate).toHaveBeenCalledWith(ino, fi, 0, 0n, 0n, context, {});

      mockFallocate.mockClear();

      // Large offset and length
      const largeOffset = BigInt(Number.MAX_SAFE_INTEGER);
      const largeLength = 1024n;
      await fallocateWrapper(handlers, ino, fi, 0, largeOffset, largeLength, context);
      expect(mockFallocate).toHaveBeenCalledWith(ino, fi, 0, largeOffset, largeLength, context, {});
    });

    it('passes options through correctly', async () => {
      const mockFallocate = jest.fn().mockResolvedValue(undefined);
      const handlers = { fallocate: mockFallocate };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await fallocateWrapper(handlers, ino, fi, 0, 0n, 1024n, context, options);

      expect(mockFallocate).toHaveBeenCalledWith(ino, fi, 0, 0n, 1024n, context, options);
    });

    it('throws ENOSYS when no fallocate handler is available', async () => {
      await expect(fallocateWrapper({}, ino, fi, 0, 0n, 1024n, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('throws when fallocate handler throws', async () => {
      const handlers = {
        fallocate: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(fallocateWrapper(handlers, ino, fi, 0, 0n, 1024n, context))
        .rejects.toThrow('test error');
    });

    it('handles fallocate handler returning any value (void operation)', async () => {
      const handlers = {
        fallocate: jest.fn().mockResolvedValue('unexpected'),
      };

      // Fallocate is a void operation, so any return value is ignored
      await expect(fallocateWrapper(handlers, ino, fi, 0, 0n, 1024n, context)).resolves.toBeUndefined();
    });

    it('handles fallocate handler returning undefined explicitly', async () => {
      const mockFallocate = jest.fn().mockResolvedValue(undefined);
      const handlers = { fallocate: mockFallocate };

      await expect(fallocateWrapper(handlers, ino, fi, 0, 0n, 1024n, context)).resolves.toBeUndefined();
    });

    it('supports different file handles', async () => {
      const mockFallocate = jest.fn().mockResolvedValue(undefined);
      const handlers = { fallocate: mockFallocate };

      const differentFi: FileInfo = {
        fh: createFd(10),
        flags: createFlags(0x100), // O_RDONLY
      };

      await fallocateWrapper(handlers, ino, differentFi, 1, 4096n, 8192n, context);

      expect(mockFallocate).toHaveBeenCalledWith(ino, differentFi, 1, 4096n, 8192n, context, {});
    });

    it('handles complex mode flag combinations', async () => {
      const mockFallocate = jest.fn().mockResolvedValue(undefined);
      const handlers = { fallocate: mockFallocate };

      // Test combination of flags
      const mode = 1 | 2 | 4; // FALLOC_FL_KEEP_SIZE | FALLOC_FL_PUNCH_HOLE | FALLOC_FL_NO_HIDE_STALE
      await fallocateWrapper(handlers, ino, fi, mode, 0n, 1024n, context);

      expect(mockFallocate).toHaveBeenCalledWith(ino, fi, mode, 0n, 1024n, context, {});
    });
  });
});