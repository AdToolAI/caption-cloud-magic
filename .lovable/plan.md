# Plan: v207 — v169-Rebuild-Guide-Audit statt Symptom-Fix

## Prämisse

Der Nutzer hat den vollständigen **Sync.so Multi-Speaker Lip-Sync Pipeline — Rebuild Guide v169 (PARALLEL)** als Wahrheitsdokument. In v169 lief Multi-Speaker (N=4) sauber ohne Ghost-Mouthing. Statt weiter Overlays oder Prompt-Härtungen zu addieren, prüfen wir jede der **12 Invarianten aus §10 des Guides** gegen den aktuellen Code und dokumentieren jede Abweichung.

## Vorgehen

Für jede der 12 Invarianten:
1. Lokalisiere den entsprechenden Code-Pfad in der Repo.
2. Vergleiche mit der Guide-Spezifikation.
3. Kennzeichne mit **✓ match**, **⚠ drift** oder **✗ missing**.
4. Für jede Drift: minimale Korrektur direkt in dem betroffenen Modul, keine neuen Layer.

Kein Refactor, keine Feature-Änderung, keine neuen Feature-Flags. Reine Guide-Parität.

## Zu prüfende Invarianten (aus §10 Rebuild Guide)

| # | Invariante | Zu prüfen in |
|---|-----------|--------------|
| 1 | Eine Hailuo i2v Master-Plate pro Szene | `compose-video-clips/index.ts`, `compose-dialog-scene/index.ts` |
| 2 | Jeder Speaker-Turn = ein Pass | `compose-dialog-segments/index.ts` (Pass-Aufbau) |
| 3 | Parallele Passes, `concurrencyCap` bis 4, hart begrenzt durch Sync.so-Plan-Parallelität minus Inflight | `compose-dialog-segments/index.ts`, `syncso_inflight_jobs` |
| 4 | Jeder Pass verwendet eigenen Preclip als `input_url` — **niemals** `output_url` des vorigen Passes | `pass-face-preclip.ts`, Dispatch-Payload |
| 5 | Per-Pass PG advisory lock (`FEATURE_PER_PASS_LOCK=true`) | `dialog_dispatch_locks`, `try_acquire_dialog_lock` |
| 6 | Per-Slot JSONB RPC Write (`update_dialog_shot_pass`) — nie Full-Row-Rewrite | Webhook-Handler `sync-so-webhook/*` |
| 7 | ASD deterministisch für N≥2: `frame_number+coords` **oder** `bounding_boxes_url`. **Nie** `auto_detect:true` | Dispatch-Payload-Builder |
| 8 | Auf `sync-3`: `temperature` und `occlusion_detection_enabled` **entfernt** | Payload-Sanitizer |
| 9 | Auf `lipsync-2-pro`: Retry-Ladder `RETRY_TEMPERATURES=[0.5,0.35,0.7,0.4]`, `MAX_SHOT_RETRIES=4` | Retry-Logik |
| 10 | Webhook `verify_jwt=false`; `x-webhook-secret` gegen `WEBHOOK_SHARED_SECRET` in Code validiert; idempotent auf Duplikate | `sync-so-webhook/index.ts`, `supabase/config.toml` |
| 11 | Background-Preclip-Prefanout (`PRECLIP_PREFANOUT_ENABLED=true`) | Preclip-Renderer + Trigger |
| 12 | Stale-Job-Reconcile ≤500 ms vor Fan-Out; 429-Backoff mit Jitter; pg_cron-Watchdog 1 min, 8 min Pass-Timeout; idempotenter Refund via deterministischer UUID aus `(video_id, pass_idx)` | Watchdog-Function, Reconcile-Function, Refund-Helper |

Zusätzlich Non-§10-Elemente aus dem Guide, die den Multi-Speaker-Output visuell prägen:

| # | Element | Zu prüfen |
|---|---------|-----------|
| A | v166 Anchor-Identity Slot Bridge — Anchor-Portraits + Plate-Identitäten vor ASD-Build gemergt; **kein Fallback** `unlabeled.find(f => f.slot === idx)` | `compose-dialog-segments/index.ts` |
| B | Final Concat in `finalize-dialog-scene` produziert **einen** `clip_url`; keine Silent-Overlay-Layer im Mux | `finalize-dialog-scene/index.ts`, `render-sync-segments-audio-mux/index.ts` |
| C | Plate-Prompt-Version = **v167** (nicht v171/v172 verschärft) | `compose-video-clips/index.ts` Zeilen ~861/~864/~1038/~1041 |
| D | COMPOSE_DIALOG_SEGMENTS_VERSION-String — kann v164 bleiben (Guide-Note), reiner Log-Grep | `compose-dialog-segments/index.ts` Header |

Element **C** ist der einzige Punkt, an dem eine echte Diff-Möglichkeit besteht: seit v169 wurden v171 (Ghost-Speaker Guard), v172 (Closed-Eyes Guard), v182 (N=1 Closed-Mouth Prompt) hinzugefügt. Wenn eine dieser Ergänzungen den Plate-Output *schlechter* macht (z.B. weil Hailuo die verschärften Anweisungen als "halb-offener Mund" interpretiert), wäre eine kontrollierte Rückstellung zum v167-Prompt-Text ein legitimer Fix — aber erst nachdem 1–12 + A/B sauber sind.

## Ergebnis-Format

Ich erzeuge `mem/architecture/lipsync/v207-v169-guide-audit.md` mit:

- Tabelle aller 16 Punkte, Ist-Zustand, Guide-Soll, Drift-Bewertung.
- Für jede Drift ein exakter Datei:Zeile-Verweis + minimale Korrektur.
- Für jeden ✓-Match: kurze Begründung (Log-Marker oder Code-Zeile).

## Erst-danach-Fix

Nach dem Audit gibt es drei mögliche Outcomes:

1. **Drift gefunden** — wir korrigieren nur die driftenden Punkte, keine neuen Features. Erwartung: Ghost-Mouthing verschwindet, weil ein Guide-Element fehlt/falsch war.
2. **Kein Drift, aber Prompt hat sich seit v169 geändert** (Element C) — wir stellen den Plate-Prompt kontrolliert auf v167-Textstand zurück (dokumentiert im Audit-Memo mit Diff).
3. **Kein Drift, Prompt identisch** — dann ist die einzige verbleibende Erklärung eine **Hailuo/Kling-Modell-Regression** außerhalb unserer Kontrolle. In dem Fall dokumentieren wir das und die Diskussion geht weiter über Modell-Alternativen oder gezielte Overlay-Reaktivierung — bewusst nicht Teil dieses Plans.

## Nicht angefasst

- Kein neuer Silent-Layer.
- Kein Prompt-Front-Loading, kein neuer Negativ-Prompt.
- `render-sync-segments-audio-mux` bleibt im v206-Zustand (Silent-Layer aus).
- Sync.so-Dispatch, Refund/Watchdog, Preclip-Pipeline werden nur **gelesen**, nicht modifiziert (Modifikation nur bei bewiesener Drift zur v169-Guide-Spec).

## Deploy

- Audit-Memo: kein Deploy nötig.
- Falls Drift-Korrekturen: Edge-Functions auto, Remotion-Bundle nur wenn Template geändert wurde.
