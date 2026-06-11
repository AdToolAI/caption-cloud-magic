## Diagnose (Szene `89db58ca`, 4 Sprecher, gerade abgeschlossen)

Aus DB belegt:
- Alle 4 Sync.so-Pässe wurden gegen die **volle Multi-Face Plate** dispatched (`dispatch_video_kind: "full_plate"`, `preclip_url: null`). v69 (single-face preclip für ALLE N) ist nicht aktiv geworden.
- Pixel-Coords der 4 Sprecher: `337, 838, 901, 1095` auf 1376-px-Plate. **Matthew (838) und Kailee (901) sind 63 px auseinander** → Sync.so kann sie nicht trennen → beide Audios landen auf demselben Gesicht.
- Symptom passt 1:1: zwei Charaktere "reden alles", zwei haben den Mund zu. Morph entsteht weil sync-3 auf einer breiten Plate mit 4 Gesichtern und `coordinates` zwei Köpfe ineinander schmilzt.

Außerdem läuft trotz v77/v76-Memory-Dokumentation der full-plate-Pfad als stiller Fallback durch, ohne dass irgendwo ein Abbruch geloggt wird.

## Ziel
**Sync.so sieht NIE wieder eine Multi-Face-Plate.** Wenn der Preclip nicht renderbar ist → harter Fail mit Refund, kein full-plate Fallback. Zusätzlich darf bei N≥3 keine Coords-Kollision dispatched werden.

## Plan

### Phase A — v107 Hard-Preclip Enforcement (`compose-dialog-segments`)
1. Für `speakers.length >= 2`: `wantPassPreclip` ist **mandatory**, nicht conditional. Wenn `plateDims`, `coords` oder `tightAudioInfo` fehlt → bereits hier abbrechen mit `clip_error: 'preclip_prerequisites_missing'`, Wallet refunden, scene → `failed`.
2. Wenn `render-pass-face-preclip` fehlschlägt oder `preclip_face_count !== 1` → **kein** full-plate Fallback mehr. Pass markieren `pass.status='failed'`, scene am Ende auf `failed` setzen mit `clip_error: 'preclip_render_failed_for_pass_<i>'`, idempotent refunden.
3. Logging: `v107_preclip_enforced: true` in jedem Dispatch-Probe.

### Phase B — Coords-Kollisions-Guard (`compose-dialog-segments`, vor Dispatch)
Vor `wantPassPreclip`-Check: paarweise euklidischen Pixelabstand aller `pass.coords` prüfen. Wenn `minDistance < max(120, plateWidth * 0.08)` (~110 px @1376):
- Versuch 1: `resolvePlateFaceIdentities` (v77) **erneut** mit höherem Detail-Prompt erzwingen (force refresh, cache bypass).
- Wenn weiterhin kollidierend → scene `failed` + `clip_error: 'face_coords_collision_<distancePx>px'`, refund. Kein Dispatch.

### Phase C — Preclip-Crop Cap überprüfen
Sicherstellen dass v76 `siblingCoords` an `computeFaceCrop` durchgereicht werden (Memory sagt "passed in" — verifizieren). Falls für Szene `89db58ca` der Crop trotzdem >2 Gesichter eingeschlossen hätte, ist v76 nicht hinreichend → zusätzlich post-render Face-Count-Validation via `validate-frame-face` auf jedem Preclip; bei `faceCount !== 1` → Fail (siehe A.2).

### Phase D — Sofort-Bereinigung
1. Refund für Szene `89db58ca` ausstellen (324 credits, `dialog_shots.refunded=true` setzen für Idempotenz).
2. Szene per `reset-lipsync-scene` zurücksetzen (`clip_url=NULL`, `lip_sync_status='pending'`, `twoshot_stage='master_clip'`, `dialog_shots=NULL`, `audio_plan.twoshot.{syncJobs,faceMap,anchor_face_audit,heartbeat}` löschen, `scene_anchor_cache` Row löschen).
3. Stuck-Szene `c8fb1fe6` (`failed/watchdog_provider_timeout`) ebenfalls für sauberen Re-Run zurücksetzen.

### Phase E — Verifikation
- Frischer Run der 4-Sprecher-Szene.
- Erwartung in DB: `dispatch_video_kind: "preclip_crop"` für alle 4 Pässe, `preclip_face_count: 1`, `preclip_url` gesetzt, keine `provider_unknown_error`-Kette, keine Coords <120 px.
- Endclip: jeder der 4 Charaktere bewegt seinen eigenen Mund in seinem eigenen Zeitfenster, kein Morph.

### Phase F — Memory
Neuen Eintrag `mem/architecture/lipsync/v107-hard-preclip-enforcement.md` anlegen und Index aktualisieren. Klarstellen: **full-plate Dispatch ist für N≥2 verboten**, auch als Fallback. v69 "fallback allowed" Klausel wird explizit obsoleted.

## Betroffene Dateien
- `supabase/functions/compose-dialog-segments/index.ts` (A, B, C)
- `supabase/functions/_shared/face-crop.ts` (C, falls v76 nicht greift)
- Migration: Refund + Reset für `89db58ca` und `c8fb1fe6`
- `mem/architecture/lipsync/v107-hard-preclip-enforcement.md` + `mem/index.md`

## Out of scope
- DialogStitchVideo Overlay-Rendering, sync-so-webhook (außer Stuck-State-Recovery falls nötig), Pricing, sync_mode-Auswahl.
