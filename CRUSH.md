# CRUSH.md

## Build Commands
- **Full build**: `pnpm run build` (native + TS)
- **Native only**: `pnpm run build:native` (cmake-js)
- **TypeScript only**: `pnpm run build:ts`
- **Test all**: `pnpm test` (jest)
- **Test single**: `pnpm test -- test/specific-file.test.ts`
- **Lint**: `pnpm run lint` (eslint with fixes)
- **Format**: `pnpm run format` (prettier)
- **Type check**: `pnpm run typecheck`

**Critical: After adding C++ functions, update prebuilds:**
```bash
cp build/Release/fuse-native.node prebuilds/linux-x64/@cocalc+fuse-native.node
```

## Code Style Guidelines
- **ESM imports**: `import type { Foo } from './foo.js'`
- **Strict TypeScript**: no `any`, no implicit types, prefer readonly
- **BigInt for 64-bit**: offsets/sizes/timestamps (never `number`)
- **Error handling**: negative errno (e.g., `-2` for ENOENT)
- **Current working directory**: absolute paths, avoid `cd`
- **No callbacks**: only Promises with AbortSignal support
- **Branded types**: `Fd`, `Mode`, `Flags` (not plain numbers)
- **C++ namespace**: `fuse_native::` prefix
- **Formatting**: single quotes, 2 spaces, semi-colons, printWidth 80

# AGENTS.md (English, Compact Version)

## Mission

Build a **modern FUSE3 binding for Node.js** — performance-oriented, robust, ergonomic:

* Native bridge via **N-API (C/C++)**, public **TypeScript API** (ESM, Promises, AbortSignal)
* **BigInt** for offsets/sizes, **ns timestamps** (no ms truncation)
* **Zero-Copy**/External ArrayBuffer, **copy\_file\_range** fast path
* Unified **−errno** errors, clear branded types (`Fd`, `Mode`, `Flags`)
* **Thread-safe** callbacks (TSFN), ordered **shutdown**, strong **observability**
* **Greenfield**: use `./old-reference-implementation` only as behavioral reference, `./fuse-docs` as semantic source

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
/test    # Unit & Mock-E2E tests
/bench   # Benchmarks & KPI scripts
/docs    # API reference & HowTos
/examples# memfs, passthrough, kvfs
```

## Source Policy

* `./old-reference-implementation`: observe behavior only; **no copy-paste**.
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
