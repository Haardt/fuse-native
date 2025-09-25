import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  BaseOperationOptions,
  Ino,
  RequestContext,
} from '../types.ts';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type BmapResult = {
  block: bigint;
};

export function validateBmap(
  ino: unknown,
  blocksize: unknown,
  idx: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (typeof blocksize !== 'number') {
    throw new FuseErrno('EINVAL', 'Block size must be a number');
  }

  if (!Number.isInteger(blocksize) || blocksize <= 0) {
    throw new FuseErrno('EINVAL', 'Block size must be a positive integer');
  }

  if (typeof idx !== 'bigint') {
    throw new FuseErrno('EINVAL', 'Block index must be a BigInt');
  }

  if (idx < 0n) {
    throw new FuseErrno('EINVAL', 'Block index must be non-negative');
  }
}

/**
 * Block map operation wrapper.
 *
 * Maps a logical block number to a physical block number. This operation
 * is used to support FIBMAP ioctl and similar block mapping functionality.
 * Filesystems that don't support block mapping should not implement this handler.
 *
 * @param blocksize - The filesystem block size in bytes
 * @param idx - The logical block number to map
 * @returns The physical block number, or 0 if the block is not allocated
 */
export async function bmapWrapper(
  handlers: {
    bmap?: (
      ino: Ino,
      blocksize: number,
      idx: bigint,
      context: RequestContext,
      options?: BaseOperationOptions
    ) => Promise<{ block: bigint }>
  },
  ino: Ino,
  blocksize: number,
  idx: bigint,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<BmapResult> {
  validateBmap(ino, blocksize, idx);

  const handler = handlers.bmap;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, blocksize, idx, context, options);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'bmap handler returned invalid result');
  }

  if (typeof result.block !== 'bigint') {
    throw new FuseErrno('EIO', 'bmap handler returned invalid block number');
  }

  // Block number can be 0 (unallocated) or positive
  if (result.block < 0n) {
    throw new FuseErrno('EIO', 'bmap handler returned negative block number');
  }

  return result;
}