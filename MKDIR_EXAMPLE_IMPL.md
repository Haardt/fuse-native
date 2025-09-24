# MKDIR operation implementation walk-through

This guide explains, step by step, how to wire a fully functional `mkdir` operation into the unified FuseBridge → TSFN dispatcher → TypeScript handler pipeline. Follow the steps in order for a clean implementation.

## 1. Define the request payload in `FuseRequestContext`

1. Ensure the context has fields for `parent` inode, directory `name`, and `mode` (already available in the current struct). If additional metadata is required (e.g. capability flags), add the fields in `src/fuse_bridge.h` and initialise them in the constructor.
2. Keep the struct move-only and rely on `shared_ptr` semantics; do **not** expose raw ownership to other subsystems.

## 2. Populate the context inside the C callback

1. Navigate to `FuseBridge::HandleMkdir` in `src/fuse_bridge.cc`.
2. Before the dispatcher call, set:
   - `context->parent = parent;`
   - `context->name = name ? name : "";`
   - `context->mode = mode;`
3. Perform any cheap guard rails (e.g. empty name check) and reply with `EINVAL` if the kernel input is malformed.

## 3. Marshal arguments for JavaScript

1. Prepare the ordered argument list that the JS handler expects:
   - `parent` as `NapiHelpers::CreateBigUint64(env, ToUint64(context->parent))`.
   - `name` as a UTF-8 `Napi::String`.
   - `mode` as a `Napi::Number` (or richer struct if we introduce branded types later).
   - `requestCtx` via `CreateRequestContextObject(env, *context)`.
   - `options` as an object, initially empty.
2. If you support AbortSignal/timeout, attach both to `options` so the TS layer sees consistent metadata.

## 4. Dispatch through the TSFN layer

1. Call `ProcessRequest(context, [...])`. Inside the lambda, invoke the registered handler with the argument list from step 3.
2. Make sure `ProcessRequest` returns early with `-ENOSYS` if no handler was registered (`HasOperationHandler` check already covers this).

## 5. Handle JavaScript results

1. Use `ResolvePromiseOrValue` to unwrap synchronous or async results.
2. On success, expect an object `{ attr, timeout }`:
   - Validate both properties. `attr` must convert via `NapiHelpers::ObjectToStat`. 
   - Default `timeout` to `1.0` seconds if missing.
3. Populate a `fuse_entry_param`:
   - `entry.attr = attr;`
   - `entry.attr_timeout = timeout;`
   - `entry.entry_timeout = timeout;`
   - `entry.ino = attr.st_ino != 0 ? static_cast<fuse_ino_t>(attr.st_ino) : 0;`
4. Reply using `context->ReplyEntry(entry);`.

## 6. Map errors back to the kernel

1. Any thrown/returned error travels through the rejection branch of `ResolvePromiseOrValue`.
2. Call `ReplyWithErrorValue` so `FuseErrno('EEXIST')`, plain numbers, or BigInts all end up as `-errno` for the kernel.

## 7. Update the TypeScript surface

1. Ensure the public handler signature in `ts/types.ts` matches the native invocation: `(parent, name, mode, context, options) => Promise<{ attr, timeout }>`.
2. In `ts/ops/mkdir.ts`, add a defensive wrapper (`mkdirWrapper`) that validates arguments and forwards to the user handler.
3. Export the wrapper from `ts/index.ts` if the high-level API should expose helpers.

## 8. Add tests

1. In `test/` (or `test/native/` if we create a new suite), write a unit test that:
   - Registers a `mkdir` handler.
   - Simulates the dispatcher call with synthetic `FuseRequestContext` values.
   - Asserts that `fuse_reply_create` receives the expected inode + timeout.
2. Add a TypeScript unit test verifying that `mkdirWrapper` enforces branded types, BigInt offsets, and errno propagation.

## 9. Refresh documentation and examples

1. Document the new handler contract in `docs/api.md` (inputs, return type, error codes).
2. Update any sample filesystem (e.g. a passthrough example) to use the new unified registration path.

## 10. Rebuild and regenerate prebuilds

1. Run `npm run build:native` (CMake) and `npm run build`.
2. Copy the resulting `.node` into `prebuilds/...` as described in `AGENTS.md` if the interface changed.
3. Keep CI matrix green before shipping.

Following these steps ensures the `mkdir` operation flows through the single FuseBridge entry point, honours TSFN ordering, and delivers consistent errno semantics across the stack.
