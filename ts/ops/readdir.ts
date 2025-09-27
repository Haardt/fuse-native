import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  FileInfo,
  Ino,
  ReaddirHandler,
  ReaddirOptions,
  ReaddirResult,
  RequestContext,
} from '../types.ts';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: ReaddirOptions = {
  size: 0,
};

export function validateReaddir(
  ino: unknown,
  offset: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);
  ValidationUtils.validateOffset(offset);
}

// Function to ensure the result from handler is a valid ReaddirResult
export function ensureReaddirResult(value: unknown): ReaddirResult {
  if (!value || typeof value !== 'object') {
    throw new FuseErrno('EIO', 'readdir handler returned invalid result');
  }

  const record = value as Record<string, unknown>;

  // Validate entries array
  if (!Array.isArray(record['entries'])) {
    throw new FuseErrno('EIO', 'readdir entries must be an array');
  }

  // Validate each DirentEntry
  for (let i = 0; i < record['entries'].length; i++) {
    const entry = record['entries'][i] as any;
    if (!entry || typeof entry !== 'object') {
      throw new FuseErrno('EIO', `readdir entry[${i}] must be an object`);
    }

    if (typeof entry.name !== 'string') {
      throw new FuseErrno('EIO', `readdir entry[${i}].name must be a string`);
    }

    if (typeof entry.ino !== 'bigint' || entry.ino <= 0n) {
      throw new FuseErrno('EIO', `readdir entry[${i}].ino must be a positive BigInt`);
    }

    if (typeof entry.type !== 'number' || !Number.isInteger(entry.type)) {
      throw new FuseErrno('EIO', `readdir entry[${i}].type must be an integer`);
    }

    if (typeof entry.nextOffset !== 'bigint') {
      throw new FuseErrno('EIO', `readdir entry[${i}].nextOffset must be a BigInt`);
    }

    if (entry.nextOffset < 0n) {
      throw new FuseErrno('EIO', `readdir entry[${i}].nextOffset must be non-negative`);
    }
  }

  // Validate hasMore
  if (typeof record['hasMore'] !== 'boolean') {
    throw new FuseErrno('EIO', 'readdir hasMore must be a boolean');
  }

  // Validate nextOffset if present
  if (record['nextOffset'] !== undefined && typeof record['nextOffset'] !== 'bigint') {
    throw new FuseErrno('EIO', 'readdir nextOffset must be a BigInt when present');
  }

  return value as ReaddirResult;
}

export async function readdirWrapper(
  handlers: { readdir?: ReaddirHandler },
  ino: Ino,
  offset: bigint,
  context: RequestContext = DEFAULT_CONTEXT,
  fi?: FileInfo,
  options: ReaddirOptions = DEFAULT_OPTIONS
): Promise<ReaddirResult> {
  validateReaddir(ino, offset);

  const handler = handlers.readdir;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, offset, context, fi, options);

  return ensureReaddirResult(result);
}
