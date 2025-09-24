import { FuseErrno } from '../errors.js';
import { ModeUtils, ValidationUtils } from '../helpers.js';
import { ensureStatResult, normalizeTimeout } from './getattr.js';
import type {
  BaseOperationOptions,
  Ino,
  Mode,
  RequestContext,
  StatResult,
  Timeout,
  FileInfo,
  CreateHandler,
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
  mode: unknown,
): asserts parent is Ino {
  ValidationUtils.validateIno(parent);

  if (typeof name !== 'string' || name.length === 0 || name.length > 255) {
    throw new FuseErrno('EINVAL', 'File name must be 1-255 characters long');
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
    throw new FuseErrno('EINVAL', 'Create supports only regular files');
  }
}

export async function createWrapper(
  handlers: { create?: CreateHandler },
  parent: Ino,
  name: string,
  mode: Mode | number,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<CreateResult> {
  validateCreate(parent, name, mode);

  const handler = handlers.create;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(parent, name, Number(mode), context, options);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'create handler returned invalid result');
  }

  const statResult = ensureStatResult((result as any).attr);
  const fi = (result as any).fi as FileInfo;
  if (!fi || typeof fi !== 'object') {
    throw new FuseErrno('EIO', 'create handler must return fi');
  }
  if (typeof fi.fh !== 'number' || !Number.isInteger(fi.fh) || fi.fh < 0) {
    throw new FuseErrno('EIO', 'fi.fh must be a non-negative integer');
  }
  if (typeof fi.flags !== 'number' || !Number.isInteger(fi.flags) || fi.flags < 0) {
    throw new FuseErrno('EIO', 'fi.flags must be a non-negative integer');
  }

  const timeout = normalizeTimeout((result as any).timeout);

  return { attr: statResult, timeout, fi };
}