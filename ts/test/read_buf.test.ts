import { readBufWrapper, validateReadBuf, validateFuseBufvec } from '../ops/read_buf.ts';
import { FuseErrno } from '../errors.ts';
import {
  createFd,
  createFlags,
  createGid,
  createIno,
  createUid,
  FuseBufFlags,
  type FuseBufvec,
  type RequestContext,
} from '../types.ts';

function createSampleBufvec(): FuseBufvec {
  const buffer = new ArrayBuffer(1024);
  new Uint8Array(buffer).fill(42); // Fill with test data

  return {
    count: 1,
    idx: 0,
    off: 0,
    buf: [{
      size: 1024,
      flags: FuseBufFlags.NONE,
      mem: buffer,
    }],
  };
}

function createSampleFdBufvec(): FuseBufvec {
  return {
    count: 1,
    idx: 0,
    off: 0,
    buf: [{
      size: 512,
      flags: FuseBufFlags.IS_FD,
      fd: 10,
      pos: 100n,
    }],
  };
}

describe('ReadBuf Operation', () => {
  const ino = createIno(42n);
  const fi = {
    fh: createFd(5),
    flags: createFlags(0),
  };
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: 0o022 as any,
  };

  describe('validateReadBuf', () => {
    it('accepts valid parameters', () => {
      expect(() => validateReadBuf(ino, 1024, 0n)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      expect(() => validateReadBuf(123 as any, 1024, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid size', () => {
      expect(() => validateReadBuf(ino, -1, 0n)).toThrow(FuseErrno);
      expect(() => validateReadBuf(ino, 'invalid' as any, 0n)).toThrow(FuseErrno);
      expect(() => validateReadBuf(ino, 1.5, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid offset', () => {
      expect(() => validateReadBuf(ino, 1024, -1n)).toThrow(FuseErrno);
      expect(() => validateReadBuf(ino, 1024, 'invalid' as any)).toThrow(FuseErrno);
    });
  });

  describe('validateFuseBufvec', () => {
    it('accepts valid memory buffer vector', () => {
      const bufvec = createSampleBufvec();
      expect(() => validateFuseBufvec(bufvec)).not.toThrow();
    });

    it('accepts valid file descriptor buffer vector', () => {
      const bufvec = createSampleFdBufvec();
      expect(() => validateFuseBufvec(bufvec)).not.toThrow();
    });

    it('rejects invalid buffer vector object', () => {
      expect(() => validateFuseBufvec(null as any)).toThrow(FuseErrno);
      expect(() => validateFuseBufvec('invalid' as any)).toThrow(FuseErrno);
    });

    it('rejects invalid count', () => {
      const bufvec = { ...createSampleBufvec(), count: -1 };
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);
    });

    it('rejects invalid index', () => {
      const bufvec = { ...createSampleBufvec(), idx: -1 };
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);

      const bufvec2 = { ...createSampleBufvec(), idx: 2 };
      expect(() => validateFuseBufvec(bufvec2)).toThrow(FuseErrno);
    });

    it('rejects invalid offset', () => {
      const bufvec = { ...createSampleBufvec(), off: -1 };
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);
    });

    it('rejects invalid buf array', () => {
      const bufvec = { ...createSampleBufvec(), buf: null as any };
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);
    });

    it('rejects mismatched buf length', () => {
      const bufvec = { ...createSampleBufvec(), count: 2 };
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);
    });

    it('rejects invalid buffer objects', () => {
      const bufvec = createSampleBufvec();
      bufvec.buf[0] = null as any;
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);
    });

    it('rejects invalid buffer size', () => {
      const bufvec = createSampleBufvec();
      bufvec.buf[0].size = -1;
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);
    });

    it('rejects invalid buffer flags', () => {
      const bufvec = createSampleBufvec();
      bufvec.buf[0].flags = 'invalid' as any;
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);
    });

    it('rejects FD buffer without valid fd', () => {
      const bufvec = createSampleFdBufvec();
      bufvec.buf[0].fd = -1;
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);
    });

    it('rejects FD buffer without pos', () => {
      const bufvec = createSampleFdBufvec();
      delete bufvec.buf[0].pos;
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);
    });

    it('rejects memory buffer without ArrayBuffer', () => {
      const bufvec = createSampleBufvec();
      bufvec.buf[0].mem = null as any;
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);
    });

    it('rejects memory buffer with insufficient size', () => {
      const bufvec = createSampleBufvec();
      bufvec.buf[0].size = 2048; // Larger than buffer
      expect(() => validateFuseBufvec(bufvec)).toThrow(FuseErrno);
    });
  });

  describe('readBufWrapper', () => {
    it('calls read_buf handler when available', async () => {
      const mockReadBuf = jest.fn().mockResolvedValue(createSampleBufvec());
      const handlers = { read_buf: mockReadBuf };
      const options = { offset: 0n, size: 1024, fi };

      const result = await readBufWrapper(handlers, ino, context, options);

      expect(mockReadBuf).toHaveBeenCalledWith(ino, context, options);
      expect(result).toEqual(createSampleBufvec());
    });

    it('falls back to read handler and converts to buffer vector', async () => {
      const testBuffer = new ArrayBuffer(512);
      new Uint8Array(testBuffer).fill(123);

      const mockRead = jest.fn().mockResolvedValue(testBuffer);
      const handlers = { read: mockRead };
      const options = { offset: 100n, size: 512, fi };

      const result = await readBufWrapper(handlers, ino, context, options);

      expect(mockRead).toHaveBeenCalledWith(ino, context, options);
      expect(result.count).toBe(1);
      expect(result.idx).toBe(0);
      expect(result.off).toBe(0);
      expect(result.buf[0].size).toBe(512);
      expect(result.buf[0].flags).toBe(FuseBufFlags.NONE);
      expect(result.buf[0].mem).toBe(testBuffer);
    });

    it('throws ENOSYS when neither read_buf nor read handler is available', async () => {
      const options = { offset: 0n, size: 1024, fi };

      await expect(readBufWrapper({}, ino, context, options))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('throws when read_buf handler returns invalid buffer vector', async () => {
      const mockReadBuf = jest.fn().mockResolvedValue(null);
      const handlers = { read_buf: mockReadBuf };
      const options = { offset: 0n, size: 1024, fi };

      await expect(readBufWrapper(handlers, ino, context, options))
        .rejects.toMatchObject({
          code: 'EINVAL',
        });
    });

    it('throws when read handler returns invalid buffer', async () => {
      const mockRead = jest.fn().mockResolvedValue('invalid');
      const handlers = { read: mockRead };
      const options = { offset: 0n, size: 1024, fi };

      await expect(readBufWrapper(handlers, ino, context, options))
        .rejects.toMatchObject({
          code: 'EIO',
        });
    });

    it('throws when read_buf handler throws', async () => {
      const handlers = {
        read_buf: jest.fn().mockRejectedValue(new Error('test error')),
      };
      const options = { offset: 0n, size: 1024, fi };

      await expect(readBufWrapper(handlers, ino, context, options))
        .rejects.toThrow('test error');
    });
  });
});