

## Problem

Die `CloudStorageConnect`-Komponente (Google Drive verbinden) wird aktuell nur in den Account-Einstellungen unter "Verbindungen" angezeigt. Im Cloud-Tab der Mediathek fehlt sie komplett — dort sieht man nur die leere Dateiliste mit dem Upload-Button.

## Lösung

Wenn der Cloud-Tab aktiv ist und **keine** Google Drive-Verbindung besteht, wird die `CloudStorageConnect`-Komponente direkt im Cloud-Tab der Mediathek angezeigt (statt der leeren Liste). Sobald verbunden, erscheint die normale Cloud-Dateiliste.

## Änderungen

**`src/pages/MediaLibrary.tsx`**
- Import von `CloudStorageConnect` hinzufügen
- Im Render-Bereich: Wenn `categoryFilter === 'cloud'` und `!cloudConnection`, die `CloudStorageConnect`-Komponente anstelle der leeren Medienliste rendern
- Die bestehende Logik (Cloud-Dateien anzeigen wenn verbunden) bleibt unverändert

Das ist eine einzige, kleine Änderung — ca. 5-8 Zeilen Code.

