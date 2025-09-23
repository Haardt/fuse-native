# Phase 0 – Projektgrundlage

# Mission

Wir bauen ein **modernes FUSE3-Binding für Node.js**:
- **N-API (C/C++)** als stabile ABI-Schicht
- **TypeScript-API (ESM, Promises, AbortSignal)** für ergonomische Nutzung
- **BigInt** für alle 64-Bit Werte, **ns-präzise** Zeitstempel
- **Zero-Copy** Datenpfade, optional **copy_file_range** Fast-Path
- Konsistente **−errno** Fehlerkonvention, starke **Observability**
- Saubere **Concurrency/Shutdown** (TSFN, Write-Queues), klare Doku & Tests
- **Greenfield**: alte Referenz nur **read-only**, FUSE-Docs als fachliche Quelle

## 0.1 Build & Struktur fixieren

* **Implementierung**

  * Tools: pnpm, jest and others

  * Lege `src/` (C++/N-API), `ts/` (TypeScript-API) und `test/` (Unit/Mock-E2E) an.
  * `package.json`: `type: "module"`, Scripts:

    * `build:native` (cmake-js / node-gyp)
    * `build:ts` (tsc)
    * `test`
    * `lint`
    * `prepare` (Prebuilds optional später)
* **Dateien**

  * `CMakeLists.txt` oder `binding.gyp`
  * `tsconfig.json` (strict, ES2022, `"moduleResolution":"bundler"`)
* **Tests**

  * Simple Smoke-Test (Mock): `open→getattr→release` ohne Mount.
* **Doku**

  * `README.md`: „Requirements“, „Local build“, „Test ohne FUSE“.
  * `CONTRIBUTING.md`: Build-Schritte & Ordnerstruktur.

* **Dateien**

  * `.github/workflows/ci.yml`
* **Doku**

  * `README.md`: Badge + kurzer CI-Hinweis.

---

# Phase 1 – 64-Bit Umstellung auf BigInt (kein Low/High mehr)

## 1.1 N-API BigInt Helpers

* **Implementierung**

  * `src/napi_bigint.h/.cc`: `u64_to_bigint`, `bigint_to_u64`, Lossless-Check.
  * Ersetze alle Offsets/Größen in Callbacks von 2×32-Bit → `napi_bigint_*`.
* **Dateien**

  * `src/napi_bigint.h`, `src/napi_bigint.cc`
* **Tests**

  * Roundtrip > 2^53 (z. B. `9_000_000_000_000_000_000n`).
* **Doku**

  * `docs/api.md`: „64-Bit Werte = BigInt (JS)“.

## 1.2 JS/TS API anpassen

* **Implementierung**

  * `ts/index.ts`: Signaturen für `read/write/truncate/...` → `position: bigint`, `size: bigint`.
  * Entferne `getDoubleArg` & alte Pfade.
* **Dateien**

  * `ts/index.ts`, `index.d.ts` (aus TS generiert)
* **Tests**

  * Typ-Tests (tsd): 64-Bit Parameter sind `bigint`.
* **Doku**

  * `MIGRATION.md`: „Wegfall Low/High — BigInt verwenden“.

---

# Phase 2 – Zeitstempel auf ns-Präzision

## 2.1 Timespec Codec

* **Implementierung**

  * `src/timespec_codec.h/.cc`: Konvertiere `timespec` ⇄ **ns-epoch** `bigint`.
  * FUSE-Funktionen (`utimens`, ggf. `getattr` Timestamps) nutzen Codec.
* **Dateien**

  * `src/timespec_codec.h`, `src/timespec_codec.cc`
* **Tests**

  * ns-Roundtrip (z. B. `1234567890123456789n`).
* **Doku**

  * `docs/time.md`: Formate, Beispiele, Präzisionshinweis bei `Date`.

## 2.2 TS Helper

* **Implementierung**

  * `ts/time.ts`: `toTimespec(input: bigint|{sec:nsec}|Date|number)`.
  * `ts/index.ts`: akzeptiert `TimeSpec` überall, nutzt Helper.
* **Dateien**

  * `ts/time.ts`, `ts/index.ts`
* **Tests**

  * Unit: alle Eingabeformen → korrekte ns.
* **Doku**

  * `docs/api.md`: „TimeSpec akzeptierte Formen“ + Codebeispiele.

---

# Phase 3 – Einheitliche API & Fehlerkonvention

## 3.1 Callback- und Fehler-Layout

* **Implementierung**

  * Alle APIs verwenden FUSE-Style: Erfolg ≥ 0, Fehler = **−errno**.
  * `src/errno.h/.cc`: Map für `errno <-> Name` + JS-Export (`errno(name)`).
* **Dateien**

  * `src/errno.h`, `src/errno.cc`
  * `ts/errno.ts` (Typen + Helper)
* **Tests**

  * Fehlerpfade je Operation (ENOENT, EACCES, …).
* **Doku**

  * `docs/errors.md`: Tabelle „Operation → mögliche errno“, Beispiele.

## 3.2 d.ts/TS Aufräumen

* **Implementierung**

  * Eindeutige Typen: `Fd`, `Mode`, `Flags` als **branded types**.
  * Konsistente Parameterreihenfolge & Namen.
* **Dateien**

  * `ts/types.ts`, `ts/index.ts`
* **Tests**

  * tsd: falsche Typen (z. B. Mode vs Flags) werden gefangen.
* **Doku**

  * `docs/api.md`: Typtabellen & Beispiele.

---

# Phase 4 – `readdir` mit Offset/Pagination & `d_type`

## 4.1 C-Bridge & Offsets

* **Implementierung**

  * `src/readdir_bridge.cc`: Verwaltung `off_t`, Füllen via `filler`, `nextOffset` ermitteln.
* **Dateien**

  * `src/readdir_bridge.cc`, ggf. Header
* **Tests**

  * Mock: 10k Einträge, mehrere Seiten, Resume via `offset`.
* **Doku**

  * `docs/readdir.md`: Pagination, `nextOffset`, `d_type` Werte.

## 4.2 TS API

* **Implementierung**

  * `readdir(path: string, offset: bigint, opts?, cb)`.
  * Helper: `readdirAll(path)` (intern paginiert).
* **Dateien**

  * `ts/index.ts`
* **Tests**

  * Unit: Pagination + `readdirAll`.
* **Doku**

  * Codebeispiele: „große Verzeichnisse“ / Resume.

---

# Phase 5 – `statfs` 64-Bit

## 5.1 C & TS Anpassungen

* **Implementierung**

  * `struct statvfs` → BigInt-Felder (blocks/files/…).
  * TS-Typ `Statfs` mit `bigint` Feldern.
* **Dateien**

  * `src/statfs_bridge.cc`, `ts/types.ts`
* **Tests**

  * Roundtrip großer Werte, df-ähnliche Prüfung.
* **Doku**

  * `docs/api.md`: `statfs` Felder & Beispiele.

---

# Phase 6 – Zero-Copy & `copy_file_range`

## 6.1 External ArrayBuffer

* **Implementierung**

  * Lese-/Schreibpuffer via `napi_create_external_arraybuffer` an JS reichen.
  * Finalizer korrekt (kein Use-after-free).
* **Dateien**

  * `src/buffer_bridge.cc`
* **Tests**

  * Leak-Check (Valgrind/ASan), Korrektheit.
* **Doku**

  * `docs/performance.md`: Zero-Copy Mechanik & Vorsichtspunkte.

## 6.2 `copy_file_range` Fast-Path

* **Implementierung**

  * Native Implementierung; Fallback: chunked read/write (1–8MB).
* **Dateien**

  * `src/copy_file_range.cc`, `ts/index.ts`
* **Tests**

  * Checksums großer Dateien, Partial-Copy Fehlerpfade.
* **Doku**

  * Bench-Hinweise + Tuning-Parameter.

---

# Phase 7 – Concurrency & Shutdown

## 7.1 TSFN Dispatcher & Queues

* **Implementierung**

  * `src/tsfn_dispatcher.h/.cc`: einheitliche C→JS Übergabe.
  * Per-FD Write-Queue; `flush/release` warten bis leer.
* **Dateien**

  * `src/tsfn_dispatcher.*`, `src/write_queue.*`
* **Tests**

  * Parallel-Write Szenarien, Race-Detektoren.
* **Doku**

  * `docs/concurrency.md`: Modell, Garantiereihenfolge, Anti-Patterns.

## 7.2 Geordneter Shutdown

* **Implementierung**

  * State Machine: `RUNNING→DRAINING→UNMOUNTING→CLOSED`.
  * `unmount()` + Signal-Handler (SIGINT/SIGTERM) → `fuse_session_exit`.
* **Dateien**

  * `src/shutdown.cc`, `ts/index.ts`
* **Tests**

  * Simulierter SIGINT, keine hängenbleibenden Threads/Mounts.
* **Doku**

  * „Shutdown & Cleanup“ Abschnitt mit Beispielcode.

---

# Phase 8 – xattr Vereinheitlichung

## 8.1 API & Normalisierung

* **Implementierung**

  * Einheitliche Signaturen: `getxattr/listxattr` mit optionaler Size-Probe.
  * macOS Position=0 im C-Layer erzwingen.
* **Dateien**

  * `src/xattr_bridge.cc`, `ts/index.ts`
* **Tests**

  * Fehlende Attribute, große Attribute, leere Liste.
* **Doku**

  * `docs/xattr.md`: Plattformdetails, Beispiele.

---

# Phase 9 – Init/Capabilities & Mount-Optionen

## 9.1 `init` Infos exponieren

* **Implementierung**

  * Snapshot `fuse_conn_info` / `fuse_config` → TS Objekt (`maxWrite`, `timeGranNs`, `caps[]`).
* **Dateien**

  * `src/init_bridge.cc`, `ts/index.ts`
* **Tests**

  * Mock-Werte, Flag-Durchreichung.
* **Doku**

  * `docs/mount.md`: Optionen, Capabilities, Tuning.

---

# Phase 10 – Moderne TS-API (ESM, Promises, AbortSignal)

## 10.1 ESM & TS-first

* **Implementierung**

  * Nur ESM-Exports aus `ts/index.ts`, Build zu `dist/`.
* **Dateien**

  * `package.json` (`exports` Felder), `tsconfig.json`, `dist/*`
* **Tests**

  * ESM-Import in Beispielprojekt.
* **Doku**

  * `README.md`: ESM Import Pfad.

## 10.2 Promise-API & AbortSignal

* **Implementierung**

  * Alle Operationen als `async` Varianten; Callback-Layer intern.
  * `opts?: { signal?: AbortSignal; timeout?: number }` überall.
* **Dateien**

  * `ts/index.ts`, `ts/abort.ts` (Timeout/Abort Helper)
* **Tests**

  * Abbruch mittendrin (read/write), Timeout-Fehler.
* **Doku**

  * `docs/api.md`: Promises, Cancellation Beispiele.

---

# Phase 11 – Observability & Performance

## 11.1 Structured Logging & Tracing

* **Implementierung**

  * Logger-Interface (pluggable); pro Op: Dauer, Bytes, errno.
  * Optional OpenTelemetry Spans.
* **Dateien**

  * `ts/logging.ts`, `ts/tracing.ts`
* **Tests**

  * Unit: Serializer & Sampling.
* **Doku**

  * `docs/observability.md`: Logger integrieren, Beispielconfig.

## 11.2 Benchmarks & KPIs

* **Implementierung**

  * `bench/` Scripts: seq read/write, readdir mass, copy\_file\_range.
* **Dateien**

  * `bench/*.js` (+ minimale Node Tools)
* **Tests**

  * KPI-Ziele definieren, Report generieren.
* **Doku**

  * `docs/performance.md`: Bench-Anleitung & Zielwerte.

---

# Phase 12 – Doku-Feinschliff, Beispiele & Release

## 12.1 Beispiele (Startvorlagen)

* **Implementierung**

  * `examples/memfs`, `examples/passthrough`, `examples/kvfs`.
* **Dateien**

  * `examples/*/*`
* **Tests**

  * Smoke-Run lokal (optional CI separater Runner).
* **Doku**

  * `README.md`: Quickstart, Beispiele verlinken.

## 12.2 Vollständige API-Referenz

* **Implementierung**

  * `docs/api.md` finalisieren: alle Funktionen, Parameter, Typen.
* **Dateien**

  * `docs/api.md` (+ Inhaltsverzeichnis in `README.md`)
* **Doku**

  * „Breaking Changes“ Abschnitt (BigInt, TimeSpec, Promises, readdir offset).

## 12.3 Release Notes & Version

* **Implementierung**

  * `CHANGELOG.md` (SemVer major, da breaking).
  * Optional Prebuilds (später).
* **Dateien**

  * `CHANGELOG.md`, `package.json` (Version bump)
* **Doku**

  * Release-Prozess notieren (Tagging, CI-Artefakte).

---

## Einheitliche Testmatrix (über alle Phasen)

* **Unit (C++):** GoogleTest/ Catch2 für Codec, errno, tsfn, queues.
* **Unit (TS):** Jest/Vitest für Helpers, Typ-Tests mit tsd.
* **Mock-E2E:** Simulierte FUSE-Ops ohne echten Mount (über interne Bridges).
* **(Optional) Real-E2E:** separater priv. CI-Runner mit echten Mounts; Szenarien: basic I/O, große Files, xattr, readdir pagination, shutdown unter Last.

---

## Dokumentationsstruktur (Dateien)

* `README.md` – Quickstart, Build, Beispiele
* `docs/api.md` – API-Referenz (Signaturen, Typen, Fehler)
* `docs/time.md` – Zeitformate & Präzision
* `docs/errors.md` – errno & Fehlerkonventionen
* `docs/readdir.md` – Pagination & d\_type
* `docs/mount.md` – Optionen, Capabilities, Tuning
* `docs/concurrency.md` – Threading, Queues, Shutdown
* `docs/performance.md` – Zero-Copy, Benchmarks, KPIs
* `docs/observability.md` – Logging/Tracing
* `MIGRATION.md` – (kurz) für Altnutzer (nur Info)

---

## Nächster konkreter Schritt (für den Agent)

> **Starte mit Phase 1.1 und 1.2.**
> Implementiere `napi_bigint`-Helpers, ersetze alle 2×32-Bit Parameter in C++/JS, passe `index.ts`/`types.ts` auf BigInt an, und schreibe Roundtrip-Tests inkl. Werte > 2^53.
> Danach Phase 2.1 Timespec-Codec.
