import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  Ino,
  RequestContext,
  UnlinkHandler,
} from '../types.js';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validateUnlink(
  parent: unknown,
  name: unknown
): asserts parent is Ino {
  ValidationUtils.validateIno(parent);

  if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
    throw new FuseErrno('EINVAL', 'File name must be 1-255 characters long');
  }
}

export async function unlinkWrapper(
  handlers: { unlink?: UnlinkHandler },
  parent: Ino,
  name: string,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<void> {
  validateUnlink(parent, name);

  const handler = handlers.unlink;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  await handler(parent, name, context, options);
}
