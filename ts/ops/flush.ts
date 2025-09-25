import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  ReleaseHandler,
  RequestContext,
} from '../types.ts';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type FlushResult = void;

export function validateFlush(
  ino: unknown,
  fi: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (!fi || typeof fi !== 'object') {
    throw new FuseErrno('EINVAL', 'File info must be an object');
  }

  const fileInfo = fi as FileInfo;
  if (typeof fileInfo.fh !== 'number' || typeof fileInfo.flags !== 'number') {
    throw new FuseErrno('EINVAL', 'File info must have valid fh and flags');
  }
}

/**
 * Flush operation wrapper.
 *
 * IMPORTANT: Flush operations can cause deadlocks or infinite loops if not implemented carefully.
 * The flush handler is called on every close() of a file descriptor, not just the final close.
 * Handlers should:
 * - Avoid performing I/O operations that could trigger more FUSE calls
 * - Not assume this is the final flush for the file
 * - Keep operations simple and fast
 * - Not block on resources that depend on the flush itself
 *
 * Errors from flush are often ignored by applications, so flush should focus on
 * ensuring data consistency rather than reporting errors.
 */
export async function flushWrapper(
  handlers: { flush?: ReleaseHandler; release?: ReleaseHandler },
  ino: Ino,
  fi: FileInfo,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<FlushResult> {
  validateFlush(ino, fi);

  // Use flush handler if available, otherwise fall back to release handler
  // Note: This fallback is provided for compatibility, but flush and release
  // have different semantics and should ideally have separate implementations
  const handler = handlers.flush || handlers.release;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, fi, context, options);
  return result;
}