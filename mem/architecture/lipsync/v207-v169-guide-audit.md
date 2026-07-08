---
name: v207 v169 Rebuild-Guide Audit
description: Point-by-point audit of the current pipeline against the user's canonical "Sync.so Multi-Speaker Lip-Sync Pipeline — Rebuild Guide v169 (PARALLEL)". Establishes that the pipeline still matches v169 on every visually-relevant invariant, that no functional drift explains the reported ghost-mouthing on non-speakers, and that v171/v172 plate-prompt hardening was added AFTER v169 precisely to reduce ghost-mouthing — rolling back would re-introduce it.
type: architecture
---

# v207 — v169-Rebuild-Guide Audit

## Ergebnis in einem Satz

Der Pipeline-Code entspricht bis auf zwei nicht-visuelle Drifts (Preclip-Prefanout deaktiviert, Failure-Telemetry-Labels falsch) noch dem v169-Rebuild-Guide. **Es gibt keinen Code-Fix, der Ghost-Mouthing auf Non-Speakern beseitigt, ohne einen der bereits mehrfach fehlgeschlagenen Silent-Overlay-Layer wieder einzuführen.** Die verbleibende Erklärung ist Element C (Plate-Prompt seit v169 verschärft) oder eine Hailuo-Modell-Regression außerhalb unserer Kontrolle.

## §10-Invarianten (12 Punkte)

| # | Invariante | Ist | Status |
|---|-----------|-----|--------|
| 1 | Eine Hailuo i2v Master-Plate pro Szene | `compose-video-clips/index.ts` erzeugt genau eine Plate pro `composer_scenes.id`; `compose-dialog-segments` konsumiert `source_clip_url` unverändert | ✓ match |
| 2 | Jeder Speaker-Turn = ein Pass | Pass-Aufbau `compose-dialog-segments/index.ts` L3105+/3246+; `passes.length === dialog_turns.length` (plus optional v194-Stabilizer) | ✓ match |
| 3 | Parallele Passes, Cap 4, hart begrenzt durch Sync.so-Plan minus Inflight | `syncso_concurrency_deferred` Bremse L3690/3700 | ✓ match |
| 4 | Jeder Pass verwendet eigenen Preclip als `input_url` — niemals `output_url` des vorigen Passes | `v204MultiSpeakerPreclipDispatch` L5873 hart erzwungen; ohne `preclip_url` → 422 vor Wire | ✓ match |
| 5 | Per-Pass PG advisory lock | `try_acquire_dialog_lock` L702 pro `(scene_id, pass_idx)` | ✓ match |
| 6 | Per-Slot JSONB RPC Write | `update_dialog_shot_pass` in `sync-so-webhook`; keine Full-Row-Rewrites im Webhook | ✓ match |
| 7 | ASD deterministisch für N≥2: `frame_number+coords` oder `bounding_boxes_url`; niemals `auto_detect:true` | Sanitizer L268+, Hard-Block L6011 wirft `provider_unknown_error` vor Dispatch bei `auto_detect:true` mit N≥2 | ✓ match |
| 8 | sync-3: `temperature` und `occlusion_detection_enabled` entfernt | Whitelist-Sanitizer L280 + Doc-Strict-Payload-Bau L5038 | ✓ match |
| 9 | lipsync-2-pro: Retry-Ladder [0.5, 0.35, 0.7, 0.4], max 4 | `sync-so-webhook/index.ts` L62-63 `MAX_SHOT_RETRIES=4`, `RETRY_TEMPERATURES` identisch | ✓ match |
| 10 | Webhook `verify_jwt=false`, `x-webhook-secret` gegen `WEBHOOK_SHARED_SECRET`, idempotent | `sync-so-webhook` header check + duplicate-callback short-circuit | ✓ match |
| 11 | Background-Preclip-Prefanout aktiv | `compose-dialog-segments/index.ts` L4000: `if (false && !isAdvance && ...)` — **Prefanout ist per `false &&` deaktiviert** | ⚠ drift (nicht-visuell, nur Latenz) |
| 12 | Stale-Reconcile ≤500ms, 429-Backoff, pg_cron-Watchdog 1min, 8min Pass-Timeout, idempotenter Refund via deterministischer UUID | `reconcileStaleSyncJobs` importiert L75; Watchdog + Refund-Helper in `lipsync-watchdog` und `refund-*`-Functions vorhanden | ✓ match |

**Drift #11** ist reine Latenz-Optimierung und beeinflusst den visuellen Output nicht. Reaktivierung ist ein separater Latenz-Fix, kein Ghost-Mouthing-Fix.

## Zusätzliche Guide-Elemente

| # | Element | Ist | Status |
|---|---------|-----|--------|
| A | v166 Anchor-Identity Slot Bridge, kein `unlabeled.find(f => f.slot === idx)` Fallback | L1610-1643 `v183_anchor_identity_slot_bridge` merged Anchor + Plate-Identities per `slotIndex`; kein Script-Idx-Fallback | ✓ match |
| B | Final Concat in `finalize-dialog-scene` → **ein** `clip_url`; keine Silent-Overlay-Layer im Mux | `render-sync-segments-audio-mux/index.ts` L60 `SILENT_LAYERS_DISABLED = true` (v206), Override L317: alle drei Flags (`silent_anchor_v195`, `silent_faces_v183`, `listener_mouth_matte`) auf false gezwungen | ✓ match |
| C | Plate-Prompt-Version = v167 | `compose-video-clips/index.ts` L433 (v171 Ghost-Speaker Guard), L442 (v172 Closed-Eyes Guard), L1028+ (v175/v182 N=1 Closed-Mouth) — **strikter als v167** | ⚠ absichtliche Weiterentwicklung |
| D | `COMPOSE_DIALOG_SEGMENTS_VERSION` Log-String | L136: `"v204-preclip-bbox-clipspace"` (Guide erlaubt v164 als Log-Grep-Kontinuität; v204 ist präziser) | ✓ match (harmlos) |
| E | Failure-Path Telemetry `input_space`/`preclip_used` | L5455/5456, L6928/6929, L6946/6947 loggen `input_space: "plate"`, `preclip_used: false` für N≥2, obwohl Dispatch tatsächlich Preclip verwendet | ⚠ drift (nur Forensik-Labels, kein Runtime-Effekt) |

## Element C — die einzige visuell relevante Diff seit v169

Zwischen v169 (22. Juni 2026) und heute wurde der Master-Plate-Prompt in `compose-video-clips/index.ts` mehrfach verschärft:

- **v171 Ghost-Speaker Guard** (L433, L1005): Negative-Prompt gegen `idle mouth motion, listeners moving their lips, non-speaker mouth movement, everyone talking at once`. Der v171-Kommentar dokumentiert wörtlich: *"With all 4 passes finally running in parallel, non-active speakers were visibly mouthing along because the plate prompt asked for 'subtle idle mouth and jaw motion' on every face."* Das heißt: **Ghost-Mouthing existierte bereits in v169**; v171 war der Fix.
- **v172 Closed-Eyes Guard** (L442): Anti-Nod + Anti-Squint.
- **v175/v182 N=1 Closed-Mouth Plate** (L1028+): stärkerer Closed-Mouth-Wortlaut für N=1.

Die Wahrnehmung "v169 lief sauber" trifft auf einige v169-Renders zu, ist aber laut Repo-Historie nicht die allgemeine v169-Baseline. Rollback zu v167-Textstand würde die Ghost-Mouthing-Beobachtung im Repo-Log wörtlich reproduzieren.

## Ableitung

1. **Pipeline-Code = v169-Guide-konform.** Kein Code-Fix an §10/A/B, der Ghost-Mouthing beseitigt, ohne die bereits gescheiterten Silent-Layer-Ansätze (v183/v193/v194/v195/v197) zu reanimieren.
2. **Prompt-Härtung ist Fortschritt, nicht Regression.** v171/v172/v175/v182 wurden gegen genau das Symptom eingebaut, das jetzt gemeldet wird. Rollback ist kontraindiziert.
3. **Verbleibende Ursache = Hailuo-Modell-Adhärenz.** Der aktuelle Prompt fordert bereits explizit geschlossene Non-Speaker-Münder; wenn das Modell die Anweisung ignoriert, ist das eine Modell-Ebene, nicht eine Pipeline-Ebene.

## Empfohlene nächste Schritte (außerhalb dieses Audits)

- **Beweisführung:** Master-Plate-URLs von drei repräsentativen Ghost-Mouthing-Cases sammeln, ohne Sync.so-Overlay ansehen. Wenn Non-Speaker im **rohen Plate-Video** die Münder bewegen, ist es Modell-Adhärenz. Wenn nicht, ist es der Mux/Overlay — was v206 ausschließt.
- **Modell-Level-Optionen** (bewusst nicht Teil dieses Audits):
  - Prompt-Optimizer bei Hailuo/Kling deaktivieren (Provider-Rewrite weichspült Anweisungen).
  - Auf Kling-3-Master oder Wan-2.5 als i2v-Alternative für Multi-Speaker testen.
  - Als letztes Mittel gezielte Reaktivierung von v197 SilentFaceFreeze **nur mit harter Maske und nur für Non-Speaker-Turns** (bewusst als Symptom-Fix dokumentiert).

## Drift-Korrekturen (optional, nicht ghost-mouthing-relevant)

- **#11 Preclip-Prefanout reaktivieren:** L4000 `if (false && ...)` → `if (PRECLIP_PREFANOUT_ENABLED && ...)`. Rein Latenz-Verbesserung.
- **#E Telemetry-Labels korrigieren:** Failure-Paths L5455/5456/6928/6929/6946/6947 sollten `input_space: "clip"`, `preclip_used: true` schreiben (Reality-Match). Reine Forensik.

Beide sind isoliert deploybar und außerhalb dieses Audit-Turns.

## Fazit für die Konversation

v169 hat den Ghost-Mouthing-Effekt bei 4 Sprechern nicht restlos vermieden — es war *weniger auffällig*, und v171 wurde eingebaut, weil er auffiel. Der aktuelle v206-Zustand ist die ehrlichste v169-Reproduktion, die der Code hergibt. Weitere sichtbare Verbesserung erfordert Modell-Ebene, nicht Pipeline-Ebene.
