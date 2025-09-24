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

export function validateOpendir(
  ino: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);
}

export function ensureFileInfoResult(value: unknown): FileInfo {
  if (!value || typeof value !== 'object') {
    throw new FuseErrno('EIO', 'opendir handler returned invalid result');
  }

  // The FileInfo type includes fh as Fd (number & brand) and flags as Flags (number & brand)
  // but the handler can return plain numbers which should be fine
  return value as FileInfo;
}

export async function opendirWrapper(
  handlers: { opendir?: OpenHandler },
  ino: Ino,
  flags: number,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<FileInfo> {
  validateOpendir(ino);

  const handler = handlers.opendir;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, context, { ...options, flags: flags as Flags });

  return ensureFileInfoResult(result);
}
