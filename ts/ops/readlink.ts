import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  Ino,
  ReadlinkHandler,
  RequestContext,
} from '../types.js';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validateReadlink(ino: unknown): asserts ino is Ino {
  ValidationUtils.validateIno(ino);
}

export async function readlinkWrapper(
  handlers: { readlink?: ReadlinkHandler },
  ino: Ino,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<string> {
  validateReadlink(ino);

  const handler = handlers.readlink;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, context, options);
  if (typeof result !== 'string' || result.length === 0) {
    throw new FuseErrno('EIO', 'readlink handler must return a non-empty string');
  }

  if (result.length > 4096) {
    throw new FuseErrno('ENAMETOOLONG', 'readlink result exceeds PATH_MAX');
  }

  return result;
}
