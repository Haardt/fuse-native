import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  Ino,
  RenameHandler,
  RequestContext,
} from '../types.js';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validateRename(
  parent: unknown,
  name: unknown,
  newParent: unknown,
  newName: unknown,
  flags: unknown
): asserts parent is Ino {
  ValidationUtils.validateIno(parent);
  ValidationUtils.validateIno(newParent);

  if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
    throw new FuseErrno('EINVAL', 'Source name must be 1-255 characters long');
  }

  if (name.includes('\0')) {
    throw new FuseErrno('EINVAL', 'Source name cannot contain null bytes');
  }

  if (typeof newName !== 'string' || newName.length === 0 || newName.length > 255) {
    throw new FuseErrno('EINVAL', 'Destination name must be 1-255 characters long');
  }

  if (newName.includes('\0')) {
    throw new FuseErrno('EINVAL', 'Destination name cannot contain null bytes');
  }

  if (typeof flags !== 'number' || !Number.isInteger(flags) || flags < 0) {
    throw new FuseErrno('EINVAL', 'Rename flags must be a non-negative integer');
  }
}

export async function renameWrapper(
  handlers: { rename?: RenameHandler },
  parent: Ino,
  name: string,
  newParent: Ino,
  newName: string,
  flags: number,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<void> {
  validateRename(parent, name, newParent, newName, flags);

  const handler = handlers.rename;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(parent, name, newParent, newName, flags, context, options);
  if (result !== undefined) {
    throw new FuseErrno('EIO', 'rename handler must resolve without a value');
  }
}
