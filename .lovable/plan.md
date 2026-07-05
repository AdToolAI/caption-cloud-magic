# Diagnose (verifiziert an DB + Code, kein Rätselraten)

## Ursache 1 — „Alle Sprecher bewegen den Mund"

`supabase/functions/render-sync-segments-audio-mux/index.ts` Zeile 288–290:

```ts
const silentSlots: Array<{ x: number; y: number; size: number }> = [];
void silentSlots;
void v164SilentSlotsByExcludedIdx;
```

v164 Silent-Faces wurde **bewusst tot-gestellt** (nicht gelöscht, aber `void`-referenced), weil die alten Freeze-Tiles laut Kommentar Zeile 348–353 „ghost/morph artefacts" verursacht haben. Der Ersatz v182 (`tailFreezeFromSec`) hält jedoch **nur bei N=1** (`isSingleSpeakerTight = donePasses.length === 1 && anyTight`) den letzten Frame.

**Für Multi-Speaker existiert derzeit gar kein Listener-Mute** — deshalb bewegen im finalen Mux zwischen den aktiven Turn-Fenstern alle Gesichter des Plate ihren baked-in Mund.

## Ursache 2 — „16:31 statt ~10 min"

Szene `1de5510b` (3 Sprecher, `lip_sync_status=done`, `duration=16:31`), `syncso_dispatch_log` Zeitstempel:

| t+ (min:s) | Event |
|---|---|
| 0:00 | Dispatcher Start |
| 1:27 | Turn 0 → Sync.so 201 |
| 1:31 | Turn 1 & Turn 2 parallel `DISPATCH_ATTEMPT_STARTED` |
| 3:05 | Turn 1 → Sync.so 201 |
| 4:05 | Turn 2 → Sync.so 201 |
| 6:19 | Turn 2 **Retry** → Sync.so 201 (2. Mal) |
| ~16:31 | Fertig |

Feststellungen:
- **Fan-out ist aktiv** (`composer.parallel_sync_so_passes=true`, `sync_so_concurrency_cap=4`, `plan_d_fanout_force_enable=true`, `FEATURE_PER_PASS_LOCK`/`FEATURE_PLAN_D_FANOUT` im Code aktiv).
- Turn 1 und Turn 2 wurden **gleichzeitig gestartet** (22:38:36) — Fanout greift.
- Aber die Sync.so-201-Bestätigungen kamen 1 Min versetzt. Ursache liegt vor Sync.so-Enqueue: entweder Remotion-Lambda-Cold-Start pro Preclip oder serielle HEAD-Probes.
- Turn 2 hatte einen **transient Retry** ~2:14 nach dem ersten Dispatch. Dieser Retry allein kostet ~2 min Wallclock.
- Der finale Audio-Mux + Concat kann erst starten, wenn Turn 2 (nach Retry) fertig ist. Sync.so-Verarbeitung selbst = ~4–6 min pro Pass → Kritischer Pfad = Turn 2 + Retry.

# Fix

## Fix A — Multi-Speaker Listener-Mute (Silent-Faces v183)

Wiederbelebung der v164-Idee, **aber diesmal mit v182-Erkenntnissen** um Morph-Artefakte zu vermeiden.

**Datei:** `supabase/functions/render-sync-segments-audio-mux/index.ts` und `src/remotion/templates/DialogTurnFaceCropVideo.tsx` (falls das die aktive Template ist — sonst `DialogStitchVideo`).

1. Aktivieren des `silentSlots`-Payloads pro Shot: für jeden Fanout-Shot alle `preclip_crop`-Boxen der **anderen** Sprecher (aus `donePasses[i].preclip_crop`) sammeln und in `shot.silentSlots` schreiben. `void` entfernen.

2. Remotion-Template `SilentFaceFreeze`-Komponente: **kein `<Freeze frame={0}>` mehr** (das war die Morph-Ursache — Frame 0 hat oft noch Mund-Anfangs-Motion und beim Übergang zurück knallte es). Stattdessen: pro silent-slot ein `<Img>` mit einer **statischen Neutral-Portrait-Crop** aus dem Anchor-Frame des jeweiligen Sprechers (aus `passes[i].character_id` → brand_characters.anchor_portrait_url). Das Anchor-Portrait ist per Definition mund-geschlossen und liegt bereits in der DB.

3. Fallback wenn kein Anchor: harte Deckungs-Kachel (semi-opaque Rechteck in Plate-Hintergrundfarbe) — akzeptable minimale Störung, garantiert keine Mund-Motion.

4. Feathering des Silent-Slot-Div bewusst weit (feather-radius 12–16px), damit der Übergang zum Plate-Hintergrund weich bleibt.

**Bundle-Deploy** via `scripts/deploy-remotion-bundle.sh` und Bundle-ID in `system_config.remotion` aktualisieren — sonst rendert Lambda mit altem Bundle ohne die neue Logik.

Log-Tag: `v183_silent_slots speakers=N crops=K anchors=M fallback=F`.

## Fix B — Turn 2 Retry-Muster verstehen und reduzieren

**Nur Diagnose, kein Code-Change im ersten Schritt** — der Retry ist ein Symptom, nicht die Root Cause.

1. `syncso_dispatch_log` für Turn 2 der Szene `1de5510b` mit voller Payload lesen: `error_class`, `error_message`, `variant`, um zu sehen ob es `provider_unknown_error`, `face_detection` oder Timeout war.

2. `sync-so-webhook` Logs für Turn 2 der Szene ausfiltern: welcher Retry-Ladder-Variant war fällig (`bbox-url-pro` → `coords-pro` → …)?

3. Wenn Retry-Muster reproduzierbar bei bestimmten Konstellationen auftritt (z.B. bei Turn N wenn der Sprecher im Plate teilweise verdeckt ist): entweder v188-Snap (bereits deployed) greifen lassen ODER Preclip-Crop enger auf Face-BBox schneiden.

4. **Kein Blind-Fix** — erst wenn Ursache identifiziert, gezielter Patch. Sonst Risiko den v141 State-Machine-Hardening zu brechen.

## Fix C — Preclip-Render parallel beschleunigen (optional, nach Fix B)

Aktuell dauern Preclip-Renders 1:00–2:30 obwohl parallel dispatched. Ursache-Verdacht: Remotion-Lambda-Cold-Start oder `pass-face-preclip.ts` interne Serialisierung.

- `_shared/pass-face-preclip.ts` prüfen: gibt es dort ein Mutex/Await das Passes serialisiert?
- Falls ja: Preclips wirklich parallel rendern (Promise.allSettled).
- Erwarteter Gain: ~1 min Wallclock bei 3–4 Sprechern.

# Was NICHT angefasst wird

- v141 State-Machine (per-pass Locks, RPC writes)
- v166 Anchor-Identity Slot Bridge
- v167 Preclip Pre-Fanout
- v168 Per-Pass Lock
- v169-A Stale Reconcile
- v188 Turn-Visibility Snap (frisch deployed)
- Sync.so Payload-Contract, Retry-Ladder, Pricing, Refund-Logik
- `COMPOSE_DIALOG_SEGMENTS_VERSION="v164"` String-Konstante (log-grep continuity)

# Validierung

Nach Fix A Bundle-Deploy und einer neuen Multi-Speaker-Szene:
- Edge-Log: `v183_silent_slots speakers=3 crops=3 anchors=3 fallback=0`
- Finales MP4: pro aktivem Sprecher-Fenster stehen die anderen Gesichter still (Anchor-Portrait sichtbar), nur der aktive Sprecher animiert.
- Keine Morph-Übergänge beim Turn-Wechsel (Feathering-Test).

Nach Fix B Analyse:
- Bekannt: was löste den Turn-2-Retry aus. Entscheidung ob Fix nötig.

# Rollback

- Fix A: Feature-Flag `composer.silent_faces_v183` (default OFF beim Deploy, dann in Migration einschalten). Ausschalten via einzelnem SQL-Update, ohne Bundle-Redeploy — dann fallen die `silentSlots` im Payload auf `[]` zurück und das Template ignoriert sie.
