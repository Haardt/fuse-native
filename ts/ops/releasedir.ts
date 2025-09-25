import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import type {
  BaseOperationOptions,
  FileInfo,
  Ino,
  ReleaseHandler,
  RequestContext,
} from '../types.ts';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validateReleasedir(
  ino: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);
}

export async function releasedirWrapper(
  handlers: { releasedir?: ReleaseHandler },
  ino: Ino,
  fi: FileInfo,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<void> {
  validateReleasedir(ino);

  const handler = handlers.releasedir;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  await handler(ino, fi, context, options);
}