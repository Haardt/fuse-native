# FUSE Native Testing Framework

## Übersicht

Dieses Verzeichnis enthält ein vollständiges Testsystem für FUSE-Operationen mit einem minimalen in-Memory Dateisystem. Das System implementiert alle FUSE-Operationen und bietet umfassende Tests für die Funktionalität.

## Dateien

- **`memory-fs.js`** - In-Memory Dateisystem-Implementierung mit allen FUSE-Operationen
- **`fuse-operations.test.js`** - Umfassende Testsuite für alle FUSE-Operationen  
- **`jest.test.js`** - Basis Jest-Funktionalitätstests

## FUSE-Operationen Implementierung

Das `MemoryFileSystem` implementiert alle wichtigen FUSE-Operationen:

### Core Operations
- `init` - Dateisystem-Initialisierung
- `error` - Fehlerbehandlung
- `access` - Zugriffsprüfung
- `statfs` - Dateisystem-Statistiken

### File Metadata
- `getattr` / `fgetattr` - Datei-Attribute abrufen
- `utimens` - Zeitstempel setzen
- `chmod` - Berechtigungen ändern
- `chown` - Besitzer ändern

### File I/O
- `open` / `create` / `release` - Datei öffnen/erstellen/schließen
- `read` / `write` - Daten lesen/schreiben
- `flush` / `fsync` - Synchronisation
- `truncate` / `ftruncate` - Datei kürzen

### Directory Operations
- `opendir` / `releasedir` - Verzeichnis öffnen/schließen
- `readdir` - Verzeichnis-Inhalt lesen
- `fsyncdir` - Verzeichnis synchronisieren
- `mkdir` / `rmdir` - Verzeichnis erstellen/löschen

### File Management
- `unlink` - Datei löschen
- `rename` - Datei/Verzeichnis umbenennen
- `link` - Hard Link erstellen
- `symlink` / `readlink` - Symbolische Links
- `mknod` - Spezielle Dateien erstellen

### Extended Attributes
- `setxattr` / `getxattr` - Erweiterte Attribute setzen/abrufen
- `listxattr` / `removexattr` - Attribute auflisten/entfernen

### Advanced Operations
- `lock` / `flock` - Datei-Sperrung
- `bmap` - Block-Mapping
- `ioctl` - I/O-Kontrolle
- `poll` - Polling
- `write_buf` / `read_buf` - Gepufferte I/O
- `fallocate` - Speicher-Allokation
- `lseek` - Dateizeiger positionieren
- `copy_file_range` - Daten zwischen Dateien kopieren

## Callback-Konventionen

Die Implementierung folgt den AGENTS.md Konventionen:

### Erfolgreiche Operationen:
- **Allgemein**: `cb(0)` oder `cb(0, result)`
- **create**: `cb(0, fd)` - Rückgabe des File Descriptors
- **read**: `cb(bytesRead)` - Positive Anzahl gelesener Bytes
- **write**: `cb(bytesWritten)` - Positive Anzahl geschriebener Bytes

### Fehlerhafte Operationen:
- **Fehler**: `cb(negativeNumber)` - Negativer Errno-Wert
- Häufige Errno-Werte:
  - `-2` (ENOENT) - Datei/Verzeichnis nicht gefunden
  - `-9` (EBADF) - Ungültiger File Descriptor
  - `-13` (EACCES) - Zugriff verweigert
  - `-17` (EEXIST) - Datei existiert bereits
  - `-20` (ENOTDIR) - Nicht ein Verzeichnis
  - `-21` (EISDIR) - Ist ein Verzeichnis
  - `-22` (EINVAL) - Ungültiges Argument
  - `-39` (ENOTEMPTY) - Verzeichnis nicht leer
  - `-61` (ENODATA) - Keine Daten verfügbar

## In-Memory Dateisystem Struktur

Das Dateisystem speichert alle Daten im Arbeitsspeicher:

```javascript
{
  files: Map,           // Pfad -> FileNode Mapping
  fileDescriptors: Map, // fd -> {path, flags, pos}
  dirDescriptors: Map,  // fd -> {path}
  nextFd: number,       // Nächste verfügbare FD
  stats: object         // Dateisystem-Statistiken
}
```

### FileNode Struktur
```javascript
{
  path: string,         // Vollständiger Pfad
  type: string,         // 'file', 'directory', 'symlink', 'special'
  mode: number,         // Dateiberechtigungen (octal)
  content: Buffer,      // Dateiinhalt
  uid: number,          // Benutzer-ID
  gid: number,          // Gruppen-ID
  nlink: number,        // Anzahl Hard Links
  atime: Date,          // Letzter Zugriff
  mtime: Date,          // Letzte Modifikation
  ctime: Date,          // Erstellung/Metadaten-Änderung
  xattrs: Map          // Erweiterte Attribute
}
```

## Verwendung

### Grundlegende Verwendung:

```javascript
const MemoryFileSystem = require('./memory-fs');

const fs = new MemoryFileSystem();

// Datei erstellen
fs.create('/test.txt', 0o644, (err, fd) => {
  if (err === 0) {
    console.log('Datei erstellt, FD:', fd);
    
    // Daten schreiben
    const data = Buffer.from('Hello, World!');
    fs.write(fd, data, data.length, 0, (bytesWritten) => {
      console.log('Bytes geschrieben:', bytesWritten);
      
      // Datei schließen
      fs.release(fd, (err) => {
        console.log('Datei geschlossen');
      });
    });
  }
});
```

### Mit dem echten FUSE-Native:

```javascript
const Fuse = require('../index');
const MemoryFileSystem = require('./memory-fs');

const memFs = new MemoryFileSystem();

const fuse = new Fuse('/mnt/memory-fs', {
  init: memFs.init.bind(memFs),
  getattr: memFs.getattr.bind(memFs),
  readdir: memFs.readdir.bind(memFs),
  open: memFs.open.bind(memFs),
  read: memFs.read.bind(memFs),
  write: memFs.write.bind(memFs),
  create: memFs.create.bind(memFs),
  // ... weitere Operationen
}, { debug: true });

fuse.mount((err) => {
  if (err) throw err;
  console.log('Memory-FS gemountet unter /mnt/memory-fs');
});
```

## Tests ausführen

```bash
# Alle Tests ausführen
pnpm test

# Nur FUSE-Operations Tests
pnpm test test/fuse-operations.test.js

# Mit Verbose Output
pnpm test -- --verbose
```

## Test-Struktur

Die Testsuite ist in logische Gruppen unterteilt:

1. **Core Operations** - Grundlegende FUSE-Funktionen
2. **File Metadata Operations** - Datei-Attribute und -Eigenschaften
3. **File I/O Operations** - Lesen, Schreiben, Truncate
4. **Directory Operations** - Verzeichnis-Management
5. **File Management Operations** - Datei-Operationen (rename, link, etc.)
6. **Extended Attributes Operations** - Erweiterte Attribute
7. **Advanced Operations** - Spezialisierte FUSE-Funktionen
8. **Integration Tests** - End-to-End Szenarien

Jeder Test prüft sowohl positive als auch negative Szenarien und stellt sicher, dass die korrekten Errno-Codes zurückgegeben werden.

## Debugging

Das System bietet ausführliche Logging-Ausgaben für alle Operationen:

```
MemoryFS: create /test.txt mode=644
MemoryFS: write fd=1 length=13 position=0
MemoryFS: read fd=1 length=13 position=0
```

Diese Logs helfen beim Debuggen und Verstehen des Operationsflusses.

## Erweiterte Features

### Extended Attributes
Das System unterstützt vollständige Extended Attributes mit POSIX-kompatiblen Flags:
- `XATTR_CREATE` (1) - Nur erstellen, nicht überschreiben
- `XATTR_REPLACE` (2) - Nur ersetzen, nicht erstellen

### File Locking
Implementiert sowohl `lock` als auch `flock` Operationen für Dateisperrung.

### Buffer Operations
Optimierte `read_buf` und `write_buf` Operationen für bessere Performance.

### Copy File Range
Effiziente `copy_file_range` Operation für das Kopieren von Daten zwischen Dateien.

## Performance

Das In-Memory Dateisystem ist für Tests optimiert:
- Alle Operationen sind asynchron mit `process.nextTick()`
- Minimaler Overhead durch Map-basierte Datenstrukturen
- Effiziente Buffer-Operationen
- Keine persistente Speicherung (nur RAM)

## Erweiterung

Das System kann einfach erweitert werden:

1. **Neue FUSE-Operationen** hinzufügen in `MemoryFileSystem`
2. **Tests** für neue Operationen in `fuse-operations.test.js`
3. **Errno-Codes** nach POSIX-Standards implementieren
4. **Callback-Konventionen** gemäß AGENTS.md befolgen

## Kompatibilität

- **Node.js**: Getestet mit Node.js 14+
- **Jest**: Testsystem basiert auf Jest
- **FUSE**: Kompatibel mit fuse-native und FUSE3
- **POSIX**: Errno-Codes folgen POSIX-Standards

Dieses Testsystem bietet eine solide Grundlage für die Entwicklung und das Testen von FUSE-Dateisystemen in Node.js.