import { FuseErrno } from '../errors.js';
import { ModeUtils, ValidationUtils } from '../helpers.js';
import { ensureStatResult, normalizeTimeout } from './getattr.js';
import type {
  BaseOperationOptions,
  CreateHandler,
  FileInfo,
  Ino,
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

export type CreateResult = {
  attr: StatResult;
  timeout: Timeout;
  fi: FileInfo;
};

export function validateCreate(
  parent: unknown,
  name: unknown,
  mode: unknown
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

  if (!ModeUtils.isFile(mode)) {
    throw new FuseErrno('EINVAL', 'Create can only be used for regular files');
  }
}

export async function createWrapper(
  handlers: { create?: CreateHandler },
  parent: Ino,
  name: string,
  mode: number,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<CreateResult> {
  validateCreate(parent, name, mode);

  const handler = handlers.create;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(parent, name, mode, context, options);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'create handler returned invalid result');
  }

  const statResult = ensureStatResult(result.attr);
  const timeout = normalizeTimeout(result.timeout);

  if (!result.fi || typeof result.fi !== 'object') {
    throw new FuseErrno('EIO', 'create handler returned invalid fi');
  }

  // Basic validation of fi
  const fi = result.fi as FileInfo;
  if (typeof fi.fh !== 'number' || typeof fi.flags !== 'number') {
    throw new FuseErrno('EIO', 'create handler returned invalid fi');
  }

  return { attr: statResult, timeout, fi };
}