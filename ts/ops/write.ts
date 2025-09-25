import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  Ino,
  WriteHandler,
  WriteOptions,
  RequestContext,
} from '../types.ts';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: WriteOptions = {
  offset: 0n,
};

export function validateWrite(
  ino: unknown,
  data: unknown,
  options: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (!(data instanceof ArrayBuffer)) {
    throw new FuseErrno('EINVAL', 'Data must be an ArrayBuffer');
  }

  if (!options || typeof options !== 'object') {
    throw new FuseErrno('EINVAL', 'Options must be an object');
  }

  const opts = options as WriteOptions;
  if (typeof opts.offset !== 'bigint') {
    throw new FuseErrno('EINVAL', 'Offset must be a BigInt');
  }

  if (opts.offset < 0n) {
    throw new FuseErrno('EINVAL', 'Offset must be non-negative');
  }
}

export async function writeWrapper(
  handlers: { write?: WriteHandler },
  ino: Ino,
  data: ArrayBuffer,
  context: RequestContext = DEFAULT_CONTEXT,
  options: WriteOptions = DEFAULT_OPTIONS
): Promise<number> {
  validateWrite(ino, data, options);

  const handler = handlers.write;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, data, context, options);
  if (typeof result !== 'number' || !Number.isInteger(result) || result < 0) {
    throw new FuseErrno('EIO', 'write handler returned invalid result');
  }

  return result;
}