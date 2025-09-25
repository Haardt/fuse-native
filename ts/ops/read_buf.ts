import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import { FuseBufFlags } from '../types.ts';
import type {
  FuseBufvec,
  Ino,
  ReadBufHandler,
  ReadOptions,
  RequestContext,
} from '../types.ts';

export type ReadBufResult = FuseBufvec;

export function validateReadBuf(
  ino: unknown,
  size: unknown,
  offset: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (typeof size !== 'number' || size < 0 || !Number.isInteger(size)) {
    throw new FuseErrno('EINVAL', 'Size must be a non-negative integer');
  }

  if (typeof offset !== 'bigint' || offset < 0n) {
    throw new FuseErrno('EINVAL', 'Offset must be a non-negative BigInt');
  }
}

export function validateFuseBufvec(bufvec: unknown): asserts bufvec is FuseBufvec {
  if (!bufvec || typeof bufvec !== 'object') {
    throw new FuseErrno('EINVAL', 'Buffer vector must be an object');
  }

  const bv = bufvec as FuseBufvec;
  if (typeof bv.count !== 'number' || bv.count < 0) {
    throw new FuseErrno('EINVAL', 'Buffer vector count must be a non-negative number');
  }

  if (typeof bv.idx !== 'number' || bv.idx < 0 || bv.idx >= bv.count) {
    throw new FuseErrno('EINVAL', 'Buffer vector index must be valid');
  }

  if (typeof bv.off !== 'number' || bv.off < 0) {
    throw new FuseErrno('EINVAL', 'Buffer vector offset must be non-negative');
  }

  if (!Array.isArray(bv.buf)) {
    throw new FuseErrno('EINVAL', 'Buffer vector buf must be an array');
  }

  if (bv.buf.length !== bv.count) {
    throw new FuseErrno('EINVAL', 'Buffer vector buf length must match count');
  }

  // Validate each buffer
  for (let i = 0; i < bv.buf.length; i++) {
    const buf = bv.buf[i];
    if (!buf || typeof buf !== 'object') {
      throw new FuseErrno('EINVAL', `Buffer ${i} must be an object`);
    }

    if (typeof buf.size !== 'number' || buf.size < 0) {
      throw new FuseErrno('EINVAL', `Buffer ${i} size must be non-negative`);
    }

    if (typeof buf.flags !== 'number') {
      throw new FuseErrno('EINVAL', `Buffer ${i} flags must be a number`);
    }

    // Check flags
    if ((buf.flags & FuseBufFlags.IS_FD) !== 0) {
      // File descriptor buffer
      if (typeof buf.fd !== 'number' || buf.fd < 0) {
        throw new FuseErrno('EINVAL', `Buffer ${i} fd must be a valid file descriptor`);
      }
      if (typeof buf.pos !== 'bigint') {
        throw new FuseErrno('EINVAL', `Buffer ${i} pos must be a BigInt`);
      }
    } else {
      // Memory buffer
      if (!(buf.mem instanceof ArrayBuffer)) {
        throw new FuseErrno('EINVAL', `Buffer ${i} mem must be an ArrayBuffer`);
      }
      if (buf.mem.byteLength < buf.size) {
        throw new FuseErrno('EINVAL', `Buffer ${i} mem size must be at least ${buf.size} bytes`);
      }
    }
  }
}

export async function readBufWrapper(
  handlers: { read_buf?: ReadBufHandler; read?: any },
  ino: Ino,
  context: RequestContext,
  options: ReadOptions = {} as ReadOptions
): Promise<ReadBufResult> {
  validateReadBuf(ino, options.size, options.offset);

  // If there's a dedicated read_buf handler, use it
  if (handlers.read_buf) {
    const result = await handlers.read_buf(ino, context, options);
    validateFuseBufvec(result);
    return result;
  }

  // Fallback: use regular read handler and convert to buffer vector
  if (!handlers.read) {
    throw new FuseErrno('ENOSYS');
  }

  const buffer = await handlers.read(ino, context, options);

  if (!(buffer instanceof ArrayBuffer)) {
    throw new FuseErrno('EIO', 'read handler returned invalid buffer');
  }

  // Create a single buffer vector from the ArrayBuffer
  const bufvec: FuseBufvec = {
    count: 1,
    idx: 0,
    off: 0,
    buf: [{
      size: buffer.byteLength,
      flags: FuseBufFlags.NONE,
      mem: buffer,
    }],
  };

  return bufvec;
}