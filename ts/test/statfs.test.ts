import { statfsWrapper, validateStatfs, validateStatvfsResult } from '../ops/statfs.ts';
import { FuseErrno } from '../errors.ts';
import { createIno, createGid, createUid, type RequestContext } from '../types.ts';

function createSampleStatvfsResult() {
  return {
    bsize: 4096,
    frsize: 4096,
    blocks: 1000000n,
    bfree: 500000n,
    bavail: 450000n,
    files: 100000n,
    ffree: 95000n,
    favail: 90000n,
    fsid: 12345n,
    flag: 0,
    namemax: 255,
  };
}

describe('Statfs Operation', () => {
  const ino = createIno(42n);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: 0o022 as any,
  };

  describe('validateStatfs', () => {
    it('accepts valid inode', () => {
      expect(() => validateStatfs(ino)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateStatfs(123 as any)).toThrow(FuseErrno);
    });
  });

  describe('validateStatvfsResult', () => {
    it('accepts valid statvfs result', () => {
      const result = createSampleStatvfsResult();
      expect(() => validateStatvfsResult(result)).not.toThrow();
    });

    it('rejects invalid result type', () => {
      expect(() => validateStatvfsResult(null as any)).toThrow(FuseErrno);
      expect(() => validateStatvfsResult('invalid' as any)).toThrow(FuseErrno);
    });

    it('rejects missing numeric fields', () => {
      const result = createSampleStatvfsResult();
      delete (result as any).bsize;
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);
    });

    it('rejects invalid field types', () => {
      const result = createSampleStatvfsResult();
      (result as any).bsize = 'invalid';
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);
    });

    it('rejects invalid block sizes', () => {
      const result = createSampleStatvfsResult();
      result.bsize = 0;
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);

      result.bsize = -1;
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);
    });

    it('rejects invalid fragment sizes', () => {
      const result = createSampleStatvfsResult();
      result.frsize = 0;
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);
    });

    it('rejects negative block counts', () => {
      const result = createSampleStatvfsResult();
      result.blocks = -1n;
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);

      result.blocks = 1000000n;
      result.bfree = -1n;
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);
    });

    it('rejects invalid block relationships', () => {
      const result = createSampleStatvfsResult();
      result.bfree = result.blocks + 100000n; // Free > total
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);

      result.bfree = 500000n;
      result.bavail = result.bfree + 100000n; // Available > free
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);
    });

    it('rejects negative inode counts', () => {
      const result = createSampleStatvfsResult();
      result.files = -1n;
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);
    });

    it('rejects invalid inode relationships', () => {
      const result = createSampleStatvfsResult();
      result.ffree = result.files + 10000n; // Free > total
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);

      result.ffree = 95000n;
      result.favail = result.ffree + 10000n; // Available > free
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);
    });

    it('rejects invalid name length', () => {
      const result = createSampleStatvfsResult();
      result.namemax = 0;
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);

      result.namemax = -1;
      expect(() => validateStatvfsResult(result)).toThrow(FuseErrno);
    });

    it('accepts valid BigInt values', () => {
      const result = createSampleStatvfsResult();
      result.blocks = 1000000n;
      result.fsid = 12345n;
      expect(() => validateStatvfsResult(result)).not.toThrow();
    });

    it('accepts valid number values', () => {
      const result = createSampleStatvfsResult();
      result.blocks = 1000000;
      result.fsid = 12345;
      expect(() => validateStatvfsResult(result)).not.toThrow();
    });
  });

  describe('statfsWrapper', () => {
    it('calls statfs handler when available', async () => {
      const mockStatfs = jest.fn().mockResolvedValue(createSampleStatvfsResult());
      const handlers = { statfs: mockStatfs };

      const result = await statfsWrapper(handlers, ino, context);

      expect(mockStatfs).toHaveBeenCalledWith(ino, context, {});
      expect(result).toEqual(createSampleStatvfsResult());
    });

    it('throws ENOSYS when no statfs handler is available', async () => {
      await expect(statfsWrapper({}, ino, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('passes options through correctly', async () => {
      const mockStatfs = jest.fn().mockResolvedValue(createSampleStatvfsResult());
      const handlers = { statfs: mockStatfs };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await statfsWrapper(handlers, ino, context, options);

      expect(mockStatfs).toHaveBeenCalledWith(ino, context, options);
    });

    it('throws when statfs handler returns invalid result', async () => {
      const mockStatfs = jest.fn().mockResolvedValue(null);
      const handlers = { statfs: mockStatfs };

      await expect(statfsWrapper(handlers, ino, context))
        .rejects.toMatchObject({
          code: 'EINVAL',
        });
    });

    it('throws when statfs handler throws', async () => {
      const handlers = {
        statfs: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(statfsWrapper(handlers, ino, context))
        .rejects.toThrow('test error');
    });

    it('validates the result from handler', async () => {
      const invalidResult = createSampleStatvfsResult();
      invalidResult.bsize = 0; // Invalid

      const mockStatfs = jest.fn().mockResolvedValue(invalidResult);
      const handlers = { statfs: mockStatfs };

      await expect(statfsWrapper(handlers, ino, context))
        .rejects.toMatchObject({
          code: 'EINVAL',
        });
    });
  });
});
