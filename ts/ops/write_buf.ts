import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import { FuseBufFlags } from '../types.ts';
import type {
  FuseBufvec,
  Ino,
  RequestContext,
  WriteBufHandler,
  WriteOptions,
} from '../types.ts';

export type WriteBufResult = number;

export function validateWriteBuf(
  ino: unknown,
  bufvec: unknown,
  offset: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

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

  if (typeof offset !== 'bigint' || offset < 0n) {
    throw new FuseErrno('EINVAL', 'Offset must be a non-negative BigInt');
  }
}

export async function writeBufWrapper(
  handlers: { write_buf?: WriteBufHandler; write?: any },
  ino: Ino,
  bufvec: FuseBufvec,
  context: RequestContext,
  options: WriteOptions = {} as WriteOptions
): Promise<WriteBufResult> {
  validateWriteBuf(ino, bufvec, options.offset);

  // If there's a dedicated write_buf handler, use it
  if (handlers.write_buf) {
    const result = await handlers.write_buf(ino, bufvec, context, options);
    return result;
  }

  // Fallback: convert buffer vector to single buffer and use regular write
  if (!handlers.write) {
    throw new FuseErrno('ENOSYS');
  }

  // For simplicity, we'll handle only single memory buffers for now
  // Complex scatter-gather would require concatenating or multiple writes
  if (bufvec.count !== 1) {
    throw new FuseErrno('ENOTSUP', 'Multi-buffer write_buf not yet supported');
  }

  const buf = bufvec.buf[0]!;
  if ((buf.flags & FuseBufFlags.IS_FD) !== 0) {
    throw new FuseErrno('ENOTSUP', 'File descriptor buffers not yet supported');
  }

  if (!(buf.mem instanceof ArrayBuffer)) {
    throw new FuseErrno('EINVAL', 'Buffer memory is not an ArrayBuffer');
  }

  // Create a view of the buffer starting from the current offset
  const buffer = buf.mem.slice(bufvec.off, bufvec.off + buf.size);

  const result = await handlers.write(ino, buffer, context, options);
  return result;
}