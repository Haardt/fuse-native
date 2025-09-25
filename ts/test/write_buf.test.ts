import { writeBufWrapper, validateWriteBuf } from '../ops/write_buf.ts';
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

function createSampleFileInfo() {
  return {
    fh: createFd(5),
    flags: createFlags(0),
  };
}

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

describe('WriteBuf Operation', () => {
  const ino = createIno(42n);
  const fi = createSampleFileInfo();
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 1234,
    umask: 0o022 as any,
  };

  describe('validateWriteBuf', () => {
    it('accepts valid memory buffer vector', () => {
      const bufvec = createSampleBufvec();
      expect(() => validateWriteBuf(ino, bufvec, 0n)).not.toThrow();
    });

    it('accepts valid file descriptor buffer vector', () => {
      const bufvec = createSampleFdBufvec();
      expect(() => validateWriteBuf(ino, bufvec, 0n)).not.toThrow();
    });

    it('rejects invalid inode', () => {
      const bufvec = createSampleBufvec();
      expect(() => validateWriteBuf(123 as any, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid buffer vector object', () => {
      expect(() => validateWriteBuf(ino, null as any, 0n)).toThrow(FuseErrno);
      expect(() => validateWriteBuf(ino, 'invalid' as any, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid count', () => {
      const bufvec = { ...createSampleBufvec(), count: -1 };
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid index', () => {
      const bufvec = { ...createSampleBufvec(), idx: -1 };
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);

      const bufvec2 = { ...createSampleBufvec(), idx: 2 };
      expect(() => validateWriteBuf(ino, bufvec2, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid offset', () => {
      const bufvec = { ...createSampleBufvec(), off: -1 };
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid buf array', () => {
      const bufvec = { ...createSampleBufvec(), buf: null as any };
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects mismatched buf length', () => {
      const bufvec = { ...createSampleBufvec(), count: 2 };
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid buffer objects', () => {
      const bufvec = createSampleBufvec();
      bufvec.buf[0] = null as any;
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid buffer size', () => {
      const bufvec = createSampleBufvec();
      bufvec.buf[0].size = -1;
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid buffer flags', () => {
      const bufvec = createSampleBufvec();
      bufvec.buf[0].flags = 'invalid' as any;
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects FD buffer without valid fd', () => {
      const bufvec = createSampleFdBufvec();
      bufvec.buf[0].fd = -1;
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects FD buffer without pos', () => {
      const bufvec = createSampleFdBufvec();
      delete bufvec.buf[0].pos;
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects memory buffer without ArrayBuffer', () => {
      const bufvec = createSampleBufvec();
      bufvec.buf[0].mem = null as any;
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects memory buffer with insufficient size', () => {
      const bufvec = createSampleBufvec();
      bufvec.buf[0].size = 2048; // Larger than buffer
      expect(() => validateWriteBuf(ino, bufvec, 0n)).toThrow(FuseErrno);
    });

    it('rejects invalid offset', () => {
      const bufvec = createSampleBufvec();
      expect(() => validateWriteBuf(ino, bufvec, -1n)).toThrow(FuseErrno);
      expect(() => validateWriteBuf(ino, bufvec, 'invalid' as any)).toThrow(FuseErrno);
    });
  });

  describe('writeBufWrapper', () => {
    it('calls write_buf handler when available', async () => {
      const mockWriteBuf = jest.fn().mockResolvedValue(1024);
      const handlers = { write_buf: mockWriteBuf };
      const bufvec = createSampleBufvec();
      const options = { offset: 0n, fi };

      const result = await writeBufWrapper(handlers, ino, bufvec, context, options);

      expect(mockWriteBuf).toHaveBeenCalledWith(ino, bufvec, context, options);
      expect(result).toBe(1024);
    });

    it('falls back to write handler for single memory buffer', async () => {
      const mockWrite = jest.fn().mockResolvedValue(512);
      const handlers = { write: mockWrite };
      const bufvec = createSampleBufvec();
      const options = { offset: 100n, fi };

      const result = await writeBufWrapper(handlers, ino, bufvec, context, options);

      expect(mockWrite).toHaveBeenCalledWith(ino, bufvec.buf[0].mem!.slice(0, 1024), context, options);
      expect(result).toBe(512);
    });

    it('throws ENOTSUP for multi-buffer vectors', async () => {
      const handlers = { write: jest.fn() };
      const bufvec = {
        ...createSampleBufvec(),
        count: 2,
        buf: [createSampleBufvec().buf[0], createSampleBufvec().buf[0]],
      };

      await expect(writeBufWrapper(handlers, ino, bufvec, context, { offset: 0n, fi }))
        .rejects.toMatchObject({
          code: 'ENOTSUP',
          message: 'Multi-buffer write_buf not yet supported',
        });
    });

    it('throws ENOTSUP for file descriptor buffers', async () => {
      const handlers = { write: jest.fn() };
      const bufvec = createSampleFdBufvec();

      await expect(writeBufWrapper(handlers, ino, bufvec, context, { offset: 0n, fi }))
        .rejects.toMatchObject({
          code: 'ENOTSUP',
          message: 'File descriptor buffers not yet supported',
        });
    });

    it('throws ENOSYS when neither write_buf nor write handler is available', async () => {
      const bufvec = createSampleBufvec();

      await expect(writeBufWrapper({}, ino, bufvec, context, { offset: 0n, fi }))
        .rejects.toMatchObject({
          code: 'ENOSYS',
        });
    });

    it('throws when write_buf handler throws', async () => {
      const handlers = {
        write_buf: jest.fn().mockRejectedValue(new Error('test error')),
      };
      const bufvec = createSampleBufvec();

      await expect(writeBufWrapper(handlers, ino, bufvec, context, { offset: 0n, fi }))
        .rejects.toThrow('test error');
    });
  });
});