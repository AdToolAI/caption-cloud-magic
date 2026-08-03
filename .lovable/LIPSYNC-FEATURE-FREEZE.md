# Lip-Sync Pipeline — Feature Freeze

**Status:** FROZEN as of **v400** (Anchor/Plate-Kohärenz + Run-Identität), 2026-08-03.
**Referenzlauf:** siehe `docs/lipsync-golden-run-v400.md`.
**Spezifikation:** siehe `docs/lipsync-pipeline-v400.md`.

Am 2026-08-03 hat die Kette zum ersten Mal seit dem 27.07.2026 auf allen vier
Sprechern einer Szene korrekt getroffen. Dieser Zustand ist eingefroren.

## Was "frozen" bedeutet

Keine Änderungen an Gates, Schwellenwerten, Framing, Reprojektion, Provider-Payload
oder Zustandsmaschine in den unten gelisteten Dateien.

Alle Tuning-Werte liegen zentral in
`supabase/functions/_shared/lipsync-frozen-contract.ts` und werden von zwei Tests
bewacht:

- `supabase/functions/_shared/lipsync-frozen-contract.test.ts` (Deno)
- `src/lib/composer/__tests__/lipsyncFrozenContract.test.ts` (vitest, läuft in CI)

Wer einen Wert verstellt, bricht diese Tests. Das ist beabsichtigt.

## Gefrorener Scope

Backend (`supabase/functions/`):

```text
_shared/scene-run-begin.ts          _shared/pass-face-preclip.ts
_shared/scene-run.ts                _shared/syncso-face-gate.ts
_shared/scene-hard-reset.ts         _shared/syncso-preflight.ts
_shared/plateFaceSlotRouter.ts      _shared/plate-face-detect.ts
_shared/plate-face-identity.ts      _shared/twoshot-face-map.ts
_shared/camera-path.ts              _shared/compute-mouth-centered-crop.ts
_shared/face-detect-mediapipe.ts    _shared/face-crop.ts
_shared/face-count.ts               _shared/face-frame-extract.ts
_shared/cast-clause.ts              _shared/lipsync-fail.ts
_shared/plate-attempt.ts            _shared/anchor-min-face-size.ts
_shared/dialogPassTransition.ts     _shared/provider-tracker.ts

compose-video-clips/                compose-dialog-segments/
sync-so-webhook/                    remotion-webhook/
lipsync-watchdog/                   reset-lipsync-scene/
```

Frontend / Remotion:

```text
src/remotion/templates/DialogStitchVideo.tsx
src/remotion/templates/DialogTurnFaceCropVideo.tsx
```

## Erlaubte Änderungen während des Freeze

- P0-Crashes und Datenverlust.
- Credit-Refund-Korrekturen (Refunds müssen idempotent bleiben).
- Reine Telemetrie und Logging, ohne Einfluss auf Verzweigungen.
- Copy, Übersetzungen, Fehlermeldungs-Texte im UI.
- Infrastruktur ausserhalb der Kette (Lambda-Kapazität, Cron-Intervalle).

## Verbotene Änderungen

- Neue oder geänderte Gates und Schwellenwerte.
- Umbau des Preclip-Framings oder des Kamerapfads.
- Änderungen an der Maskengeometrie der Reprojektion.
- Zusätzliche oder ausgetauschte Provider im Lip-Sync-Pfad.
- Retry-Mechanismen jeder Art (NOOP-Retry wurde in v353 bewusst abgeschafft).
- Änderungen an der Zustandsmaschine oder an den Guard-Triggern.

## Vier Invarianten (nicht verhandelbar)

1. **Anchor-Kohärenz** — Geometrie wird ausschliesslich auf `reference_image_url`
   gemessen. Niemals auf `lock_reference_url` oder einem älteren Bild.
2. **Run-Identität** — jeder Lauf startet über `beginSceneRun()` und stempelt
   `active_run_id` + `plate_generation`.
3. **Run-Guard** — der Webhook schreibt nur Ergebnisse, deren Job zum aktuellen
   Lauf gehört; alles andere wird als `run_guard_discarded` verworfen.
4. **Assignment-Lock** — Sprecher → Gesichts-Slot wird einmal deterministisch
   (row-major) bestimmt und danach nie neu berechnet.

## Unfreeze

Nur durch ausdrückliche Aussage **"unfreeze lipsync"** mit konkretem Scope.
Ein Unfreeze verlangt vorher einen grünen Referenzlauf mit vier Sprechern und
danach einen erneuten Golden-Run-Eintrag.
