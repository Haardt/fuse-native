import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import type {
  BaseOperationOptions,
  FileInfo,
  Flags,
  Ino,
  OpenHandler,
  RequestContext,
} from '../types.js';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export function validateOpen(
  ino: unknown,
  flags: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (typeof flags !== 'number') {
    throw new FuseErrno('EINVAL', 'Flags must be a number');
  }

  if (!Number.isInteger(flags) || flags < 0) {
    throw new FuseErrno('EINVAL', 'Flags must be a non-negative integer');
  }
}

export async function openWrapper(
  handlers: { open?: OpenHandler },
  ino: Ino,
  flags: Flags,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<FileInfo> {
  validateOpen(ino, flags);

  const handler = handlers.open;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, context, { ...options, flags });
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'open handler returned invalid result');
  }

  // Basic validation of the FileInfo
  const fi = result as FileInfo;
  if (typeof fi.fh !== 'number' || typeof fi.flags !== 'number') {
    throw new FuseErrno('EIO', 'open handler returned invalid FileInfo');
  }

  return fi;
}
