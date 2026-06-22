## Symptom

Bei 4 Sprechern wird **nur 1 Lip-Sync-Pass** erstellt. UI zeigt `1/1 Clips`, Szene endet nach ~6 min mit `lip_sync_status=done`, obwohl `total_passes=4`.

DB-Beleg (latest scene `37685723…`):
```
n_passes=1, current_pass=0, total_passes=4, lip_sync_status=done
```

## Root Cause

Die gestrige Migration `update_dialog_pass_slot` initialisiert `passes` zwar als leeres Array, aber `jsonb_set(arr, '{N}', x, true)` mit out-of-bounds positivem Index **hängt am Ende an statt zu padden** (PostgreSQL-Doku: "the new value is added at the end of the array if the index is positive").

Plan-D Fanout dispatched Pass 0..3 parallel:
1. Pass 0 schreibt zuerst → `passes = [p0]` ✓
2. Pass 2 läuft als nächstes → `jsonb_set([p0], '{2}', p2, true)` → `[p0, p2]` (p2 landet auf Index 1, nicht 2!)
3. Pass 1/3 überschreiben sich gegenseitig, Endzustand chaotisch.

Wenn der Webhook dann `passes[1].sync_job_id` mit dem zurückkommenden Job vergleicht, matched nichts → alle weiteren Passes werden als ORPHAN klassifiziert. Sichtbar bleibt nur Pass 0.

Zusätzlich: ohne `FOR UPDATE` Row-Lock kann zwischen Read und Write von parallelen Calls ein Lost-Update entstehen.

## Fix

Eine zweite, finale Migration auf `update_dialog_pass_slot`:

1. Explizites `SELECT … FOR UPDATE` zum serialisieren paralleler Writer.
2. **Padding-Loop**: Array mit `{}` auffüllen bis `length > _pass_idx`, BEVOR der Slot geschrieben wird.
3. Anschließend Slot-Merge via `jsonb_set(arr, [idx], (arr->idx) || _patch, true)`.

### SQL (vereinfacht)

```sql
CREATE OR REPLACE FUNCTION public.update_dialog_pass_slot(
  _scene_id uuid, _pass_idx integer, _patch jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _ds jsonb;
  _arr jsonb;
  _new_shots jsonb;
BEGIN
  -- Row-lock serialisiert parallele Pass-Dispatcher
  SELECT COALESCE(dialog_shots, '{}'::jsonb) INTO _ds
  FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;

  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array'
               THEN _ds->'passes' ELSE '[]'::jsonb END;

  -- Pad mit {} bis Index existiert (verhindert append-to-end Bug)
  WHILE jsonb_array_length(_arr) <= _pass_idx LOOP
    _arr := _arr || '[{}]'::jsonb;
  END LOOP;

  _arr := jsonb_set(_arr, ARRAY[_pass_idx::text],
                    (_arr->_pass_idx) || _patch, true);
  _ds  := jsonb_set(_ds, ARRAY['passes'], _arr, true);

  UPDATE public.composer_scenes
  SET dialog_shots = _ds, updated_at = now()
  WHERE id = _scene_id
  RETURNING dialog_shots INTO _new_shots;

  RETURN _new_shots;
END;
$$;
```

## Verification

Nach Migration:
1. Neue 4-Sprecher-Szene in Composer starten.
2. Erwartung: nach ~30s zeigt UI `1/4 → 2/4 → 3/4 → 4/4 Clips`, DB `n_passes=4` aufgebaut über Zeit (parallel).
3. Alle 4 Sync.so-Jobs landen in passes[0..3] mit unterschiedlichen `speaker_idx`.
4. Webhook ORPHAN-Quote = 0.

Kein Frontend-, Edge-Function- oder Memory-Change nötig — nur eine SQL-Migration auf die bestehende RPC.

## Out of Scope

- `compose-dialog-segments` (unverändert, ruft RPC korrekt mit `_pass_idx`).
- `sync-so-webhook`, `lipsync-watchdog`, `render-sync-segments-audio-mux`.
- Hängende Szene `70558eb9…` → bleibt failed, User muss "Sauber neu starten" auf einer neuen Szene drücken zum Verifizieren.
