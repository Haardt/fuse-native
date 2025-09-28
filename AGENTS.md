# AGENTS.md

# Single-Operation Implementation Plan

> Replace `OP_NAME` with the concrete operation (e.g., `GETATTR`, `READDIR`) as you execute the steps.

## Phase 1 — Analysis

1. ### Ground truth (libfuse)

  * Open:

    * `fuse-docs/doc/libfuse-operations.txt`
    * `fuse-docs/include/fuse_kernel.h`
  * Find **OP_NAME** (e.g., `FUSE_GETATTR`, `FUSE_READDIR`).
  * Identify:

    * **Request structures** (what the kernel sends to userspace)
    * **Reply structures** (what we must return), e.g.:

      * `struct fuse_attr_out`, `struct fuse_entry_out`, buffers for `readdir`, etc.
    * Note each field name and C type (including 64-bit vs 32-bit, signedness, enums/flags, and time fields).

2. ### C++ bridge (current binding)

  * Open `src/fuse_bridge.cc`.
  * Locate:

    * The **HandleOP_NAME** method (e.g., `HandleGetattr`, `HandleReaddir`).
    * The **Callback** that connects to libfuse (e.g., `GetattrCallback`).
    * Any helper that **parses the JS result** into native structs
      (e.g., `PopulateEntryFromResult`, bespoke parsing inside the handler).
  * Compare what we currently parse/set vs. the ground-truth fields you listed.

3. ### TypeScript types & handler surface

  * Open `ts/types.ts` (or the file exporting handler types).
  * Find the **handler type** for OP_NAME (e.g., `GetattrHandler`, `ReaddirHandler`).
  * Compare the **current return type** (and params) with the ground truth. Identify missing/underspecified fields.

---

## Phase 2 — Implementation

1. ### TS type surface (`ts/types.ts`)

  * Define or extend a **rich result type** that mirrors the libfuse reply:

    * Example names: `GetattrResult`, `EntryResult`, `ReaddirResult`, etc.
    * Include **all** libfuse reply fields. Use:

      * `bigint` for any 64-bit integers (ino, size, blocks, offsets, FHs, time in ns if applicable).
      * `number` for 32-bit flags/mode/uid/gid/errno.
      * Nested objects if that improves clarity (e.g., `{ attr: StatResult, timeout: number }`).
  * Update the `OP_NAME` handler signature to **return the new result**.

2. ### Bridge parsing (`src/fuse_bridge.cc`)

  * If a helper exists (e.g., `PopulateEntryFromResult`), **extend it** to read every new field you added to the TS result.
  * If parsing is inline in `HandleOP_NAME`, **add robust extraction** for each field:

    * When reading from JS:

      * Use BigInt helpers for 64-bit: `NapiHelpers::GetBigUint64`, `CreateBigIntU64`, etc.
      * Validate optional fields (existence + type).
      * Enforce **lossless** conversions for BigInt ↔ 64-bit C++.
    * Map all fields into the correct libfuse struct(s), or build the response buffer (e.g., `readdir` uses `fuse_add_direntry`).
  * Ensure you **reply** with the correct libfuse API:

    * Examples:

      * `fuse_reply_attr`, `fuse_reply_entry`, `fuse_reply_statfs`, `fuse_reply_buf`, `fuse_reply_write`, etc.
  * Keep ownership in mind: if you pass a buffer to FUSE, ensure the **buffer lifetime** survives the reply (use a `shared_ptr` “keepalive” as done elsewhere).

3. ### Default ops used in tests (`ts/test/integration/file-system-operations.ts`)

  * Update the **default handler implementation** for OP_NAME to **populate every field** now defined in your rich TS result.
  * If your result needs data not present in the simple filesystem model, extend `ts/test/integration/filesystem.ts` (e.g., add `generation`, extra timestamps, etc.).

---

## Phase 3 — Verification

1. ### Integration test (`ts/test/integration/op_name.test.ts`)

  * Pattern:

    1. **Override only OP_NAME** with a test handler that returns a **fully populated** result object (use clear, non-default values to catch mapping errors).
    2. **Trigger** the op from Node’s fs to go through the bridge:

      * `getattr` → `fs.stat()` or `lstat()`
      * `readdir` → `fs.readdir()`
      * `mknod`/`mkdir`/etc. → corresponding fs call
    3. **Assert**:

      * The JS handler **received** the correct params (ino, offsets, `fi`, `context`).
      * The kernel call’s **observable effect** matches your returned data (e.g., names/offsets in `readdir`, stat fields for `getattr`).
      * For paginated/streamed ops (e.g., `readdir`), assert `nextOffset`, `hasMore`, and **monotonic offsets**.

2. ### Negative/edge checks (lightweight)

  * Missing optional fields → defaults behave correctly.
  * Type mismatch → handler returns `ENOSYS` or `EIO` as expected.
  * Large 64-bit values round-trip losslessly.

---

## Logging (optional but recommended while implementing one op)

You can turn logging on/off at runtime or compile time. Use it to trace **only the op you’re working on**.

### Runtime control

Set the env var `FUSE_LOG` (case-insensitive) to one of:
`OFF | ERROR | WARN | INFO | DEBUG | TRACE`

Examples:

```bash
# quiet
FUSE_LOG=OFF npm test

# detailed while developing one op
FUSE_LOG=DEBUG npm run test -- ts/test/integration/op_name.test.ts

# maximum
FUSE_LOG=TRACE node your-app.js
```

> If logging was compiled out (`FUSE_LOG_ENABLED=0`), the env var has no effect.

### Build-time flags

Add to `binding.gyp` → `cflags_cc`:

```json
"-DFUSE_LOG_ENABLED=1",
"-DFUSE_LOG_DEFAULT_LEVEL=FUSE_LOG_LEVEL_INFO",
"-DFUSE_LOG_TAG=\"fuse-native\""
```

* `FUSE_LOG_ENABLED=0` removes logging entirely (zero overhead).
* Change `FUSE_LOG_DEFAULT_LEVEL` if you want a higher default without env vars.

### Where to log

* In `src/fuse_bridge.cc`, log at the **start** and **end** of `HandleOP_NAME`, and when parsing/validating the JS result.
* Use concise, structured messages—include `ino`, sizes, offsets, flags, and whether BigInt conversions were lossless.

Examples:

```cpp
FUSE_LOG_DEBUG("readdir: ino=%llu size=%zu off=%lld", (unsigned long long)ino, size, (long long)off);
FUSE_LOG_TRACE("readdir: added entry name=%s nextOffset=%lld need=%zu", name.c_str(), (long long)next_offset, need);
FUSE_LOG_ERROR("getattr: invalid result: missing 'attr'");
```

---

## Acceptance Checklist (per OP_NAME)

* [ ] All libfuse reply fields are represented in the TS result type.
* [ ] C++ bridge parses **every** field with correct types and lossless BigInt handling.
* [ ] The correct libfuse reply function is used; buffer lifetimes are safe.
* [ ] Default test implementation returns a **fully populated** result matching the new type.
* [ ] Integration test triggers the op and asserts both **input params** and **observable outputs**.
* [ ] Logging at `DEBUG` shows a clean, traceable flow; can be silenced with `FUSE_LOG=OFF`.

---

### Tips

* Prefer **explicit** BigInt handling (`Uint64Value`, `Int64Value`) with **lossless** checks.
* Time fields: decide on **ns-since-epoch BigInt** in TS → convert via `NapiHelpers::NsBigIntToTimespec`.
* For `readdir`, ensure offsets are **strictly increasing** and `nextOffset` semantics match libfuse expectations.
* Keep changes **surgical**: one operation per PR keeps diffs reviewable and tests precise.

That’s it. Apply this playbook **one operation at a time** until the TypeScript API fully mirrors libfuse.

## Goals

Predictable quality, consistent commits, clean docs and green tests — no backward compatibility.

## Coding Style Directives
* Separation of Concerns: one file, one responsibility (critical goal).
* Semantic naming: file names and function names should clearly reflect their domain purpose.
* Small source files: aim for files ≤300 lines (exceptions allowed but keep them rare and justified).

These rules help keep the project modular, predictable, and easier to maintain. They fit perfectly with the goals of the binding: explicit ownership, clear interfaces, and testable pieces.

## Repository Structure

```
/src     # C++ N-API Bridge
/ts      # Public TS API, helpers, types
/ts/test/integration    # The integration tests
/ts/test/    # Unit tests
/docs    # API reference & HowTos
/fuse-docs    # fuse3 source code and docs
/examples# memfs, passthrough, kvfs
```

## Source Policy
* `./fuse-docs`: main semantic source; may copy structure/field meanings; quote texts in docs but not code (>25 words per block forbidden).

## Coding Standards

### C++ (N-API)

* C++17+, no exceptions in hot path.
* All C→JS calls via **TSFN** (never reentrant).
* Always check **napi\_status**, map errors to errno.
* **BigInt** helpers for 64-bit.
* Timestamps: **ns-epoch BigInt**.
* **External ArrayBuffer** for zero-copy, correct finalizer.
* Clear ownership, no data races.

### TypeScript

* **ESM**, `strict: true`, no `any`.
* **Promises** only (no callbacks).
* Support `AbortSignal`/timeout in `opts`.
* Branded types for `Fd`, `Mode`, `Flags`.
* 64-bit fields: `bigint`. Timestamps: `bigint` ns.
* Errors: `FuseErrno` with `.errno` (negative) + `.code`.

### Error Convention

* Success: ≥ 0
* Error: −errno (POSIX)
* TS mapping: `throw new FuseErrno('ENOENT')` with `.errno=-2`.

## Tests

* **Unit tests (TS):** helpers, types, conversions (BigInt, timespec).
* **Mock-E2E:** FUSE ops without real mount.
* **Type tests (tsd):** no 64-bit as number.
* **C++ tests (optional):** timespec codec, errno mapping.
* Test checklist per PR: offsets >2^53, ns timestamps, negative paths (ENOENT/EACCES/…), at least one concurrency scenario.

## Performance & Stability

* **Zero-Copy** where possible (External ArrayBuffer).
* Large I/O configurable chunks (1–8 MB).
* **copy\_file\_range** fast path + fallback.
* Minimize JS↔C crossings (batching when possible).
* Per-FD write queue; `flush/release` wait until empty.
* State machine: `RUNNING → DRAINING → UNMOUNTING → CLOSED`.
* `unmount()` triggers `fuse_session_exit`; TSFN released cleanly.

## Observability

* Structured logging: op, path, fd, size, offset, errno, duration.
* Optional tracing: OpenTelemetry spans.
* Metrics: ops/s, bytes, p50/p95/p99 latency, error rate.

## Documentation Duties (every PR)

Update relevant docs: `README.md`, `docs/api.md`, `docs/errors.md`, `docs/performance.md`, `docs/concurrency.md`, and `CHANGELOG.md`.

## Build & CI

* Node ≥18, Linux x64/arm64 targets.
* `npm run build` builds native+TS; `npm test` runs all tests.
* Prebuilds via prebuildify (later); artifacts in release job.
* Define `FUSE_USE_VERSION=31` and `NAPI_VERSION=8` in CMake.

## Safety & Robustness

* Validate all paths in C++ (null terminators, lengths).
* Never block the Node main thread.
* Check every N-API call.
* Finalizers idempotent; no dangling pointers.
* Sanitizer builds (ASan/UBSan) recommended.

## Architecture: Call-Chain & Implementation Classes

**Kernel → FUSE → C++ → JS → C++ → FUSE**

* **SessionManager**: owns lifecycle; state machine RUNNING→CLOSED; orchestrates shutdown.
* **FuseBridge**: single entry from `fuse_lowlevel_ops`; creates `FuseRequestContext`; delegates only to TSFNDispatcher; exactly one `fuse_reply_*` per request.
* **TSFNDispatcher**: one `ThreadSafeFunction` for all ops; FIFO + backpressure; passes op+ctx to JS; returns completion to C++.
* **FuseRequestContext**: move-only request data (op, ids, fd, path, offsets, ns timestamps, buffer, abort info). Completed exactly once.
* **BufferBridge/CopyFileRange/NapiHelpers**: helpers for zero-copy, fast path, BigInt conversions.

### Flow Example: Read

```
Kernel ll_read → FuseBridge.ProcessRequest → TSFNDispatcher.enqueue
JS handler (TS) awaits fs.read → TSFNDispatcher.complete(ctxId, data)
FuseBridge.HandleReadSuccess → fuse_reply_buf()
```

### Flow Example: Write

```
ll_write enqueues ctx to per-FD queue → worker drains → TSFNDispatcher.enqueue → JS handler fs.write → complete → fuse_reply_write → queue next()
```

### Error Path

```
JS throws FuseErrno('ENOENT') → TSFNDispatcher.complete errno:-2 → FuseBridge.HandleError → fuse_reply_err()
```

### Concurrency & Shutdown

* Global FIFO across ops (order not guaranteed across inodes/fds).
* Per-FD write queues serialize writes.
* Backpressure handled by dispatcher backlog.
* JS side controls concurrency (semaphores) but API stays Promise-based.
* `unmount()`: stop new requests, drain queues, release TSFN after full drain, then CLOSED.

### Invariants

* One reply per request; none after exit.
* `FUSE_USE_VERSION=31` before all FUSE includes.
* Per-FD write serialization; no JS reentrancy.
* Final TSFN release after full drain.

## Glossary

* **TSFN**: ThreadSafeFunction (C++→JS bridge).
* **errno**: POSIX error code, negative in API.
* **ns-epoch**: nanoseconds since Unix epoch (BigInt).
* **External ArrayBuffer**: JS buffer pointing to native memory.
* **Prebuilds**: precompiled binaries for platforms.
