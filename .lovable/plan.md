
## Problem

`v153_auto_detect_wire_blocked` ist **nicht** der Fehler — es ist die v153.2 Safety-Net, die korrekt verhindert, dass ein `auto_detect:true` Payload an Sync.so rausgeht.

Die eigentliche Ursache: nach dem v153-Bbox-Branch läuft im selben Request immer noch der **alte Preclip-Pfad** (`plan_b_B_batch_preclip` + per-pass `v1291_preclip_sync3`) und überschreibt `payload.options.active_speaker_detection` auf `{auto_detect:true}`. Genau dieser Pfad sollte laut deiner früheren Ansage komplett raus.

Logs Beweis (scene 9fa61b47, pass 1):
1. `v153.2_unified_bbox_primary speakers=4 plate_box=yes` — v153 setzt korrekt bbox-url-pro
2. `plan_b_B_batch_preclip_start passes=4` — Legacy-Batch startet trotzdem
3. `v1291_preclip_sync3 … mode=single_face_auto` — Legacy überschreibt ASD
4. `v140_ASD_CANONICAL asd={"auto_detect":true}` → Safety-Net blockt

## Lösung — v153.3 in `supabase/functions/compose-dialog-segments/index.ts`

**Phase A (sofort, sicher):** Preclip-Pfad gaten, nicht löschen — dann verifizieren.

1. **`canBatchPrefetch` (Zeile ~3411) deaktivieren wenn v153 aktiv**
   Erweitern um `&& !v153UnifiedActive` — keine Legacy-Batch-Preclip-Renders mehr, wenn alle Speaker Plate-Bboxes haben. Spart die ~60s `plan_b_B_batch_preclip_complete ms_total=60476` direkt.

2. **Per-pass Preclip-Block überspringen wenn `_v153BboxPrimary` gesetzt**
   Vor dem Block, der `v129.23.2_face_gate` / `v1291_preclip_sync3` / `preclip-sync3-autodetect-v105` ausführt, ein hartes `if ((pass as any)._v153BboxPrimary) { /* skip entire preclip overwrite */ }` setzen. Damit bleibt der von v153 gebaute `bbox-url-pro` Payload unangetastet.

3. **Sicherheits-Assert verschärfen** (Zeile ~5582)
   Wenn `_v153BboxPrimary && active_speaker_detection.auto_detect===true` → eigener Log `v153.3_preclip_overwrite_detected` mit Stack/Source, damit wir sofort sehen, falls noch eine 3. Stelle die ASD überschreibt.

4. **Version bump** auf `v153.3`, Boot-Log + zusätzlicher Log `v153.3_preclip_skipped pass=X reason=v153_bbox_primary` pro übersprungenem Preclip.

**Phase B (Follow-up, sobald Phase A grün läuft):** echten Code löschen.
- `plan_b_B_batch_preclip_*` Block (Zeilen ~3380–3700)
- Per-pass Preclip-Render + `v129.23.2_face_gate` + `v1291_preclip_sync3` + `preclip-sync3-autodetect-v105` Branch
- `usePassPreclip`, `preclipTrustedForGate`, `v143_rehost` Pfad
- Tote `dispatch_video_kind: "preclip"` Zweige in payload-Builder

Phase B wird in einer separaten Runde gemacht — nicht in derselben Datei-Änderung, damit Rollback einfach bleibt.

## Erwartetes Verhalten nach Phase A

- Logs zeigen pro Pass: `v153.2_unified_bbox_primary` → direkt `v140_ASD_CANONICAL asd={"auto_detect":false,"bounding_boxes_url":"…"}` → DISPATCH ohne dazwischenliegende `plan_b_B_batch_preclip_*` / `v1291_preclip_sync3` Zeilen.
- Wall-Time pro Szene fällt drastisch (entfällt: 60s Batch-Preclip + N×~10s per-pass Preclip + N×Re-Render).
- Sprecher 1–4 bekommen alle korrekten Lip-Sync (jeder eigene Plate-native Bbox), kein Sprecher mehr ohne Sync.
- Wenn doch noch eine Code-Stelle ASD überschreibt: neues Log `v153.3_preclip_overwrite_detected` zeigt sofort, wo.

## Dateien

- `supabase/functions/compose-dialog-segments/index.ts` (Phase A)
- `mem/architecture/lipsync/v153-single-path-bbox-pipeline.md` (auf v153.3 updaten)
- `mem/index.md` (Eintrag updaten)

Phase B (Löschen des Dead-Codes) wird in einem separaten Plan nach erfolgreicher Verifikation von Phase A vorgeschlagen.
