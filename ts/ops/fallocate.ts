import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  RequestContext,
} from '../types.js';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validateFallocate(
  ino: unknown,
  fi: unknown,
  mode: unknown,
  offset: unknown,
  length: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (!fi || typeof fi !== 'object') {
    throw new FuseErrno('EINVAL', 'File info must be an object');
  }

  const fileInfo = fi as FileInfo;
  if (typeof fileInfo.fh !== 'number' || typeof fileInfo.flags !== 'number') {
    throw new FuseErrno('EINVAL', 'File info must have valid fh and flags');
  }

  if (typeof mode !== 'number') {
    throw new FuseErrno('EINVAL', 'Fallocate mode must be a number');
  }

  if (!Number.isInteger(mode) || mode < 0) {
    throw new FuseErrno('EINVAL', 'Fallocate mode must be a non-negative integer');
  }

  if (typeof offset !== 'bigint') {
    throw new FuseErrno('EINVAL', 'Offset must be a BigInt');
  }

  if (offset < 0n) {
    throw new FuseErrno('EINVAL', 'Offset must be non-negative');
  }

  if (typeof length !== 'bigint') {
    throw new FuseErrno('EINVAL', 'Length must be a BigInt');
  }

  if (length < 0n) {
    throw new FuseErrno('EINVAL', 'Length must be non-negative');
  }
}

/**
 * Fallocate operation wrapper for file space allocation/deallocation.
 *
 * Provides file space preallocation and deallocation functionality, allowing
 * efficient space management for files. This operation enables fallocate system call support.
 *
 * @param fi - File information for the opened file
 * @param mode - Allocation mode flags (FALLOC_FL_*)
 * @param offset - Starting offset for allocation/deallocation
 * @param length - Length of region to allocate/deallocate
 * @returns Promise that resolves on successful space allocation/deallocation
 */
export async function fallocateWrapper(
  handlers: {
    fallocate?: (
      ino: Ino,
      fi: FileInfo,
      mode: number,
      offset: bigint,
      length: bigint,
      context: RequestContext,
      options?: BaseOperationOptions
    ) => Promise<void>
  },
  ino: Ino,
  fi: FileInfo,
  mode: number,
  offset: bigint,
  length: bigint,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<void> {
  validateFallocate(ino, fi, mode, offset, length);

  const handler = handlers.fallocate;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  await handler(ino, fi, mode, offset, length, context, options);
}