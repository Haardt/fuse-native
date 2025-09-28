import { FuseErrno } from '../errors.ts';
import { ModeUtils, ValidationUtils } from '../helpers.ts';
import { ensureStatResult, normalizeTimeout } from './getattr.ts';
import type {
  BaseOperationOptions,
  Ino,
  Mode,
  RequestContext,
  StatResult,
  Timeout,
  FileInfo,
  CreateHandler,
  CreateResult,
} from '../types.ts';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

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

  const statResult = ensureStatResult(result.attr);
  const fi = result.fi as FileInfo;
  if (!fi || typeof fi !== 'object') {
    throw new FuseErrno('EIO', 'create handler must return fi');
  }
  if (typeof fi.flags !== 'number' || !Number.isInteger(fi.flags) || fi.flags < 0) {
    throw new FuseErrno('EIO', 'fi.flags must be a non-negative integer');
  }

  const normalizeTimeoutField = (value: unknown, fallback: Timeout): Timeout => {
    if (typeof value === 'number') {
      return normalizeTimeout(value);
    }
    return fallback;
  };

  const entry_timeout = normalizeTimeoutField(
    (result as any).entryTimeout ?? (result as any).entry_timeout ?? result.timeout,
    1.0,
  );
  const attr_timeout = normalizeTimeoutField(
    (result as any).attrTimeout ?? (result as any).attr_timeout ?? result.timeout,
    entry_timeout,
  );

  let inoValue = (result as any).ino ?? statResult.ino;
  if (typeof inoValue === 'number') {
    if (!Number.isInteger(inoValue) || inoValue < 0) {
      throw new FuseErrno('EIO', 'create result ino must be a non-negative integer');
    }
    inoValue = BigInt(inoValue);
  }
  if (typeof inoValue !== 'bigint') {
    throw new FuseErrno('EIO', 'create result must include ino as bigint');
  }

  let generationValue = (result as any).generation ?? 0n;
  if (typeof generationValue === 'number') {
    if (!Number.isInteger(generationValue) || generationValue < 0) {
      throw new FuseErrno('EIO', 'create result generation must be non-negative');
    }
    generationValue = BigInt(generationValue);
  }
  if (typeof generationValue !== 'bigint') {
    throw new FuseErrno('EIO', 'create result must include generation as bigint');
  }

  const normalized: CreateResult = {
    ino: inoValue as Ino,
    generation: generationValue,
    entry_timeout,
    attr_timeout,
    attr: statResult,
    fi,
    timeout: typeof result.timeout === 'number' ? normalizeTimeout(result.timeout) : undefined,
  };

  return normalized;
}
