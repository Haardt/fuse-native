import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  CopyFileRangeHandler,
  FileInfo,
  Ino,
  RequestContext,
} from '../types.js';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validateCopyFileRange(
  inoIn: unknown,
  offIn: unknown,
  fiIn: unknown,
  inoOut: unknown,
  offOut: unknown,
  fiOut: unknown,
  len: unknown,
  flags: unknown
): asserts inoIn is Ino {
  ValidationUtils.validateIno(inoIn);
  ValidationUtils.validateIno(inoOut);

  if (typeof offIn !== 'bigint' || offIn < 0n) {
    throw new FuseErrno('EINVAL', 'Input offset must be a non-negative BigInt');
  }

  if (typeof offOut !== 'bigint' || offOut < 0n) {
    throw new FuseErrno('EINVAL', 'Output offset must be a non-negative BigInt');
  }

  if (typeof len !== 'bigint' || len <= 0n) {
    throw new FuseErrno('EINVAL', 'Length must be a positive BigInt');
  }

  if (typeof flags !== 'number' || !Number.isInteger(flags)) {
    throw new FuseErrno('EINVAL', 'Flags must be an integer');
  }

  if (!fiIn || typeof fiIn !== 'object') {
    throw new FuseErrno('EINVAL', 'Input file info must be an object');
  }

  if (!fiOut || typeof fiOut !== 'object') {
    throw new FuseErrno('EINVAL', 'Output file info must be an object');
  }

  const fiInObj = fiIn as FileInfo;
  const fiOutObj = fiOut as FileInfo;

  if (typeof fiInObj.fh !== 'number' || typeof fiInObj.flags !== 'number') {
    throw new FuseErrno('EINVAL', 'Input file info is invalid');
  }

  if (typeof fiOutObj.fh !== 'number' || typeof fiOutObj.flags !== 'number') {
    throw new FuseErrno('EINVAL', 'Output file info is invalid');
  }
}

export async function copyFileRangeWrapper(
  handlers: { copy_file_range?: CopyFileRangeHandler },
  inoIn: Ino,
  offIn: bigint,
  fiIn: FileInfo,
  inoOut: Ino,
  offOut: bigint,
  fiOut: FileInfo,
  len: bigint,
  flags: number,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<bigint> {
  validateCopyFileRange(inoIn, offIn, fiIn, inoOut, offOut, fiOut, len, flags);

  const handler = handlers.copy_file_range;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(inoIn, offIn, fiIn, inoOut, offOut, fiOut, len, flags, context, options);
  if (typeof result !== 'bigint' || result < 0n) {
    throw new FuseErrno('EIO', 'copy_file_range handler returned invalid result');
  }

  return result;
}