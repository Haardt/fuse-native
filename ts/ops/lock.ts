import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  BaseOperationOptions,
  FileInfo,
  FileLock,
  Ino,
  RequestContext,
} from '../types.ts';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type GetlkResult = FileLock;

export type SetlkResult = void;

export function validateGetlk(
  ino: unknown,
  fi: unknown,
  lock: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (!fi || typeof fi !== 'object') {
    throw new FuseErrno('EINVAL', 'File info must be an object');
  }

  const fileInfo = fi as FileInfo;
  if (typeof fileInfo.fh !== 'number' || typeof fileInfo.flags !== 'number') {
    throw new FuseErrno('EINVAL', 'File info must have valid fh and flags');
  }

  if (!lock || typeof lock !== 'object') {
    throw new FuseErrno('EINVAL', 'Lock must be an object');
  }

  const fileLock = lock as FileLock;
  if (typeof fileLock.type !== 'number' || typeof fileLock.start !== 'bigint' ||
      typeof fileLock.end !== 'bigint' || typeof fileLock.pid !== 'number') {
    throw new FuseErrno('EINVAL', 'Lock must have valid type, start, end, and pid');
  }

  if (fileLock.start < 0n || fileLock.end < 0n || fileLock.start > fileLock.end) {
    throw new FuseErrno('EINVAL', 'Lock start and end must be non-negative with start <= end');
  }
}

export function validateSetlk(
  ino: unknown,
  fi: unknown,
  lock: unknown,
  sleep: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (!fi || typeof fi !== 'object') {
    throw new FuseErrno('EINVAL', 'File info must be an object');
  }

  const fileInfo = fi as FileInfo;
  if (typeof fileInfo.fh !== 'number' || typeof fileInfo.flags !== 'number') {
    throw new FuseErrno('EINVAL', 'File info must have valid fh and flags');
  }

  if (!lock || typeof lock !== 'object') {
    throw new FuseErrno('EINVAL', 'Lock must be an object');
  }

  const fileLock = lock as FileLock;
  if (typeof fileLock.type !== 'number' || typeof fileLock.start !== 'bigint' ||
      typeof fileLock.end !== 'bigint' || typeof fileLock.pid !== 'number') {
    throw new FuseErrno('EINVAL', 'Lock must have valid type, start, end, and pid');
  }

  if (fileLock.start < 0n || fileLock.end < 0n || fileLock.start > fileLock.end) {
    throw new FuseErrno('EINVAL', 'Lock start and end must be non-negative with start <= end');
  }

  if (typeof sleep !== 'boolean') {
    throw new FuseErrno('EINVAL', 'Sleep parameter must be a boolean');
  }
}

/**
 * Get lock information operation wrapper.
 *
 * Retrieves information about existing locks on a file. This operation
 * checks what locks are currently held or would conflict with a proposed lock.
 *
 * @param lock - The lock to query (type, start, end, pid)
 * @returns Information about the conflicting lock, or the input lock if no conflict
 */
export async function getlkWrapper(
  handlers: {
    getlk?: (
      ino: Ino,
      fi: FileInfo,
      lock: FileLock,
      context: RequestContext,
      options?: BaseOperationOptions
    ) => Promise<FileLock>
  },
  ino: Ino,
  fi: FileInfo,
  lock: FileLock,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<GetlkResult> {
  validateGetlk(ino, fi, lock);

  const handler = handlers.getlk;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, fi, lock, context, options);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'getlk handler returned invalid result');
  }

  // Basic validation of returned lock
  const returnedLock = result as FileLock;
  if (typeof returnedLock.type !== 'number' || typeof returnedLock.start !== 'bigint' ||
      typeof returnedLock.end !== 'bigint' || typeof returnedLock.pid !== 'number') {
    throw new FuseErrno('EIO', 'getlk handler returned invalid lock');
  }

  return returnedLock;
}

/**
 * Set lock operation wrapper.
 *
 * Sets or removes a lock on a file. This operation can acquire read/write locks
 * or unlock regions of a file.
 *
 * @param lock - The lock to set (type, start, end, pid)
 * @param sleep - Whether to sleep if the lock is blocked (true for setlkw, false for setlk)
 */
export async function setlkWrapper(
  handlers: {
    setlk?: (
      ino: Ino,
      fi: FileInfo,
      lock: FileLock,
      sleep: boolean,
      context: RequestContext,
      options?: BaseOperationOptions
    ) => Promise<void>
  },
  ino: Ino,
  fi: FileInfo,
  lock: FileLock,
  sleep: boolean,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<SetlkResult> {
  validateSetlk(ino, fi, lock, sleep);

  const handler = handlers.setlk;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, fi, lock, sleep, context, options);
  return result;
}