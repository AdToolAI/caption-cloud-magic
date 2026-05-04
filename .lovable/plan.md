## Was ich beobachte

Im Screenshot zeigt das Director's Cut Studio 6 Szenen mit Titeln wie *"Drohnenflug über verschneite Berge", "Nahaufnahme eines schneebedeckten Baumes"* — das Video selbst ist aber ein Mann im Maisfeld (~29s lang). Die Szenenbeschreibungen passen also gar nicht zum Video. Außerdem sind die Timings (13s + 2s + 1.17s + …) typisch für eine AI-Auto-Cut-Analyse, **nicht** für die deterministische Composer-Geometrie.

## Verifizierte Ursachen im Code

In `src/pages/DirectorsCut/DirectorsCut.tsx`:

1. **Composer-Handoff-Link in `RenderPipelinePanel.tsx`** (Zeile 79–82) übergibt nur `source_video=…&project_id=…&source=composer`, aber **nur wenn `projectId` existiert**. Wenn das Composer-Projekt noch nicht persistiert ist (oder die ID anders heißt), fehlt `source=composer` und der Handoff-Pfad wird gar nicht aktiviert → es greift entweder ein alter Draft (Zeile 168–194) oder der User klickt anschließend auf „Auto-Cut" und Gemini halluziniert Beschreibungen, die nichts mit dem aktuellen Video zu tun haben.

2. **Composer-Handoff selbst ist still-fehlertolerant** (Zeile 354–447): Wenn `composer_scenes` leer ist *oder* der Fetch failt (RLS, Race Condition direkt nach Render), wird nur ein `console.warn` geloggt und der User landet ohne Szenen im Editor. Sobald er „Auto-Cut" drückt, kommen die Phantom-Szenen.

3. **Draft-Restore bei SPA-Navigation** (Zeile 167–194): Wenn der User per Browser-Back/Forward kommt **ohne** `?source=composer`, werden Szenen aus einem alten Projekt 1:1 wiederhergestellt — auch wenn das `selectedVideo` ein anderes ist. Das kann genau das Symptom „Drohnenflug-Szenen über Mais-Video" erzeugen, wenn vorher ein Drohnen-Projekt offen war.

4. **Race Condition im Composer-Import**: `clip_url` ist bei manchen Szenen erst nach dem Stitch verfügbar (siehe DB-Stichprobe: Projekt `ce846cc8…` hat 5 Szenen ohne `clip_url`). `probeMediaDuration` failt dann, fällt auf `duration_seconds`-Default zurück → Timeline-Geometrie weicht von der echten ab, Szenen rasten an falschen Stellen ein.

## Fix-Plan

### A. Composer-Handoff härten (`RenderPipelinePanel.tsx`)
- `openInDirectorsCut` **immer** mit `&source=composer&project_id=…` übergeben. Falls `projectId` fehlt → erst `ensureProjectPersisted()` aufrufen, dann navigieren. Niemals ohne Marker zur DC navigieren, sonst greift der Auto-Cut-Pfad.

### B. Draft-Schutz gegen falsches Video (`DirectorsCut.tsx`)
- In der Draft-Restore-Logik (Zeile 161–195) zusätzlich prüfen: `draft.selectedVideo?.url === currentSelectedVideo?.url` **oder** `draft.selectedVideo?.id === sourceProjectId`. Wenn die URL/ID nicht matcht → Draft verwerfen statt blind Szenen zu übernehmen. Das verhindert, dass Drohnen-Szenen über einem Mais-Video auftauchen.

### C. Composer-Import sichtbar fehlerhaft machen
- Bei `composerScenes.length === 0` oder Fetch-Fehler: `toast.error("Composer-Szenen konnten nicht importiert werden — bitte erneut öffnen")` statt nur `console.warn`. So sieht der User den Fehler, statt nachher mit halluzinierten Auto-Cut-Szenen dazustehen.
- Zusätzlich: Wenn `composerSourceProjectId` gesetzt ist, **deaktiviere den Auto-Cut-Button**, solange der Import läuft, und blockiere ihn ganz, wenn der Import erfolgreich war (Composer-Geometrie ist autoritativ).

### D. Race-Condition bei `clip_url` schließen
- Im Composer-Import-Effect zuerst prüfen, ob **alle** Szenen ein `clip_url` (oder `upload_url`) haben. Wenn nicht: ein paar Sekunden warten + retry (max. 3×) bevor `probeMediaDuration` läuft. Andernfalls Default-Dauern nutzen, aber den User mit einem Toast informieren.

### E. Diagnose-Logging
- `console.info('[DirectorsCut] Composer handoff:', { projectId, scenesCount, totalDuration, measuredVideoDur })` einbauen, damit wir bei künftigen Reports auf einen Blick sehen, welcher Pfad gegriffen hat.

## Betroffene Dateien

- `src/components/video-composer/RenderPipelinePanel.tsx` — Handoff-URL immer mit Marker, projektpersistierung erzwingen.
- `src/pages/DirectorsCut/DirectorsCut.tsx` — Draft-Match-Check, sichtbare Fehler, Auto-Cut-Sperre während/nach Composer-Import, clip_url-Retry, Logging.

## Akzeptanzkriterien

1. „In Director's Cut öffnen" aus Motion Studio → die exakt im Composer angelegten Szenen erscheinen mit korrekten Timings (Render-Geometrie).
2. Kein Mismatch mehr zwischen Video-Inhalt und Szenenbeschreibungen.
3. Wenn der Composer-Import scheitert, sieht der User einen klaren Fehler-Toast — keine stillen Phantom-Szenen mehr.
4. Browser-Back lädt nur dann den Draft, wenn das Video wirklich dasselbe ist.
