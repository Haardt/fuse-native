import { accessWrapper, validateAccess } from '../ts/ops/access.js';
import { FuseErrno } from '../ts/errors.js';
import {
  createGid,
  createIno,
  createUid,
  type RequestContext,
} from '../ts/types.js';

describe('Access Operation', () => {
  const ino = createIno(42n);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: 0o022 as any,
  };

  describe('validateAccess', () => {
    it('accepts valid parameters', () => {
      expect(() => validateAccess(ino, 0)).not.toThrow(); // F_OK
      expect(() => validateAccess(ino, 4)).not.toThrow(); // R_OK
      expect(() => validateAccess(ino, 2)).not.toThrow(); // W_OK
      expect(() => validateAccess(ino, 1)).not.toThrow(); // X_OK
      expect(() => validateAccess(ino, 7)).not.toThrow(); // R_OK | W_OK | X_OK
    });

    it('rejects invalid inode', () => {
      expect(() => validateAccess(123 as any, 4)).toThrow(FuseErrno);
    });

    it('rejects invalid mask parameter', () => {
      expect(() => validateAccess(ino, 'invalid' as any)).toThrow(FuseErrno);
      expect(() => validateAccess(ino, null as any)).toThrow(FuseErrno);
      expect(() => validateAccess(ino, undefined as any)).toThrow(FuseErrno);
    });

    it('rejects negative mask', () => {
      expect(() => validateAccess(ino, -1)).toThrow(FuseErrno);
    });

    it('rejects non-integer mask', () => {
      expect(() => validateAccess(ino, 4.5)).toThrow(FuseErrno);
    });
  });

  describe('accessWrapper', () => {
    it('calls access handler when available with F_OK', async () => {
      const mockAccess = jest.fn().mockResolvedValue(undefined);
      const handlers = { access: mockAccess };

      const result = await accessWrapper(handlers, ino, 0, context);

      expect(mockAccess).toHaveBeenCalledWith(ino, 0, context, {});
      expect(result).toBeUndefined();
    });

    it('calls access handler when available with R_OK', async () => {
      const mockAccess = jest.fn().mockResolvedValue(undefined);
      const handlers = { access: mockAccess };

      const result = await accessWrapper(handlers, ino, 4, context);

      expect(mockAccess).toHaveBeenCalledWith(ino, 4, context, {});
      expect(result).toBeUndefined();
    });

    it('calls access handler when available with combined permissions', async () => {
      const mockAccess = jest.fn().mockResolvedValue(undefined);
      const handlers = { access: mockAccess };

      const result = await accessWrapper(handlers, ino, 7, context); // R_OK | W_OK | X_OK

      expect(mockAccess).toHaveBeenCalledWith(ino, 7, context, {});
      expect(result).toBeUndefined();
    });

    it('throws ENOSYS when no access handler is available', async () => {
      await expect(accessWrapper({}, ino, 4, context))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('passes options through correctly', async () => {
      const mockAccess = jest.fn().mockResolvedValue(undefined);
      const handlers = { access: mockAccess };
      const options = { signal: new AbortController().signal, timeout: 5000 };

      await accessWrapper(handlers, ino, 4, context, options);

      expect(mockAccess).toHaveBeenCalledWith(ino, 4, context, options);
    });

    it('throws when access handler throws', async () => {
      const handlers = {
        access: jest.fn().mockRejectedValue(new Error('test error')),
      };

      await expect(accessWrapper(handlers, ino, 4, context))
        .rejects.toThrow('test error');
    });

    it('handles different access masks correctly', async () => {
      const mockAccess = jest.fn().mockResolvedValue(undefined);
      const handlers = { access: mockAccess };

      // Test F_OK (existence check)
      await accessWrapper(handlers, ino, 0, context);
      expect(mockAccess).toHaveBeenLastCalledWith(ino, 0, context, {});

      // Reset mock
      mockAccess.mockClear();

      // Test R_OK (read permission)
      await accessWrapper(handlers, ino, 4, context);
      expect(mockAccess).toHaveBeenLastCalledWith(ino, 4, context, {});

      // Reset mock
      mockAccess.mockClear();

      // Test W_OK (write permission)
      await accessWrapper(handlers, ino, 2, context);
      expect(mockAccess).toHaveBeenLastCalledWith(ino, 2, context, {});

      // Reset mock
      mockAccess.mockClear();

      // Test X_OK (execute permission)
      await accessWrapper(handlers, ino, 1, context);
      expect(mockAccess).toHaveBeenLastCalledWith(ino, 1, context, {});
    });
  });
});