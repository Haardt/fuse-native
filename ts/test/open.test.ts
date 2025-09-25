import { openWrapper, validateOpen } from '../ops/open.ts';
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

describe('Open Operation', () => {
  const ino = createIno(42n);
  const flags = createFlags(0);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: createMode(0o022),
  };

  describe('validateOpen', () => {
    it('accepts valid parameters', () => {
      expect(() => validateOpen(ino, flags)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateOpen(123 as any, flags)).toThrow(FuseErrno);
      expect(() => validateOpen('invalid' as any, flags)).toThrow(FuseErrno);
    });

    it('rejects invalid flags', () => {
      expect(() => validateOpen(ino, 'invalid' as any)).toThrow(FuseErrno);
      expect(() => validateOpen(ino, -1)).toThrow(FuseErrno);
      expect(() => validateOpen(ino, 1.5)).toThrow(FuseErrno);
    });
  });

  describe('openWrapper', () => {
    it('calls open handler with correct arguments and returns result', async () => {
      const fi = createSampleFileInfo();
      const mockOpen = jest.fn().mockResolvedValue(fi);
      const handlers = { open: mockOpen };
      const options = { timeout: 500 };

      const result = await openWrapper(handlers, ino, flags, context, options);

      expect(mockOpen).toHaveBeenCalledWith(ino, flags, context, options);
      expect(result).toEqual(fi);
    });

    it('throws if no open handler is registered', async () => {
      await expect(openWrapper({}, ino, flags)).rejects.toMatchObject({
        code: 'ENOSYS',
        name: 'FuseErrno',
      });
    });

    it('throws when handler returns invalid result', async () => {
      const handlers = {
        open: jest.fn().mockResolvedValue(null),
      };

      await expect(openWrapper(handlers, ino, flags)).rejects.toMatchObject({
        code: 'EIO',
        name: 'FuseErrno',
      });
    });

    it('throws when handler returns invalid FileInfo', async () => {
      const handlers = {
        open: jest.fn().mockResolvedValue({ invalid: 'object' }),
      };

      await expect(openWrapper(handlers, ino, flags)).rejects.toMatchObject({
        code: 'EIO',
        name: 'FuseErrno',
      });
    });

    it('throws when handler returns FileInfo with invalid fh', async () => {
      const handlers = {
        open: jest.fn().mockResolvedValue({ fh: 'invalid', flags: 0 }),
      };

      await expect(openWrapper(handlers, ino, flags)).rejects.toMatchObject({
        code: 'EIO',
        name: 'FuseErrno',
      });
    });

    it('throws when handler returns FileInfo with invalid flags', async () => {
      const handlers = {
        open: jest.fn().mockResolvedValue({ fh: 5, flags: 'invalid' }),
      };

      await expect(openWrapper(handlers, ino, flags)).rejects.toMatchObject({
        code: 'EIO',
        name: 'FuseErrno',
      });
    });
  });
});