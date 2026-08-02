## Ursache — belegt aus dem Log

Der Fehler kommt nicht von der Szenengenerierung, sondern vom Hard-Reset davor:

```
[v377_start] reset_failed scene=6bf4e815…
update: null value in column "dialog_takes" of relation "composer_scenes" violates not-null constraint
[v380_hard_reset] … errors=1
```

In der Datenbank geprüft:

| Spalte | nullable | default |
|---|---|---|
| `dialog_takes` | **NO** | `'{}'::jsonb` |
| `scene_assets` | **NO** | `'[]'::jsonb` |
| `dialog_shots` | YES | – |

`scene-hard-reset.ts` (Zeile 551) schreibt `dialog_takes: null`. Das verletzt die NOT-NULL-Bedingung, der Reset meldet `errors=1`, v377 bricht korrekt mit `reset_failed` ab und liefert non-2xx — genau die rote Meldung im Screenshot. Der v377-Vertrag hat also funktioniert (kein Geld ausgegeben, kein halber Lauf), aber der Reset selbst war seit v380 durch diesen einen Wert dauerhaft kaputt: **jeder** Regenerate einer Dialogszene schlägt hier fehl. Das erklärt auch, warum in der Produktionsdatenbank noch nie eine Szene `plate_generation > 1` erreicht hat.

## Plan v382 — Reset-Write NOT-NULL-konform machen

### 1. Leerwerte statt NULL
In `supabase/functions/_shared/scene-hard-reset.ts`:
- `dialog_takes: null` → `dialog_takes: {}` (Spaltendefault).
- `scene_assets`: sicherstellen, dass der `cleanedAssets === null`-Fall als `[]` geschrieben wird, nicht als `null` — dieselbe Falle, nur bisher nicht ausgelöst.
- `dialog_shots` bleibt `null` (Spalte ist nullable).

### 2. Schema-Drift dauerhaft ausschließen
Ein kleiner Guard vor dem Update: das Reset-Update-Objekt wird gegen die NOT-NULL-Spalten von `composer_scenes` abgeglichen; ein `null` auf einer NOT-NULL-Spalte wird auf den Spaltendefault korrigiert und mit `v382_notnull_coerced` geloggt, statt den ganzen Reset scheitern zu lassen. Damit kann eine künftige Schemaänderung den Regenerate nicht erneut komplett blockieren.

### 3. Verifikation am echten Lauf
Nach dem Deploy löst du den Regenerate auf derselben Szene aus. Ich lese danach:
- `composer_scenes`: `plate_generation` 2 → 3, `plate_ready_generation` leer, neue `active_run_id`.
- Log auf `reset_failed` = 0 und `[v380_hard_reset] … errors=0`.
- Die vier `v381_generation_provenance`-Marker (`plate_load`, `preclip_cut`, `sync_dispatch`, `mux`) mit der neuen Generation.

Erst wenn diese Kette sauber ist, ist die Aussage „die Pipeline wird bei jedem Neustart komplett geleert" belegt statt behauptet.

## Technische Details
- Betroffene Datei: `supabase/functions/_shared/scene-hard-reset.ts`.
- Kein Schema-Change, keine Migration.
- Alle Funktionen, die den Shared-Reset importieren (u. a. `composer-start-scene-generation`, `composer-hard-reset-scene`, `auto-director-compose`), werden neu deployt.
