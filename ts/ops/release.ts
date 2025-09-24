import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  ReleaseHandler,
  RequestContext,
} from '../types.js';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validateRelease(
  ino: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);
}

export async function releaseWrapper(
  handlers: { release?: ReleaseHandler },
  ino: Ino,
  fi: FileInfo,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<void> {
  validateRelease(ino);

  const handler = handlers.release;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  await handler(ino, fi, context, options);
}