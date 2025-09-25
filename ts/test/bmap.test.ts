import { bmapWrapper, validateBmap } from '../ops/bmap.ts';
import { FuseErrno } from '../errors.ts';
import {
  createGid,
  createIno,
  createUid,
  type RequestContext,
} from '../types.ts';

describe('Bmap Operation', () => {
  const ino = createIno(42n);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: 0o022 as any,
  };

  describe('validateBmap', () => {
    it('accepts valid parameters', () => {
      expect(() => validateBmap(ino, 4096, 0n)).not.toThrow();
      expect(() => validateBmap(ino, 512, 100n)).not.toThrow();
      expect(() => validateBmap(ino, 1024, 0n)).not.toThrow();
    });

    it('accepts large block indices', () => {
      expect(() => validateBmap(ino, 4096, 1000000n)).not.toThrow();
      expect(() => validateBmap(ino, 4096, BigInt(Number.MAX_SAFE_INTEGER))).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateBmap(123 as any, 4096, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid blocksize', () => {
      expect(() => validateBmap(ino, 'invalid' as any, 0n)).toThrow(FuseErrno);
      expect(() => validateBmap(ino, null as any, 0n)).toThrow(FuseErrno);
      expect(() => validateBmap(ino, undefined as any, 0n)).toThrow(FuseErrno);
    });

    it('rejects non-positive blocksize', () => {
      expect(() => validateBmap(ino, 0, 0n)).toThrow(FuseErrno);
      expect(() => validateBmap(ino, -1, 0n)).toThrow(FuseErrno);
      expect(() => validateBmap(ino, -4096, 0n)).toThrow(FuseErrno);
    });

    it('rejects non-integer blocksize', () => {
      expect(() => validateBmap(ino, 4096.5, 0n)).toThrow(FuseErrno);
      expect(() => validateBmap(ino, NaN, 0n)).toThrow(FuseErrno);
      expect(() => validateBmap(ino, Infinity, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid block index', () => {
      expect(() => validateBmap(ino, 4096, 'invalid' as any)).toThrow(FuseErrno);
      expect(() => validateBmap(ino, 4096, null as any)).toThrow(FuseErrno);
      expect(() => validateBmap(ino, 4096, undefined as any)).toThrow(FuseErrno);
    });

    it('rejects negative block index', () => {
      expect(() => validateBmap(ino, 4096, -1n)).toThrow(FuseErrno);
      expect(() => validateBmap(ino, 4096, -100n)).toThrow(FuseErrno);
    });
  });

  describe('bmapWrapper', () => {
    it('calls bmap handler when available and returns block mapping', async () => {
      const mockBmap = jest.fn().mockResolvedValue({ block: 12345n });
      const handlers = { bmap: mockBmap };

      const result = await bmapWrapper(handlers, ino, 4096, 100n, context);

      expect(mockBmap).toHaveBeenCalledWith(ino, 4096, 100n, context, {});
      expect(result).toEqual({ block: 12345n });
    });

    it('accepts zero block number (unallocated)', async () => {
      const mockBmap = jest.fn().mockResolvedValue({ block: 0n });
      const handlers = { bmap: mockBmap };

      const result = await bmapWrapper(handlers, ino, 4096, 0n, context);

      expect(result).toEqual({ block: 0n });
    });

    it('accepts large block numbers', async () => {
      const mockBmap = jest.fn().mockResolvedValue({ block: 1000000000n });
      const handlers = { bmap: mockBmap };

      const result = await bmapWrapper(handlers, ino, 4096, 500n, context);

      expect(result).toEqual({ block: 1000000000n });
    });

    it('throws ENOSYS when no bmap handler is available', async () => {
      await expect(bmapWrapper({}, ino, 4096, 100n, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('passes options through correctly', async () => {
      const mockBmap = jest.fn().mockResolvedValue({ block: 999n });
      const handlers = { bmap: mockBmap };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await bmapWrapper(handlers, ino, 4096, 100n, context, options);

      expect(mockBmap).toHaveBeenCalledWith(ino, 4096, 100n, context, options);
    });

    it('throws when bmap handler throws', async () => {
      const handlers = {
        bmap: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(bmapWrapper(handlers, ino, 4096, 100n, context))
        .rejects.toThrow('test error');
    });

    it('throws when bmap handler returns invalid result', async () => {
      const handlers = {
        bmap: jest.fn().mockResolvedValue(null),
      };

      await expect(bmapWrapper(handlers, ino, 4096, 100n, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('throws when bmap handler returns invalid block number', async () => {
      const handlers = {
        bmap: jest.fn().mockResolvedValue({ block: 'invalid' }),
      };

      await expect(bmapWrapper(handlers, ino, 4096, 100n, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('throws when bmap handler returns negative block number', async () => {
      const handlers = {
        bmap: jest.fn().mockResolvedValue({ block: -1n }),
      };

      await expect(bmapWrapper(handlers, ino, 4096, 100n, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('handles different block sizes correctly', async () => {
      const mockBmap = jest.fn().mockResolvedValue({ block: 42n });
      const handlers = { bmap: mockBmap };

      // Test various block sizes
      await bmapWrapper(handlers, ino, 512, 10n, context);
      expect(mockBmap).toHaveBeenLastCalledWith(ino, 512, 10n, context, {});

      mockBmap.mockClear();

      await bmapWrapper(handlers, ino, 4096, 5n, context);
      expect(mockBmap).toHaveBeenLastCalledWith(ino, 4096, 5n, context, {});

      mockBmap.mockClear();

      await bmapWrapper(handlers, ino, 8192, 1n, context);
      expect(mockBmap).toHaveBeenLastCalledWith(ino, 8192, 1n, context, {});
    });
  });
});