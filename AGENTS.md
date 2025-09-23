# AGENTS.md

## Mission

Wir bauen ein **modernes FUSE3-Binding für Node.js** – performanceorientiert, robust und ergonomisch:
- Native Bridge via **N-API (C/C++)**, öffentliche **TypeScript-API** (ESM, Promises, AbortSignal)
- **BigInt** für Offsets/Größen, **ns-Zeitstempel** statt ms-Trunkation
- **Zero-Copy**/External ArrayBuffer, **copy_file_range** Fast-Path
- Einheitliche **−errno**-Fehler, klare Typen (branded `Fd/Mode/Flags`)
- **Thread-safe** Callbacks (TSFN), geordneter **Shutdown**, starke **Observability**
- **Greenfield-Ansatz**: `./old-reference-implementation` nur **lesen**, `./fuse-docs` als Semantik-Quelle

## Zweck

Dieses Dokument definiert **Arbeitsweise, Standards und Checklisten** für Coding-Agenten (und Menschen), die an diesem Projekt arbeiten. Ziel: **vorhersehbare Qualität**, **konsistente Commits**, **saubere Doku** und **grüne Tests** – ohne Abwärtskompatibilität.

---

## 1) Projektkontext & Ziele (Kurz)

* Native **FUSE3**-Bindings für Node.js via **N-API (C/C++)** + **TypeScript-API**.
* Moderne API: **ESM**, **Promises**, **BigInt** für 64-bit, **ns-Timestamps**, konsistente **errno**-Fehlerkonvention.
* Fokus: **Korrektheit, Performance (Zero-Copy), Stabilität, Observability**.

---

## 2) Repo-Struktur (Soll)

```
/src            # C++ N-API Bridge (one module, mehrere *.cc/*.h)
/ts             # Öffentliche TypeScript API, Helpers, Types
/test           # Unit & Mock-E2E (TS, optional C++ Tests)
/bench          # Benchmarks & KPI Scripts
/docs           # API-Referenz & HowTos (md)
/examples       # memfs, passthrough, kvfs
.github/workflows/ci.yml
package.json, tsconfig.json, CMakeLists.txt|binding.gyp
```

---

## 3) Arbeitsmodus des Agenten

3.1) Quellen-Policy (SEHR WICHTIG)

./old-reference-implementation dient ausschließlich als Lesereferenz:

✅ Erlaubt: Verhalten beobachten (Blackbox), API-Semantik verstehen, edge cases notieren.

❌ Verboten: Copy/Paste von Code/Strukturen/Text, Imports/Includes, 1:1 Portierungen.

./fuse-docs ist die primäre fachliche Quelle:

✅ Erlaubt: API/Struktur/Feldbedeutungen übernehmen, Normtexte zitieren (in Doku, nicht in Code), Ableitungen dokumentieren.

❌ Verboten: Lizenz-problematische Textübernahmen in Code-Kommentare > 25 Worte am Stück.


### 3.1 Task-Format

Jeder Arbeitsschritt wird als **kleiner, atomarer Task** formuliert:

```
### Task: <prägnanter Titel>
Ziel:
Änderungen (Code):
Änderungen (Doku):
Tests:
Akzeptanzkriterien (DoD):
Notizen/Risiken:
```

### 3.2 Definition of Done (DoD)

* [ ] Code gebaut (native + TS) ohne Warnungen (Release & Debug).
* [ ] **Unit-Tests + Mock-E2E** grün, neue Tests vorhanden.
* [ ] **Doku aktualisiert** (mind. eine relevante .md).
* [ ] **API-Typen konsistent** (tsd-Typ-Tests grün).
* [ ] Linters/Formatters grün.
* [ ] Commit-Message: konventionell & referenziert Task.

### 3.3 Commit-Konvention

```
feat: <Änderung knapp>  | fix: | perf: | docs: | refactor: | test: | chore:
```

* Body: Was & Warum (1–3 Sätze).
* Breaking: `BREAKING CHANGE: ...` (nur wenn wirklich notwendig).

---

## 4) Coding-Standards

### 4.1 C++ (N-API)

* C++17 oder neuer. Keine Exceptions im Hotpath (oder klar gefangen).
* **TSFN** für alle C→JS Aufrufe, niemals reentrant in JS.
* **napi\_status** prüfen, bei Fehlern → sauberer Rückpfad mit errno.
* **BigInt**: `napi_create_bigint_uint64` / `napi_get_value_bigint_uint64`.
* **timespec**: ns-epoch `bigint` oder `{sec: bigint, nsec: number}` – Projektstandard: **ns-epoch `bigint`**.
* Speicher: **napi\_create\_external\_arraybuffer** für Zero-Copy; Finalizer korrekt.
* Threading: klare Ownership, kein Data Race; RAII-Wrapper für Handles.

### 4.2 TypeScript

* **ESM**, `strict: true`, keine `any`, keine impliziten `any`.
* **Promises** (keine Callback-APIs nach außen).
* **AbortSignal/timeout** in `opts?: {...}` unterstützen.
* **Branded Types** für `Fd`, `Mode`, `Flags`.
* 64-Bit Felder: **`bigint`**. Timestamps: `bigint` ns.
* Fehler: **`FuseErrno extends Error`** mit `.errno` (negativ) + `.code`.

### 4.3 Fehlerkonvention

* Erfolg: **≥ 0**
* Fehler: **−errno** (POSIX), z. B. `-2` (ENOENT)
* Mapping in TS: `throw new FuseErrno('ENOENT')` mit `.errno = -2`.

---

## 5) Tests

### 5.1 Pflicht

* **Unit-Tests** (TS): Helper, Typen, Konversionen (BigInt, TimeSpec).
* **Mock-E2E**: typische FUSE-Operationen ohne echtes Mount (Harness).
* **Typ-Tests (tsd)**: keine 64-bit Felder als `number`.
* **C++-Tests** (optional, aber empfohlen): Timespec-Codec, errno-Mapping.

### 5.2 Beispiel-Checkliste pro PR

* [ ] Offsets/Größen > 2^53 getestet (Roundtrip).
* [ ] Timestamps ns-präzise getestet.
* [ ] Negativpfade: ENOENT/EACCES/EEXIST/… abgedeckt.
* [ ] Concurrency-Szenario (mind. 1) simuliert.

---

## 6) Performance & Stabilität

### 6.1 Performance-Prinzipien

* **Zero-Copy** wo möglich (External ArrayBuffer).
* Große I/O in **konfigurierbaren Chunks** (1–8 MB).
* **copy\_file\_range** Fast-Path + Fallback.
* Minimale JS↔C Übertrittshäufigkeit (Batching wo möglich).

### 6.2 Concurrency & Shutdown

* **Per-FD Write-Queue**, `flush/release` warten bis leer.
* State Machine: `RUNNING → DRAINING → UNMOUNTING → CLOSED`.
* `unmount()` löst `fuse_session_exit` aus; TSFN sauber freigeben.

---

## 7) Observability

* **Structured Logging**: op, path, fd, size, offset, errno, duration.
* **Tracing (optional)**: OpenTelemetry-Spans um FUSE-Ops.
* **Metriken**: ops/s, bytes, p50/p95/p99 Latenzen, Fehlerquote.

---

## 8) Doku-Pflichten

Bei **jedem** PR:

* **README.md** (falls Nutzerfluss betroffen).
* **docs/api.md** (Signaturen/Typen, Beispiele).
* **docs/errors.md** (neue/angepasste Errnos).
* **docs/performance.md** (wenn I/O-Pfade berührt).
* **docs/concurrency.md** (bei Threading/Queues).
* **CHANGELOG.md** (stichpunktartig).

---

## 9) Build & CI

* Node ≥ 18, Linux x64/arm64 Zielplattformen.
* `npm run build` baut **native + TS**; `npm test` führt **alle Tests**.
* CI blockt Merge bei roten Tests oder Lintfehlern.
* (Später) Prebuilds via prebuildify; artifacts im Release-Job.

---

## 10) Sicherheits- & Robustheitsregeln

* Keine unvalidierten Pfade in C++ (Null-Terminator, Längen prüfen).
* Keine Blockierung des Node Main Threads.
* Alle N-API Aufrufe **Status prüfen**, niemals ignorieren.
* Finalizer müssen **idempotent** sein; keine Dangling-Pointer.
* Sanitizer-Builds (ASan/UBSan) in separatem CI-Job (empfohlen).

---

## 11) Prompt/Task-Beispiele (Copy-Paste)

### 11.1 Beispiel-Task: BigInt-Helpers einführen

```
### Task: N-API BigInt Helpers implementieren
Ziel:
  64-Bit Offsets/Größen ohne Low/High-Split, BigInt end-to-end.
Änderungen (Code):
  - src/napi_bigint.h/.cc: u64_to_bigint, bigint_to_u64 (lossless-check).
  - src/*: alle Stellen mit (low,high) ersetzen; N-API BigInt nutzen.
Änderungen (Doku):
  - docs/api.md: 64-Bit = bigint
  - MIGRATION.md: Low/High entfällt
Tests:
  - ts/test/bigint.spec.ts: Roundtrip > 2^53
DoD:
  - Build grün, Tests grün, Doku aktualisiert.
```

### 11.2 Beispiel-Task: ns-Timespec

```
### Task: Timespec ns-epoch bigint
Ziel:
  ns-präzise Zeitstempel durchgängig.
Änderungen (Code):
  - src/timespec_codec.*: timespec <-> bigint(ns)
  - utimens/getattr Pfade umstellen
  - ts/time.ts: toTimespec(...)
Änderungen (Doku):
  - docs/time.md, api.md
Tests:
  - ts/test/time.spec.ts: Roundtrip mit 1234567890123456789n
DoD:
  - ns-Genauigkeit belegt, Doku/Tests grün.
```

### 11.3 Beispiel-Task: readdir Pagination

```
### Task: readdir mit offset & nextOffset
Ziel:
  Große Verzeichnisse seitenweise.
Änderungen (Code):
  - src/readdir_bridge.cc: filler/offset/nextOffset
  - ts/index.ts: readdir(path, offset), readdirAll(path)
Änderungen (Doku):
  - docs/readdir.md
Tests:
  - ts/test/readdir.spec.ts: 10k Einträge, mehrere Seiten
DoD:
  - Pagination korrekt, Doku/Tests grün.
```

---

## 12) Do & Don’t (Kurz)

**Do**

* Kleine, abgeschlossene Tasks.
* Tests zuerst skizzieren.
* Doku parallel updaten.
* Fehler als −errno, BigInt für 64-Bit, ns-epoch für Zeit.

**Don’t**

* Callbacks nach außen (nur Promises).
* 64-Bit als `number`.
* Reentrante JS-Aufrufe aus C++.
* Blinde Kopien von Buffern (Zero-Copy bevorzugen).

---

## 13) Glossar (Kurz)

* **TSFN**: ThreadSafeFunction (N-API Mechanismus für C→JS).
* **errno**: POSIX Fehlercode, negativ zurück an FUSE.
* **ns-epoch**: Nanosekunden seit Unix-Epoch (BigInt).
* **External ArrayBuffer**: JS-Buffer, der auf native Speicher zeigt.
