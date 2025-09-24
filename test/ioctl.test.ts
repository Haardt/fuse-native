import { ioctlWrapper, validateIoctl } from '../ts/ops/ioctl.js';
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

describe('Ioctl Operation', () => {
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

  describe('validateIoctl', () => {
    it('accepts valid parameters with number arg', () => {
      expect(() => validateIoctl(ino, 0x1234, 42, fi, 0)).not.toThrow();
    });

    it('accepts valid parameters with bigint arg', () => {
      expect(() => validateIoctl(ino, 0x5678, 123456789n, fi, 1)).not.toThrow();
    });

    it('accepts valid parameters with Buffer arg', () => {
      const buffer = Buffer.from('test data');
      expect(() => validateIoctl(ino, 0x9ABC, buffer, fi, 2)).not.toThrow();
    });

    it('accepts valid parameters with null arg', () => {
      expect(() => validateIoctl(ino, 0xDEF0, null, fi, 3)).not.toThrow();
    });

    it('accepts various ioctl commands', () => {
      expect(() => validateIoctl(ino, 0, 0, fi, 0)).not.toThrow();
      expect(() => validateIoctl(ino, 0xFFFFFFFF, 0, fi, 0)).not.toThrow();
    });

    it('accepts various flags', () => {
      expect(() => validateIoctl(ino, 0x1234, 0, fi, 0)).not.toThrow();
      expect(() => validateIoctl(ino, 0x1234, 0, fi, 0xFF)).not.toThrow();
      expect(() => validateIoctl(ino, 0x1234, 0, fi, 0xFFFFFFFF)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateIoctl(123 as any, 0x1234, 0, fi, 0)).toThrow(FuseErrno);
    });

    it('rejects invalid command', () => {
      expect(() => validateIoctl(ino, 'invalid' as any, 0, fi, 0)).toThrow(FuseErrno);
      expect(() => validateIoctl(ino, -1, 0, fi, 0)).toThrow(FuseErrno);
      expect(() => validateIoctl(ino, 1.5, 0, fi, 0)).toThrow(FuseErrno);
    });

    it('rejects invalid arg types', () => {
      expect(() => validateIoctl(ino, 0x1234, 'invalid' as any, fi, 0)).toThrow(FuseErrno);
      expect(() => validateIoctl(ino, 0x1234, {} as any, fi, 0)).toThrow(FuseErrno);
      expect(() => validateIoctl(ino, 0x1234, [] as any, fi, 0)).toThrow(FuseErrno);
    });

    it('rejects invalid file info', () => {
      expect(() => validateIoctl(ino, 0x1234, 0, null as any, 0)).toThrow(FuseErrno);
      expect(() => validateIoctl(ino, 0x1234, 0, {} as any, 0)).toThrow(FuseErrno);
    });

    it('rejects file info without fh', () => {
      const invalidFi = { flags: createFlags(0) };
      expect(() => validateIoctl(ino, 0x1234, 0, invalidFi as any, 0)).toThrow(FuseErrno);
    });

    it('rejects file info without flags', () => {
      const invalidFi = { fh: createFd(5) };
      expect(() => validateIoctl(ino, 0x1234, 0, invalidFi as any, 0)).toThrow(FuseErrno);
    });

    it('rejects invalid flags', () => {
      expect(() => validateIoctl(ino, 0x1234, 0, fi, 'invalid' as any)).toThrow(FuseErrno);
      expect(() => validateIoctl(ino, 0x1234, 0, fi, -1)).toThrow(FuseErrno);
      expect(() => validateIoctl(ino, 0x1234, 0, fi, 1.5)).toThrow(FuseErrno);
    });
  });

  describe('ioctlWrapper', () => {
    it('calls ioctl handler and returns number result', async () => {
      const mockIoctl = jest.fn().mockResolvedValue({ result: 42 });
      const handlers = { ioctl: mockIoctl };

      const result = await ioctlWrapper(handlers, ino, 0x1234, 100, fi, 0, context);

      expect(mockIoctl).toHaveBeenCalledWith(ino, 0x1234, 100, fi, 0, context, {});
      expect(result).toEqual({ result: 42 });
    });

    it('calls ioctl handler and returns bigint result', async () => {
      const mockIoctl = jest.fn().mockResolvedValue({ result: 123456789n });
      const handlers = { ioctl: mockIoctl };

      const result = await ioctlWrapper(handlers, ino, 0x5678, 200n, fi, 1, context);

      expect(mockIoctl).toHaveBeenCalledWith(ino, 0x5678, 200n, fi, 1, context, {});
      expect(result).toEqual({ result: 123456789n });
    });

    it('calls ioctl handler and returns Buffer result', async () => {
      const bufferResult = Buffer.from('ioctl response');
      const mockIoctl = jest.fn().mockResolvedValue({ result: bufferResult });
      const handlers = { ioctl: mockIoctl };

      const result = await ioctlWrapper(handlers, ino, 0x9ABC, Buffer.from('arg'), fi, 2, context);

      expect(mockIoctl).toHaveBeenCalledWith(ino, 0x9ABC, Buffer.from('arg'), fi, 2, context, {});
      expect(result).toEqual({ result: bufferResult });
    });

    it('calls ioctl handler and returns null result', async () => {
      const mockIoctl = jest.fn().mockResolvedValue({ result: null });
      const handlers = { ioctl: mockIoctl };

      const result = await ioctlWrapper(handlers, ino, 0xDEF0, null, fi, 3, context);

      expect(mockIoctl).toHaveBeenCalledWith(ino, 0xDEF0, null, fi, 3, context, {});
      expect(result).toEqual({ result: null });
    });

    it('handles various ioctl commands and args', async () => {
      const mockIoctl = jest.fn().mockResolvedValue({ result: 0 });
      const handlers = { ioctl: mockIoctl };

      // Test different argument types
      await ioctlWrapper(handlers, ino, 0x1111, 42, fi, 0, context);
      expect(mockIoctl).toHaveBeenLastCalledWith(ino, 0x1111, 42, fi, 0, context, {});

      mockIoctl.mockClear();

      await ioctlWrapper(handlers, ino, 0x2222, 999999999n, fi, 1, context);
      expect(mockIoctl).toHaveBeenLastCalledWith(ino, 0x2222, 999999999n, fi, 1, context, {});

      mockIoctl.mockClear();

      await ioctlWrapper(handlers, ino, 0x3333, Buffer.from('data'), fi, 2, context);
      expect(mockIoctl).toHaveBeenLastCalledWith(ino, 0x3333, Buffer.from('data'), fi, 2, context, {});
    });

    it('throws ENOSYS when no ioctl handler is available', async () => {
      await expect(ioctlWrapper({}, ino, 0x1234, 0, fi, 0, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('passes options through correctly', async () => {
      const mockIoctl = jest.fn().mockResolvedValue({ result: 123 });
      const handlers = { ioctl: mockIoctl };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await ioctlWrapper(handlers, ino, 0x1234, 100, fi, 0, context, options);

      expect(mockIoctl).toHaveBeenCalledWith(ino, 0x1234, 100, fi, 0, context, options);
    });

    it('throws when ioctl handler throws', async () => {
      const handlers = {
        ioctl: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(ioctlWrapper(handlers, ino, 0x1234, 0, fi, 0, context))
        .rejects.toThrow('test error');
    });

    it('throws when ioctl handler returns invalid result', async () => {
      const handlers = {
        ioctl: jest.fn().mockResolvedValue(null),
      };

      await expect(ioctlWrapper(handlers, ino, 0x1234, 0, fi, 0, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('throws when ioctl handler returns invalid result type', async () => {
      const handlers = {
        ioctl: jest.fn().mockResolvedValue({ result: 'invalid' }),
      };

      await expect(ioctlWrapper(handlers, ino, 0x1234, 0, fi, 0, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('throws when ioctl handler returns object result', async () => {
      const handlers = {
        ioctl: jest.fn().mockResolvedValue({ result: {} }),
      };

      await expect(ioctlWrapper(handlers, ino, 0x1234, 0, fi, 0, context))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });
  });
});