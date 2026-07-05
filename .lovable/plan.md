# v183 Multi-Speaker Silent-Faces — Umgesetzt (Fix A) + Fix B Diagnose

## Fix A — Silent-Faces v183 (fertig implementiert)

**Was gemacht wurde:**

1. `src/remotion/templates/DialogStitchVideo.tsx`
   - `ShotSchema.silentSlots` erweitert: pro Slot jetzt `{x, y, size, anchorUrl?}` (statt reines Crop-Rect).
   - Neue Komponente `SilentFaceAnchor`: rendert `<Img src={anchorUrl}>` in einem feathered radial-masked Div (58% solid → 96% transparent). Fallback ohne anchorUrl: semi-opaque `rgba(12,12,14,0.92)` Kachel. Kein `<Freeze>`, kein `<Video>` → keine Morph-/Ghost-Artefakte, keine Lambda-Renderkosten.
   - Render-Loop rendert die silent slots als Layer **vor** dem aktiven Overlay in jeder Sequence (silent slots liegen also unter dem aktiven Sprecher-Overlay).

2. `supabase/functions/render-sync-segments-audio-mux/index.ts`
   - Feature-Flag `composer.silent_faces_v183` (default OFF, jsonb bool).
   - Bei Flag ON + Multi-Speaker: `brand_characters.portrait_url` für alle beteiligten `character_id`s in einem einzigen Query holen.
   - Pro Fanout-Shot: `silentSlots = alle done-Passes AUßER dem eigenen Speaker`, jeder Slot mit `preclip_crop`-Rect + `anchorUrl`.
   - Neuer Log-Tag `v183_silent_slots ENABLED|DISABLED speakers=N crops=K anchors=M fallback=F`.
   - Bestehende Overlay-Pfade (`crop` und `faceMask`) tragen `silentSlots` optional als zusätzlichen Payload-Key.

3. DB: `system_config` Row `composer.silent_faces_v183 = false` per Insert angelegt.

**Deployment-Status:**
- Edge Function `render-sync-segments-audio-mux` deployed ✅
- tsgo clean ✅
- Remotion Bundle: **NOCH NICHT** neu deployed. Benötigt manuelles `scripts/deploy-remotion-bundle.sh` + `system_config.remotion.deployed_bundle_id` Update.

**Aktivierungs-Sequenz (in dieser Reihenfolge):**
1. `bash scripts/deploy-remotion-bundle.sh` → neue Bundle-ID notieren
2. `UPDATE system_config SET value = to_jsonb('<neue-bundle-id>'::text) WHERE key = 'remotion.deployed_bundle_id';` (oder wie auch immer der Key heißt — siehe Memory `lambda-bundle-deployment-and-verification`)
3. `UPDATE system_config SET value = 'true'::jsonb WHERE key = 'composer.silent_faces_v183';`
4. Neue Multi-Speaker-Szene rendern. Log-Grep: `v183_silent_slots ENABLED`.

**Solange Bundle nicht neu ist, bleibt der Flag auf false.** Bei aktiviertem Flag mit alter Bundle würde Lambda `silentSlots` im Payload einfach ignorieren (Feld ist optional im Schema) — kein Absturz, aber auch kein Silent-Faces-Effekt.

**Rollback:** `UPDATE system_config SET value = 'false'::jsonb WHERE key = 'composer.silent_faces_v183';` — instant, kein Redeploy nötig.

## Fix B — Turn-2 Retry Diagnose

Analyse der DB für Szene `1de5510b-9bc8-4ba3-b466-b2df31f1bbff`:

**Dispatch-Timeline für Turn 2:**
| t | Event |
|---|---|
| 22:38:36 | DISPATCH_ATTEMPT_STARTED (turn=2) |
| 22:41:02 | DISPATCH_ATTEMPT_STARTED (turn=2, zweites Mal, +2:26) |
| 22:41:10 | DISPATCHED http_status=201 |
| 22:43:26 | DISPATCHED http_status=201 (drittes Mal, +2:16) |

**Beobachtung:**
Die erste `DISPATCH_ATTEMPT_STARTED` um 22:38:36 hatte KEINEN zugehörigen `DISPATCHED`-Eintrag. Das heißt: der Preclip-Render oder die HEAD-Probes vor dem Sync.so-POST sind fehlgeschlagen und der Dispatcher hat 2:26 später neu angesetzt. Dann kam eine erfolgreiche Sync.so-Antwort um 22:41:10 — und trotzdem ein weiterer Dispatch um 22:43:26. Das zweite Redispatch riecht nach `sync-so-webhook` Transient-Retry (Retry-Ladder), aber Edge-Logs sind bereits rotiert und `retry_history` wird auf dem Pass-Slot nicht persistiert.

**Kosten dieses Retry-Musters:** ~4:30 min extra Wallclock (2:26 vor Dispatch 1, 2:16 zwischen Dispatch 1 und 2). Das erklärt fast exakt den Delta 16:31 vs. ~12 min erwartet.

**Empfehlung — kein Blind-Fix:**
Ohne reproduzierbaren Trigger oder Edge-Log-Snapshot kein sicherer Patch möglich. Als niedrig-hängende Frucht: **`retry_history` auf dem Pass-Slot persistieren** (in `sync-so-webhook` bei jedem Retry-Ladder-Wechsel append). Dann ist beim nächsten 16-min-Run sofort sichtbar, welcher Variant (`bbox-url-pro`, `coords-pro`, `sync3-coords`, …) welchen Fehler geworfen hat. Dieser Patch ist eigenständig, nicht Teil dieser PR.

## Validierung Fix A

Nach Bundle-Deploy + Flag ON:
- Edge-Log: `v183_silent_slots ENABLED speakers=3 crops=3 anchors=3 fallback=0`
- Finales MP4 einer Multi-Speaker-Szene: während des aktiven Sprecher-Fensters zeigen die anderen Gesichter das statische Portrait; **kein** Lip-Flap, **kein** Morph-Übergang.
- Wenn ein Portrait fehlt: die betroffene Slot-Region wird durch eine dunkle Kachel bedeckt (immer noch besser als ein sprechender Nicht-Sprecher).

## Nicht angefasst

- v141 State-Machine, v166 Anchor-ID Bridge, v167 Preclip Pre-Fanout, v168 Per-Pass Lock, v169-A Stale Reconcile, v188 Turn-Visibility Snap
- Sync.so Payload-Contract, Retry-Ladder, Pricing, Refund-Logik
- `COMPOSE_DIALOG_SEGMENTS_VERSION="v164"` String-Konstante
- Fix C (Preclip parallel beschleunigen) — deferred bis Fix B Root Cause klar ist
