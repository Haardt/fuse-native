import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import { ensureStatResult, normalizeTimeout } from './getattr.ts';
import type {
  BaseOperationOptions,
  Ino,
  RequestContext,
  StatResult,
  SymlinkHandler,
  Timeout,
} from '../types.ts';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type SymlinkResult = {
  attr: StatResult;
  timeout: Timeout;
};

export function validateSymlink(
  target: unknown,
  parent: unknown,
  name: unknown
): asserts parent is Ino {
  if (typeof target !== 'string' || target.length === 0 || target.length > 4096) {
    throw new FuseErrno('EINVAL', 'Symlink target must be a 1-4096 character string');
  }

  if (target.includes('\0')) {
    throw new FuseErrno('EINVAL', 'Symlink target cannot contain null bytes');
  }

  ValidationUtils.validateIno(parent);

  if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
    throw new FuseErrno('EINVAL', 'Link name must be 1-255 characters long');
  }

  if (name.includes('\0')) {
    throw new FuseErrno('EINVAL', 'Link name cannot contain null bytes');
  }
}

export async function symlinkWrapper(
  handlers: { symlink?: SymlinkHandler },
  target: string,
  parent: Ino,
  name: string,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<SymlinkResult> {
  validateSymlink(target, parent, name);

  const handler = handlers.symlink;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(target, parent, name, context, options);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'symlink handler returned invalid result');
  }

  const statResult = ensureStatResult(result.attr);
  const timeout = normalizeTimeout(result.timeout);

  return { attr: statResult, timeout };
}
