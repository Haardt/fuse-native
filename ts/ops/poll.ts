import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  PollHandle,
  PollResult,
  RequestContext,
} from '../types.ts';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validatePoll(
  ino: unknown,
  fi: unknown,
  ph: unknown,
  requestedEvents: unknown
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

  if (typeof requestedEvents !== 'number' || requestedEvents < 0) {
    throw new FuseErrno('EINVAL', 'Requested events must be a non-negative number');
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
 * @param requestedEvents - Events that the kernel is interested in
 * @returns PollResult containing the ready events and optional keepPolling flag
 */
export async function pollWrapper(
  handlers: {
    poll?: (
      ino: Ino,
      fi: FileInfo,
      ph: PollHandle,
      requestedEvents: number,
      context: RequestContext,
      options?: BaseOperationOptions
    ) => Promise<PollResult>
  },
  ino: Ino,
  fi: FileInfo,
  ph: PollHandle,
  requestedEvents: number,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<PollResult> {
  validatePoll(ino, fi, ph, requestedEvents);

  const handler = handlers.poll;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, fi, ph, requestedEvents, context, options);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'poll handler returned invalid result');
  }

  if (typeof result.revents !== 'number') {
    throw new FuseErrno('EIO', 'poll handler returned invalid revents');
  }

  if (!Number.isInteger(result.revents) || result.revents < 0) {
    throw new FuseErrno('EIO', 'poll handler returned invalid revents value');
  }

  if (result.keepPolling !== undefined && typeof result.keepPolling !== 'boolean') {
    throw new FuseErrno('EIO', 'poll handler keepPolling must be a boolean when provided');
  }

  return result;
}
