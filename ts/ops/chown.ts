import { FuseErrno } from '../errors.js';
import { ValidationUtils } from '../helpers.js';
import { ensureStatResult, normalizeTimeout } from './getattr.js';
import type {
  BaseOperationOptions,
  ChownHandler,
  Gid,
  Ino,
  RequestContext,
  StatResult,
  Timeout,
  Uid,
} from '../types.js';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: BaseOperationOptions = {};

export type ChownResult = {
  attr: StatResult;
  timeout: Timeout;
};

function validateOwnershipId(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number') {
    throw new FuseErrno('EINVAL', `${label} must be a number`);
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new FuseErrno('EINVAL', `${label} must be a non-negative integer`);
  }
}

export function validateChown(
  ino: unknown,
  uid: unknown,
  gid: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  const uidProvided = uid !== null && uid !== undefined;
  const gidProvided = gid !== null && gid !== undefined;

  if (!uidProvided && !gidProvided) {
    throw new FuseErrno('EINVAL', 'At least one of uid or gid must be provided');
  }

  if (uidProvided) {
    validateOwnershipId(uid, 'uid');
  }

  if (gidProvided) {
    validateOwnershipId(gid, 'gid');
  }
}

export async function chownWrapper(
  handlers: { chown?: ChownHandler },
  ino: Ino,
  uid: Uid | null,
  gid: Gid | null,
  context: RequestContext = DEFAULT_CONTEXT,
  options: BaseOperationOptions = DEFAULT_OPTIONS
): Promise<ChownResult> {
  validateChown(ino, uid, gid);

  const handler = handlers.chown;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, uid, gid, context, options);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'chown handler returned invalid result');
  }

  const statResult = ensureStatResult(result.attr);
  const timeout = normalizeTimeout(result.timeout);

  return { attr: statResult, timeout };
}
