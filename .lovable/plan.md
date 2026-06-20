
## Ziel

Den kompletten Preclip- / `auto_detect`-Pfad aus `compose-dialog-segments` entfernen, damit nur noch der v153-Bbox-Pfad existiert. Phase A (v153.3) hat den Pfad bereits per Gate stillgelegt — jetzt wird der tote Code wirklich gelöscht.

Scope: **407 Referenzen** zu `preclip` / `auto_detect` in einer 6307-Zeilen-Datei + `supabase/functions/_shared/pass-face-preclip.ts` (336 Zeilen, nur von dieser Funktion benutzt). Wegen der Größe wird in 3 Sub-Phasen gelöscht, jede einzeln deploy- und verifizierbar. Bei jedem Schritt bleibt v153 grün; ein Rollback ist trivial.

## Voraussetzung

Mindestens **ein erfolgreicher Live-Run** auf v153.3, der zeigt: alle 4 Speaker laufen über `bbox-url-pro`, kein `v153.3_preclip_overwrite_detected` Log, kein `v107_preclip_required` Fehler. Falls dieser Run noch nicht passiert ist, **zuerst v153.3 live verifizieren** — sonst löschen wir auf Verdacht.

## Phase B.1 — Legacy-Batch-Preclip entfernen

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Block `Plan B Hebel B — Batch preclip prefetch` komplett löschen (~Z. 3378–3636):
  - `batchPreclipFlagOn` DB-Read, `canBatchPrefetch`, `renderOnePassPreclip`, `Promise.all` Loop, `plan_b_B_batch_preclip_*` Logs, `v143_rehost` Upload-Logik im Batch.
- Import von `renderPassFacePreclip` bleibt noch (Per-Pass-Block braucht ihn in B.2).
- `composer.batch_preclip_render` `system_config` Key: bleibt in der DB, wird ignoriert.
- Version bump → `v153.4`. Boot-Log: `v153.4 legacy_batch_preclip_removed`.

Verifizierung: Live-Run zeigt keine `plan_b_B_batch_preclip_*` Logs mehr; alle Passes laufen weiter über v153.

## Phase B.2 — Per-Pass-Preclip + v107/v126 Hard-Fails entfernen

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Per-Pass-Preclip-Render-Block löschen (~Z. 3735–4061):
  - `v114_preclip_url_stale` HEAD-Probe.
  - `wantPassPreclip` + komplette `renderPassFacePreclip` + `v116_face_gate_repair` Expansion-Ladder + `v113_preclip_resolution_BLOCK` + `v77_preclip_ready` Logs.
- `passPreclipUrl` / `usePassPreclip` Variablen + alle `if (usePassPreclip)` Branches (Z. 4063–4232 + ASD-Build-Branch um Z. 4500–4660).
- v107/v126 Hard-Fail-Block (~Z. 4081–4205) löschen — er ist nur für „preclip missing" relevant. Dafür kommt ein **v153-natives Hard-Fail** dazu: wenn `!v153HasPlateBox` → `failBeforeProviderDispatch("v153_plate_bbox_required", …)` mit identischer Refund-Logik (Wallet-Top-up + `composer_scenes` Patch + `logSyncDispatch`) und derselben Human-Readable-Message (Speaker-Name + Turn-Zeit).
- `v129.23.2_face_gate` + `v1291_preclip_sync3` + `v105_doc_strict` Logs (alle „preclip-sync3-autodetect" Strings) entfernen.
- `preclip_url`, `preclip_crop`, `preclip_render_id`, `preclip_error`, `preclip_face_count`, `preclip_dims`, `preclip_repair_attempts`, `preclip_duration_sec`, `preclip_bbox_drift_rejected`, `preclip_face_gate_failed_frame`, `preclip_face_*` aus `PassState` (Z. ~452–462) und aus allen `(p as any).preclip_*` Zuweisungen + DB-Patches entfernen. Existierende DB-Zeilen behalten die Spalten — Reader ignorieren sie.
- `v120_pass4_preclip_forced`, `v123_stale_preclip_*`, `v125_*`, `v148_noop_bypass_preclip` Logs entfernen (waren nur Preclip-Reset-Pfade).
- Import `renderPassFacePreclip` aus `_shared/pass-face-preclip.ts` entfernen.
- Version bump → `v153.5`. Boot-Log: `v153.5 preclip_path_removed`.

Verifizierung: Live-Run mit 1/2/3/4 Speakern; alle vier Szenarien dispatchen mit `auto_detect:false` + `bounding_boxes_url`. Logs zeigen ausschließlich `v153.2_unified_bbox_primary` → `v140_ASD_CANONICAL` → `DISPATCH`. Kein „preclip" String mehr in Logs.

## Phase B.3 — `auto_detect` selbst aus dem Code verbannen

Datei: `supabase/functions/compose-dialog-segments/index.ts` + `supabase/functions/_shared/`

- v140 Safety-Net (`v153_auto_detect_wire_blocked`): bleibt als Belt-and-Suspenders.
- `normalizeCanonicalAsd`: nur noch `bounding_boxes_url` + `frame_number` + `bounding_boxes` zulassen; `auto_detect` aus dem Input akzeptieren (für Rückwärtskompat-Payloads von alten Webhook-Re-Invokes), aber explizit auf `false` zwingen + WARN-Log `v153.6_auto_detect_input_coerced`.
- `_shared/pass-face-preclip.ts` löschen (rm).
- `mem/architecture/lipsync/v99-preclip-explicit-bbox.md`, `v123-stale-preclip-invalidation.md`, `v12919-preflight-validates-provider-input.md`, `v12920-plate-face-detection-every-speaker.md`, `v1291-payload-contract-doc-strict.md` → mit Hinweis „DEPRECATED in v153 — siehe v153-single-path-bbox-pipeline.md" versehen (nicht löschen, Historie).
- `mem/index.md` aktualisieren: v153-Eintrag = einzige aktive Lipsync-Doc.
- Version bump → `v153.6`. Boot-Log: `v153.6 auto_detect_path_eliminated`.

Verifizierung: `rg -n "preclip|auto_detect|renderPassFacePreclip" supabase/functions/compose-dialog-segments/index.ts` → idealerweise 0 Treffer (außer dem v140 Safety-Net Begriff). Datei sollte um ~1800–2400 Zeilen schrumpfen (von 6307 → ~4000).

## Was NICHT angefasst wird

- `compose-twoshot-lipsync` / `compose-lipsync-scene` (Legacy two-shot — laut Memory `Dialog-Shot Pipeline` bereits ersetzt, aber separat).
- Sync.so Webhook-Handler (`sync-so-webhook`) — bekommt nur fertige Job-IDs, kennt kein `auto_detect`.
- Audio-Mux Lambda — overlay-Logik nutzt `preclip_crop` aus historischen Jobs. Solange wir die DB-Felder nicht entfernen, läuft alte Re-Render-Jobs weiter sauber. Neue Jobs schreiben die Felder nicht mehr, was OK ist (Bbox-Path braucht keinen Crop-Overlay).
- `dialog_shots` JSON-Schema in der DB — wir schreiben einfach keine `preclip_*` Felder mehr.
- Client-Code (`useResetLipSync`, `useVideoBatch`, `useVideoEditor`) — die referenzieren `preclip` nicht, nur `lip_sync_*` Status.

## Risiken & Mitigation

- **Versteckte ASD-Overwriter**: Phase A v153.3 hat den `v153.3_preclip_overwrite_detected` Sensor. Wenn er nach B.1/B.2 leise bleibt, ist der Pfad wirklich tot.
- **Alte In-Flight Webhook-Re-Invokes**: Phase B.2 löscht den Preclip-Reader. Falls ein Sync.so Webhook für einen Job kommt, der vor B.2 mit `preclip_url` gestartet wurde: kein Problem — `sync-so-webhook` patcht nur das Job-Ergebnis, ruft `compose-dialog-segments` nicht erneut für Preclip-Stuff auf.
- **Refund-Pfad**: Der neue `v153_plate_bbox_required` Hard-Fail muss die Wallet-Refund-Logik 1:1 von v107/v126 übernehmen — sonst riskieren wir Credit-Lecks. Wird in B.2 mit Test-Case verifiziert.

## Dateien

- `supabase/functions/compose-dialog-segments/index.ts` (alle 3 Sub-Phasen)
- `supabase/functions/_shared/pass-face-preclip.ts` (B.3: löschen)
- `mem/architecture/lipsync/v153-single-path-bbox-pipeline.md` (B.1/B.2/B.3: updaten auf v153.4 → v153.6)
- `mem/index.md` (B.3: Eintrag schärfen, Legacy-Docs als deprecated markieren)
- 5 Legacy-`mem/architecture/lipsync/v*.md` (B.3: DEPRECATED-Hinweis oben)

## Reihenfolge

1. **Vorher**: ein erfolgreicher v153.3 Live-Run als Sicherheitsnetz.
2. B.1 → deploy → ein Live-Run.
3. B.2 → deploy → Live-Runs mit 1/2/3/4 Speakern.
4. B.3 → deploy → finaler Cleanup-Run.

Jede Sub-Phase ist ein eigener Edit + Deploy, kein Big-Bang. Rollback per Git-Restore der einen Datei.
