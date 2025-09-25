import { truncateWrapper, validateTruncate } from '../ops/truncate.ts';
import { FuseErrno } from '../errors.ts';
import {
  createFd,
  createFlags,
  createGid,
  createIno,
  createMode,
  createUid,
  type FileInfo,
  type RequestContext,
} from '../types.ts';

function createSampleFileInfo(): FileInfo {
  return {
    fh: createFd(5),
    flags: createFlags(0),
  };
}

function createSampleStat() {
  return {
    ino: createIno(42n),
    mode: createMode(0o100644),
    nlink: 1,
    uid: createUid(1000),
    gid: createGid(1000),
    rdev: 0n,
    size: 1024n,
    blksize: 4096,
    blocks: 2n,
    atime: 1672531200000000000n,
    mtime: 1672531200000000000n,
    ctime: 1672531200000000000n,
  };
}

describe('Truncate Operation', () => {
  const ino = createIno(42n);
  const size = 512n;
  const fi = createSampleFileInfo();
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: createMode(0o022),
  };

  describe('validateTruncate', () => {
    it('accepts valid parameters', () => {
      expect(() => validateTruncate(ino, size)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateTruncate(123 as any, size)).toThrow(FuseErrno);
      expect(() => validateTruncate('invalid' as any, size)).toThrow(FuseErrno);
    });

    it('rejects invalid size', () => {
      expect(() => validateTruncate(ino, 'invalid' as any)).toThrow(FuseErrno);
      expect(() => validateTruncate(ino, -1n)).toThrow(FuseErrno);
    });
  });

  describe('truncateWrapper', () => {
    it('calls truncate handler when available', async () => {
      const mockTruncate = jest.fn().mockResolvedValue({
        attr: createSampleStat(),
        timeout: 1.0,
      });
      const handlers = { truncate: mockTruncate };
      const options = { timeout: 500 };

      const result = await truncateWrapper(handlers, ino, size, context, fi, options);

      expect(mockTruncate).toHaveBeenCalledWith(ino, size, context, fi, options);
      expect(result).toEqual({
        attr: createSampleStat(),
        timeout: 1.0,
      });
    });

    it('falls back to setattr when no truncate handler', async () => {
      const mockSetattr = jest.fn().mockResolvedValue({
        attr: createSampleStat(),
        timeout: 1.0,
      });
      const handlers = { setattr: mockSetattr };
      const options = { timeout: 500 };

      const result = await truncateWrapper(handlers, ino, size, context, fi, options);

      expect(mockSetattr).toHaveBeenCalledWith(ino, { size }, context, {
        ...options,
        fi,
        valid: 0x40, // FUSE_SET_ATTR_SIZE
      });
      expect(result).toEqual({
        attr: createSampleStat(),
        timeout: 1.0,
      });
    });

    it('throws ENOSYS when neither truncate nor setattr handler is available', async () => {
      await expect(truncateWrapper({}, ino, size)).rejects.toMatchObject({
        code: 'ENOSYS',
        name: 'FuseErrno',
      });
    });

    it('throws when truncate handler throws', async () => {
      const handlers = {
        truncate: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(truncateWrapper(handlers, ino, size)).rejects.toThrow('test error');
    });
  });
});