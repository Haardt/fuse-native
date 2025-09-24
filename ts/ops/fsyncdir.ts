import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  RequestContext,
} from '../types.js';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type FsyncdirResult = void;

export function validateFsyncdir(
  ino: unknown,
  datasync: unknown,
  fi: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (typeof datasync !== 'boolean') {
    throw new FuseErrno('EINVAL', 'Datasync must be a boolean');
  }

  if (!fi || typeof fi !== 'object') {
    throw new FuseErrno('EINVAL', 'File info must be an object');
  }

  const fileInfo = fi as FileInfo;
  if (typeof fileInfo.fh !== 'number' || typeof fileInfo.flags !== 'number') {
    throw new FuseErrno('EINVAL', 'File info must have valid fh and flags');
  }
}

/**
 * Fsyncdir operation wrapper.
 *
 * Synchronizes directory contents to storage. This operation ensures that all
 * pending directory operations (like file creations, deletions, renames) are
 * physically written to the underlying storage.
 *
 * @param datasync - If true, only synchronize user data (not metadata like timestamps)
 *                   If false, synchronize both user data and metadata
 */
export async function fsyncdirWrapper(
  handlers: {
    fsyncdir?: (
      ino: Ino,
      datasync: boolean,
      fi: FileInfo,
      context: RequestContext,
      options?: BaseOperationOptions
    ) => Promise<void>
  },
  ino: Ino,
  datasync: boolean,
  fi: FileInfo,
  context: RequestContext = {} as RequestContext,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<FsyncdirResult> {
  validateFsyncdir(ino, datasync, fi);

  const handler = handlers.fsyncdir;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, datasync, fi, context, options);
  return result;
}