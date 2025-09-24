# Debugging Segmentation Faults in FUSE Native

## Übersicht

Dieses Dokument erklärt, wie man Segmentation Faults in der FUSE Native Implementierung debuggt. Es wurden spezielle Debugging-Tools aktiviert, um die Fehlerquelle zu identifizieren.

## Build mit Debugging-Tools

### 1. Debug-Build erstellen

```bash
# Debug-Build mit ASan/UBSan
npm run build:native:debug
```

### 2. Mit AddressSanitizer starten

```bash
# Mit ASan und N-API Fatal Errors
./examples/start-inmemory-fs.sh --enable-asan

# Oder als Environment-Variable
ENABLE_ASAN=true ./examples/start-inmemory-fs.sh
```

## Debugging-Tools

### AddressSanitizer (ASan)
- **Erkennt**: Memory-Leaks, Buffer-Overflows, Use-After-Free
- **Aktiviert in**: `CMakeLists.txt` für Debug-Builds
- **Flags**: `-fsanitize=address,undefined -fno-omit-frame-pointer -g`

### Undefined Behavior Sanitizer (UBSan)
- **Erkennt**: Undefiniertes Verhalten (Division durch Null, Integer-Overflows, etc.)
- **Aktiviert in**: `CMakeLists.txt` für Debug-Builds

### N-API Fatal Errors
- **Erkennt**: N-API Fehler werden als Fatals behandelt statt stumm ignoriert
- **Aktiviert**: `NAPI_FATAL_ERRORS=1` Environment-Variable
- **Define**: `-DNAPI_FATAL_ERRORS=1` in CMakeLists.txt

## Debugging-Schritte

### 1. Crash reproduzieren

```bash
# Starte mit Debugging aktiviert
ENABLE_ASAN=true ./examples/start-inmemory-fs.sh --foreground
```

### 2. GDB Backtrace erstellen

```bash
# Wenn der Crash passiert:
# 1. Öffne zweiten Terminal
# 2. Finde PID: ps aux | grep node
# 3. Attach GDB: gdb -p <PID>
# 4. (gdb) bt  # Backtrace anzeigen
# 5. (gdb) info threads  # Threads anzeigen
```

### 3. ASan Output analysieren

ASan gibt detaillierte Informationen über:
- **Memory Leaks**: Speicher, der nicht freigegeben wurde
- **Buffer Overflows**: Zugriff außerhalb von Array-Grenzen
- **Use-After-Free**: Zugriff auf freigegebenen Speicher

### 4. UBSan Output analysieren

UBSan erkennt:
- Division durch Null
- Integer-Overflows
- Ungültige Bit-Shifts
- Unsignierte Integer-Underflows

## Bekannte Problemquellen

### 1. Invalid Inode Numbers
- **Problem**: In-Memory FS gibt invalide Inode-IDs zurück
- **Symptom**: Crash in `HandleAccess` bei `ToUint64(context->ino)`
- **Lösung**: Validiere Inode-IDs vor der Verwendung

### 2. File Descriptor Issues
- **Problem**: FUSE File Handles sind keine echten FDs
- **Symptom**: Crash in `copy_file_range` bei FD-Operationen
- **Lösung**: Implementiere Fallback für In-Memory FS

### 3. Buffer-Handling
- **Problem**: Unsichere Buffer-Operationen in C++
- **Symptom**: Heap-Corruption, invalid Reads/Writes
- **Lösung**: Bounds-Checking und sichere Buffer-Allocation

## Debug-Logging

Das System loggt bereits viele Debug-Informationen:

```bash
# Debug-Output wird angezeigt bei:
./examples/start-inmemory-fs.sh --debug --enable-asan
```

## Performance Impact

**Warnung**: Die Debugging-Tools haben erheblichen Performance-Impact:
- ASan: ~2-3x langsamer
- UBSan: ~1.5x langsamer
- N-API Fatals: Sofortiger Abbruch bei Fehlern

**Für Produktion**: Verwende Release-Build ohne Debugging-Tools.

## Troubleshooting

### "AddressSanitizer: heap-buffer-overflow"
1. Identifiziere die Funktion im Stack-Trace
2. Prüfe Buffer-Größen und -Zugriffe
3. Füge Bounds-Checking hinzu

### "UndefinedBehaviorSanitizer: signed-integer-overflow"
1. Identifiziere die überlaufende Operation
2. Verwende größere Integer-Typen oder prüfe Overflow

### "N-API Fatal Error"
1. Identifiziere die N-API Funktion im Stack-Trace
2. Prüfe Parameter-Typen und -Werte
3. Füge NULL-Checks hinzu

## Zusätzliche Tools

### Valgrind
```bash
# Alternative zu ASan
valgrind --tool=memcheck node examples/inmemory-fs.mjs /tmp/test
```

### GDB mit Pretty-Printing
```bash
# Für bessere C++ Ausgabe
(gdb) set print pretty on
(gdb) set print object on
```

## Nächste Schritte

1. **Reproduziere den Crash** mit aktivierten Debugging-Tools
2. **Analysiere den Backtrace** mit GDB
3. **Identifiziere die Root-Cause** aus ASan/UBSan Output
4. **Implementiere Fix** basierend auf der Analyse
5. **Teste den Fix** mit und ohne Debugging-Tools