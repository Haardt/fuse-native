/**
 * @file types.test-d.ts
 * @brief Type safety tests using tsd for FUSE Native branded types
 *
 * This file contains type-level tests to ensure branded types work correctly
 * and prevent type confusion between similar types like Mode and Flags.
 */

import { expectType, expectError, expectAssignable, expectNotAssignable } from 'tsd';
import {
  // Branded types
  Fd,
  Ino,
  Mode,
  Flags,
  Uid,
  Gid,
  Dev,
  Timestamp,

  // Type creators
  createFd,
  createIno,
  createMode,
  createFlags,
  createUid,
  createGid,
  createDev,

  // Main types
  StatResult,
  FileInfo,
  DirentEntry,
  ReaddirResult,
  RequestContext,

  // Operation types
  ReadOptions,
  WriteOptions,
  FuseOperationHandlers,

  // Session types
  FuseSession,
  FuseSessionOptions,
} from '../ts/types.js';

import {
  FuseErrno,
  createFuseError,
} from '../ts/errors.js';

import {
  toTimespec,
  toTimestamp,
  now,
} from '../ts/time.js';

// =============================================================================
// Branded Type Tests
// =============================================================================

// Test that branded types are distinct
declare const fd: Fd;
declare const ino: Ino;
declare const mode: Mode;
declare const flags: Flags;
declare const uid: Uid;
declare const gid: Gid;
declare const dev: Dev;

// Branded types should not be assignable to each other
expectNotAssignable<Mode>(flags);
expectNotAssignable<Flags>(mode);
expectNotAssignable<Fd>(ino);
expectNotAssignable<Ino>(fd);
expectNotAssignable<Uid>(gid);
expectNotAssignable<Gid>(uid);

// Branded types should not be assignable to their underlying types
expectNotAssignable<number>(fd);
expectNotAssignable<number>(mode);
expectNotAssignable<number>(flags);
expectNotAssignable<bigint>(ino);
expectNotAssignable<bigint>(dev);

// But underlying types should not be assignable to branded types
expectNotAssignable<Fd>(5);
expectNotAssignable<Mode>(0o644);
expectNotAssignable<Flags>(0x0001);
expectNotAssignable<Ino>(123n);
expectNotAssignable<Dev>(456n);

// Type creators should return correct branded types
expectType<Fd>(createFd(5));
expectType<Ino>(createIno(123n));
expectType<Mode>(createMode(0o644));
expectType<Flags>(createFlags(0x0001));
expectType<Uid>(createUid(1000));
expectType<Gid>(createGid(1000));
expectType<Dev>(createDev(789n));

// Type creators should only accept correct underlying types
expectError(createFd('invalid'));
expectError(createFd(123n));
expectError(createIno(123));
expectError(createIno('invalid'));
expectError(createMode('0644'));
expectError(createMode(123n));

// =============================================================================
// Timestamp Type Tests
// =============================================================================

// Timestamp should be BigInt
expectType<Timestamp>(123456789n);
expectNotAssignable<Timestamp>(123456789);
expectNotAssignable<Timestamp>('123456789');
expectNotAssignable<Timestamp>(new Date());

// Time functions should work with Timestamp
expectType<Timestamp>(now());
expectType<Timestamp>(toTimestamp(new Date()));
expectType<Timestamp>(toTimestamp(123456789));
expectType<Timestamp>(toTimestamp('2023-01-01T00:00:00Z'));

declare const timestamp: Timestamp;
expectType<{ seconds: number; nanoseconds: number }>(toTimespec(timestamp));

// =============================================================================
// Struct Type Tests
// =============================================================================

// StatResult should use branded types
declare const statResult: StatResult;
expectType<Ino>(statResult.ino);
expectType<Mode>(statResult.mode);
expectType<Uid>(statResult.uid);
expectType<Gid>(statResult.gid);
expectType<Dev>(statResult.rdev);
expectType<bigint>(statResult.size);
expectType<bigint>(statResult.blocks);
expectType<Timestamp>(statResult.atime);
expectType<Timestamp>(statResult.mtime);
expectType<Timestamp>(statResult.ctime);

// FileInfo should use branded types
declare const fileInfo: FileInfo;
expectType<Fd>(fileInfo.fh);
expectType<Flags>(fileInfo.flags);

// DirentEntry should use branded types
declare const direntEntry: DirentEntry;
expectType<string>(direntEntry.name);
expectType<Ino>(direntEntry.ino);
expectType<bigint | undefined>(direntEntry.nextOffset);

// RequestContext should use branded types
declare const requestContext: RequestContext;
expectType<Uid>(requestContext.uid);
expectType<Gid>(requestContext.gid);
expectType<number>(requestContext.pid);
expectType<Mode>(requestContext.umask);

// =============================================================================
// Operation Options Type Tests
// =============================================================================

// ReadOptions should use BigInt for offset
declare const readOptions: ReadOptions;
expectType<bigint>(readOptions.offset);
expectType<number>(readOptions.size);
expectType<FileInfo | undefined>(readOptions.fi);

// WriteOptions should use BigInt for offset
declare const writeOptions: WriteOptions;
expectType<bigint>(writeOptions.offset);
expectType<FileInfo | undefined>(writeOptions.fi);

// Options should not accept wrong types for offset
expectError<ReadOptions>({ offset: 123, size: 100 }); // number instead of bigint
expectError<WriteOptions>({ offset: '123', size: 100 }); // string instead of bigint

// =============================================================================
// Operation Handler Type Tests
// =============================================================================

// Test that operation handlers have correct signatures
declare const operationHandlers: FuseOperationHandlers;

// getattr should accept Ino and return StatResult
if (operationHandlers.getattr) {
  expectType<(
    ino: Ino,
    context: RequestContext,
    fi?: FileInfo,
    options?: any
  ) => Promise<{ attr: StatResult; timeout: number }>>(operationHandlers.getattr);
}

// read should accept Ino and ReadOptions, return ArrayBuffer
if (operationHandlers.read) {
  expectType<(
    ino: Ino,
    context: RequestContext,
    options: ReadOptions
  ) => Promise<ArrayBuffer>>(operationHandlers.read);
}

// write should accept Ino, ArrayBuffer, and WriteOptions, return number
if (operationHandlers.write) {
  expectType<(
    ino: Ino,
    data: ArrayBuffer,
    context: RequestContext,
    options: WriteOptions
  ) => Promise<number>>(operationHandlers.write);
}

// readdir should return ReaddirResult
if (operationHandlers.readdir) {
  expectType<(
    ino: Ino,
    offset: bigint,
    context: RequestContext,
    fi?: FileInfo,
    options?: any
  ) => Promise<ReaddirResult>>(operationHandlers.readdir);
}

// Operation handlers should not accept wrong parameter types
expectError<FuseOperationHandlers>({
  getattr: async (ino: number) => ({ attr: {} as StatResult, timeout: 1.0 }) // number instead of Ino
});

expectError<FuseOperationHandlers>({
  read: async (ino: Ino, context: RequestContext, options: { offset: number }) => new ArrayBuffer(0) // number offset instead of bigint
});

// =============================================================================
// Session Type Tests
// =============================================================================

// FuseSession should have correct interface
declare const fuseSession: FuseSession;
expectType<string>(fuseSession.mountpoint);
expectType<boolean>(fuseSession.mounted);
expectType<boolean>(fuseSession.ready);
expectType<() => Promise<void>>(fuseSession.mount);
expectType<() => Promise<void>>(fuseSession.unmount);
expectType<() => Promise<void>>(fuseSession.destroy);

// FuseSessionOptions should have correct types
declare const sessionOptions: FuseSessionOptions;
expectType<boolean | undefined>(sessionOptions.allowOther);
expectType<boolean | undefined>(sessionOptions.debug);
expectType<number | undefined>(sessionOptions.maxRead);
expectType<string[] | undefined>(sessionOptions.mountOptions);

// =============================================================================
// Error Type Tests
// =============================================================================

// FuseErrno should extend Error with additional properties
declare const fuseError: FuseErrno;
expectType<Error>(fuseError);
expectType<number>(fuseError.errno);
expectType<string>(fuseError.code);
expectType<string | undefined>(fuseError.syscall);
expectType<string | undefined>(fuseError.path);

// Error creators should work with different input types
expectType<FuseErrno>(createFuseError('ENOENT'));
expectType<FuseErrno>(createFuseError(-2));
expectType<FuseErrno>(createFuseError('EACCES', 'Custom message'));
expectType<FuseErrno>(createFuseError(-13, 'Custom message', 'open', '/path'));

// =============================================================================
// Complex Type Composition Tests
// =============================================================================

// Test that complex operations maintain type safety
async function testTypedOperation(): Promise<StatResult> {
  const ino = createIno(123n);
  const context: RequestContext = {
    uid: createUid(1000),
    gid: createGid(1000),
    pid: 12345,
    umask: createMode(0o022)
  };

  const handlers: FuseOperationHandlers = {
    async getattr(inode, ctx, fi, opts) {
      expectType<Ino>(inode);
      expectType<RequestContext>(ctx);
      expectType<FileInfo | undefined>(fi);

      return {
        attr: {
          ino: inode,
          mode: createMode(0o644),
          nlink: 1,
          uid: ctx.uid,
          gid: ctx.gid,
          rdev: createDev(0n),
          size: 1024n,
          blksize: 4096,
          blocks: 2n,
          atime: now(),
          mtime: now(),
          ctime: now()
        },
        timeout: 1.0
      };
    }
  };

  if (handlers.getattr) {
    const result = await handlers.getattr(ino, context);
    expectType<StatResult>(result.attr);
    expectType<number>(result.timeout);
    return result.attr;
  }

  throw new Error('getattr not implemented');
}

// Test that wrong types are caught in complex scenarios
expectError(async function invalidOperation() {
  const handlers: FuseOperationHandlers = {
    async getattr(ino, context) {
      return {
        attr: {
          ino,
          mode: 0o644, // ERROR: should be branded Mode type
          nlink: 1,
          uid: context.uid,
          gid: context.gid,
          rdev: createDev(0n),
          size: 1024n,
          blksize: 4096,
          blocks: 2n,
          atime: now(),
          mtime: now(),
          ctime: now()
        },
        timeout: 1.0
      };
    }
  };
});

// =============================================================================
// Utility Type Tests
// =============================================================================

// Test generic type utilities work correctly
import type { FuseOperationName, HandlerFor, HandlerResult } from '../ts/types.js';

expectType<'getattr' | 'setattr' | 'read' | 'write'>('getattr' as FuseOperationName);

// HandlerFor should extract correct handler type
type GetattrHandler = HandlerFor<'getattr'>;
expectAssignable<GetattrHandler>(async (ino: Ino, context: RequestContext) => ({
  attr: {} as StatResult,
  timeout: 1.0
}));

// HandlerResult should extract correct return type
type GetattrResult = HandlerResult<'getattr'>;
expectType<{ attr: StatResult; timeout: number }>({} as GetattrResult);

// =============================================================================
// Edge Case Type Tests
// =============================================================================

// Test optional properties work correctly
declare const optionalFileInfo: Partial<FileInfo>;
expectType<Fd | undefined>(optionalFileInfo.fh);
expectType<boolean | undefined>(optionalFileInfo.direct_io);

// Test readonly properties are enforced
declare const readonlyError: FuseErrno;
expectError(() => {
  // @ts-expect-error - errno should be readonly
  readonlyError.errno = -999;
});

expectError(() => {
  // @ts-expect-error - code should be readonly
  readonlyError.code = 'INVALID';
});

// Test array types work correctly
declare const direntEntries: DirentEntry[];
expectType<DirentEntry[]>(direntEntries);
expectType<DirentEntry>(direntEntries[0]);

declare const readdirResult: ReaddirResult;
expectType<DirentEntry[]>(readdirResult.entries);
expectType<boolean>(readdirResult.hasMore);
expectType<bigint | undefined>(readdirResult.nextOffset);

// =============================================================================
// Version Compatibility Tests
// =============================================================================

// Test that types work with strict TypeScript settings
declare function strictFunction<T extends Ino>(ino: T): T;
expectType<Ino>(strictFunction(createIno(123n)));
expectError(strictFunction(123n)); // Raw bigint should not be accepted

// Test discriminated unions work correctly
type OperationResult =
  | { success: true; data: ArrayBuffer }
  | { success: false; error: FuseErrno };

declare const result: OperationResult;
if (result.success) {
  expectType<ArrayBuffer>(result.data);
  expectError(result.error); // error should not exist when success is true
} else {
  expectType<FuseErrno>(result.error);
  expectError(result.data); // data should not exist when success is false
}
