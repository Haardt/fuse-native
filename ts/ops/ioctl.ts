import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  RequestContext,
} from '../types.js';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type IoctlResult = {
  result: number | bigint | Buffer | null;
};

export function validateIoctl(
  ino: unknown,
  cmd: unknown,
  arg: unknown,
  fi: unknown,
  flags: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (typeof cmd !== 'number') {
    throw new FuseErrno('EINVAL', 'Ioctl command must be a number');
  }

  if (!Number.isInteger(cmd) || cmd < 0) {
    throw new FuseErrno('EINVAL', 'Ioctl command must be a non-negative integer');
  }

  // arg can be number, bigint, Buffer, or null
  if (arg !== null && typeof arg !== 'number' && typeof arg !== 'bigint' && !(arg instanceof Buffer)) {
    throw new FuseErrno('EINVAL', 'Ioctl argument must be number, bigint, Buffer, or null');
  }

  if (!fi || typeof fi !== 'object') {
    throw new FuseErrno('EINVAL', 'File info must be an object');
  }

  const fileInfo = fi as FileInfo;
  if (typeof fileInfo.fh !== 'number' || typeof fileInfo.flags !== 'number') {
    throw new FuseErrno('EINVAL', 'File info must have valid fh and flags');
  }

  if (typeof flags !== 'number') {
    throw new FuseErrno('EINVAL', 'Flags must be a number');
  }

  if (!Number.isInteger(flags) || flags < 0) {
    throw new FuseErrno('EINVAL', 'Flags must be a non-negative integer');
  }
}

/**
 * I/O control operation wrapper.
 *
 * Handles ioctl system calls, allowing device-specific I/O operations.
 * This operation is used for various device control operations and
 * filesystem-specific ioctl commands.
 *
 * @param cmd - The ioctl command number
 * @param arg - The ioctl argument (can be number, bigint, Buffer, or null)
 * @param fi - File information for the opened file
 * @param flags - Ioctl flags
 * @returns The ioctl result (can be number, bigint, Buffer, or null)
 */
export async function ioctlWrapper(
  handlers: {
    ioctl?: (
      ino: Ino,
      cmd: number,
      arg: number | bigint | Buffer | null,
      fi: FileInfo,
      flags: number,
      context: RequestContext,
      options?: BaseOperationOptions
    ) => Promise<{ result: number | bigint | Buffer | null }>
  },
  ino: Ino,
  cmd: number,
  arg: number | bigint | Buffer | null,
  fi: FileInfo,
  flags: number,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<IoctlResult> {
  validateIoctl(ino, cmd, arg, fi, flags);

  const handler = handlers.ioctl;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, cmd, arg, fi, flags, context, options);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'ioctl handler returned invalid result');
  }

  // result can be number, bigint, Buffer, or null
  if (result.result !== null &&
      typeof result.result !== 'number' &&
      typeof result.result !== 'bigint' &&
      !(result.result instanceof Buffer)) {
    throw new FuseErrno('EIO', 'ioctl handler returned invalid result type');
  }

  return result;
}