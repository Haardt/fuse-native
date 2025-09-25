import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  RequestContext,
} from '../types.ts';

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type FsyncResult = void;

export function validateFsync(
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
 * Fsync operation wrapper.
 *
 * Synchronizes file contents to storage. This operation ensures that all
 * pending writes for the file are physically written to the underlying storage.
 *
 * @param datasync - If true, only synchronize user data (not metadata like timestamps)
 *                   If false, synchronize both user data and metadata
 */
export async function fsyncWrapper(
  handlers: {
    fsync?: (
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
): Promise<FsyncResult> {
  validateFsync(ino, datasync, fi);

  const handler = handlers.fsync;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, datasync, fi, context, options);
  return result;
}