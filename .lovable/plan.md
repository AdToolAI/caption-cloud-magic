# v191 — Lipsync-Amplitude & Silent-Faces Hardening

Drei chirurgische Fixes für die drei beobachteten Symptome. Keine Änderungen an v169-Invarianten (Parallel-Fanout, per-Pass-Lock, per-Slot-RPC, ASD-Deterministik, verify_jwt=false, Watchdog).

## Symptom → Fix Mapping

| Symptom | Ursache | Fix |
|---|---|---|
| Mehrere Sprecher bewegen gleichzeitig Lippen | v190 Kill-Switch aktiv (`silent_faces_v183=false`) | Fix 1 + Fix 2 |
| Lippen bewegen sich vor/nach dem Skript | Silent-Anchor-Ebene fehlt | Fix 1 + Fix 2 |
| Sprecher 1 zu wenig, Sprecher 2/3 „schreien" | LP2-Pro Temperatur 0.5 auf 1-Face-Preclips | Fix 3 |
| Anchor-Tiles würden off-face landen | `plate_dims` = null in `dialog_shots` | Fix 2 |

## Fix 1 — Kill-Switch entfernen (P0, 1 Zeile SQL)

```sql
UPDATE system_config SET value = 'true'::jsonb
WHERE key = 'composer.silent_faces_v183';
```

Aktiviert v190 `globalSilentSlots`-Ebene für alle neuen Dispatches. Kein Deploy.

## Fix 2 — `plate_dims` persistieren + Remotion-Bundle-Refresh (P0)

**Problem:** `plateDims` wird in `compose-dialog-segments` bereits ermittelt (`plate-face-detect` liefert `{width,height,fps}`), aber nicht in `dialog_shots.plate_dims` geschrieben. Ohne diese Dims skaliert `DialogStitchVideo.globalSilentSlots` die Anchor-Tiles über die Fallback-`targetWidth/Height`, was bei 720p-Plates → 1080p-Render zu ~1.5× versetzten Tiles führt.

**Änderung 1:** `supabase/functions/compose-dialog-segments/index.ts` — Beim Init nach `plate-face-detect`, das Ergebnis in den `dialog_shots` JSONB per `update_dialog_shot_pass` bzw. dediziertem RPC persistieren:
```ts
await supabase.rpc("update_dialog_shot_meta", {
  _scene_id: sceneId,
  _patch: { plate_dims: { w: plateDims.width, h: plateDims.height, fps: plateDims.fps ?? 24 } }
});
```
(Falls kein RPC existiert: gezielter JSONB-Merge über bestehenden Update-Pfad — v169-Kontrakt §3 sieht `plate_dims` explizit vor.)

**Änderung 2:** `scripts/deploy-remotion-bundle.sh` einmalig ausführen (durch die Nutzer-Aktion) — v190 `DialogStitchVideo` mit `globalSilentSlots`-Prop muss im deployten Bundle liegen. Ist im vorherigen Turn empfohlen worden; jetzt hart in die Verifikationsschritte.

## Fix 3 — LP2-Pro Temperatur-Kalibrierung (P0)

**Problem:** `RETRY_TEMPERATURES = [0.5, 0.35, 0.7, 0.4]`. Erster Versuch (bbox-url-pro + lipsync-2-pro) läuft bei 0.5 — das ist bei getighteten Single-Face-Preclips zu heiß und produziert das Aufreißen/Nicht-Bewegen-Muster.

**Änderung:** `supabase/functions/compose-dialog-segments/index.ts`
```ts
// v191 — LP2-Pro amplitude calibration on tight 1-face preclips.
// 0.5 was overshooting on close-cropped faces (mouth-open artefacts on
// speakers 2/3, underdriven on speaker 1). 0.3 gives consistent phoneme
// amplitude across face-crop sizes. Later retries stay hotter to escape
// specific stuck-mouth failure modes.
const RETRY_TEMPERATURES = [0.3, 0.4, 0.55, 0.5];
```

Kein Änderung am Retry-Ladder-Order (bbox-url-pro → coords-pro → coords-pro-box → sync3-coords → coords-pro-lp2pro → auto-pro → auto-standard). Nur die Temperatur-Kurve wird gedämpft und behält das „nach oben eskalieren"-Muster für Retry-Fälle.

## Was NICHT angefasst wird

- v169 Kern: Parallel-Fanout, per-Pass-Lock, per-Slot-RPC, ASD-Deterministik, verify_jwt=false, Watchdog, idempotenter Refund.
- v187 Preclip-Pflicht, v188 Nearest-Window-Snap, v189 Identity-Trust-Gate.
- Sync.so-Payload-Kontrakt §5 (sync_mode=cut_off, keine temperature auf sync-3, keine occlusion_detection_enabled).
- v90 Overlay-Fenster, v182 Tail-Hold, v175 Tight-Slice.

## Verifikation

1. SQL aus Fix 1 ausführen → Silent-Faces global aktiv.
2. `deploy-remotion-bundle.sh` ausführen → v190-Template im Lambda-Bundle.
3. Edit + Deploy `compose-dialog-segments` (Fix 2 Persistenz, Fix 3 Temperatur).
4. 3-Sprecher-Szene neu rendern.
5. **Edge-Log-Assertions:**
   - `v190_global_silent_slots=3 anchors=3 fallback=0`
   - `plate_dims={w:…,h:…,fps:…}` in `dialog_shots` (SQL: `SELECT dialog_shots->'plate_dims' FROM composer_scenes …`)
   - Sync.so-Payloads (via `syncso_dispatch_log`): erster Versuch `temperature=0.3`.
6. **Visuelle Assertions:**
   - Nur der aktuell sprechende Sprecher bewegt Lippen.
   - Mund-Amplitude bei allen 3 Sprechern konsistent (kein „Schreien", kein „Standbild").
   - Vor/nach Turn: statisches Anchor-Portrait, keine Idle-Bewegung.

## Rollback

- Fix 1: `UPDATE system_config SET value='false'::jsonb WHERE key='composer.silent_faces_v183';`
- Fix 2: rein additiv (plate_dims-Feld ignorierbar).
- Fix 3: `RETRY_TEMPERATURES = [0.5, 0.35, 0.7, 0.4]` zurücksetzen.

Alle drei sind unabhängig reversibel.