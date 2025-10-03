import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import { ensureStatResult, normalizeTimeout } from './getattr.ts';
import type {
  BaseOperationOptions,
  EntryResult,
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

export type LinkResult = EntryResult;

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

  const normalizeTimeoutField = (value: unknown, fallback: Timeout): Timeout => {
    if (typeof value === 'number') {
      return normalizeTimeout(value);
    }
    return fallback;
  };

  const entryTimeout = normalizeTimeoutField(
    (result as any).entryTimeout ?? (result as any).entry_timeout ?? (result as any).timeout ?? 1.0,
    1.0,
  );
  const attrTimeout = normalizeTimeoutField(
    (result as any).attrTimeout ?? (result as any).attr_timeout ?? (result as any).timeout ?? entryTimeout,
    entryTimeout,
  );

  let inoValue = (result as any).ino ?? statResult.ino;
  if (typeof inoValue === 'number') {
    if (!Number.isInteger(inoValue) || inoValue < 0) {
      throw new FuseErrno('EIO', 'link result ino must be a non-negative integer');
    }
    inoValue = BigInt(inoValue);
  }
  if (typeof inoValue !== 'bigint') {
    throw new FuseErrno('EIO', 'link result must include ino as bigint');
  }

  let generationValue = (result as any).generation ?? 0n;
  if (typeof generationValue === 'number') {
    if (!Number.isInteger(generationValue) || generationValue < 0) {
      throw new FuseErrno('EIO', 'link result generation must be non-negative');
    }
    generationValue = BigInt(generationValue);
  }
  if (typeof generationValue !== 'bigint') {
    throw new FuseErrno('EIO', 'link result must include generation as bigint');
  }

  const normalized: LinkResult = {
    ino: inoValue as Ino,
    generation: generationValue,
    entry_timeout: entryTimeout,
    attr_timeout: attrTimeout,
    attr: statResult,
  };

  return normalized;
}
