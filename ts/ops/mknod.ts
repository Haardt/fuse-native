import { FuseErrno } from '../errors.js';
import { ModeUtils, ValidationUtils } from '../helpers.js';
import { ensureStatResult, normalizeTimeout } from './getattr.js';
import type {
  BaseOperationOptions,
  Dev,
  Ino,
  MknodHandler,
  Mode,
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

export type MknodResult = {
  attr: StatResult;
  timeout: Timeout;
};

export function validateMknod(
  parent: unknown,
  name: unknown,
  mode: unknown,
  rdev: unknown
): asserts parent is Ino {
  ValidationUtils.validateIno(parent);

  if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
    throw new FuseErrno('EINVAL', 'Node name must be 1-255 characters long');
  }

  if (typeof mode !== 'number') {
    throw new FuseErrno('EINVAL', 'Mode must be a number');
  }

  if (!Number.isInteger(mode) || mode <= 0) {
    throw new FuseErrno('EINVAL', 'Mode must be a positive integer');
  }

  if (ModeUtils.isDirectory(mode)) {
    throw new FuseErrno('EINVAL', 'Use mkdir for directories');
  }

  if (typeof rdev !== 'bigint') {
    throw new FuseErrno('EINVAL', 'Device ID must be a BigInt');
  }
}

export async function mknodWrapper(
  handlers: { mknod?: MknodHandler },
  parent: Ino,
  name: string,
  mode: Mode,
  rdev: Dev,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<MknodResult> {
  validateMknod(parent, name, mode, rdev);

  const handler = handlers.mknod;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(parent, name, mode, rdev, context, options);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'mknod handler returned invalid result');
  }

  const statResult = ensureStatResult(result.attr);
  const timeout = normalizeTimeout(result.timeout);

  return { attr: statResult, timeout };
}
