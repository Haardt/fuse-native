import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import { ensureStatResult, normalizeTimeout } from './getattr.js';
import type {
  BaseOperationOptions,
  Ino,
  Mode,
  ChmodHandler,
  RequestContext,
  StatResult,
  Timeout,
} from '../types.js';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type ChmodResult = {
  attr: StatResult;
  timeout: Timeout;
};

export function validateChmod(
  ino: unknown,
  mode: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (typeof mode !== 'number') {
    throw new FuseErrno('EINVAL', 'Mode must be a number');
  }

  if (!Number.isInteger(mode) || mode < 0) {
    throw new FuseErrno('EINVAL', 'Mode must be a non-negative integer');
  }
}

export async function chmodWrapper(
  handlers: { chmod?: ChmodHandler },
  ino: Ino,
  mode: Mode,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<ChmodResult> {
  validateChmod(ino, mode);

  const handler = handlers.chmod;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, mode, context, options);

  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'chmod handler returned invalid result');
  }

  const statResult = ensureStatResult(result.attr);
  const timeout = normalizeTimeout(result.timeout);

  return { attr: statResult, timeout };
}
