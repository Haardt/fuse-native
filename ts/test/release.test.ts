import { releaseWrapper, validateRelease } from '../ops/release.ts';
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

describe('Release Operation', () => {
  const ino = createIno(42n);
  const fi = createSampleFileInfo();
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: createMode(0o022),
  };

  describe('validateRelease', () => {
    it('accepts valid parameters', () => {
      expect(() => validateRelease(ino)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateRelease(123 as any)).toThrow(FuseErrno);
      expect(() => validateRelease('invalid' as any)).toThrow(FuseErrno);
    });
  });

  describe('releaseWrapper', () => {
    it('calls release handler with correct arguments', async () => {
      const mockRelease = jest.fn().mockResolvedValue(undefined);
      const handlers = { release: mockRelease };
      const options = { timeout: 500 };

      await releaseWrapper(handlers, ino, fi, context, options);

      expect(mockRelease).toHaveBeenCalledWith(ino, fi, context, options);
    });

    it('throws if no release handler is registered', async () => {
      await expect(releaseWrapper({}, ino, fi)).rejects.toMatchObject({
        code: 'ENOSYS',
        name: 'FuseErrno',
      });
    });

    it('throws when handler throws', async () => {
      const handlers = {
        release: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(releaseWrapper(handlers, ino, fi)).rejects.toThrow('test error');
    });
  });
});