import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  BaseOperationOptions,
  FileInfo,
  GetattrHandler,
  Ino,
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
const DEFAULT_TIMEOUT = 1.0;

export type GetattrResult = {
  attr: StatResult;
  timeout: Timeout;
};

export function validateGetattr(ino: unknown): asserts ino is Ino {
  ValidationUtils.validateIno(ino);
}

export function ensureStatResult(value: unknown): StatResult {
  if (!value || typeof value !== 'object') {
    throw new FuseErrno('EIO', 'getattr handler must return a stat object');
  }

  const record = value as Record<string, unknown>;

  const requiredBigInts = ['ino', 'size', 'blocks', 'atime', 'mtime', 'ctime'] as const;
  for (const key of requiredBigInts) {
    if (typeof record[key] !== 'bigint') {
      throw new FuseErrno('EIO', `stat.${key} must be a BigInt`);
    }
  }

  const requiredNumbers = ['mode', 'nlink', 'uid', 'gid', 'blksize'] as const;
  for (const key of requiredNumbers) {
    if (typeof record[key] !== 'number') {
      throw new FuseErrno('EIO', `stat.${key} must be a number`);
    }
  }

  if (typeof record['rdev'] !== 'bigint') {
    throw new FuseErrno('EIO', 'stat.rdev must be a BigInt');
  }

  if (record['birthtime'] !== undefined && typeof record['birthtime'] !== 'bigint') {
    throw new FuseErrno('EIO', 'stat.birthtime must be a BigInt when provided');
  }

  return value as StatResult;
}

export function normalizeTimeout(value: unknown): Timeout {
  if (value === undefined) {
    return DEFAULT_TIMEOUT;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new FuseErrno('EIO', 'timeout must be a non-negative finite number');
  }

  return value;
}

export async function getattrWrapper(
  handlers: { getattr?: GetattrHandler },
  ino: Ino,
  context: RequestContext = DEFAULT_CONTEXT,
  fi?: FileInfo,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<GetattrResult> {
  validateGetattr(ino);

  const handler = handlers.getattr;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, context, fi, options);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'getattr handler returned invalid result');
  }

  const statResult = ensureStatResult((result as GetattrResult).attr);
  const timeout = normalizeTimeout((result as GetattrResult).timeout);

  return { attr: statResult, timeout };
}
