import { readWrapper, validateRead } from '../ts/ops/read.js';
import { FuseErrno } from '../ts/errors.js';
import {
  createGid,
  createIno,
  createMode,
  createUid,
  type ReadOptions,
  type RequestContext,
} from '../ts/types.js';

function createSampleReadOptions(): ReadOptions {
  return {
    offset: 100n,
    size: 1024,
  };
}

describe('Read Operation', () => {
  const ino = createIno(42n);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: createMode(0o022),
  };

  describe('validateRead', () => {
    it('accepts valid parameters', () => {
      const options = createSampleReadOptions();
      expect(() => validateRead(ino, options)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      const options = createSampleReadOptions();
      expect(() => validateRead(123 as any, options)).toThrow(FuseErrno);
      expect(() => validateRead('invalid' as any, options)).toThrow(FuseErrno);
    });

    it('rejects invalid options object', () => {
      expect(() => validateRead(ino, null as any)).toThrow(FuseErrno);
      expect(() => validateRead(ino, 'invalid' as any)).toThrow(FuseErrno);
    });

    it('rejects invalid offset', () => {
      expect(() => validateRead(ino, { offset: 'invalid' as any, size: 1024 })).toThrow(FuseErrno);
      expect(() => validateRead(ino, { offset: -1n, size: 1024 })).toThrow(FuseErrno);
    });

    it('rejects invalid size', () => {
      expect(() => validateRead(ino, { offset: 100n, size: 'invalid' as any })).toThrow(FuseErrno);
      expect(() => validateRead(ino, { offset: 100n, size: -1 })).toThrow(FuseErrno);
      expect(() => validateRead(ino, { offset: 100n, size: 1.5 })).toThrow(FuseErrno);
    });
  });

  describe('readWrapper', () => {
    it('calls read handler with correct arguments and returns result', async () => {
      const options = createSampleReadOptions();
      const buffer = new ArrayBuffer(1024);
      const mockRead = jest.fn().mockResolvedValue(buffer);
      const handlers = { read: mockRead };

      const result = await readWrapper(handlers, ino, context, options);

      expect(mockRead).toHaveBeenCalledWith(ino, context, options);
      expect(result).toBe(buffer);
    });

    it('throws if no read handler is registered', async () => {
      const options = createSampleReadOptions();
      await expect(readWrapper({}, ino, context, options)).rejects.toMatchObject({
        code: 'ENOSYS',
        name: 'FuseErrno',
      });
    });

    it('throws when handler returns invalid result', async () => {
      const options = createSampleReadOptions();
      const handlers = {
        read: jest.fn().mockResolvedValue(null),
      };

      await expect(readWrapper(handlers, ino, context, options)).rejects.toMatchObject({
        code: 'EIO',
        name: 'FuseErrno',
      });
    });

    it('throws when handler returns non-ArrayBuffer', async () => {
      const options = createSampleReadOptions();
      const handlers = {
        read: jest.fn().mockResolvedValue('not a buffer'),
      };

      await expect(readWrapper(handlers, ino, context, options)).rejects.toMatchObject({
        code: 'EIO',
        name: 'FuseErrno',
      });
    });

    it('accepts TypedArray as valid result', async () => {
      const options = createSampleReadOptions();
      const buffer = new Uint8Array(1024);
      const mockRead = jest.fn().mockResolvedValue(buffer.buffer);
      const handlers = { read: mockRead };

      const result = await readWrapper(handlers, ino, context, options);

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(1024);
    });
  });
});