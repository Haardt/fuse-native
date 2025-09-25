import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  RequestContext,
} from '../types.ts';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validateLseek(
  ino: unknown,
  fi: unknown,
  offset: unknown,
  whence: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (!fi || typeof fi !== 'object') {
    throw new FuseErrno('EINVAL', 'File info must be an object');
  }

  const fileInfo = fi as FileInfo;
  if (typeof fileInfo.fh !== 'number' || typeof fileInfo.flags !== 'number') {
    throw new FuseErrno('EINVAL', 'File info must have valid fh and flags');
  }

  if (typeof offset !== 'bigint') {
    throw new FuseErrno('EINVAL', 'Offset must be a BigInt');
  }

  if (typeof whence !== 'number') {
    throw new FuseErrno('EINVAL', 'Whence must be a number');
  }

  if (!Number.isInteger(whence) || whence < 0 || whence > 2) {
    throw new FuseErrno('EINVAL', 'Whence must be SEEK_SET (0), SEEK_CUR (1), or SEEK_END (2)');
  }
}

/**
 * Lseek operation wrapper for file offset repositioning.
 *
 * Provides file offset repositioning functionality, allowing precise control
 * over the file position for subsequent read/write operations. This operation
 * enables lseek system call support.
 *
 * @param fi - File information for the opened file
 * @param offset - New offset value (interpretation depends on whence)
 * @param whence - How to interpret offset (SEEK_SET, SEEK_CUR, SEEK_END)
 * @returns Promise that resolves to the new file offset
 */
export async function lseekWrapper(
  handlers: {
    lseek?: (
      ino: Ino,
      fi: FileInfo,
      offset: bigint,
      whence: number,
      context: RequestContext,
      options?: BaseOperationOptions
    ) => Promise<bigint>
  },
  ino: Ino,
  fi: FileInfo,
  offset: bigint,
  whence: number,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<bigint> {
  validateLseek(ino, fi, offset, whence);

  const handler = handlers.lseek;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, fi, offset, whence, context, options);

  if (typeof result !== 'bigint') {
    throw new FuseErrno('EIO', 'lseek handler returned invalid result');
  }

  if (result < 0n) {
    throw new FuseErrno('EINVAL', 'lseek handler returned negative offset');
  }

  return result;
}