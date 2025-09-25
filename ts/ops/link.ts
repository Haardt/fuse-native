import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import { ensureStatResult, normalizeTimeout } from './getattr.ts';
import type {
  BaseOperationOptions,
  Ino,
  LinkHandler,
  RequestContext,
  StatResult,
  Timeout,
} from '../types.ts';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type LinkResult = {
  attr: StatResult;
  timeout: Timeout;
};

export function validateLink(
  ino: unknown,
  newparent: unknown,
  newname: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  ValidationUtils.validateIno(newparent);

  if (typeof newname !== 'string' || newname.length === 0 || newname.length > 255) {
    throw new FuseErrno('EINVAL', 'New link name must be 1-255 characters long');
  }

  if (newname.includes('\0')) {
    throw new FuseErrno('EINVAL', 'New link name cannot contain null bytes');
  }
}

export async function linkWrapper(
  handlers: { link?: LinkHandler },
  ino: Ino,
  newparent: Ino,
  newname: string,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<LinkResult> {
  validateLink(ino, newparent, newname);

  const handler = handlers.link;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, newparent, newname, context, options);

  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'link handler returned invalid result');
  }

  const statResult = ensureStatResult(result.attr);
  const timeout = normalizeTimeout(result.timeout);

  return { attr: statResult, timeout };
}