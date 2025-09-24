import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  RequestContext,
  StatResult,
  Timeout,
  TruncateHandler,
} from '../types.js';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type TruncateResult = {
  attr: StatResult;
  timeout: Timeout;
};

export function validateTruncate(
  ino: unknown,
  size: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (typeof size !== 'bigint') {
    throw new FuseErrno('EINVAL', 'Size must be a BigInt');
  }

  if (size < 0n) {
    throw new FuseErrno('EINVAL', 'Size cannot be negative');
  }
}

export async function truncateWrapper(
  handlers: { setattr?: any; truncate?: TruncateHandler },
  ino: Ino,
  size: bigint,
  context: RequestContext = DEFAULT_CONTEXT,
  fi?: FileInfo,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<TruncateResult> {
  validateTruncate(ino, size);

  // If there's a dedicated truncate handler, use it
  if (handlers.truncate) {
    const result = await handlers.truncate(ino, size, context, fi, options);
    return result;
  }

  // Otherwise, fall back to setattr with size
  if (!handlers.setattr) {
    throw new FuseErrno('ENOSYS');
  }

  const setattrOptions = fi ? { ...options, fi, valid: 0x40 } : { ...options, valid: 0x40 }; // FUSE_SET_ATTR_SIZE
  const result = await handlers.setattr(ino, { size }, context, setattrOptions);
  return result;
}