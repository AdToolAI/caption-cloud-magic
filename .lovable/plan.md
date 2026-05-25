## Problem

Die User-Mediathek enthält 500/500 Videos (Limit erreicht). Aktuell rendert `src/pages/MediaLibrary.tsx` im Tab „Alle" **alle gefilterten Videos auf einmal** — pro Karte ein echtes `<video preload="metadata">`-Element plus eigener `TooltipProvider` mit 7+ Tooltips. Bei 500 Videos heißt das:

- 500 parallele Video-Metadaten-Requests an den CDN beim Tab-Wechsel → Netzwerk/Decoder-Stau, Browser friert ein.
- ~3.500 Tooltip-Portale im DOM → React + Radix werden träge.
- Jeder Realtime-Event (`media_assets`, `content_items`, `video_creations`) ruft das komplette `loadMedia()` neu auf und re-rendert die ganze Liste.

Das deckt sich mit „reagiert sehr langsam und hat sich aufgehängt".

## Lösung (nur Frontend, Mediathek-Seite)

### 1. Pagination / „Mehr laden" für das Grid

In `src/pages/MediaLibrary.tsx`:

- Neue State-Variable `visibleCount` (Start: **60**).
- Im Grid statt `filteredMedia.map(...)` nur `filteredMedia.slice(0, visibleCount).map(...)`.
- Unter dem Grid Button **„Mehr laden (X von Y)"**, der `visibleCount += 60` setzt.
- `visibleCount` bei jeder Filter-/Tab-/Such-Änderung auf 60 zurücksetzen (im bestehenden `applyFilters`-Effect).

### 2. Lazy Video-Thumbnails

Neuer kleiner Wrapper `LazyVideoThumb` (inline in der Datei oder als `src/components/media-library/LazyVideoThumb.tsx`):

- Standard: leeres `<div>` mit Play-Icon + grauem Hintergrund (kein Netzwerk-Request).
- `IntersectionObserver`: erst beim Sichtbarwerden ein `<video preload="metadata" muted playsInline>` mounten, das nur den ersten Frame zieht (Poster).
- Auf Hover/Click → Modal-Player (vorhandenes `selectedVideo`-Modal weiterverwenden).

Damit lädt der Browser maximal die ~12 sichtbaren Karten statt 500.

### 3. Ein einzelner TooltipProvider

`<TooltipProvider>` einmal um die gesamte Seite legen (im Return ganz außen), nicht pro Karte. Spart ~500 Provider-Instanzen.

### 4. Realtime entschärfen

- `loadMedia()` mit einem 800 ms-Debounce wrappen (kleiner `useRef`-Timer), damit Bursts von Realtime-Events (z. B. Auto-Cleanup, der mehrere Rows löscht) nicht 5× hintereinander komplett neu laden.
- Toast „🎉 Neue Medien hinzugefügt!" nur bei `INSERT` mit `source IN ('ai','ai_generator','campaign')` zeigen, nicht bei jedem Update.

### 5. Memoization

- `getSourceBadge` und `getFileIcon` als `useCallback` / `useMemo`-Map.
- Karte als kleine `React.memo`-Komponente `MediaCard` extrahieren (in derselben Datei), damit Re-Renders durch Selection-Checkbox nicht das ganze Grid neu zeichnen.

## Nicht im Scope

- Keine DB-Migrationen, kein Backend-Change.
- Albums-/Cloud-Tab bleibt unverändert (haben eigene Komponenten).
- Echte Virtualisierung (react-window) bewusst weggelassen — Pagination + Lazy-Videos lösen das Problem ohne neue Dependency.

## Erwartetes Ergebnis

- Initialer Mediathek-Aufruf rendert 60 Karten ohne aktive Videos → flüssig.
- Scroll/„Mehr laden" lädt Video-Frames nur für sichtbare Karten.
- Realtime-Updates lösen keine Render-Stürme mehr aus.
