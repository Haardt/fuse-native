import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  RequestContext,
} from '../types.js';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validateFlock(
  ino: unknown,
  fi: unknown,
  op: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (!fi || typeof fi !== 'object') {
    throw new FuseErrno('EINVAL', 'File info must be an object');
  }

  const fileInfo = fi as FileInfo;
  if (typeof fileInfo.fh !== 'number' || typeof fileInfo.flags !== 'number') {
    throw new FuseErrno('EINVAL', 'File info must have valid fh and flags');
  }

  if (typeof op !== 'number') {
    throw new FuseErrno('EINVAL', 'Flock operation must be a number');
  }

  if (!Number.isInteger(op) || op < 0) {
    throw new FuseErrno('EINVAL', 'Flock operation must be a non-negative integer');
  }
}

/**
 * Flock operation wrapper for advisory file locking.
 *
 * Provides advisory file locking functionality, allowing processes to coordinate
 * access to files. This operation enables flock system call support for filesystem operations.
 *
 * @param fi - File information for the opened file
 * @param op - Flock operation (LOCK_SH, LOCK_EX, LOCK_UN, etc.)
 * @returns Promise that resolves on successful lock operation
 */
export async function flockWrapper(
  handlers: {
    flock?: (
      ino: Ino,
      fi: FileInfo,
      op: number,
      context: RequestContext,
      options?: BaseOperationOptions
    ) => Promise<void>
  },
  ino: Ino,
  fi: FileInfo,
  op: number,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<void> {
  validateFlock(ino, fi, op);

  const handler = handlers.flock;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  await handler(ino, fi, op, context, options);
}