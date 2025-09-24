import { writeWrapper, validateWrite } from '../ts/ops/write.js';
import { FuseErrno } from '../ts/errors.js';
import {
  createGid,
  createIno,
  createMode,
  createUid,
  type WriteOptions,
  type RequestContext,
} from '../ts/types.js';

function createSampleWriteOptions(): WriteOptions {
  return {
    offset: 100n,
  };
}

describe('Write Operation', () => {
  const ino = createIno(42n);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: createMode(0o022),
  };

  describe('validateWrite', () => {
    it('accepts valid parameters', () => {
      const data = new ArrayBuffer(1024);
      const options = createSampleWriteOptions();
      expect(() => validateWrite(ino, data, options)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      const data = new ArrayBuffer(1024);
      const options = createSampleWriteOptions();
      expect(() => validateWrite(123 as any, data, options)).toThrow(FuseErrno);
      expect(() => validateWrite('invalid' as any, data, options)).toThrow(FuseErrno);
    });

    it('rejects invalid data', () => {
      const options = createSampleWriteOptions();
      expect(() => validateWrite(ino, null as any, options)).toThrow(FuseErrno);
      expect(() => validateWrite(ino, 'not a buffer' as any, options)).toThrow(FuseErrno);
      expect(() => validateWrite(ino, new Uint8Array(10) as any, options)).toThrow(FuseErrno);
    });

    it('rejects invalid options object', () => {
      const data = new ArrayBuffer(1024);
      expect(() => validateWrite(ino, data, null as any)).toThrow(FuseErrno);
      expect(() => validateWrite(ino, data, 'invalid' as any)).toThrow(FuseErrno);
    });

    it('rejects invalid offset', () => {
      const data = new ArrayBuffer(1024);
      expect(() => validateWrite(ino, data, { offset: 'invalid' as any })).toThrow(FuseErrno);
      expect(() => validateWrite(ino, data, { offset: -1n })).toThrow(FuseErrno);
    });
  });

  describe('writeWrapper', () => {
    it('calls write handler with correct arguments and returns result', async () => {
      const data = new ArrayBuffer(1024);
      const options = createSampleWriteOptions();
      const mockWrite = jest.fn().mockResolvedValue(512);
      const handlers = { write: mockWrite };

      const result = await writeWrapper(handlers, ino, data, context, options);

      expect(mockWrite).toHaveBeenCalledWith(ino, data, context, options);
      expect(result).toBe(512);
    });

    it('throws if no write handler is registered', async () => {
      const data = new ArrayBuffer(1024);
      const options = createSampleWriteOptions();
      await expect(writeWrapper({}, ino, data, context, options)).rejects.toMatchObject({
        code: 'ENOSYS',
        name: 'FuseErrno',
      });
    });

    it('throws when handler returns invalid result', async () => {
      const data = new ArrayBuffer(1024);
      const options = createSampleWriteOptions();
      const handlers = {
        write: jest.fn().mockResolvedValue(null),
      };

      await expect(writeWrapper(handlers, ino, data, context, options)).rejects.toMatchObject({
        code: 'EIO',
        name: 'FuseErrno',
      });
    });

    it('throws when handler returns negative number', async () => {
      const data = new ArrayBuffer(1024);
      const options = createSampleWriteOptions();
      const handlers = {
        write: jest.fn().mockResolvedValue(-1),
      };

      await expect(writeWrapper(handlers, ino, data, context, options)).rejects.toMatchObject({
        code: 'EIO',
        name: 'FuseErrno',
      });
    });

    it('throws when handler returns non-integer', async () => {
      const data = new ArrayBuffer(1024);
      const options = createSampleWriteOptions();
      const handlers = {
        write: jest.fn().mockResolvedValue(1.5),
      };

      await expect(writeWrapper(handlers, ino, data, context, options)).rejects.toMatchObject({
        code: 'EIO',
        name: 'FuseErrno',
      });
    });

    it('accepts zero bytes written', async () => {
      const data = new ArrayBuffer(1024);
      const options = createSampleWriteOptions();
      const mockWrite = jest.fn().mockResolvedValue(0);
      const handlers = { write: mockWrite };

      const result = await writeWrapper(handlers, ino, data, context, options);

      expect(result).toBe(0);
    });
  });
});