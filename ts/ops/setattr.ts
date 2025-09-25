import { FuseErrno } from '../errors.ts';
import { ValidationUtils } from '../helpers.ts';
import { ensureStatResult, normalizeTimeout } from './getattr.ts';
import {
  FUSE_SET_ATTR_ATIME,
  FUSE_SET_ATTR_ATIME_NOW,
  FUSE_SET_ATTR_CTIME,
  FUSE_SET_ATTR_GID,
  FUSE_SET_ATTR_MODE,
  FUSE_SET_ATTR_MTIME,
  FUSE_SET_ATTR_MTIME_NOW,
  FUSE_SET_ATTR_SIZE,
  FUSE_SET_ATTR_UID,
} from '../constants.ts';
import {
  createGid,
  createMode,
  createUid,
  type Ino,
  type RequestContext,
  type SetattrHandler,
  type SetattrOptions,
  type StatResult,
  type Timeout,
} from '../types.ts';

const DEFAULT_CONTEXT: RequestContext = {
  uid: 0 as any,
  gid: 0 as any,
  pid: 0,
  umask: 0 as any,
};

const DEFAULT_OPTIONS: SetattrOptions = { valid: 0 };

export type SetattrResult = {
  attr: StatResult;
  timeout: Timeout;
};

function assertBigInt(value: unknown, label: string): asserts value is bigint {
  if (typeof value !== 'bigint') {
    throw new FuseErrno('EINVAL', `${label} must be a BigInt`);
  }

  if (value < 0n) {
    throw new FuseErrno('EINVAL', `${label} cannot be negative`);
  }
}

function assertNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number') {
    throw new FuseErrno('EINVAL', `${label} must be a number`);
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new FuseErrno('EINVAL', `${label} must be a non-negative integer`);
  }
}

function normalizeSetattrOptions(options: SetattrOptions): SetattrOptions {
  if (!options || typeof options !== 'object') {
    throw new FuseErrno('EINVAL', 'Setattr options must be provided');
  }

  if (typeof options.valid !== 'number' || options.valid === 0) {
    throw new FuseErrno('EINVAL', 'Setattr valid mask must be a non-zero number');
  }

  return options;
}

function normalizeSetattrAttributes(attr: unknown, valid: number): Partial<StatResult> {
  if (!attr || typeof attr !== 'object') {
    throw new FuseErrno('EINVAL', 'Setattr attributes must be an object');
  }

  const record = attr as Record<string, unknown>;
  const result: Partial<StatResult> = {};
  let matched = 0;

  if ((valid & FUSE_SET_ATTR_MODE) !== 0) {
    assertNumber(record['mode'], 'attr.mode');
    result.mode = createMode(record['mode']);
    matched += 1;
  }

  if ((valid & FUSE_SET_ATTR_UID) !== 0) {
    assertNumber(record['uid'], 'attr.uid');
    result.uid = createUid(record['uid']);
    matched += 1;
  }

  if ((valid & FUSE_SET_ATTR_GID) !== 0) {
    assertNumber(record['gid'], 'attr.gid');
    result.gid = createGid(record['gid']);
    matched += 1;
  }

  if ((valid & FUSE_SET_ATTR_SIZE) !== 0) {
    assertBigInt(record['size'], 'attr.size');
    result.size = record['size'];
    matched += 1;
  }

  if ((valid & FUSE_SET_ATTR_ATIME) !== 0) {
    if (record['atime'] !== undefined) {
      assertBigInt(record['atime'], 'attr.atime');
      result.atime = record['atime'];
    } else if ((valid & FUSE_SET_ATTR_ATIME_NOW) === 0) {
      throw new FuseErrno('EINVAL', 'attr.atime must be provided when FUSE_SET_ATTR_ATIME is set');
    }
    matched += 1;
  } else if ((valid & FUSE_SET_ATTR_ATIME_NOW) !== 0) {
    matched += 1;
  }

  if ((valid & FUSE_SET_ATTR_MTIME) !== 0) {
    if (record['mtime'] !== undefined) {
      assertBigInt(record['mtime'], 'attr.mtime');
      result.mtime = record['mtime'];
    } else if ((valid & FUSE_SET_ATTR_MTIME_NOW) === 0) {
      throw new FuseErrno('EINVAL', 'attr.mtime must be provided when FUSE_SET_ATTR_MTIME is set');
    }
    matched += 1;
  } else if ((valid & FUSE_SET_ATTR_MTIME_NOW) !== 0) {
    matched += 1;
  }

  if ((valid & FUSE_SET_ATTR_CTIME) !== 0) {
    assertBigInt(record['ctime'], 'attr.ctime');
    result.ctime = record['ctime'];
    matched += 1;
  }

  if (matched === 0) {
    throw new FuseErrno('EINVAL', 'Setattr request did not specify any supported fields');
  }

  return result;
}

export function validateSetattr(
  ino: unknown,
  attr: unknown,
  options: unknown
): asserts ino is Ino {
  ValidationUtils.validateIno(ino);

  if (!options || typeof options !== 'object' || options === null) {
    throw new FuseErrno('EINVAL', 'Setattr options must be provided');
  }

  if (attr === undefined) {
    throw new FuseErrno('EINVAL', 'Setattr attributes must be provided');
  }
}

export async function setattrWrapper(
  handlers: { setattr?: SetattrHandler },
  ino: Ino,
  attr: unknown,
  context: RequestContext = DEFAULT_CONTEXT,
  options: SetattrOptions = DEFAULT_OPTIONS
): Promise<SetattrResult> {
  validateSetattr(ino, attr, options);

  const normalizedOptions = normalizeSetattrOptions(options);
  const validMask = normalizedOptions.valid;
  const normalizedAttr = normalizeSetattrAttributes(attr, validMask);

  const handler = handlers.setattr;
  if (!handler) {
    throw new FuseErrno('ENOSYS');
  }

  const result = await handler(ino, normalizedAttr, context, normalizedOptions);
  if (!result || typeof result !== 'object') {
    throw new FuseErrno('EIO', 'setattr handler returned invalid result');
  }

  const statResult = ensureStatResult(result.attr);
  const timeout = normalizeTimeout(result.timeout);

  return { attr: statResult, timeout };
}
