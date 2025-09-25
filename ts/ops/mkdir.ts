import { FuseErrno } from '../errors.ts';
import { ModeUtils, ValidationUtils } from '../helpers.ts';
import { ensureStatResult, normalizeTimeout } from './getattr.ts';
import type {
  BaseOperationOptions,
  Ino,
  Mode,
  MkdirHandler,
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

export type MkdirResult = {
  attr: StatResult;
  timeout: Timeout;
};

export function validateMkdir(
  parent: unknown,
  name: unknown,
  mode: unknown
): asserts parent is Ino {
  ValidationUtils.validateIno(parent);

  if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
    throw new FuseErrno('EINVAL', 'Directory name must be 1-255 characters long');
  }

  if (typeof mode !== 'number') {
    throw new FuseErrno('EINVAL', 'Mode must be a number');
  }

  if (!Number.isInteger(mode) || mode <= 0) {
    throw new FuseErrno('EINVAL', 'Mode must be a positive integer');
  }

  if (!ModeUtils.isDirectory(mode)) {
    throw new FuseErrno('EINVAL', 'Mode must include the directory bit (S_IFDIR)');
  }
}

export async function mkdirWrapper(
  handlers: { mkdir?: MkdirHandler },
  parent: Ino,
  name: string,
  mode: Mode,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<MkdirResult> {
  validateMkdir(parent, name, mode);

  const handler = handlers.mkdir;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(parent, name, mode, context, options);

  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'mkdir handler returned invalid result');
  }

  const statResult = ensureStatResult(result.attr);
  const timeout = normalizeTimeout(result.timeout);

  return { attr: statResult, timeout };
}
