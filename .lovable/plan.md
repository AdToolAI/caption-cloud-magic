## Was tatsächlich passiert ist
Die Szene `c01d339d…` beim Re-Render war **nicht** kaputt: alle 4 Sync.so-Passes `done`, Mux erfolgreich, `clip_url` gesetzt. Trotzdem stand in der DB `clip_status='failed'` mit `clip_error=NULL` und `lip_sync_status='done'`. Zwei Schreiber haben in derselben Sekunde geschrieben:

1. Identity-Audit Attempt-2 verdict `cast=missing` (der v263-Härtungspfad) → setzt `clip_status='failed'` ohne `clip_error`.
2. Der Mux-Completion-Writer setzt gleichzeitig `clip_url`, `lip_sync_status='done'`, `twoshot_stage='done'`.

Ergebnis: widersprüchlicher Endzustand + orphaned Lip-Sync-Anzeige im UI.

## Fix — 4 kleine Patches

### 1) v263 Identity-Fail darf laufende/fertige Renders nicht mehr killen
`supabase/functions/compose-video-clips/index.ts` Attempt-3 Face-Lock Burnout (~Z. 2939) und der Attempt-2 Soft-Pass-Block:

- Vor jedem `.update({ clip_status: "failed", clip_error: msg })` erst per `select clip_url, lip_sync_status from composer_scenes where id=…` prüfen.
- Wenn `clip_url` bereits existiert **oder** `lip_sync_status IN ('running','done')` → **kein** Failed-Write. Stattdessen `clip_error` nur als warnenden Suffix an ein optionales `identity_notes`-Feld hängen (oder rein loggen).
- Grund: sobald der async Hailuo/Sync.so-Pfad gestartet ist, entscheidet der Provider- + Mux-Ausgang über success/fail, nicht mehr die Anchor-Sanity.

### 2) Jeder `clip_status='failed'`-Write erzwingt `clip_error`
In `compose-video-clips/index.ts` an allen 8 direkten `.update({ clip_status: "failed", ... })`-Stellen (Z. 500, 1536, 2174, 2942, 2987, 3294, 4012, 4238):

- Wenn `clip_error` nicht gesetzt ist → hart abbrechen bzw. `clip_error='unknown_failure_no_details'` schreiben. Ein stiller `clip_error=NULL` bei `clip_status='failed'` ist ab jetzt ein Bug, kein Zustand.

### 3) Cinematic-Sync-Fail-Pfade nullen die Lip-Sync-Felder
Alle Failed-Writes bei Cinematic-Sync-Szenen müssen die vier Felder mit-clearen (analog zum vorhandenen `failedClipUpdate()` Helper Z. 496): `lip_sync_status=null`, `twoshot_stage=null`, `dialog_shots=null`, `lip_sync_source_clip_url=null`. Betroffen: die 6 direkten Failed-Writes in compose-video-clips, die den Helper heute umgehen.

### 4) Client-Guard in `SceneClipProgress.tsx`
- `lipSyncRunning` (Z. 130) zusätzlich mit `scene.clipStatus !== 'failed'` gaten.
- `DialogShotsBar` (Z. 501+) nur mounten, wenn `scene.clipStatus !== 'failed'`.
- Wirkung: Altbestand-Rows mit widersprüchlichem `failed` + `done`-Lipsync zeigen sofort nur noch die rote „Fehlgeschlagen"-Kachel, keine Spinner-Bar mehr.

### 5) Backfill für die aktuelle Szene
Einmaliges SQL: für die 1 Szene `c01d339d-91db-4ad6-8f08-8071495f5756` (und ähnliche mit `clip_status='failed'` + `clip_url IS NOT NULL` + `lip_sync_status='done'`) `clip_status='ready'`, `clip_error=NULL` setzen — das war ein grüner Render.

## Verifikation
- `tsgo` auf die zwei Dateien.
- Re-Render einer 4-Sprecher-Szene mit absichtlich unähnlichen Portraits → soft-pass, Pipeline läuft durch, `clip_status` bleibt `ready`.
- Alte Failed-Cinematic-Szenen (z. B. `edbcb26e…`) zeigen in der UI keine Lip-Sync-Progress-Bar mehr.
