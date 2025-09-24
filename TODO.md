# FUSE3 Function Validation TODO

## Mission

Verifizieren, dass **alle FUSE3-Funktionen** korrekt durch die Ebenen **C/N-API ⇄ JS/TS** laufen (Signaturen, Typen, Fehlerwege, Concurrency, große Werte).

---

## 1) Inventar & Mapping

### 1.1 Op-Matrix erstellen (`docs/op-matrix.md`)

**Status**: ❌ **FEHLT**

**Aufgabe**: Vollständige Mapping-Matrix erstellen: FUSE-Operation → C-Handler → JS/TS-API-Methode → Typen → Fehlerkonvention.

**Aktuelle Analyse**:
```
✅ IMPLEMENTIERT (C++ Bridge vorhanden):
- Session Management: createSession, destroySession, mount, unmount, isReady
- Operation Handlers: setOperationHandler, removeOperationHandler
- Buffer Bridge: createExternalBuffer, createManagedBuffer, validateBuffer
- Copy File Range: copyFileRange + Statistics
- XAttr: getxattr, setxattr, listxattr, removexattr
- Write Queue: enqueueWrite, processWriteQueues, flushWriteQueue
- TSFN Dispatcher: initializeDispatcher, shutdownDispatcher
- Shutdown Manager: initiateGracefulShutdown, forceImmediateShutdown
- Init Bridge: initializeInitBridge, setInitCallback

❌ FEHLENDE FUSE-OPS (struct fuse_operations):
- getattr - DONE
- readlink - DONE
- mknod - DONE 
- mkdir - 
- unlink  - DONE
- rmdir   - DONE
- symlink ❌
- rename ❌ (nur TS-Handler definiert)
- link ❌
- chmod ❌
- chown ❌
- truncate ❌
- open ❌ (nur TS-Handler definiert)
- read ❌ (nur TS-Handler definiert)
- write ❌ (nur TS-Handler definiert)
- statfs ❌ (nur statfs_bridge.cc Fragment)
- flush ❌
- release ❌ (nur TS-Handler definiert)
- fsync ❌ (nur TS-Handler definiert)
- opendir ❌
- readdir ❌ (nur TS-Handler definiert)
- releasedir ❌
- fsyncdir ❌
- access ❌ (nur TS-Handler definiert)
- create ❌ (nur TS-Handler definiert)
- lock ❌
- utimens ❌
- bmap ❌
- ioctl ❌
- poll ❌
- write_buf ❌
- read_buf ❌
- flock ❌
- fallocate ❌
- lseek ❌
```

**Priorität**: **KRITISCH** - Basis für alle weiteren Arbeiten.

**Schritte**:
1. `docs/op-matrix.md` erstellen mit Tabelle: Operation | C-Handler Status | TS-Handler Status | Typen OK | Tests Vorhanden
2. Tool `npm run gen:op-report` implementieren (liest `src/main.cc` Exports und `ts/types.ts` Handler)
3. Fehlende Implementierungen markieren

---

### 1.2 Automatisierte Inventar-Tools

**Status**: ❌ **FEHLT**

**Tool**: `npm run gen:op-report`

**Funktionalität**:
- Scannt `src/main.cc` nach `napiExports.Set()` Calls
- Scannt `ts/types.ts` nach Handler-Definitionen
- Vergleicht mit `fuse_operations` struct aus `fuse-docs/include/fuse.h`
- Generiert Bericht über fehlende/ungenutzte Operations

**Ausgabe-Format**:
```
FUSE Operation Analysis Report
==============================

✅ VOLLSTÄNDIG IMPLEMENTIERT:
- init: C++ ✓, TS ✓, Tests ✓
- copyFileRange: C++ ✓, TS ✓, Tests ✓

⚠️  TEILWEISE IMPLEMENTIERT:
- getattr: C++ ❌, TS ✓, Tests ❌
- readdir: C++ ❌, TS ✓, Tests ✓

❌ NICHT IMPLEMENTIERT:
- readlink: C++ ❌, TS ❌, Tests ❌
- mknod: C++ ❌, TS ❌, Tests ❌

🔄 UNGENUTZTE EXPORTS:
- someOldFunction: C++ ✓, TS ❌, Tests ❌
```

---

## 2) Typen- & ABI-Checks (statisch)

### 2.1 TypeScript-Signaturen prüfen

**Status**: ⚠️ **TEILWEISE** - Basis-Typen definiert, aber Operations unvollständig

**Aktuelle Probleme**:
```
✅ KORREKT:
- 64-Bit Felder als bigint (Fd, Ino, Timestamp)
- Branded Types (Fd, Ino, Mode, Flags, Uid, Gid, Dev)
- Zeit als ns-bigint
- Errno-Mapping mit FuseErrno

❌ FEHLT:
- Viele Handler-Signaturen in FuseOperationHandlers unvollständig
- Keine tsd-Type-Tests für Operations
- readlink, mknod, symlink, link, chmod, chown, truncate Handler fehlen
- utimens, bmap, ioctl, poll, write_buf, read_buf, flock, fallocate, lseek Handler fehlen
```

**Tasks**:
1. **Vollständige Handler-Definitionen** in `ts/types.ts` für alle FUSE-Ops
2. **Type-Tests** in `test/types.test-d.ts` erweitern:
   ```typescript
   // Beispiel für fehlende Tests
   expectType<bigint>(readlinkResult.target.length); // ❌ FEHLT
   expectType<Mode>(mkdirOptions.mode); // ❌ FEHLT
   expectType<Dev>(mknodOptions.dev); // ❌ FEHLT
   ```
3. **Linter-Regeln** für 64-Bit → `bigint` Enforcement

---

### 2.2 C/N-API BigInt-Konsistenz

**Status**: ✅ **OK** - NapiHelpers BigInt-Functions vorhanden

**Verifiziert**:
- `GetBigUint64()`, `CreateBigUint64()` in `napi_helpers.h`
- Keine 2×32-Bit Splits mehr
- `napi_status` Prüfungen vorhanden

**Remaining Tasks**:
- ✅ Bereits implementiert durch NapiHelpers

---

### 2.3 Linter/tsd Integration

**Status**: ❌ **UNVOLLSTÄNDIG**

**Command**: `npm run typecheck && npm run test:types`

**Fehlende Tests**:
1. Alle Operation Handler müssen tsd-Type-Tests haben
2. BigInt-Constraint-Tests für Offsets > 2^53
3. Errno-Code-Konsistenz-Tests

---

## 3) FUSE Operations Implementation Status

### 3.1 KRITISCHE BASIS-OPERATIONS (Priorität 1)

#### 3.1.1 `init` Operation
**Status**: ✅ **IMPLEMENTIERT**
- C++: `init_bridge.cc` ✓
- TS: Handler-Registry ✓
- Tests: `init-bridge.test.ts` ✓

#### 3.1.2 `getattr` Operation
**Status**: ❌ **FEHLT C++ FUSE-Callback**
- C++: Nur Handler-Registry, kein FUSE-Callback ❌
- TS: Handler definiert ✓
- Tests: Fehlen ❌

**Implementation**:
```cpp
// src/getattr_bridge.cc - NEU
static int fuse_getattr(const char* path, struct stat* stbuf,
                       struct fuse_file_info* fi) {
    // BigInt ino conversion
    // TSFN call to TS handler
    // stat structure population with ns-timestamps
}
```

#### 3.1.3 `readdir` Operation
**Status**: ❌ **FEHLT C++ FUSE-Callback**
- C++: Nur Handler-Registry, kein FUSE-Callback ❌
- TS: Handler definiert ✓
- Tests: `readdir.test.ts`, `readdir-errors.test.ts` ✓ (aber Mock-basiert)

**Implementation**:
```cpp
// src/readdir_bridge.cc - NEU
static int fuse_readdir(const char* path, void* buf, fuse_fill_dir_t filler,
                       off_t offset, struct fuse_file_info* fi,
                       enum fuse_readdir_flags flags) {
    // Offset als BigInt
    // Pagination support
    // d_type mapping
}
```

#### 3.1.4 `open/read/write/release` Operations
**Status**: ❌ **KOMPLETT FEHLT**
- C++: Keine FUSE-Callbacks ❌
- TS: Handler definiert ✓
- Tests: Fehlen ❌

**Critical für**: Zero-Copy, Performance, FD-Management

---

### 3.2 FILESYSTEM STRUCTURE OPERATIONS (Priorität 2)

**Status**: ❌ **ALLE FEHLEN**

Fehlende Operations:
- `mkdir` - Verzeichnis erstellen
- `rmdir` - Verzeichnis löschen
- `create` - Datei erstellen und öffnen
- `unlink` - Datei löschen
- `rename` - Umbenennen/Verschieben
- `link` - Hard Link erstellen
- `symlink` - Symbolic Link erstellen
- `readlink` - Symbolic Link lesen

**Errno-Tests erforderlich**: EEXIST, ENOENT, ENOTEMPTY, EISDIR, ENOTDIR

---

### 3.3 METADATA OPERATIONS (Priorität 2)

**Status**: ❌ **ALLE FEHLEN**

Fehlende Operations:
- `chmod` - Berechtigungen ändern
- `chown` - Besitzer ändern
- `truncate` - Dateigröße ändern
- `utimens` - Zeitstempel setzen (ns-Genauigkeit!)

**Kritisch**: `utimens` muss ns-bigint timestamps unterstützen, nicht ms-truncation.

---

### 3.4 I/O & PERFORMANCE OPERATIONS (Priorität 2)

#### 3.4.1 `statfs` Operation
**Status**: ⚠️ **TEILWEISE** - `statfs_bridge.cc` Fragment vorhanden
- C++: Fragment in `src/statfs_bridge.cc` ⚠️
- TS: Handler definiert ✓
- Tests: `statfs.test.ts`, `statfs-native.test.ts` ✓

**Problem**: Fragment-Implementierung, Integration in FUSE-Callbacks fehlt.

#### 3.4.2 Buffer Operations (`read_buf/write_buf`)
**Status**: ❌ **FEHLT** - Zero-Copy Performance-kritisch
- C++: Keine FUSE-Callbacks ❌
- TS: Keine Handler ❌
- Tests: Fehlen ❌

**Kritisch für**: Zero-Copy Performance, External ArrayBuffers.

#### 3.4.3 `copy_file_range` Operation
**Status**: ✅ **IMPLEMENTIERT**
- C++: `copy_file_range.cc` ✓
- TS: Tests ✓
- Tests: `copy-file-range.test.ts` ✓

---

### 3.5 SYNC & CACHE OPERATIONS (Priorität 3)

**Status**: ❌ **ALLE FEHLEN**

Fehlende Operations:
- `flush` - Cache leeren (wird bei close() aufgerufen)
- `fsync` - Datei synchronisieren
- `fsyncdir` - Verzeichnis synchronisieren

**Integration**: Muss mit Write-Queue synchronisiert werden.

---

### 3.6 EXTENDED ATTRIBUTES (Priorität 3)

**Status**: ✅ **IMPLEMENTIERT**
- C++: `xattr_bridge.cc` ✓
- TS: Handler definiert ✓
- Tests: `xattr.test.ts`, `xattr-debug.test.ts` ✓

---

### 3.7 SPEZIAL-OPERATIONS (Priorität 4 - Optional)

**Status**: ❌ **ALLE FEHLEN**

Fehlende Operations:
- `access` - Dateizugriff prüfen
- `lock` - POSIX File Locking
- `flock` - BSD File Locking
- `fallocate` - Speicher vorallokieren
- `lseek` - Dateizeiger setzen/abfragen
- `bmap` - Block-Mapping (meist stub/ENOSYS)
- `ioctl` - Device I/O Control (meist ENOTTY)
- `poll` - I/O Polling (meist ENOSYS)

**Standard-Verhalten**: Die meisten können mit ENOSYS/ENOTTY antworten.

---

## 4) Konkrete Test-Anforderungen pro Operation

### 4.1 Basis-Operations Testing

#### 4.1.1 `init` Testing
**Status**: ✅ **VOLLSTÄNDIG**
- Connection Info ✓
- FUSE Config ✓
- Capabilities ✓

#### 4.1.2 `getattr` Testing - **FEHLT KOMPLETT**
**Erforderlich**:
```typescript
describe('getattr', () => {
  test('should return stat with bigint fields', async () => {
    const stat = await fuse.getattr(1n, context);
    expect(typeof stat.ino).toBe('bigint');
    expect(typeof stat.size).toBe('bigint');
    expect(typeof stat.atime).toBe('bigint'); // ns-timestamp!
  });

  test('should handle large inodes > 2^53', async () => {
    const largeIno = 9007199254740992n; // 2^53
    await expect(fuse.getattr(largeIno, context)).resolves.toBeDefined();
  });

  test('should throw ENOENT for non-existent files', async () => {
    await expect(fuse.getattr(999n, context)).rejects.toMatchObject({
      code: 'ENOENT',
      errno: -2
    });
  });
});
```

#### 4.1.3 `readdir` Testing - **UNVOLLSTÄNDIG**
**Vorhanden**: Mock-basierte Tests in `readdir.test.ts`
**Fehlt**: Native FUSE-Integration Tests

**Zusätzliche Tests erforderlich**:
```typescript
test('should handle offset pagination with bigint', async () => {
  const offset = 1000000000000n; // > 2^32
  const result = await fuse.readdir(1n, offset, context);
  expect(typeof result.nextOffset).toBe('bigint');
});

test('should return correct d_type values', async () => {
  const result = await fuse.readdir(1n, 0n, context);
  expect(result.entries[0].type).toBeOneOf(['file', 'directory', 'symlink']);
});
```

#### 4.1.4 `open/read/write/release` Testing - **FEHLT KOMPLETT**
**Kritisch**: Vollständiger FD-Lebenszyklus

```typescript
describe('file operations lifecycle', () => {
  test('should open, read, write, and release', async () => {
    const fd = await fuse.open('/test.txt', O_RDWR, context);
    expect(typeof fd).toBe('bigint');

    const data = new ArrayBuffer(1024);
    const written = await fuse.write(fd, data, 0n, context);
    expect(written).toBe(1024);

    const readData = await fuse.read(fd, 0n, 1024, context);
    expect(readData.byteLength).toBe(1024);

    await fuse.release(fd, context);
  });
});
```

---

### 4.2 Performance & Large Value Testing

#### 4.2.1 BigInt Grenzwert-Tests
**Status**: ❌ **UNVOLLSTÄNDIG**

**Erforderlich für ALLE Operations**:
```typescript
describe('large value handling', () => {
  test('should handle offsets > 2^53', async () => {
    const largeOffset = 9007199254740992n; // 2^53
    await expect(fuse.read(1n, largeOffset, 1024, context))
      .resolves.toBeDefined();
  });

  test('should handle file sizes > 2^53', async () => {
    const largeSize = 18014398509481984n; // 2^54
    await expect(fuse.truncate(1n, largeSize, context))
      .resolves.toBeUndefined();
  });
});
```

#### 4.2.2 ns-Timestamp Tests
**Status**: ❌ **FEHLT**

```typescript
describe('nanosecond timestamp precision', () => {
  test('should preserve ns precision in utimens', async () => {
    const nsTime = 1234567890123456789n; // ns-timestamp
    await fuse.utimens(1n, nsTime, nsTime, context);

    const stat = await fuse.getattr(1n, context);
    expect(stat.atime).toBe(nsTime);
    expect(stat.mtime).toBe(nsTime);
  });

  test('should not truncate to ms precision', async () => {
    const nsTime = 1000000001n; // 1.000000001 seconds
    await fuse.utimens(1n, nsTime, nsTime, context);

    const stat = await fuse.getattr(1n, context);
    expect(stat.atime % 1000000n).toBe(1n); // ns remainder preserved
  });
});
```

---

### 4.3 Fehlerbehandlung Tests

#### 4.3.1 Errno-Konsistenz Tests
**Status**: ❌ **UNVOLLSTÄNDIG**

**Erforderlich für ALLE Operations**:
```typescript
describe('error handling consistency', () => {
  test('should return consistent errno values', async () => {
    await expect(fuse.getattr(999n, context)).rejects.toMatchObject({
      errno: -2,
      code: 'ENOENT'
    });

    await expect(fuse.mkdir('/existing', 0o755, context)).rejects.toMatchObject({
      errno: -17,
      code: 'EEXIST'
    });

    await expect(fuse.rmdir('/not-empty', context)).rejects.toMatchObject({
      errno: -39,
      code: 'ENOTEMPTY'
    });
  });
});
```

#### 4.3.2 FUSE-spezifische Errno Tests
```typescript
describe('FUSE specific errors', () => {
  test('should return ENOSYS for unimplemented operations', async () => {
    await expect(fuse.bmap(1n, 4096, context)).rejects.toMatchObject({
      errno: -38,
      code: 'ENOSYS'
    });
  });

  test('should return ENOTTY for unsupported ioctl', async () => {
    await expect(fuse.ioctl(1n, 0x1234, null, context)).rejects.toMatchObject({
      errno: -25,
      code: 'ENOTTY'
    });
  });
});
```

---

### 4.4 Concurrency Tests

#### 4.4.1 Write-Queue Integration Tests
**Status**: ⚠️ **TEILWEISE** - Write-Queue implementiert, aber FUSE-Integration fehlt

**Erforderlich**:
```typescript
describe('write queue integration', () => {
  test('should serialize writes to same FD', async () => {
    const fd = await fuse.open('/test.txt', O_WRONLY, context);

    const writes = Promise.all([
      fuse.write(fd, data1, 0n, context),
      fuse.write(fd, data2, 1024n, context),
      fuse.write(fd, data3, 2048n, context)
    ]);

    await expect(writes).resolves.toBeDefined();

    // flush should wait for all writes
    await fuse.flush(fd, context);
    await fuse.release(fd, context);
  });
});
```

#### 4.4.2 Parallel Operations Tests
```typescript
describe('parallel operations', () => {
  test('should handle concurrent readdir calls', async () => {
    const promises = Array.from({length: 10}, (_, i) =>
      fuse.readdir(1n, BigInt(i * 100), context)
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
  });
});
```

---

### 4.5 Shutdown & Resource Management Tests

#### 4.5.1 Graceful Shutdown Tests
**Status**: ✅ **IMPLEMENTIERT**
- Tests: `shutdown.test.ts` ✓

#### 4.5.2 FD-Leak Tests
**Status**: ❌ **FEHLT**

```typescript
describe('resource management', () => {
  test('should not leak file descriptors', async () => {
    const initialFDs = await getOpenFDCount();

    // Open and close many files
    for (let i = 0; i < 100; i++) {
      const fd = await fuse.open(`/test${i}.txt`, O_RDONLY, context);
      await fuse.release(fd, context);
    }

    const finalFDs = await getOpenFDCount();
    expect(finalFDs).toBe(initialFDs);
  });
});
```

---

## 5) Implementation Roadmap

### Phase 1: KRITISCHE BASIS (2-3 Wochen)
**Ziel**: Grundlegende FUSE-Funktionalität

1. **`getattr` Implementation** (3 Tage)
   - `src/getattr_bridge.cc` erstellen
   - FUSE-Callback integration
   - BigInt ino handling
   - ns-timestamp support
   - Error mapping
   - Tests: Native + BigInt edge cases

2. **`open/read/write/release` Implementation** (5 Tage)
   - `src/fileio_bridge.cc` erstellen
   - FD-Management mit BigInt
   - Zero-Copy ArrayBuffer integration
   - Write-Queue integration
   - Buffer validation
   - Tests: Lifecycle + Performance

3. **`readdir` Native Implementation** (3 Tage)
   - `src/readdir_bridge.cc` erstellen
   - Offset pagination mit BigInt
   - d_type mapping
   - FUSE filler callback
   - Tests: Pagination + large directories

4. **Op-Matrix Tool** (2 Tage)
   - `npm run gen:op-report` implementieren
   - Automatische Vollständigkeitsprüfung
   - docs/op-matrix.md generieren

### Phase 2: FILESYSTEM STRUCTURE (2 Wochen)
**Ziel**: Vollständige Dateisystem-Navigation

1. **Namespace Operations** (7 Tage)
   - `mkdir/rmdir` Implementation
   - `create/unlink` Implementation
   - `rename` Implementation
   - `link/symlink/readlink` Implementation
   - Errno-Tests: EEXIST, ENOTEMPTY, EISDIR, ENOTDIR
   - Tests: Edge cases + race conditions

2. **Metadata Operations** (5 Tage)
   - `chmod/chown` Implementation
   - `truncate` Implementation (BigInt sizes)
   - `utimens` Implementation (ns-precision!)
   - Tests: Large files + precision

3. **statfs Completion** (2 Tage)
   - Fragment zu vollständiger Implementation
   - 64-Bit Filesystem statistics
   - Tests: Large filesystems

### Phase 3: PERFORMANCE & ADVANCED I/O (2 Wochen)
**Ziel**: Optimale Performance

1. **Zero-Copy Buffer Operations** (5 Tage)
   - `read_buf/write_buf` Implementation
   - External ArrayBuffer integration
   - Memory management + finalizers
   - Tests: Large transfers + memory usage

2. **Sync & Cache Operations** (4 Tage)
   - `flush/fsync/fsyncdir` Implementation
   - Write-Queue synchronization
   - Data integrity guarantees
   - Tests: Crash consistency

3. **Advanced Features** (5 Tage)
   - `access` Implementation
   - `lock/flock` Implementation
   - `fallocate` Implementation
   - `lseek` Implementation
   - Tests: Locking scenarios

### Phase 4: SPEZIAL-OPERATIONS & POLISH (1 Woche)
**Ziel**: Vollständigkeit

1. **Optional Operations** (3 Tage)
   - `bmap` (stub/ENOSYS)
   - `ioctl` (ENOTTY default)
   - `poll` (ENOSYS default)
   - Tests: Proper error responses

2. **Performance Benchmarking** (2 Tage)
   - End-to-end benchmarks
   - Performance regression tests
   - Memory leak detection

3. **Documentation & Examples** (2 Tage)
   - Complete API documentation
   - Working examples (memfs, passthrough)
   - Migration guide

---

## 6) Test Strategy Details

### 6.1 Test Kategorien

**Unit Tests** (`test/unit/`):
```
test/unit/
├── operations/
│   ├── getattr.test.ts
│   ├── readdir.test.ts
│   ├── fileio.test.ts (open/read/write/release)
│   ├── namespace.test.ts (mkdir/rmdir/create/unlink)
│   ├── metadata.test.ts (chmod/chown/truncate/utimens)
│   └── advanced.test.ts (lock/fallocate/lseek)
├── types/
│   ├── bigint.test.ts (> 2^53 values)
│   ├── timestamps.test.ts (ns precision)
│   └── errno.test.ts (consistency)
└── integration/
    ├── lifecycle.test.ts (mount/ops/unmount)
    ├── concurrency.test.ts (parallel operations)
    └── performance.test.ts (benchmarks)
```

**Mock-E2E Tests** (`test/e2e/`):
```
test/e2e/
├── memfs.test.ts (In-memory filesystem)
├── passthrough.test.ts (Real filesystem proxy)
└── stress.test.ts (Load testing)
```

**Type Tests** (`test/types/`):
```
test/types/
├── handlers.test-d.ts (All operation signatures)
├── constraints.test-d.ts (BigInt enforcement)
└── errors.test-d.ts (Errno types)
```

### 6.2 Test Data & Edge Cases

**BigInt Edge Cases**:
```typescript
const testValues = [
  0n,                    // Minimum
  1n,                    // Basic
  2147483647n,          // 2^31-1 (signed 32-bit max)
  4294967295n,          // 2^32-1 (unsigned 32-bit max)
  9007199254740991n,    // 2^53-1 (JS safe integer max)
  9007199254740992n,    // 2^53 (first unsafe)
  18446744073709551615n // 2^64-1 (uint64 max)
];
```

**Timestamp Edge Cases**:
```typescript
const timestampTests = [
  0n,                         // Unix epoch
  1000000000n,               // 1 second in ns
  1234567890123456789n,      // Mixed precision
  9223372036854775807n       // int64 max (year 2262)
];
```

**Path Edge Cases**:
```
"/",                          // Root
"/very/deep/nested/path",     // Deep nesting
"/file-with-ümlaut.txt",      // Unicode
"/file with spaces.txt",       // Spaces
"/" + "a".repeat(255),        // NAME_MAX
"/" + "a".repeat(256),        // > NAME_MAX (should fail)
```

**Concurrent Test Patterns**:
```typescript
// Pattern: Parallel same-operation
const promises = Array.from({length: 100}, (_, i) =>
  operation(i, context)
);
await Promise.allSettled(promises);

// Pattern: Mixed operation types
await Promise.allSettled([
  getattr(1n, context),
  readdir(1n, 0n, context),
  open('/test', O_RDONLY, context)
]);

// Pattern: Resource contention
const fd = await open('/shared', O_RDWR, context);
await Promise.allSettled([
  write(fd, data1, 0n, context),
  write(fd, data2, 1024n, context),
  flush(fd, context)
]);
```

---

## 7) Quality Gates & Acceptance Criteria

### 7.1 Definition of Done (DoD) pro Operation

**Für jede FUSE-Operation MUSS gelten**:

- [ ] **C++ FUSE-Callback** implementiert in `src/`
- [ ] **N-API Wrapper** mit korrekter BigInt-Verwendung
- [ ] **TypeScript Handler** in `ts/types.ts` definiert
- [ ] **Error Mapping** für alle relevanten errno-Codes
- [ ] **Unit Tests** mit >90% Coverage
- [ ] **BigInt Edge Case Tests** (> 2^53 Werte)
- [ ] **Concurrency Tests** (falls zutreffend)
- [ ] **Type Tests** (.test-d.ts) für Signaturen
- [ ] **Documentation** in docs/ aktualisiert
- [ ] **Example Usage** in examples/
- [ ] **Performance Baseline** etabliert

### 7.2 Build & CI Requirements

**Build-Pipeline**:
```bash
# Phase gates - alle müssen grün sein
npm run build:native          # CMake + C++ compilation
npm run build:ts             # TypeScript compilation
npm run test:unit            # Unit tests
npm run test:types           # Type tests (tsd)
npm run test:integration     # Integration tests
npm run test:performance     # Performance regression
npm run lint                 # Code style
npm run docs:generate        # Documentation generation
```

**Coverage Targets**:
- **Lines**: >90%
- **Functions**: >95%
- **Branches**: >80%
- **Statements**: >90%

**Performance Baselines** (pro Operation):
```
getattr:    < 50μs  (median)
read:       < 100μs (per
 MB)
write:      < 150μs (per MB) 
readdir:    < 200μs (per 1000 entries)
mkdir:      < 100μs (median)
```

### 7.3 Memory & Resource Constraints

**Memory Limits**:
- **Max RSS**: <100MB während Tests
- **FD Leaks**: 0 (pre/post Test-Vergleich)
- **Buffer Leaks**: 0 (Valgrind/ASan clean)
- **ThreadSafeFunction**: Alle korrekt released

**Concurrency Constraints**:
- **Max parallel operations**: 1000
- **Write queue depth**: <10MB per FD
- **TSFN queue**: <1000 pending calls
- **Graceful shutdown**: <5s unter Last

---

## 8) Tools & Automation

### 8.1 Development Tools

**Operation Report Tool**:
```bash
npm run gen:op-report
# Generiert: docs/op-matrix.md mit Status aller Operations
```

**Test Data Generator**:
```bash
npm run gen:test-data
# Generiert: BigInt edge cases, Unicode paths, etc.
```

**Performance Profiler**:
```bash
npm run profile:operations
# Generiert: Latenz-Profile pro Operation
```

**Memory Leak Detector**:
```bash
npm run test:memory-leaks  
# Läuft mit Valgrind/ASan
```

### 8.2 Continuous Integration

**PR-Pipeline** (.github/workflows/pr.yml):
```yaml
name: PR Validation
on: [pull_request]
jobs:
  validate:
    steps:
      - name: Build Native
        run: npm run build:native
      - name: Type Check
        run: npm run typecheck
      - name: Unit Tests
        run: npm run test:unit
      - name: Integration Tests  
        run: npm run test:integration
      - name: Performance Check
        run: npm run test:performance
      - name: Memory Leak Check
        run: npm run test:memory-leaks
```

**Release Pipeline** (.github/workflows/release.yml):
```yaml
name: Release
on: 
  push:
    tags: ['v*']
jobs:
  release:
    steps:
      - name: Full Test Suite
        run: npm run test:all
      - name: Build Prebuilds
        run: npm run prebuild:all  
      - name: Generate Docs
        run: npm run docs:generate
      - name: Publish NPM
        run: npm publish
```

---

## 9) Risk Assessment & Mitigation

### 9.1 Technical Risks

**HIGH RISK**:

1. **BigInt Performance**: Conversions zwischen C++ uint64_t ↔ JS BigInt
   - **Mitigation**: Benchmark critical paths, optimize häufige Conversions
   - **Contingency**: Falls zu langsam, selective 32-bit Fallbacks für kleine Werte

2. **Memory Management**: External ArrayBuffers + Finalizers
   - **Mitigation**: Extensive Leak-Tests mit Valgrind/ASan  
   - **Contingency**: RAII-Wrapper + shared_ptr für alle Native-Resources

3. **ThreadSafeFunction Correctness**: Race conditions zwischen C++ ↔ JS
   - **Mitigation**: Strenge TSFN-Disziplin, alle Calls synchron
   - **Contingency**: Fallback zu traditionellem Worker-Thread-Pattern

**MEDIUM RISK**:

4. **FUSE Version Compatibility**: FUSE 3.0 vs 3.1+ Features
   - **Mitigation**: Feature-Detection zur Runtime
   - **Contingency**: Polyfills für ältere FUSE-Versionen

5. **Platform Differences**: Linux-spezifische syscalls
   - **Mitigation**: Abstraction-Layer für Platform-differences
   - **Contingency**: Platform-specific Implementations

### 9.2 Timeline Risks

**Schedule Dependencies**:
- Phase 1 blockiert Phase 2-4 (kritische Basis)
- Testing parallel zu Implementation (nicht sequenziell)
- Documentation kontinuierlich (nicht am Ende)

**Mitigation Strategies**:
- **Early Feedback**: MVP nach Phase 1 für User-Testing
- **Parallel Tracks**: Tests während Implementation schreiben  
- **Risk Buffer**: 20% zusätzliche Zeit pro Phase eingeplant

---

## 10) Success Metrics

### 10.1 Functional Completeness
- [ ] **100%** aller FUSE-Operations implementiert
- [ ] **100%** aller Operations getestet (Unit + Integration)
- [ ] **100%** BigInt-Support für 64-Bit Felder
- [ ] **100%** ns-Precision für Timestamps
- [ ] **100%** errno-Consistency

### 10.2 Performance Targets
- [ ] **Zero-Copy** für Buffer-Operations aktiviert
- [ ] **< 1ms** p99-Latenz für häufige Operations (getattr, read, write)
- [ ] **> 1GB/s** Throughput für sequenzielles I/O
- [ ] **< 100MB** Memory Usage unter normaler Last
- [ ] **0 Leaks** in 24h Stress-Test

### 10.3 Developer Experience  
- [ ] **API Documentation** vollständig und mit Beispielen
- [ ] **TypeScript IntelliSense** funktioniert für alle Operations
- [ ] **Error Messages** aussagekräftig und actionable
- [ ] **Examples** funktionieren out-of-the-box
- [ ] **Migration Path** von alten Bindings dokumentiert

### 10.4 Production Readiness
- [ ] **Graceful Shutdown** unter allen Bedingungen
- [ ] **Error Recovery** von allen recoverable Failures
- [ ] **Resource Cleanup** garantiert (auch bei Crashes)
- [ ] **Monitoring/Observability** integriert
- [ ] **Security Review** abgeschlossen

---

**Dokument-Version**: 1.0  
**Erstellt**: 2025-01-06  
**Nächste Review**: Nach Phase 1 Completion

**Verantwortlichkeiten**:
- **Tech Lead**: Architektur-Decisions, Code Reviews
- **Agent/Developer**: Implementation gemäß dieser Spezifikation  
- **QA**: Test-Coverage und Performance-Validation
- **DevOps**: CI/CD Pipeline und Release-Management

---

## Appendix: Quick Reference

### FUSE Operations Status Summary
```
✅ IMPLEMENTED: init, copyFileRange, xattr operations, session management
⚠️  PARTIAL: statfs (fragment exists), readdir (TS-only)
❌ MISSING: getattr, open/read/write/release, mkdir/rmdir/create/unlink, 
           chmod/chown/truncate/utimens, flush/fsync, readlink/symlink,
           access/lock/fallocate/lseek, bmap/ioctl/poll, read_buf/write_buf
```

### Key Commands
```bash
npm run build:native        # Build C++ components
npm run test               # Run all tests  
npm run gen:op-report      # Generate operation matrix
npm run profile:operations # Performance profiling
npm run test:memory-leaks  # Memory leak detection
```