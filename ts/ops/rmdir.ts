import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  Ino,
  RequestContext,
  RmdirHandler,
} from '../types.js';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validateRmdir(
  parent: unknown,
  name: unknown
): asserts parent is Ino {
  ValidationUtils.validateIno(parent);

  if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
    throw new FuseErrno('EINVAL', 'Directory name must be 1-255 characters long');
  }

  if (name === '.' || name === '..') {
    throw new FuseErrno('EINVAL', 'Cannot remove "." or ".." directories');
  }
}

export async function rmdirWrapper(
  handlers: { rmdir?: RmdirHandler },
  parent: Ino,
  name: string,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<void> {
  validateRmdir(parent, name);

  const handler = handlers.rmdir;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  await handler(parent, name, context, options);
}
