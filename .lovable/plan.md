# Plan: Originalvideo-Szenen korrekt erkennen statt Blackscreen

## Problem

Im Screenshot ist Szene 1 als **"Neue Szene (Blackscreen)"** markiert und liegt über 0:00–0:25.77. Dadurch wird das Originalvideo durch eine schwarze Fläche ersetzt, statt durchgereicht zu werden. Die angehängte 5s-Szene am Ende läuft technisch zwar, aber der gesamte Anfang ist schwarz.

Ursache: Der Auto-Cut bzw. das manuelle Anlegen einer Szene erzeugt aktuell `isBlackscreen: true` ohne `additionalMedia`. Der Player interpretiert das korrekt als „schwarzes Overlay", was hier aber unerwünscht ist.

## Ziele

1. **Sofort-Fix:** Über den Original-Video-Bereich liegende Szenen dürfen das Originalvideo nicht versehentlich verdecken.
2. **Komfort-Feature:** Per Klick automatisch Szenen aus dem Originalvideo anlegen (mit KI-Szenenwechsel-Erkennung), danach manuell trimmbar.

## Umsetzung

### 1. Neuer Szenentyp: „Original-Passthrough"

In `src/types/directors-cut.ts` (oder wo `SceneAnalysis` lebt) ein optionales Flag ergänzen:
```ts
sourceMode?: 'original' | 'blackscreen' | 'media';
```
- `original` = zeigt das darunterliegende Originalvideo, erlaubt aber Filter/Übergänge/Subtitles obendrauf.
- `blackscreen` = wie bisher (schwarz).
- `media` = wie bisher (`additionalMedia`).

### 2. Player-Anpassung (`CapCutPreviewPlayer.tsx`)

Logik in der Render-Branch ändern:
- `sourceMode === 'original'` (oder unset bei Szenen, deren Bereich innerhalb `videoDuration` liegt und kein `additionalMedia` haben) → Originalvideo durchreichen, Filter/Effekte anwenden.
- `sourceMode === 'blackscreen'` → schwarz (nur wenn explizit gewünscht).
- `additionalMedia` vorhanden → Replacement (wie heute).

### 3. Editor-Anpassungen (`CapCutEditor.tsx`)

- **`handleSceneAdd` („Leere Szene")**: Default ändern. Wenn der Einfügepunkt innerhalb `videoDuration` liegt → `sourceMode: 'original'`. Wenn dahinter → `sourceMode: 'blackscreen'` (wie heute, sinnvoll als Platzhalter).
- **Sidebar**: Dropdown am Szenen-Eintrag „Quelle: Original / Schwarz / Mediathek" zum nachträglichen Wechseln.
- **Bestehende Szenen migrieren**: Beim Laden alte `isBlackscreen: true`-Szenen, die innerhalb `videoDuration` liegen und kein `additionalMedia` haben, automatisch auf `sourceMode: 'original'` mappen. Damit verschwindet der Blackscreen im aktuellen Projekt sofort.

### 4. Neuer Button: „Szenen aus Video erkennen"

Im Schnitt-Tab neben „Auto-Cut (KI-Analyse)":

- Nutzt den bestehenden Auto-Cut-Flow (Gemini Scene Detection, bereits im Projekt vorhanden — siehe Memory „Server-Side Scene Analysis").
- Erzeugte Szenen bekommen automatisch `sourceMode: 'original'` und ihre `start_time`/`end_time` aus der KI-Analyse.
- User kann danach jede Szene per Drag/Input-Felder (sind im Screenshot bereits vorhanden: Start/End-Eingabe) manuell justieren — wie vom User gewünscht („so dass es passt").
- Toast nach Erkennung: „N Szenen erkannt — Start/End in der Sidebar feinjustieren."

### 5. UX-Detail

- Szenen-Karte in der Sidebar zeigt einen kleinen Badge: `Original` / `Schwarz` / `Mediathek` mit unterscheidbaren Farben (nicht nur das blaue „Blackscreen" wie heute).
- Bei `sourceMode: 'original'` greifen bestehende Filter/Color-Grades/Übergänge weiterhin — das war ja der ursprüngliche Use Case (eigene Übergänge über Originalmaterial legen).

## Betroffene Dateien

- `src/types/directors-cut.ts` — neues Feld `sourceMode`
- `src/components/directors-cut/studio/CapCutEditor.tsx` — Default-Logik, Migration, neuer Button, Sidebar-Dropdown
- `src/components/directors-cut/studio/CapCutPreviewPlayer.tsx` — Render-Branch um `sourceMode` erweitern
- ggf. `src/components/directors-cut/studio/SceneCard.tsx` (oder wo die Szenen-Liste gerendert wird) — Badge + Dropdown

## Ergebnis

- Aktuelles Projekt: Der Blackscreen am Anfang verschwindet automatisch (Migration), das Originalvideo läuft 0:00–0:25.77, danach nahtlos die 5s-Mediathek-Szene.
- Zukunft: User kann mit einem Klick KI-Szenen aus dem Originalvideo erzeugen und Start/End nachjustieren.

Soll ich diesen Plan so umsetzen?