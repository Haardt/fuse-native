# FUSE3 Implementation Analysis

Diese Datei analysiert die Parameterketten und Implementierungsdetails für alle FUSE-Funktionen durch die vier Implementierungsebenen:
**FUSE3 → fuse-native.c → index.js → index.d.ts**

## Parameterkonvertierungen und wichtige Konzepte

### 64-Bit Integer Handling
- **FUSE3/C**: `off_t`, `size_t`, `uint64_t` (native 64-bit)
- **fuse-native.c**: Aufgeteilte in 2×32-bit für JavaScript-Transfer
- **index.js**: `getDoubleArg(low, high)` konvertiert zurück zu 64-bit
- **index.d.ts**: `number` (JavaScript kann nur safe integers bis 2^53)

### Zeitstempel-Konvertierung
- **FUSE3**: `struct timespec` (Sekunden + Nanosekunden)
- **fuse-native.c**: Konvertiert zu 64-bit Millisekunden
- **index.js**: `Date` Objekte
- **index.d.ts**: `Date` Typ

---

## Function: init

**FUSE3:** `void *(*init)(struct fuse_conn_info *conn, struct fuse_config *cfg)`
- `conn`: Verbindungsinfo (Protokoll, Capabilities)
- `cfg`: Dateisystem-Konfiguration

**fuse-native.c:** `void* fuse_native_init(...)`
- Direkte C-Implementierung, kein Parameter-Transfer zu JS
- Setzt interne Strukturen auf

**index.js:** `_op_init(signal)`
- `signal`: Callback-Funktion für Ergebnis

**index.d.ts:** `init?: (cb: (err: number) => void) => void`
- `cb`: Callback mit Fehlercode

**Implementierung:** Init wird nur einmal beim Mount aufgerufen. Keine Parameter werden an JavaScript weitergegeben.

---

## Function: getattr

**FUSE3:** `int (*getattr)(const char *path, struct stat *stat, struct fuse_file_info *fi)`
- `path`: Dateipfad (C-String)
- `stat`: Ausgabe-Struktur für Dateiattribute
- `fi`: Optional, Dateihandle-Info (kann NULL sein)

**fuse-native.c:** `FUSE_METHOD(getattr, 2, 1, ...)`
- `l->path`: C-String Pfad
- `l->stat`: Zeiger auf stat-Struktur
- `l->info`: Dateihandle-Info

**index.js:** `_op_getattr(signal, path)`
- `signal`: Callback-Funktion
- `path`: JavaScript String

**index.d.ts:** `getattr?: (path: string, cb: (err: number, stat?: Stats) => void) => void`
- `path`: Dateipfad als String
- `cb`: Callback mit Fehler und Stats-Objekt

**Implementierung:** 
- **Wichtig**: Dateihandle (fi) wird nicht an JavaScript weitergegeben
- Stats-Konvertierung über `getStatArray()`: JS-Objekt → Uint32Array → C struct stat
- **Dateisystem-Context**: Hauptfunktion für Dateieigenschaften (Größe, Berechtigungen, Timestamps)

---

## Function: read

**FUSE3:** `int (*read)(const char *path, char *buf, size_t size, off_t offset, struct fuse_file_info *info)`
- `path`: Dateipfad
- `buf`: Puffer zum Lesen
- `size`: Anzahl zu lesender Bytes
- `offset`: Dateiposition (64-bit)
- `info`: Dateihandle-Info

**fuse-native.c:** `FUSE_METHOD(read, 6, 1, ...)`
- `l->path`: Pfad
- `l->buf`: C-Puffer
- `l->len`: Länge
- `l->offset`: 64-bit Offset
- `l->info`: Dateihandle

**index.js:** `_op_read(signal, path, fd, buf, len, offsetLow, offsetHigh)`
- `signal`: Callback
- `path`: Dateipfad
- `fd`: File Descriptor von info->fh
- `buf`: Buffer-Objekt
- `len`: Pufferlänge
- `offsetLow/offsetHigh`: 64-bit Offset als 2×32-bit

**index.d.ts:** `read?: (path: string, fd: number, buffer: Buffer, length: number, position: number, cb: (result: number) => void) => void`

**Implementierung:**
- **FUSE-Style Callback**: `cb(bytesRead)` bei Erfolg, `cb(-errorCode)` bei Fehler
- **Retry-Logic**: Automatische Wiederholung bei EINTR/EAGAIN (bis 100x)
- **Dateisystem-Context**: Kernfunktion - muss exakte Anzahl Bytes lesen oder Fehler zurückgeben

---

## Function: write

**FUSE3:** `int (*write)(const char *path, const char *buf, size_t size, off_t offset, struct fuse_file_info *info)`
- Analog zu read, aber const buf (Eingabepuffer)

**fuse-native.c:** `FUSE_METHOD(write, 6, 1, ...)`
- Ähnlich read, aber für Schreiboperationen

**index.js:** `_op_write(signal, path, fd, buf, len, offsetLow, offsetHigh)`
- **Write-Tracking**: Verwaltet aktive Schreiboperationen pro FD
- **Sequentielle Operationen**: Flush/Release warten auf Write-Completion

**index.d.ts:** `write?: (path: string, fd: number, buffer: Buffer, length: number, position: number, cb: ((error: null, bytesWritten: number) => void) | ((errorCode: number) => void)) => void`

**Implementierung:**
- **Mixed Callback**: Erfolg: `cb(null, bytesWritten)`, Fehler: `cb(errorCode)`
- **Concurrency Control**: Tracks writes.count für ordnungsgemäße Release-Synchronisation
- **Dateisystem-Context**: Muss genau so viele Bytes schreiben wie angefordert

---

## Function: readdir

**FUSE3:** `int (*readdir)(const char *path, void *buf, fuse_fill_dir_t filler, off_t offset, struct fuse_file_info *info, enum fuse_readdir_flags flags)`
- `path`: Verzeichnispfad
- `buf`: Interner Buffer
- `filler`: Callback-Funktion zum Füllen der Einträge
- `offset`: Offset für pagination
- `info`: Verzeichnis-Handle
- `flags`: Readdir-Flags

**fuse-native.c:** `FUSE_METHOD(readdir, 1, 2, ...)`
- Komplex: Sammelt Namen und Stats in Arrays

**index.js:** `_op_readdir(signal, path)`
- `signal`: Callback
- `path`: Verzeichnispfad

**index.d.ts:** `readdir?: (path: string, cb: (err: number, names?: string[], stats?: Stats[]) => void) => void`
- `names`: Array von Dateinamen
- `stats`: Optional, Array von Stat-Objekten

**Implementierung:**
- **Vereinfachte API**: Kein Offset/Pagination in JS-Interface
- **Stats optional**: Wenn nicht bereitgestellt, werden 0-Stats generiert
- **Dateisystem-Context**: Muss mindestens "." und ".." zurückgeben

---

## Function: open

**FUSE3:** `int (*open)(const char *path, struct fuse_file_info *info)`
- `path`: Dateipfad
- `info`: Ein/Ausgabe - flags als Input, fh als Output

**fuse-native.c:** `FUSE_METHOD(open, 2, 1, ...)`
- `l->info->flags`: Open-Flags (O_RDONLY, O_WRONLY, etc.)
- `l->info->fh`: Wird mit FD gefüllt

**index.js:** `_op_open(signal, path, flags)`
- `flags`: Open-Flags als Integer

**index.d.ts:** `open?: (path: string, flags: number, cb: (err: number, fd?: number) => void) => void`
- `flags`: O_RDONLY=0, O_WRONLY=1, O_RDWR=2, etc.
- `fd`: File Descriptor (wird in info->fh gespeichert)

**Implementierung:**
- **FD Management**: Returned FD wird für alle nachfolgenden Operationen verwendet
- **Flag-Konstanten**: Standard POSIX open() flags
- **Dateisystem-Context**: Muss unique FD zurückgeben oder Fehler

---

## Function: create

**FUSE3:** `int (*create)(const char *path, mode_t mode, struct fuse_file_info *info)`
- Atomisches Create+Open
- `mode`: Dateiberechtigungen (z.B. 0644)

**fuse-native.c:** `FUSE_METHOD(create, 2, 1, ...)`
- `mode`: Berechtigungen als uint32

**index.js:** `_op_create(signal, path, mode)`
- Direkter Aufruf ohne weitere Verarbeitung

**index.d.ts:** `create?: (path: string, mode: number, cb: (errorCode: number, fd?: number) => void) => void`

**Implementierung:**
- **Atomisch**: Erstellt Datei und öffnet sie in einem Schritt
- **Mode-Bits**: 0644 (rw-r--r--), 0755 (rwxr-xr-x), etc.
- **Alternative zu mknod+open**: Effizienter für reguläre Dateien

---

## Function: statfs

**FUSE3:** `int (*statfs)(const char *path, struct statvfs *statvfs)`
- `statvfs`: Dateisystem-Statistiken (freier Platz, Inodes, etc.)

**fuse-native.c:** `FUSE_METHOD(statfs, 1, 1, ...)`
- `statvfs` wird nach JS-Callback gefüllt

**index.js:** `_op_statfs(signal, path)`
- Verwendet `getStatfsArray()` für Konvertierung

**index.d.ts:** `statfs?: (path: string, cb: (err: number, stats?: {...}) => void) => void`
- Stats-Objekt mit bsize, blocks, bfree, etc.

**Implementierung:**
- **Speicherinfo**: Wichtig für df-Command und Speicherüberwachung
- **11 Uint32-Werte**: bsize, frsize, blocks, bfree, bavail, files, ffree, favail, fsid, flag, namemax
- **Dateisystem-Context**: Muss realistische Werte liefern für Tools

---

## Function: utimens

**FUSE3:** `int (*utimens)(const char *path, const struct timespec tv[2], struct fuse_file_info *fi)`
- `tv[0]`: Access time
- `tv[1]`: Modification time
- Nanosekunden-Präzision

**fuse-native.c:** `FUSE_METHOD_VOID(utimens, 6, 0, ...)`
- Konvertiert timespec zu 64-bit Millisekunden
- 2×64-bit = 4×32-bit Parameter

**index.js:** `_op_utimens(signal, path, atimeLow, atimeHigh, mtimeLow, mtimeHigh)`
- `getDoubleArg()` konvertiert zu Millisekunden
- Erstellt Date-Objekte

**index.d.ts:** `utimens?: (path: string, atime: Date, mtime: Date, cb: (err: number) => void) => void`

**Implementierung:**
- **Zeitpräzision**: FUSE verwendet Nanosekunden, JS nur Millisekunden
- **Touch-Command**: Implementiert touch-Funktionalität
- **Dateisystem-Context**: Wichtig für Backup-Tools und Make-Systeme

---

## Function: truncate

**FUSE3:** `int (*truncate)(const char *path, off_t size, struct fuse_file_info *fi)`
- Ändert Dateigröße, kann vergrößern oder verkleinern

**fuse-native.c:** `FUSE_METHOD_VOID(truncate, 4, 0, ...)`
- 64-bit size wird als 2×32-bit übertragen

**index.js:** `_op_truncate(signal, path, sizeLow, sizeHigh)`
- `getDoubleArg()` für 64-bit Größe

**index.d.ts:** `truncate?: (path: string, size: number, cb: (err: number) => void) => void`

**Implementierung:**
- **Größenänderung**: Bei Vergrößerung meist Nullen anhängen
- **Bei Verkleinerung**: Daten gehen verloren
- **Dateisystem-Context**: Wichtig für Editoren und Datenbank-Systeme

---

## Function: chmod/chown

**FUSE3:** 
- `int (*chmod)(const char *path, mode_t mode, struct fuse_file_info *fi)`
- `int (*chown)(const char *path, uid_t uid, gid_t gid, struct fuse_file_info *fi)`

**fuse-native.c:** `FUSE_METHOD_VOID(...)`
- Direkte Parameterübergabe

**index.js:** Direkte Weiterleitung ohne Konvertierung

**index.d.ts:** 
- `chmod?: (path: string, mode: number, cb: (err: number) => void) => void`
- `chown?: (path: string, uid: number, gid: number, cb: (err: number) => void) => void`

**Implementierung:**
- **Berechtigungen**: chmod mit Oktal-Werten (0755, 0644)
- **Besitz**: chown mit numerischen User/Group-IDs
- **Dateisystem-Context**: Sicherheitsrelevant, oft root-only

---

## Function: mkdir/rmdir/unlink

**FUSE3:** Standard POSIX-Semantik
- `int (*mkdir)(const char *path, mode_t mode)`
- `int (*rmdir)(const char *path)`
- `int (*unlink)(const char *path)`

**Alle Ebenen:** Direkte Parameterweiterleitung ohne Konvertierung

**Implementierung:**
- **mkdir**: Muss parent directory existieren
- **rmdir**: Nur leere Verzeichnisse
- **unlink**: Entfernt Dateien (nicht Verzeichnisse)
- **Dateisystem-Context**: Atomische Operationen, wichtig für Konsistenz

---

## Function: symlink/link/readlink

**FUSE3:**
- `int (*symlink)(const char *target, const char *linkpath)`
- `int (*link)(const char *oldpath, const char *newpath)`
- `int (*readlink)(const char *path, char *buf, size_t size)`

**Besonderheiten:**
- **symlink**: Erstellt symbolischen Link (kann auf nicht-existierende Ziele zeigen)
- **link**: Erstellt harten Link (beide Namen zeigen auf dieselbe Inode)
- **readlink**: Liest Ziel eines symbolischen Links

**Implementierung:**
- **Symlinks**: Speichern Zielpfad als String
- **Hard Links**: Teilen sich Dateiinhalt, separate Verzeichniseinträge
- **Dateisystem-Context**: Wichtig für Package-Manager und Build-Systeme

---

## Function: flush/fsync/release

**FUSE3:**
- `int (*flush)(const char *path, struct fuse_file_info *info)`
- `int (*fsync)(const char *path, int datasync, struct fuse_file_info *info)`
- `int (*release)(const char *path, struct fuse_file_info *info)`

**index.js Besonderheiten:**
- **Write-Tracking**: flush/release warten auf aktive Schreiboperationen
- **Synchronisation**: Verhindert Race Conditions

**Implementierung:**
- **flush**: Bei jedem close() aufgerufen (kann mehrfach)
- **release**: Nur beim letzten close() aufgerufen
- **fsync**: Erzwingt Schreiben auf Speicher
- **Dateisystem-Context**: Datenkonsistenz und Persistierung

---

## Function: *xattr (Extended Attributes)

**FUSE3:** Standard Extended Attribute API
- `setxattr/getxattr/listxattr/removexattr`

**Platform-Unterschiede:**
- **macOS**: Zusätzlicher Position-Parameter
- **Linux**: Kein Position-Parameter
- **fuse-native**: Normalisiert API zwischen Platformen

**index.js:**
- **listxattr**: Komplexe Puffer-Behandlung, Size-Queries
- **getxattr**: Fehlerbehandlung für nicht-existierende Attribute

**Implementierung:**
- **Metadata**: Zusätzliche Datei-Metadaten (MIME-Types, Labels, etc.)
- **Size Queries**: listxattr mit size=0 gibt benötigte Puffergröße zurück
- **Dateisystem-Context**: Wichtig für Anwendungsdaten und Sicherheitsattribute

---

## Function: write_buf/read_buf

**FUSE3:** 
- `int (*write_buf)(const char *path, struct fuse_bufvec *buf, off_t off, struct fuse_file_info *info)`
- `int (*read_buf)(const char *path, struct fuse_bufvec **bufp, size_t size, off_t off, struct fuse_file_info *info)`

**Implementierung:**
- **Zero-Copy**: Potentielle Performance-Optimierung
- **Buffer Vectors**: Unterstützt scatter/gather I/O
- **Fallback**: Wenn nicht implementiert, fallen auf normale read/write zurück
- **Dateisystem-Context**: Optimierung für große Dateien und Netzwerk-Filesysteme

---

## Function: copy_file_range

**FUSE3:** `ssize_t (*copy_file_range)(...)`

**index.js Besonderheit:**
- **Intelligent Fallback**: Wenn nicht implementiert, verwendet read/write-Loop
- **Chunking**: Kopiert in 1MB-Blöcken
- **Error Handling**: Komplexe Fehlerbehandlung für partial copies

**Implementierung:**
- **Effizienz**: Server-side copy ohne Client-Transfer
- **Dateisystem-Context**: Wichtig für Backup und File-Manager-Operationen

---

## Callback-Konventionen Zusammenfassung

### Standard FUSE Callbacks: `cb(errorCode, result)`
- **Erfolg**: `cb(0, result)`
- **Fehler**: `cb(-errno)`
- **Funktionen**: Meiste Operations (getattr, open, create, etc.)

### FUSE-Style Callbacks: `cb(result)`
- **Erfolg**: `cb(positiveNumber)` (Bytes gelesen/geschrieben)
- **Fehler**: `cb(negativeErrorCode)`
- **Funktionen**: read, read_buf

### Mixed Callbacks
- **write/write_buf**: Erfolg `cb(null, bytesWritten)`, Fehler `cb(errorCode)`

---

## Wichtige Implementierungsdetails

### File Descriptor Management
- **C-Layer**: struct fuse_file_info->fh speichert FD
- **JS-Layer**: FD wird als number-Parameter übergeben
- **Konsistenz**: Derselbe FD für open→read/write→release

### Error Handling
- **POSIX errno**: Negative Werte (-2 = ENOENT, -13 = EACCES)
- **Retry Logic**: Automatisch für EINTR/EAGAIN bei read/write
- **Signal Handling**: Ordnungsgemäße Behandlung von Interrupts

### Memory Management  
- **Buffer Handling**: External buffers in fuse-native.c
- **Zero-Copy**: Wo möglich direkte Buffer-Übergabe
- **Cleanup**: Automatische Speicherfreigabe nach Operationen

### Concurrency
- **Write Tracking**: Verhindert Race Conditions bei flush/release
- **Thread Safety**: C-Layer ist thread-safe, JS-Layer single-threaded
- **Event Loop**: Verwendet process.nextTick() für Non-blocking Operations