import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  BaseOperationOptions,
  Ino,
  RequestContext,
  StatfsHandler,
  StatvfsResult,
} from '../types.ts';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type StatfsResult = StatvfsResult;

export function validateStatfs(ino: unknown): asserts ino is Ino {
  ValidationUtils.validateIno(ino);
}

export function validateStatvfsResult(result: unknown): asserts result is StatvfsResult {
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EINVAL', 'Statvfs result must be an object');
  }

  const stat = result as StatvfsResult;

  // Validate required numeric fields
  const numericFields = ['bsize', 'frsize', 'blocks', 'bfree', 'bavail', 'files', 'ffree', 'favail', 'fsid', 'flag', 'namemax'];
  for (const field of numericFields) {
    if (typeof (stat as any)[field] !== 'number' && typeof (stat as any)[field] !== 'bigint') {
      throw new FuseErrno('EINVAL', `Statvfs result ${field} must be a number or BigInt`);
    }
  }

  // Validate block sizes
  if (stat.bsize <= 0) {
    throw new FuseErrno('EINVAL', 'Block size must be positive');
  }

  if (stat.frsize <= 0) {
    throw new FuseErrno('EINVAL', 'Fragment size must be positive');
  }

  // Validate block counts (should not be negative)
  const blockFields = ['blocks', 'bfree', 'bavail'];
  for (const field of blockFields) {
    const value = (stat as any)[field];
    if ((typeof value === 'number' && value < 0) || (typeof value === 'bigint' && value < 0n)) {
      throw new FuseErrno('EINVAL', `${field} cannot be negative`);
    }
  }

  // Validate inode counts (should not be negative)
  const inodeFields = ['files', 'ffree', 'favail'];
  for (const field of inodeFields) {
    const value = (stat as any)[field];
    if ((typeof value === 'number' && value < 0) || (typeof value === 'bigint' && value < 0n)) {
      throw new FuseErrno('EINVAL', `${field} cannot be negative`);
    }
  }

  // Validate relationships
  const blocks = typeof stat.blocks === 'bigint' ? Number(stat.blocks) : stat.blocks;
  const bfree = typeof stat.bfree === 'bigint' ? Number(stat.bfree) : stat.bfree;
  const bavail = typeof stat.bavail === 'bigint' ? Number(stat.bavail) : stat.bavail;

  if (bfree > blocks) {
    throw new FuseErrno('EINVAL', 'Free blocks cannot exceed total blocks');
  }

  if (bavail > bfree) {
    throw new FuseErrno('EINVAL', 'Available blocks cannot exceed free blocks');
  }

  const files = typeof stat.files === 'bigint' ? Number(stat.files) : stat.files;
  const ffree = typeof stat.ffree === 'bigint' ? Number(stat.ffree) : stat.ffree;
  const favail = typeof stat.favail === 'bigint' ? Number(stat.favail) : stat.favail;

  if (ffree > files) {
    throw new FuseErrno('EINVAL', 'Free inodes cannot exceed total inodes');
  }

  if (favail > ffree) {
    throw new FuseErrno('EINVAL', 'Available inodes cannot exceed free inodes');
  }

  // Validate name length
  if (stat.namemax <= 0) {
    throw new FuseErrno('EINVAL', 'Maximum filename length must be positive');
  }
}

export async function statfsWrapper(
  handlers: { statfs?: StatfsHandler },
  ino: Ino,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<StatfsResult> {
  validateStatfs(ino);

  const handler = handlers.statfs;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, context, options);
  validateStatvfsResult(result);

  return result;
}