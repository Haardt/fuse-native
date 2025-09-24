import {Ino, RmdirHandler} from './types.js';
import { FuseErrno } from './errors.js';
import { ValidationUtils } from './helpers.js';
import type { RequestContext, BaseOperationOptions, UnlinkHandler } from './types.js';

export function validateUnlink(parent: unknown, name: unknown): void {
  ValidationUtils.validateIno(parent);
  if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
    throw new FuseErrno('EINVAL');
  }
}

export async function unlinkWrapper(handlers: { unlink?: UnlinkHandler }, parent: Ino, name: string, context: RequestContext = { uid: 0 as any, gid: 0 as any, pid: 0, umask: 0 as any }, options: BaseOperationOptions = {}): Promise<void> {
  validateUnlink(parent, name);
  if (!handlers.unlink) {
    throw new FuseErrno('ENOSYS');
  }
  await handlers.unlink(parent, name, context, options);
}

export function validateRmdir(parent: unknown, name: unknown): void {
    ValidationUtils.validateIno(parent);
    if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
        throw new FuseErrno('EINVAL');
    }
}


export async function rmdirWrapper(handlers: { rmdir?: RmdirHandler }, parent: Ino, name: string, context: RequestContext = { uid: 0 as any, gid: 0 as any, pid: 0, umask: 0 as any }, options: BaseOperationOptions = {}): Promise<void> {
    validateRmdir(parent, name);
    if (!handlers.rmdir) {
        throw new FuseErrno('ENOSYS');
    }
    await handlers.rmdir(parent, name, context, options);
}
