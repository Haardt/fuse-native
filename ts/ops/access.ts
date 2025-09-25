import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  BaseOperationOptions,
  Ino,
  RequestContext,
} from '../types.ts';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type AccessResult = void;

export function validateAccess(
  ino: unknown,
  mask: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (typeof mask !== 'number') {
    throw new FuseErrno('EINVAL', 'Access mask must be a number');
  }

  if (!Number.isInteger(mask) || mask < 0) {
    throw new FuseErrno('EINVAL', 'Access mask must be a non-negative integer');
  }
}

/**
 * Access operation wrapper.
 *
 * Checks file access permissions. This operation is called to check if a
 * process has the requested permissions on a file before performing operations.
 *
 * The mask parameter uses POSIX access flags:
 * - R_OK (4): Test for read permission
 * - W_OK (2): Test for write permission
 * - X_OK (1): Test for execute permission
 * - F_OK (0): Test for existence
 *
 * @param mask - Access permission mask (combination of R_OK, W_OK, X_OK, F_OK)
 */
export async function accessWrapper(
  handlers: {
    access?: (
      ino: Ino,
      mask: number,
      context: RequestContext,
      options?: BaseOperationOptions
    ) => Promise<void>
  },
  ino: Ino,
  mask: number,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<AccessResult> {
  validateAccess(ino, mask);

  const handler = handlers.access;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, mask, context, options);
  return result;
}