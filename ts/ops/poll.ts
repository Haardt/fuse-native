import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  PollHandle,
  RequestContext,
} from '../types.js';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type PollResult = {
  revents: number;
};

export function validatePoll(
  ino: unknown,
  fi: unknown,
  ph: unknown,
  revents: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (!fi || typeof fi !== 'object') {
    throw new FuseErrno('EINVAL', 'File info must be an object');
  }

  const fileInfo = fi as FileInfo;
  if (typeof fileInfo.fh !== 'number' || typeof fileInfo.flags !== 'number') {
    throw new FuseErrno('EINVAL', 'File info must have valid fh and flags');
  }

  if (!ph || typeof ph !== 'object') {
    throw new FuseErrno('EINVAL', 'Poll handle must be an object');
  }

  // ph can be a partial PollHandle, so we don't validate all fields strictly

  if (typeof revents !== 'number') {
    throw new FuseErrno('EINVAL', 'Returned events must be a number');
  }

  if (!Number.isInteger(revents) || revents < 0) {
    throw new FuseErrno('EINVAL', 'Returned events must be a non-negative integer');
  }
}

/**
 * Poll operation wrapper for I/O multiplexing.
 *
 * Monitors file descriptors for I/O events (readability, writability, exceptions).
 * This operation enables select/poll system call support for filesystem operations.
 *
 * @param fi - File information for the opened file
 * @param ph - Poll handle for kernel polling operations
 * @param revents - Returned events (bitmask of POLLIN, POLLOUT, etc.)
 * @returns The revents (returned events) indicating which events occurred
 */
export async function pollWrapper(
  handlers: {
    poll?: (
      ino: Ino,
      fi: FileInfo,
      ph: PollHandle,
      revents: number,
      context: RequestContext,
      options?: BaseOperationOptions
    ) => Promise<{ revents: number }>
  },
  ino: Ino,
  fi: FileInfo,
  ph: PollHandle,
  revents: number,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<PollResult> {
  validatePoll(ino, fi, ph, revents);

  const handler = handlers.poll;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, fi, ph, revents, context, options);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'poll handler returned invalid result');
  }

  if (typeof result.revents !== 'number') {
    throw new FuseErrno('EIO', 'poll handler returned invalid revents');
  }

  if (!Number.isInteger(result.revents) || result.revents < 0) {
    throw new FuseErrno('EIO', 'poll handler returned invalid revents value');
  }

  return result;
}