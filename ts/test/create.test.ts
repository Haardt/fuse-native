import {
  FuseErrno,
  createIno,
  createMode,
  createUid,
  createGid,
  createFd,
  createFlags,
  getCurrentTimestamp,
  type RequestContext,
} from '../index.ts';
import { validateCreate, createWrapper, type CreateResult } from '../ops/create.ts';

describe('Create Operation', () => {
  function createSampleStat(): CreateResult {
    const timestamp = getCurrentTimestamp();
    return {
      attr: {
        ino: createIno(99n),
        mode: createMode(0o100644),
        nlink: 1,
        uid: createUid(1000),
        gid: createGid(1000),
        rdev: 0n,
        size: 0n,
        blksize: 4096,
        blocks: 0n,
        atime: timestamp,
        mtime: timestamp,
        ctime: timestamp,
      },
      timeout: 2.5,
      fi: {
        fh: createFd(5),
        flags: createFlags(0),
      },
    };
  }

  const parent = createIno(42n);
  const name = 'newfile.txt';
  const mode = createMode(0o100644);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: createMode(0o022),
  };

  describe('validateCreate', () => {
    it('accepts valid parameters', () => {
      expect(() => validateCreate(parent, name, mode)).not.toThrow();
    });

    it('rejects invalid parent inode', () => {
      expect(() => validateCreate('invalid' as any, name, mode)).toThrow(FuseErrno);
      expect(() => validateCreate(createIno(0n), name, mode)).toThrow(FuseErrno);
    });

    it('rejects invalid name', () => {
      expect(() => validateCreate(parent, '', mode)).toThrow(FuseErrno);
      expect(() => validateCreate(parent, 'a'.repeat(256), mode)).toThrow(FuseErrno);
    });

    it('rejects invalid mode', () => {
      expect(() => validateCreate(parent, name, 'invalid' as any)).toThrow(FuseErrno);
      expect(() => validateCreate(parent, name, 0)).toThrow(FuseErrno);
      expect(() => validateCreate(parent, name, -1)).toThrow(FuseErrno);
    });

    it('rejects directory mode', () => {
      const dirMode = createMode(0o40755);
      expect(() => validateCreate(parent, name, dirMode)).toThrow(FuseErrno);
    });

    it('rejects non-regular file modes', () => {
      const blockMode = createMode(0o60644);
      expect(() => validateCreate(parent, name, blockMode)).toThrow(FuseErrno);
    });
  });

  describe('createWrapper', () => {
    it('calls create handler with correct arguments and returns result', async () => {
      const result = createSampleStat();
      const handler = jest.fn().mockResolvedValue(result);

      const actual = await createWrapper({ create: handler }, parent, name, 0o100644, context);

      expect(handler).toHaveBeenCalledWith(parent, name, 0o100644, context, {});
      expect(actual).toEqual(result);
    });

    it('defaults timeout to 1 second when not provided', async () => {
      const result = createSampleStat();
      delete (result as any).timeout;
      const handler = jest.fn().mockResolvedValue(result);

      const actual = await createWrapper({ create: handler }, parent, name, 0o100644);

      expect(actual.timeout).toBe(1.0);
    });

    it('throws if no create handler is registered', async () => {
      await expect(createWrapper({}, parent, name, 0o100644)).rejects.toMatchObject({
        code: 'ENOSYS',
      });
    });

    it('throws when handler returns invalid result', async () => {
      const handler = jest.fn().mockResolvedValue(null);

      await expect(createWrapper({ create: handler }, parent, name, 0o100644)).rejects.toMatchObject({
        code: 'EIO',
      });
    });

    it('throws when handler returns invalid attr', async () => {
      const handler = jest.fn().mockResolvedValue({ attr: null, timeout: 1.0, fi: {} });

      await expect(createWrapper({ create: handler }, parent, name, 0o100644)).rejects.toMatchObject({
        code: 'EIO',
      });
    });

    it('throws when handler returns invalid fi', async () => {
      const result = createSampleStat();
      result.fi = {} as any;
      const handler = jest.fn().mockResolvedValue(result);

      await expect(createWrapper({ create: handler }, parent, name, 0o100644)).rejects.toMatchObject({
        code: 'EIO',
      });
    });

    it('throws when timeout is invalid', async () => {
      const result = createSampleStat();
      result.timeout = -1;
      const handler = jest.fn().mockResolvedValue(result);

      await expect(createWrapper({ create: handler }, parent, name, 0o100644)).rejects.toMatchObject({
        code: 'EIO',
      });
    });
  });
});