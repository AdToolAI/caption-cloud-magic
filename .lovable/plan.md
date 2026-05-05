## Problem

Im Screenshot sind 7 frame-genaue Szenen sichtbar (0:00–0:13, 0:13–0:15, 0:15–0:16, …) — das ist die korrekte Composer-EDL. Trotzdem wird der violette **„Auto-Cut (KI-Analyse)"**-Button angezeigt, statt der goldenen **„Composer EDL gesperrt"**-Badge. Beim Klick läuft PySceneDetect über das gestitchte MP4 und überschreibt die korrekten 7 EDL-Szenen mit 5 falsch verteilten Detector-Szenen.

Ursache:
1. **Composer-Erkennung beim Library-Import unzuverlässig.** `VideoImportStep.handleLibrarySelect` versucht `render_id` aus `video.render_id` / `metadata.render_id`, sonst Lookup per `video_url`. Bei älteren Library-Rows fehlt beides bzw. die `video_url`-Spalte matcht nicht 1:1 mit dem signed `output_url`. → `composerProjectId` bleibt `null`, der Lock greift nie, der Auto-Cut-Button bleibt sichtbar.
2. **Auto-Cut ist im Editor selbst nicht gegen vorhandene EDL-Szenen geschützt.** Selbst wenn der Lock fehlt, sollte ein Klick auf Auto-Cut die korrekten 7 Szenen nicht stillschweigend zerstören.
3. **PySceneDetect-Fusion verwirft 0:13s, 0:15s … vor.** Schwellen für `min_scene_len = 8 frames` (~0.27s) und Dedup-Fenster `0.6s` löschen die kurzen 0.84s/1.17s-Szenen, die in der EDL existieren. Daher „nur 5 statt 7".

## Fix-Plan

### 1. Robusteste Composer-Erkennung beim Import (`VideoImportStep.tsx` + Helper)

Neuen Helper `resolveComposerLink(video, metadata)` einführen, der die Erkennung in **vier** Stufen versucht und beim ersten Treffer abbricht:

1. `video.render_id` → `video_renders` (heute schon vorhanden)
2. `metadata.composer_project_id` / `metadata.project_id` direkt → `composer_projects` Existenzcheck
3. Lookup per `output_url` gegen `video_renders.video_url` **und** zusätzlich gegen `composer_projects.final_video_url` (heutiger Code prüft nur `video_renders.video_url`)
4. Fuzzy-Lookup per `metadata.title` + `composer_projects.title` der letzten 30 Tage des Users

Bei Treffer immer `composerProjectId` und (falls verfügbar) `composerRenderId` setzen. Damit wird der bereits existierende `useEffect`-Pfad in `DirectorsCut.tsx` aktiviert, der die EDL frame-genau lädt und `composerLock.active = true` setzt.

### 2. Hard-Lock im Editor unabhängig vom Import-Pfad (`DirectorsCut.tsx`)

`composerLockSource` und `onStartAnalysis` aktuell nur abhängig von `composerSourceProjectId`. Stattdessen:

- `composerLockSource` aus **`composerLock.active`** ableiten (nicht mehr aus `composerSourceProjectId`).
- `onStartAnalysis` ist `undefined`, sobald **eine** der drei Bedingungen wahr ist:
  - `composerLock.active === true`
  - `composerSourceProjectId !== null`
  - `aiCutMarkers.length > 0 && scenes.length >= 3` mit allen Szenen-Markern aus `source: 'auto'` der EDL (Heuristik für „bereits importierte EDL")

Damit bleibt der Auto-Cut-Button auch dann ausgeblendet, wenn die Composer-Erkennung erst spät (z.B. nach Probe) greift.

### 3. Zerstörungsfreier Auto-Cut als Sicherheitsnetz (`handleStartAnalysis`)

Falls der Button doch einmal sichtbar ist und die Szenen stammen aus EDL (Marker-Source `auto` + `composerLock.source` gesetzt **oder** `scenes.length >= 3` mit präzisen, nicht-runden `end_time`-Werten), öffnen wir vor dem PySceneDetect-Run einen `confirm()`-Dialog:

> „Dieses Video hat bereits frame-genaue Szenen aus dem Composer. Auto-Cut würde sie überschreiben. Trotzdem fortfahren?"

Bei „Nein" Abbruch ohne Statusänderung. Bei „Ja" wird zusätzlich ein **Snapshot der alten Szenen** in `lastEdlBackupRef` gespeichert und ein „Rückgängig"-Toast angezeigt, der die EDL wiederherstellt.

### 4. PySceneDetect feinjustieren (`detect-scenes-pyscenedetect/index.ts` + Fusion in `DirectorsCut.tsx`)

- `min_scene_len`: **8 → 4 Frames** (~0.13s) für beide Detector-Runs, damit kurze Composer-Szenen (0.84s / 1.17s) nicht herausfallen.
- `adaptive_threshold`: Adaptive-Run **1.5 → 1.2**, Content-like-Run **1.0 → 0.8**, um weichere Crossfades verlässlicher zu erkennen.
- Fusions-Dedup-Fenster in `DirectorsCut.tsx` (`fuseBoundaries`): **0.6s → 0.25s**, damit eng beieinander liegende Composer-Cuts nicht zusammenfallen.
- Filter `t > 0.3 && t < dur - 0.3` → `t > 0.1 && t < dur - 0.1`, damit Szenen direkt nach dem Start nicht verloren gehen.

### 5. Diagnose-Logging im Toast

Wenn Auto-Cut tatsächlich läuft, im Toast die Detector-Counts zeigen („Adaptive: 6 · Content: 7 · Pixel: 5 → 7 fusioniert"), damit man die Qualität sofort beurteilen kann.

## Erwartetes Verhalten danach

- Composer-Renders aus der Mediathek erkennen den Lock zuverlässig — Auto-Cut-Button verschwindet, EDL-Badge erscheint.
- Sollte ein Edge-Case den Lock dennoch verfehlen, fragt Auto-Cut explizit nach und ist umkehrbar.
- Auto-Cut auf Nicht-Composer-Videos liefert spürbar mehr und genauere Szenen (auch < 1s) statt 5 grobe Buckets.

## Geänderte Dateien

- `src/components/directors-cut/steps/VideoImportStep.tsx` (Composer-Lookup mit 4 Stufen)
- `src/lib/directors-cut/composer-edl.ts` (Helper `resolveComposerLink`, falls dort gebündelt)
- `src/pages/DirectorsCut/DirectorsCut.tsx` (Lock-Logik, Confirm-Dialog, Backup/Undo, Fusionsschwellen, Toast-Diagnose)
- `supabase/functions/detect-scenes-pyscenedetect/index.ts` (Detector-Schwellen)

Soll ich das umsetzen?
