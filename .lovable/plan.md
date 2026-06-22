## Symptom (verifiziert auf Szene `70558eb9…9707a3`)

- Start 18:27:11. 11+ min später: `lip_sync_status='running'`, `twoshot_stage='syncso_fanout_0_of_4'`, `current_pass=0`, kein Audio-Mux.
- 4 Sync.so-Jobs erfolgreich dispatched (HTTP 201, job-IDs `2f42…`, `07bc…`, `272d…`, `9ea2…`).
- `sync-so-webhook`-Logs: jeder Job wird mit `ORPHAN (not in passes[] count=0) — releasing inflight slot + best-effort provider cancel` verworfen.
- DB-Check: `dialog_shots->'passes'` ist **`NULL`**.
- **Neue User-Beobachtung:** Alle 4 sichtbaren Single-Clips zeigen immer denselben Charakter (Samuel). Passt zur DB: `segments` enthält nur 1 Turn (Samuel, 0–2.32 s, `speakerIdx=0`), aber `total_passes=4` (force_multipass). Mit leerem `passes[]` kann der Dispatcher die Face-Box-Rotation nicht persistieren — alle 4 Passes laufen gegen Slot 0 statt 0/1/2/3 zu rotieren. **Symptom desselben Root-Cause-Bugs**, kein zweiter Defekt.

## Root Cause

Die Postgres-RPC `public.update_dialog_pass_slot(scene_id, pass_idx, patch)` (v168 per-slot-write) ist ein **stilles No-Op**, wenn `dialog_shots.passes` noch nicht existiert:

```sql
SELECT jsonb_set('{}'::jsonb, ARRAY['passes','0'], '{"a":1}'::jsonb, true);
-- → '{}'   (kein Effekt!)
```

Postgres-Verhalten: `jsonb_set` mit Pfad `[array_key, numeric_index]` legt das fehlende Zwischenelement nicht als Array an und gibt das Original unverändert zurück — ohne Fehler. Konsequenz:

1. Dispatcher startet 4 parallele Fan-Out-Passes (lock-protected).
2. Jeder ruft `update_dialog_pass_slot(scene, pass_idx, slot_patch)` → **No-Op**.
3. Direkt danach läuft `update_dialog_shots_root_merge(scene, rootOnly)` (strippt `passes` defensiv) → Root bekommt `sync_job_id`, `total_passes`, etc., aber `passes` bleibt `NULL`.
4. Sync.so liefert ~90 s später per Webhook ab; Webhook prüft `Array.isArray(dialog_shots.passes)` → `false` → klassifiziert den Job als `ORPHAN`, gibt den `syncso_inflight_jobs`-Slot frei, cancelt provider-seitig.
5. `current_pass` bleibt bei 0 → `render-sync-segments-audio-mux` triggert nie (wartet auf `passes.every(done)`).
6. Pro Pass fehlt der persistierte Face-Slot-Index → alle 4 Passes targeten die identische Bbox (`slot 0` = Samuel) statt 0/1/2/3 zu rotieren.
7. UI bleibt auf "Startzustand" weil `passes[]` leer ist (siehe `SceneInlinePlayer.tsx`).

**Warum es früher lief:** vor dem v168-Refactor schrieb der Dispatcher in einem Full-Row-Update `passes: [pass0, pass1, …]` als komplettes Array. Mit dem Switch auf den atomaren Per-Slot-Pfad fehlt jetzt die Initial-Seed-Logik.

## Fix — eine Migration, ~12 Zeilen SQL

`update_dialog_pass_slot` so anpassen, dass sie `passes` **deterministisch als Array initialisiert**, bevor sie den Slot setzt:

```sql
CREATE OR REPLACE FUNCTION public.update_dialog_pass_slot(
  _scene_id uuid, _pass_idx integer, _patch jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _new_shots jsonb;
BEGIN
  UPDATE public.composer_scenes
  SET dialog_shots = jsonb_set(
        -- Stage 1: ensure dialog_shots.passes is a JSON array
        jsonb_set(
          COALESCE(dialog_shots, '{}'::jsonb),
          ARRAY['passes'],
          CASE
            WHEN jsonb_typeof(dialog_shots->'passes') = 'array'
              THEN dialog_shots->'passes'
            ELSE '[]'::jsonb
          END,
          true
        ),
        -- Stage 2: write/merge the slot atomically
        ARRAY['passes', _pass_idx::text],
        COALESCE(dialog_shots->'passes'->_pass_idx, '{}'::jsonb) || _patch,
        true
      ),
      updated_at = now()
  WHERE id = _scene_id
  RETURNING dialog_shots INTO _new_shots;
  RETURN _new_shots;
END;
$$;
```

Verifikation nach Approval:

```sql
SELECT jsonb_set(jsonb_set('{}'::jsonb,'{passes}','[]'::jsonb,true),
                 ARRAY['passes','0'],'{"a":1}'::jsonb,true);
-- → {"passes": [{"a": 1}]}   ✓ Array
```

## Recovery der hängenden Szene (einmalig nach Migration)

Szene `70558eb9…9707a3` über die vorhandene Composer-UI sauber neu starten (`useResetLipSync.reset(sceneId)`). Die 4 alten Sync.so-Jobs sind bereits orphaned/cancelled; Credits unverändert reserviert; kein zusätzlicher Code nötig.

## Out of Scope

- Edge Functions (`compose-dialog-segments`, `sync-so-webhook`, watchdogs) bleiben unverändert.
- `update_dialog_shots_root_merge` ist korrekt — wird nicht angefasst.
- Kein UI-/Frontend-Diff.
- Kein Memory-Update.

Aufwand: ~5 Minuten, 1 Migration, 0 Code-Edits.