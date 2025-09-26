# AGENTS.md (English, Compact Version)

0. IMPORTANT: DON'T START THE PRGRAMM. IT WILL CRASH OR YOU CAN START IT ASNYCHRONOUSLY.
1. LET THE USER TEST THE PROGRAMM. BUILD IT, EDIT IT > OK

## Mission

Ziel: Das Ziel ist es, die TypeScript-API von fuse-native so zu erweitern, dass sie die vollen Datenstrukturen der zugrundeliegenden libfuse-Bibliothek widerspiegelt.
Dies erhöht die Mächtigkeit und Vorhersagbarkeit der API. Jede FUSE-Operation soll nach diesem Plan einzeln bearbeitet werden.

Grundlegendes Konzept: Der Arbeitsablauf ist immer derselbe und folgt einem klaren Muster, um Konsistenz und Korrektheit zu gewährleisten:

1. Analyse: Verstehe die vollständige Datenstruktur der Operation.
2. Implementierung: Setze die Änderungen im Code um (von der Typdefinition bis zum C++-Binding).
3. Verifizierung: Stelle durch einen Integrationstest sicher, dass alles korrekt funktioniert.

Detaillierter Arbeitsplan (pro FUSE-Operation)

Führe die folgenden Schritte für jede einzelne FUSE-Operation (z.B. getattr, readdir, mknod, etc.) durch.

Phase 1: Analyse und Recherche

1. FUSE-Dokumentation prüfen (`fuse-docs`):
  * Ziel: Identifiziere die exakten Input- und Output-Strukturen der libfuse-Operation.
  * Aktion:
    * Öffne fuse-docs/doc/libfuse-operations.txt und fuse-docs/include/fuse_kernel.h.
    * Suche die Zieldoperation (z.B., FUSE_GETATTR).
    * Analysiere die zugehörigen C-Strukturen (z.B. fuse_attr_out, fuse_entry_out). Notiere alle Felder und deren C-Typen. Dies ist die "Wahrheit", an der wir uns
      orientieren.

2. C++ Binding prüfen (`src/`):
  * Ziel: Verstehe, wie die Daten aktuell zwischen TypeScript und C++ übergeben werden.
  * Aktion:
    * Öffne src/fuse_bridge.cc.
    * Finde die C++-Funktion, die die Operation behandelt (z.B. HandleGetattr, HandleLookup).
    * Analysiere die Hilfsfunktion, die das Ergebnis vom JavaScript-Handler entgegennimmt und in eine C-Struktur umwandelt (z.B. PopulateEntryFromResult).
    * Prüfe, welche Felder aus dem JavaScript-Objekt bereits gelesen werden und welche fehlen.

3. TypeScript-Typen und Handler prüfen (`ts/`):
  * Ziel: Identifiziere die Lücke zwischen der aktuellen TypeScript-Definition und der libfuse-Struktur.
  * Aktion:
    * Öffne ts/types.ts.
    * Suche die aktuelle Handler-Typdefinition für die Operation (z.B. GetattrHandler).
    * Vergleiche die Parameter und insbesondere den Rückgabewert mit deinen Notizen aus der fuse-docs-Analyse.

Phase 2: Implementierung

1. TypeScript-Typen anpassen (`ts/types.ts`):
  * Ziel: Definiere die vollständige Datenstruktur in TypeScript.
  * Aktion:
    * Erstelle bei Bedarf einen neuen, aussagekräftigen ...Result- oder ...Param-Typ (z.B. EntryResult, AttrResult), der alle Felder aus der libfuse-Struktur
      enthält. Achte auf korrekte Typen (bigint für 64-bit Integer, etc.).
    * Aktualisiere die Signatur des Handler-Typs, sodass er die neue, reichhaltigere Struktur zurückgibt.

2. C++ Binding anpassen (`src/fuse_bridge.cc`):
  * Ziel: Bringe dem C++-Code bei, die neue TypeScript-Struktur zu verstehen.
  * Aktion:
    * Modifiziere die entsprechende Populate...From...-Funktion.
    * Füge die Logik hinzu, um die neuen Felder aus dem JavaScript-Objekt zu lesen (z.B. generation, entry_timeout).
    * Stelle sicher, dass die Daten korrekt in die C-Struktur für libfuse geschrieben werden.

3. Default-Implementierung anpassen (`ts/test/integration/file-system-operations.ts`):
  * Ziel: Passe die Standard-Logik für Tests an die neue Typdefinition an.
  * Aktion:
    * Öffne ts/test/integration/file-system-operations.ts.
    * Suche den Handler für die Operation (z.B. lookup: LookupHandler = ...).
    * Ändere die Implementierung so, dass sie ein Objekt zurückgibt, das dem neuen, erweiterten ...Result-Typ entspricht.
    * Hole die dafür nötigen Daten aus der _fs-Klasse. Falls dem SimpleInode in filesystem.ts dafür Eigenschaften fehlen (wie generation), füge sie dort ebenfalls
      hinzu.

Phase 3: Verifizierung

1. Integrationstest erstellen/anpassen (`ts/test/integration/`):
  * Ziel: Schreibe einen Test, der die korrekte End-zu-End-Funktionalität der neuen Datenstruktur beweist.
  * Aktion:
    * Erstelle eine neue [operation].test.ts-Datei oder passe eine existierende an.
    * Folge dem etablierten Test-Muster:
      1. Override Handler: Überschreibe den Handler mit einer test...Handler-Implementierung.
      2. Return Rich Data: Gib in diesem Test-Handler ein hartcodiertes Objekt zurück, das die neue, vollständige Datenstruktur verwendet.
      3. Trigger Operation: Führe eine Dateisystem-Operation aus, die den FUSE-Handler auslöst (z.B. fs.stat(), fs.readdir()).
      4. Assert:
        * Überprüfe, ob die an den Handler übergebenen Parameter korrekt sind.
        * Überprüfe, ob das Ergebnis des fs-Aufrufs die reichhaltigen Daten widerspiegelt, die vom Test-Handler zurückgegeben wurden.

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
/ts/test    # Unit & Mock-E2E tests
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
