# Cinematic-Sync Dialog Pipeline — v9 Artlist Parity (implementiert)

## Was war kaputt
`poll-dialog-shots` hat trotz isolierter Sprecher-Audios **VIDEO-Chaining** gemacht (Turn 1 auf Output von Turn 0, Turn 2 auf Output von Turn 1) und am Ende einfach den letzten Sync.so-Output als finalen Clip gesetzt. Dadurch hat jeder spätere Sync.so-Pass die Lippen von früheren Sprechern mit fremdem Audio re-animiert → Charakter 2 hat den ersten Satz von Charakter 1 „gesprochen", dritter Satz landete beim falschen Sprecher.

## Was Artlist macht — und was jetzt auch hier passiert
1. Master-Voiceover bleibt unveränderlich.
2. Jeder Sprecher-Turn = ein isolierter Sync.so-Pass auf der **originalen** Master-Plate, mit nur seiner eigenen Stimme.
3. Deterministischer Stitch in Lambda: pro Turn-Fenster wird der passende Sync.so-Output über die Master-Plate gelegt; Master-WAV ist die einzige Audiospur.
4. Reihenfolge stammt aus unserer Timeline, nicht aus Provider-Verkettung.

## Code-Änderungen
- `supabase/functions/poll-dialog-shots/index.ts`
  - Chaining entfernt → jeder Turn nutzt `state.source_clip_url` (Original-Master).
  - Parallele Dispatches (bis `MAX_NEW_SYNC_JOBS_PER_SCENE_PER_TICK`), Concurrency-Limit beibehalten.
  - `render_window` (Lead-in 0.18s / Tail 0.12s) pro Shot persistiert → identisch in Sync.so-`segments_secs` und Stitch-Overlay.
  - „Letzter Output = final clip"-Fallback gelöscht. `allReady` → ruft `render-dialog-stitch` und wartet auf `remotion-webhook`.
  - Idempotenz via `dialog_shots.stitch.render_id`; Refund nur bei terminal failed.
- `supabase/functions/render-dialog-stitch/index.ts` → übergibt `render_window` (Fallback: `window`) an die Composition.
- `mem/features/video-composer/dialog-shot-pipeline` → komplette Doku auf v9 aktualisiert.

## AWS-Resilienz
Falls AWS/Lambda temporär nicht verfügbar:
- Alle `ready` Shots bleiben persistiert.
- `lip_sync_status = stitching`, **kein** falscher Endclip, **kein** Refund.
- Cron-Tick retried `render-dialog-stitch` automatisch.

## Erwartetes Ergebnis
- Samuel spricht nur Samuel-Sätze, Matthew nur seinen Satz.
- Keine Lippenüberlagerung zwischen Turns.
- Master-Audio im finalen Clip = exakt das Preview-Audio.
- User muss eine betroffene Szene 1× neu rendern (alter `dialog_shots`-State enthält keine `render_window`-Werte; ist abwärtskompatibel, profitiert aber von Reset).
