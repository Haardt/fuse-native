import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  Ino,
  ReadHandler,
  ReadOptions,
  RequestContext,
} from '../types.js';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: ReadOptions = {
  offset: 0n,
  size: 0,
};

export function validateRead(
  ino: unknown,
  options: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (!options || typeof options !== 'object') {
    throw new FuseErrno('EINVAL', 'Options must be an object');
  }

  const opts = options as ReadOptions;
  if (typeof opts.offset !== 'bigint') {
    throw new FuseErrno('EINVAL', 'Offset must be a BigInt');
  }

  if (opts.offset < 0n) {
    throw new FuseErrno('EINVAL', 'Offset must be non-negative');
  }

  if (typeof opts.size !== 'number' || !Number.isInteger(opts.size) || opts.size < 0) {
    throw new FuseErrno('EINVAL', 'Size must be a non-negative integer');
  }
}

export async function readWrapper(
  handlers: { read?: ReadHandler },
  ino: Ino,
  context: RequestContext = DEFAULT_CONTEXT,
  options: ReadOptions = DEFAULT_OPTIONS
): Promise<ArrayBuffer> {
  validateRead(ino, options);

  const handler = handlers.read;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, context, options);
  if (!(result instanceof ArrayBuffer)) {
    throw new FuseErrno('EIO', 'read handler returned invalid result');
  }

  return result;
}