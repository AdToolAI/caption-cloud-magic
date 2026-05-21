# Filmreifer Lip-Sync für Dialog-Szenen

## Was du erlebst
- Die fertige Szene wirkt nicht ganz „filmreif": der Mund sieht in der 2. Hälfte weicher/unscharf aus.
- Samuel (Sprecher 1) spricht in seinem **zweiten Satz** nicht richtig — sein Mund bewegt sich kaum, obwohl Audio läuft.

## Ursachen-Analyse (verifiziert in DB + Code)

Die aktuelle Pipeline (`compose-dialog-scene` + `poll-dialog-shots`) erzeugt **eine Sync.so-Pass pro Sprecher-TURN**, nicht pro Sprecher. Bei deinem Dialog (Samuel → Matthew → Samuel) heißt das:

```text
Pass 1: Hailuo-Master  → Sync.so Samuel [0.00–2.37s]  → video_v1
Pass 2: video_v1       → Sync.so Matthew [2.62–3.50s] → video_v2
Pass 3: video_v2       → Sync.so Samuel [3.75–6.49s]  → final clip_url
```

**Problem 1 — Re-Encode-Verlust (Filmreife):** Jeder Sync.so-Pass re-encodiert das gesamte Video. Nach 3 Passes ist die Mundregion 3× durch H.264-Kompression gelaufen → sichtbare Weichzeichnung, besonders in der 2. Hälfte.

**Problem 2 — Samuel-Turn-2 schwächelt:** Bei Pass 3 verarbeitet Sync.so ein bereits zweimal re-encodiertes Video. Samuels Gesicht bei Pixel `[936, 223]` hat durch die Vor-Passes minimal an Kantenschärfe verloren → die Lipsync-2-pro Face-VAD findet weniger Anker-Features → kaum sichtbare Mundbewegung im 2. Satz.

**Problem 3 — Doppelte Animation desselben Sprechers wird verschwendet:** Samuel wird in Pass 1 und Pass 3 getrennt animiert. Dabei kann Sync.so problemlos **mehrere disjunkte Fenster** pro Pass verarbeiten (`segments_secs=[[a,b],[c,d]]`) — das ist genau, was die alte Two-Shot-Policy (siehe Projekt-Memory „Lipsync Pro Policy") erfolgreich nutzt.

## Lösung: Per-Sprecher-Passes statt Per-Turn-Passes

Wir reduzieren auf **eine Pass pro distinct character**, mit allen Turns dieses Sprechers als Multi-Window:

```text
Pass 1: Hailuo-Master → Sync.so Samuel  segments=[[0,2.37],[3.75,6.49]] → video_v1
Pass 2: video_v1      → Sync.so Matthew segments=[[2.62,3.50]]          → final clip_url
```

Vorteile:
- **Nur 2 Re-Encodes** statt 3 → schärferer, „filmreifer" Look.
- **Samuel wird in EINEM Pass animiert** → beide Sätze haben dieselbe Bildqualität und konsistente Mundbewegung. Kein „2. Satz spricht nicht" mehr.
- Skaliert: bei N Sprechern = N Passes (nicht ∑ Turns). Bei 3 Sprechern mit 6 Turns: 3 statt 6 Passes.
- Entspricht der bewährten Two-Shot-Policy, die der Composer bereits für 2-Sprecher-Szenen nutzt.

## Zusätzliche Qualitäts-Verbesserungen

1. **Pre-Roll / Tail leicht hochziehen**: `SYNC_LEAD_IN_SEC` von 0.12s → 0.18s, `SYNC_TAIL_SEC` von 0.08s → 0.12s (weiterhin hart gecappt auf halben Gap zum Nachbar-Turn). Gibt Sync.sos VAD mehr Onset-Kontext, besonders bei kurzen Folgesätzen.

2. **Temperature-Mapping pro Sprecher** (statt pro Turn): Pro Character wird die kürzeste seiner Turn-Dauern verwendet. Samuel hat min-Turn=2.37s → `temperature=0.9`; Matthew hat min-Turn=0.88s → `temperature=1.0`. Verhindert dass Samuels lange Turns überanimieren.

3. **Dispatch-Reihenfolge deterministisch**: nach „erste Erscheinung" sortieren (Samuel zuerst, Matthew zweitens). Stabilität über Retries.

## Betroffene Dateien

- `supabase/functions/compose-dialog-scene/index.ts`
  - `dialog_shots.shots[]` wird neu aufgebaut: 1 Eintrag pro **Character**, mit Feldern `character_id`, `target_coords`, `windows: Array<[start,end]>` (statt einem einzelnen `startSec/endSec`), `temperature`, `status`.
  - Optionales Legacy-Feld `turns[]` bleibt im JSONB für UI-Anzeige (Heartbeat / Debug).

- `supabase/functions/poll-dialog-shots/index.ts`
  - `DialogTurnShot` → `DialogSpeakerShot` mit `windows: [number, number][]`.
  - `expandWindow()` → `expandWindows()` erweitert jedes Element des Arrays mit Lead-in/Tail, gecappt an Nachbar-Windows (eigene + fremde).
  - `startSyncTurnJob()` → `startSyncSpeakerJob()` schickt `segments_secs: expandedWindows` (mehrere Tupel).
  - Pipeline-Status-Logik bleibt: `pending → lipsyncing → ready` pro Speaker-Shot; nach letztem Speaker = final `clip_url`.
  - Konstanten: `SYNC_LEAD_IN_SEC=0.18`, `SYNC_TAIL_SEC=0.12`.

- **Keine DB-Migration nötig** — `dialog_shots` ist JSONB.

- **Frontend**: `useTwoShotAutoTrigger.ts` und die Heartbeat-Anzeige bleiben unverändert (sie lesen nur `lip_sync_status` + `clip_url`).

## Test-Pfad

1. Deploy `compose-dialog-scene` + `poll-dialog-shots`.
2. Aktuelle Szene `d1012134…` zurücksetzen (`clip_url=NULL`, `lip_sync_status=pending`, `twoshot_stage='master_clip'`, `audio_plan.twoshot.syncJobs=NULL`, `dialog_shots=NULL`).
3. `compose-dialog-scene` re-triggern — erwartet: 2 Speaker-Shots (Samuel mit 2 Windows, Matthew mit 1 Window), final clip nach ~2 Sync.so-Pass-Zyklen (≈4 min).
4. Visuelle Verifikation: Samuels 2. Satz hat jetzt klare Mundbewegung; Bild bleibt schärfer (1 Re-Encode statt 2 für Samuels Region).

## Rollback

Falls Sync.so mit Multi-Window pro Pass ein Edge-Problem zeigt: feature-flag `DIALOG_MULTI_WINDOW_PER_SPEAKER=false` lässt es auf per-turn zurückfallen. Standard = true.
