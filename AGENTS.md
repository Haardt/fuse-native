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

## 13) Build-System & Technische Details

### 13.1 Build-Systeme

Das Projekt unterstützt zwei Build-Systeme:

**CMake (Empfohlen für Entwicklung):**
```bash
npm run build:native  # CMake-basiert, schneller
```

**node-gyp (für Prebuilds):**
```bash
npm run prebuild      # Für Distribution
```

### 13.2 Kritische Build-Definitionen

**FUSE_USE_VERSION=31** muss definiert sein, sonst:
```
error: FUSE_USE_VERSION not defined
error: only API version 30 or greater is supported
```

**CMakeLists.txt essentiell:**
```cmake
add_definitions(-DFUSE_USE_VERSION=31)
add_definitions(-DNAPI_VERSION=8)
```

### 13.3 Namespace-Konventionen

**C++ Namespaces:**
- Hauptnamespace: `fuse_native`
- Funktionen: `fuse_native::errno_to_string()`, `fuse_native::NapiHelpers::`
- Klassen: `fuse_native::BufferBridge`, `fuse_native::SessionManager`

**N-API Export Pattern:**
```cpp
// In main.cc
napiExports.Set("functionName", Napi::Function::New(napiEnv, FunctionWrapper));
```

### 13.4 64-Bit Helper-Funktionen (NapiHelpers)

**Verfügbare BigInt-Helpers in `src/napi_helpers.h`:**

```cpp
// Basis-Konversionen
static int32_t GetInt32(Napi::Env env, Napi::Value value);
static uint32_t GetUint32(Napi::Env env, Napi::Value value);
static uint64_t GetBigUint64(Napi::Env env, Napi::Value value);
static double GetDouble(Napi::Env env, Napi::Value value);
static bool GetBoolean(Napi::Env env, Napi::Value value);

// BigInt-Erstellung
static Napi::BigInt CreateBigInt64(Napi::Env env, int64_t value);
static Napi::BigInt CreateBigIntU64(Napi::Env env, uint64_t value);
static Napi::BigInt CreateBigUint64(Napi::Env env, uint64_t value);

// Sichere Konversionen mit bounds-checking
static std::optional<int64_t> SafeGetBigInt64(Napi::Value value);
static std::optional<uint64_t> SafeGetBigIntU64(Napi::Value value);
```

**Verwendungsbeispiel:**
```cpp
uint64_t offset = fuse_native::NapiHelpers::GetBigUint64(env, info[0]);
return fuse_native::NapiHelpers::CreateBigUint64(env, result);
```

### 13.5 Modul-Architektur

**Hauptmodule und ihre Exports:**

**Buffer Bridge (`buffer_bridge.*`):**
- `createExternalBuffer()` - Zero-Copy Buffer
- `createManagedBuffer()` - Managed Buffer
- `validateBuffer()` - Buffer-Validierung
- `getBufferStats()` - Buffer-Statistiken

**Copy File Range (`copy_file_range.*`):**
- `copyFileRange()` - Kernel syscall + Fallback
- `setCopyChunkSize()` - Performance-Tuning
- `getCopyStats()` - Statistiken

**Session Manager (`session_manager.*`):**
- `createSession()` - FUSE Session erstellen
- `mount()` / `unmount()` - Mount-Management
- `isReady()` - Status-Abfrage

### 13.6 Include-Pfade und Dependencies

**Kritische Include-Reihenfolge:**
```cpp
#define FUSE_USE_VERSION 31  // VOR allen FUSE includes!
#include <napi.h>
#include <fuse3/fuse.h>
#include <fuse3/fuse_lowlevel.h>
```

**CMake Include-Setup:**
```cmake
include_directories(${CMAKE_JS_INC})                    # Node headers
include_directories(${NODE_ADDON_API_DIR})              # node-addon-api
include_directories(${FUSE3_INCLUDE_DIRS})              # FUSE3
```

### 13.7 Symbol-Export Troubleshooting

**Häufige Linker-Fehler:**
- `undefined symbol: _ZN11fuse_native...` → Funktion nicht in main.cc exportiert
- `FUSE_USE_VERSION not defined` → Definition fehlt
- `napi.h: file not found` → Include-Pfade falsch

**Debug-Befehle:**
```bash
# Symbole in gebauter Library prüfen
nm build/Release/fuse-native.node | grep CreateManagedBuffer

# Include-Pfade testen
echo '#include <napi.h>' | g++ -x c++ -E - -I./node_modules/node-addon-api
```

### 13.8 Threading & TSFN Patterns

**Thread-sichere Callbacks:**
```cpp
// TSFN für C++ → JavaScript Calls
Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
    env, callback, "FuseOperation", 0, 1);
    
// Aufruf aus C++ Thread
tsfn.BlockingCall([](Napi::Env env, Napi::Function jsCallback) {
    // Sichere Ausführung im JS Thread
});
```

### 13.9 Prebuilt-Management

**Nach CMake-Build Prebuilt updaten (WICHTIG!):**
```bash
cp build/Release/fuse-native.node prebuilds/linux-x64/@cocalc+fuse-native.node
```

**Warum kritisch:**
- Tests nutzen Prebuilt-Verzeichnis, nicht build/
- Native Tests schlagen fehl mit "undefined symbol" wenn vergessen
- CMake und node-gyp erzeugen verschiedene Binaries
- Neue C++ Exports müssen in Prebuilds verfügbar sein

---

## 14) Troubleshooting & Häufige Probleme

### 14.1 Build-Fehler

**"FUSE_USE_VERSION not defined"**
```bash
# Lösung: CMakeLists.txt prüfen
add_definitions(-DFUSE_USE_VERSION=31)
```

**"napi.h: file not found"**
```bash
# Lösung: Node-Addon-API installiert?
npm install
# Include-Pfade in CMake prüfen
include_directories(${CMAKE_JS_INC})
```

**"undefined symbol: _ZN11fuse_native..."**
```bash
# Lösung: Funktion nicht in main.cc exportiert
napiExports.Set("functionName", Napi::Function::New(napiEnv, WrapperFunction));
# Oder Prebuilt updaten:
cp build/Release/fuse-native.node prebuilds/linux-x64/@cocalc+fuse-native.node
```

### 14.2 Test-Fehler

**"Cannot access 'mockBinding' before initialization"**
- Mock-Deklaration VOR jest.mock() verschieben
- Import-Statements NACH Mocks platzieren

**"Worker process failed to exit gracefully"**
- Normal bei FUSE-Tests (Threading-Artefakte)
- Mit `--detectOpenHandles` analysieren falls nötig

### 14.3 Runtime-Fehler

**TypeError: Expected BigInt**
```typescript
// Falsch: number verwenden
await copyFileRange(fd1, 0, fd2, 0, 1024);

// Richtig: BigInt verwenden
await copyFileRange(fd1, 0n, fd2, 0n, 1024n);
```

**"Transport endpoint is not connected"**
- FUSE Session nicht gemountet
- `isReady()` vor Operation prüfen

### 14.4 Debug-Kommandos

```bash
# Build-Status prüfen
npm run build 2>&1 | grep -E "(error|Error)"

# Symbole in Binary prüfen  
nm build/Release/fuse-native.node | grep -i "symbol_name"

# CMake Cache löschen bei hartnäckigen Problemen
rm -rf build/ && npm run build:native

# Node-Gyp vs CMake Unterschiede
ls -la build/Release/ prebuilds/linux-x64/
```

### 14.5 Performance Issues

**Langsame Builds:**
- CMake bevorzugen: `npm run build:native`
- Ninja Generator nutzen (automatisch wenn verfügbar)

**Hoher Speicherverbrauch:**
- Buffer-Validierung: `validateBuffer()` regelmäßig
- External ArrayBuffer für große Daten
- Stats monitoren: `getBufferStats()`

### 14.6 Typische Stolperfallen

**1. Namespace-Vergessen:**
```cpp
// Falsch
errno_to_string(err)

// Richtig  
fuse_native::errno_to_string(err)
```

**2. FUSE_USE_VERSION Position:**
```cpp
// Falsch: Nach includes
#include <fuse3/fuse.h>
#define FUSE_USE_VERSION 31

// Richtig: Vor allen FUSE includes
#define FUSE_USE_VERSION 31
#include <fuse3/fuse.h>
```

**3. BigInt vs Number Verwechslung:**
```typescript
// Falsch: Precision Loss bei > 2^53
const offset = Number(offsetBigInt);

// Richtig: BigInt durchgängig
const result = await operation(offset); // offset bleibt BigInt
```

---

## 15) Quick Reference für Agenten

### 15.1 Schnelle Build-Kommandos
```bash
# Vollständiger Build
npm run build

# Nur Native (schneller bei C++ Änderungen)
npm run build:native

# Tests ausführen
npm test

# Prebuilt nach CMake-Build updaten (KRITISCH nach Symbol-Änderungen!)
cp build/Release/fuse-native.node prebuilds/linux-x64/@cocalc+fuse-native.node

# Build-Cache löschen bei Problemen
rm -rf build/ && npm run build:native
```

### 15.2 Häufigste Code-Pattern
```cpp
// C++ BigInt Helper verwenden
uint64_t value = fuse_native::NapiHelpers::GetBigUint64(env, info[0]);
return fuse_native::NapiHelpers::CreateBigUint64(env, result);

// Funktion in main.cc exportieren
napiExports.Set("functionName", Napi::Function::New(napiEnv, WrapperFunc));

// Namespace korrekt verwenden
fuse_native::errno_to_string(err)  // Nie vergessen: fuse_native::
```

### 15.3 Kritische Definitionen
```cpp
// Immer VOR allen FUSE includes!
#define FUSE_USE_VERSION 31
#include <napi.h>
#include <fuse3/fuse.h>
```

### 15.4 TypeScript BigInt Pattern
```typescript
// Immer BigInt für 64-bit Werte
const offset = 0n;  // nicht: 0
const size = BigInt(fileSize);  // Conversion falls nötig
await copyFileRange(fd1, offset, fd2, 0n, size);
```

### 15.5 Test-Fix Pattern
```typescript
// Mock VOR jest.mock() deklarieren
const mockBinding = { /* ... */ };
jest.mock('../build/Release/fuse-native.node', () => mockBinding);
// Import NACH Mocks
import { functionName } from '../ts/index.js';
```

---

## 16) Jest & Testing Troubleshooting

### 16.1 BigInt Serialization Issues
```bash
# Fehler: "Do not know how to serialize a BigInt"
# Lösung: Vermeiden von BigInt in mockReturnValue() calls
mockBinding.func.mockReturnValue(42n);  # ✓ OK - direkte BigInt
mockBinding.func.mockReturnValue({size: BigInt(x)});  # ❌ Fehler

# Workaround: Literale verwenden
mockBinding.func.mockReturnValue({size: 42n});  # ✓ OK
```

### 16.2 Errno Handling in Tests
```typescript
// FuseErrno akzeptiert positive UND negative errno-Werte
new FuseErrno(2)    // wird zu errno: -2, code: 'ENOENT'  
new FuseErrno(-2)   // wird zu errno: -2, code: 'ENOENT'

// Tests sollten error.code prüfen, nicht error.message
expect(error.code).toBe('ENOENT');  // ✓ Richtig
expect(error.message).toContain('ENOENT');  // ❌ Falsch
```

### 16.3 Mock-Isolation
```typescript
// Beide Binding-Pfade mocken für Isolation
jest.mock('../build/Release/fuse-native.node', () => mockBinding);
jest.mock('../prebuilds/linux-x64/@cocalc+fuse-native.node', () => mockBinding);
```

---

## 17) Glossar (Kurz)

* **TSFN**: ThreadSafeFunction (N-API Mechanismus für C→JS).
* **errno**: POSIX Fehlercode, negativ zurück an FUSE.
* **ns-epoch**: Nanosekunden seit Unix-Epoch (BigInt).
* **External ArrayBuffer**: JS-Buffer, der auf native Speicher zeigt.
* **Prebuilds**: Vorkompilierte Binaries für verschiedene Plattformen.
* **Symbol Mangling**: C++ Namen-Kodierung im Linker (z.B. `_ZN11fuse_native...`).
