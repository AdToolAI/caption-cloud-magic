## Auto-FIFO bei Mediathek-Limit

Wenn ein User das Limit (500 Videos / 2.500 Bilder / 10 GB) erreicht, sollen die **ältesten Medien automatisch gelöscht** werden, statt den Upload zu blockieren — **außer** der User hat Google Drive verbunden, dann wird gewarnt + auf Cloud-Auslagerung verwiesen (kein Auto-Delete).

### Verhalten im Detail

**Ohne Cloud-Verbindung (`connection === null`):**
- Vor jedem Upload (Datei oder URL-Import) wird geprüft: würde das neue Medium ein Limit überschreiten?
- Falls ja: ältestes Medium des passenden Typs wird automatisch gelöscht (FIFO nach `createdAt`).
- Bei Storage-Limit (GB): es werden so viele älteste Videos gelöscht, bis genug Platz frei ist.
- Toast-Hinweis: "Ältestes Video wurde automatisch entfernt, um Platz zu schaffen."
- Demo-Video, AI-Generator-Bilder im Album-System und manuell in Alben einsortierte Medien sind **geschützt** und werden übersprungen.

**Mit Cloud-Verbindung:**
- Kein Auto-Delete. Stattdessen Toast: "Limit erreicht — älteste Medien sollten in Google Drive ausgelagert werden." mit Button "Jetzt auslagern" (öffnet Cloud-Auslagerungs-Dialog).
- Upload geht trotzdem durch, falls der User noch Quota hat; nur wenn das Hard-Limit erreicht wird, blockiert es wie bisher.

### Was wird gebaut

1. **Neue Helper-Datei** `src/lib/media-library/autoCleanup.ts`
   - `findOldestDeletable(media, type, count)` — sortiert nach createdAt asc, filtert Demo-Video & geschützte Items raus.
   - `deleteMediaItem(item)` — kapselt die bestehende Lösch-Logik (storage + entsprechende Tabelle: `media_assets`, `video_creations`, `content_items`).
   - `enforceLimits({ media, incoming, hasCloud })` — gibt zurück, ob Upload erlaubt ist und welche Items vorher gelöscht werden müssen.

2. **`src/pages/MediaLibrary.tsx`**
   - `handleUpload` (Zeile 478) und `handleImportFromUrl` (Zeile ~445) refactoren:
     - Statt sofortigem `return` bei Limit-Überschreitung → `enforceLimits` aufrufen.
     - Wenn `hasCloud === false`: alte Items löschen, Toast zeigen, Upload fortsetzen.
     - Wenn `hasCloud === true`: bestehender Block-Toast mit Auslagerungs-Button.
   - Lösch-Logik aus `handleDelete` (Zeile 566) wird in den neuen Helper extrahiert (DRY).

3. **UI-Hinweis im Header**
   - `src/components/media-library/MediaLibraryHeroHeader.tsx`: bestehenden Speicherlimit-Hinweis aktualisieren auf:
     "Bei Überschreitung werden automatisch die ältesten Medien gelöscht. Verbinde Google Drive, um Medien stattdessen sicher auszulagern."

### Technische Details

- **FIFO-Quelle**: `media`-State ist bereits aus allen Quellen (uploads, AI, video-creator, campaign) zusammengeführt → ein Sort nach `createdAt` ascending reicht.
- **Cloud-Items überspringen**: `source === 'cloud'` zählt nicht zum Limit und wird nie auto-gelöscht.
- **Geschützt**: `id === DEMO_VIDEO.id`, sowie alles aus dem System-Albums-Pfad (Brand Characters, Avatars).
- **Atomicity**: Löschungen laufen sequentiell vor dem Upload; bei Fehler wird der Upload abgebrochen und der User bekommt einen klaren Fehler-Toast.
- **Reload**: nach Cleanup + Upload → ein einziges `loadMedia()` + `loadStorageQuota()` am Ende.

### Out of Scope

- Kein nightly Cron-Job. FIFO triggert nur bei tatsächlichem Upload — das ist deterministisch und vom User kontrollierbar.
- Kein Soft-Delete / Trash. Wer Backups will, soll Google Drive verbinden (existiert bereits).
