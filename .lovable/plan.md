## Diagnose

Logs + DB-State zeigen, dass die Audio-Trennung jetzt sauber ist (Samuel/Matthew haben eigene isolierte WAVs, FaceMap erkennt links/rechts korrekt). Trotzdem ist das Ergebnis kaputt, weil `poll-dialog-shots` aktuell **VIDEO-Chaining** macht:

- Turn 0 (Samuel) → läuft auf Master-Plate
- Turn 1 (Matthew) → läuft auf Sync.so-Output von Turn 0
- Turn 2 (Samuel) → läuft auf Sync.so-Output von Turn 1
- Finaler Clip = einfach Output von Turn 2

Sync.so bekommt also bei Turn 1/2 ein Video, in dem schon Mundbewegungen drinstecken, und re-animiert/überschreibt sie teilweise. Genau dadurch:

- Charakter 2 „spricht" den ersten Satz von Charakter 1 (Mund aus Turn 0 wird in Turn 1 mit Matthew-Audio neu interpretiert).
- Der dritte Satz landet beim falschen Sprecher (Turn 2 überschreibt das Fenster von Turn 1 mit).
- Es entsteht Audio-Drift, weil jede Stufe re-encodet.

Artlist macht **nie** Chained-Provider-Stacking. Artlist macht:

1. Eine Master-Timeline.
2. Master-Voiceover ist unveränderlich.
3. Pro Sprecher-Turn ein isolierter Lipsync-Pass auf der **originalen** Master-Plate.
4. Ein deterministischer Stitch, der per Timeline-Fenster nur die Mundregion des richtigen Outputs einsetzt.
5. Single canonical audio remux am Ende.

## Ziel

Cinematic-Sync exakt auf diesen Artlist-Pfad umstellen.

## Plan

### 1. Chaining entfernen
`poll-dialog-shots` darf bei der Sync.so-Dispatch nicht mehr `prev.output_url` als `chainedSourceUrl` verwenden. Jeder Turn bekommt immer `state.source_clip_url` (Original-Hailuo-Master).

Damit kann Turn N nie mehr die Lippen von Turn N-1 verändern.

### 2. Parallele statt serielle Turns
Da Turns sich nicht mehr aufeinander aufbauen, können sie parallel an Sync.so geschickt werden (max 1 neuer Dispatch pro Tick bleibt für Creator-Plan-Limit). Reihenfolge spielt nicht mehr für Korrektheit eine Rolle, nur noch für Concurrency.

### 3. Finaler Schritt = Stitch, nicht „letzter Output"
Den Fallback `clip_url = last shot.output_url` entfernen. Stattdessen sobald `allReady`:

- `state.status = 'stitching'`
- `render-dialog-stitch` aufrufen (existiert bereits, nutzt `DialogStitchVideo` Remotion Composition)
- `remotion-webhook` schreibt finales `clip_url` zurück

Die Stitch-Composition macht genau Artlist-Style:
- Master-Video durchgehend
- Pro Turn ein `<Sequence>` mit dem zugehörigen Sync.so-Output, **getrimmt aufs Turn-Fenster**, geometrisch deckungsgleich
- Eine einzige Audiospur = Master-WAV

### 4. AWS-Resilienz
Falls AWS/Lambda temporär nicht verfügbar:

- `dialog_shots` mit allen `ready` Outputs bleibt persistiert.
- `lip_sync_status = 'stitching'`, kein Refund.
- Auto-Retry über Watchdog/Polling, sobald AWS wieder antwortet.
- Kein „kaputter Provider-Output als final" mehr — User sieht entweder den korrekten Stitch oder einen klaren Wartezustand.

### 5. Stitch-Window leicht erweitern
Im Stitch werden statt der nackten `window`-Werte die gleichen leicht expandierten Fenster (Lead-in/Tail wie in Sync.so-Dispatch) verwendet, damit Schnittkanten nicht den Wortanfang/das Wortende des Mundes abschneiden. Diese Werte werden pro Shot als `render_window` in `dialog_shots` mitgespeichert.

### 6. Idempotenz & Refund
- Stitch-Dispatch bleibt idempotent über `dialog_shots.stitch.render_id`.
- Refund nur bei terminal failed (≥1 Shot definitiv failed nach Retry, oder Stitch-Render-Lambda definitiv failed).
- Solange Shots `pending`/`lipsyncing` oder Stitch `pending`/`rendering` ist: kein Refund, kein „final = letzter Output".

### 7. Doku aktualisieren
`mem://features/video-composer/dialog-shot-pipeline` und `.lovable/plan.md` werden auf den neuen Pfad gesetzt (per-turn auf Original-Master, Lambda-Stitch ist Pflichtschritt, kein Video-Chaining mehr).

## Geänderte Dateien

- `supabase/functions/poll-dialog-shots/index.ts` — Chaining raus, parallele Dispatches, Stitch-Trigger statt Last-Output-Fallback, `render_window` persistieren.
- `supabase/functions/render-dialog-stitch/index.ts` — `render_window` priorisieren, sonst `window`.
- `src/remotion/templates/DialogStitchVideo.tsx` — nutzt `render_window` falls vorhanden.
- `mem://features/video-composer/dialog-shot-pipeline` — aktualisiert auf Artlist-Pfad.
- `.lovable/plan.md` — finaler Statusbericht.

## Erwartetes Ergebnis

- Samuel spricht nur seine Sätze, Matthew nur seinen Satz.
- Keine Lippenüberlagerung zwischen Turns.
- Reihenfolge stammt aus unserer Timeline, nicht aus Provider-Verkettung.
- Master-Audio im finalen Clip = exakt das, was du im Preview hörst.
- AWS-Ausfall führt zu sauberem Wartezustand statt falschem Endclip.