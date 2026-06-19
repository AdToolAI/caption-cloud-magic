# Plan v131.5 — auto_detect:true zuverlässig an Sync.so durchreichen

## Problem (Forensik aus `syncso_dispatch_log`)
Letzter Dispatch (scene `83145f34…`, 17:21:52) zeigt trotz v131.4-Edits:
- `v102_probe.asd_mode = v130_preclip_coord_strict` (nicht `v131_4_single_face_auto_forced`)
- `payload.options.active_speaker_detection = { auto_detect:false, coordinates:[360,363], frame_number:2 }`
- `coords` / `frame_number` Spalten = `[360,363]` / `2`
- `sync_status = FAILED`

→ Der v131.4-Override greift im Live-Pfad **nicht**. Drei plausible Ursachen, die wir gleichzeitig schließen.

## Änderungen

### 1. Hard Re-Deploy + Versions-Pin
- `COMPOSE_DIALOG_SEGMENTS_VERSION = "v131.5"` als Konstante in `compose-dialog-segments/index.ts`.
- In jeden `syncso_dispatch_log`-Insert: `meta.compose_version = v131.5` schreiben — damit wir in einer SQL-Abfrage sofort sehen, welcher Build dispatched hat.

### 2. Override-Härtung (Reihenfolge + Coord-Nulling)
In `compose-dialog-segments/index.ts`:
- Den v131.4-Block (`retryVariant === "coords-pro"` + clean preclip → `auto_detect:true`) **vor** `_v102_probe`-Logging und vor dem Payload-Bau ausführen.
- Synchron `pass.coords = null`, `clampedAsdFrame = null`, `v1291.reason = null`, `v1291.coord_space = "none"` setzen, damit weder Telemetrie noch Payload alte `[360,363]`/`2`-Werte führen.
- Neuer Diag-Flag `v131_5_dispatch_path_safety_override = true`.
- Asserts vor `fetch` zu sync.so: wenn `asd.auto_detect === true` → werfen, falls `coordinates` oder `frame_number` im Payload-Objekt existieren.

### 3. Audit aller Dispatch-Pfade
Identische Rule-0-Logik (coords-pro + single-face clean preclip → `auto_detect:true`, coords/frame_number raus) in:
- `supabase/functions/lipsync-watchdog/index.ts`
- `supabase/functions/syncso-replay/index.ts`
- `supabase/functions/syncso-preflight/index.ts`

→ stellt sicher, dass kein Retry-/Replay-/Watchdog-Pfad den alten Strict-Payload re-dispatched.

### 4. Test + Doku
- Neuer Unit-Test in `_shared/asd-strategy.test.ts`: `coords-pro` + clean preclip → Payload enthält **kein** `coordinates`/`frame_number`.
- Memory-Update: `mem/architecture/lipsync/v131-5-force-redeploy-and-coord-nulling.md` + Index-Eintrag.

## Verifikation
Nach Deploy + „Sauber neu starten":
```sql
select meta->>'compose_version', v102_probe->>'asd_mode',
       payload_summary->'options'->'active_speaker_detection',
       coords, frame_number, sync_status
from syncso_dispatch_log
order by created_at desc limit 5;
```
Erwartung: `compose_version=v131.5`, `asd_mode=v131_4_single_face_auto_forced`, `asd={auto_detect:true}` (ohne coords/frame), `coords=NULL`, `frame_number=NULL`, `sync_status=DISPATCHED → COMPLETED`.

## Files
- edit: `supabase/functions/compose-dialog-segments/index.ts`
- edit: `supabase/functions/lipsync-watchdog/index.ts`
- edit: `supabase/functions/syncso-replay/index.ts`
- edit: `supabase/functions/syncso-preflight/index.ts`
- edit: `supabase/functions/_shared/asd-strategy.test.ts`
- create: `mem/architecture/lipsync/v131-5-force-redeploy-and-coord-nulling.md`
- edit: `mem/index.md`

Keine Schema-Änderungen.
