---
name: Lip-Sync Feature Freeze v400
description: Lip-Sync-Kette ist ab 03.08.2026 eingefroren; alle Tuning-Werte liegen in lipsync-frozen-contract.ts und werden durch zwei Tests bewacht
type: constraint
---

Die Lip-Sync-Pipeline ist seit dem 03.08.2026 **FROZEN auf v400**. An diesem Tag
hat die Kette zum ersten Mal seit dem 27.07. auf allen vier Sprechern getroffen.

## Verbindliche Regeln

- Keine Änderungen an Gates, Schwellenwerten, Preclip-Framing, Reprojektions-Maske,
  Provider-Payload oder Zustandsmaschine der Lip-Sync-Kette.
- Alle Tuning-Werte stehen ausschliesslich in
  `supabase/functions/_shared/lipsync-frozen-contract.ts`. Module dürfen keine
  eigenen Literale mehr deklarieren.
- Zwei Tests bewachen den Freeze:
  `_shared/lipsync-frozen-contract.test.ts` (Deno) und
  `src/lib/composer/__tests__/lipsyncFrozenContract.test.ts` (vitest, CI).
  Ein Bruch dieser Tests ist das Signal, nicht das Hindernis.
- Erlaubt bleiben: P0-Crashes, Refund-Korrekturen, reine Telemetrie, Copy.
- Verboten: neue Gates, neue Provider, Retry-Mechanismen jeder Art.
- Unfreeze nur durch ausdrückliches "unfreeze lipsync" mit konkretem Scope.

## Eingefrorene Kernwerte

targetFaceShare 0.42 · minCropSizePx 128 · outputSizePx 720 · native 720–1280 ·
legacy fallback 512 · Maske radial 30 %→78 % · Face-Overlay 2.2 / 0.6 ·
Provider sync-3, sync_mode cut_off, asd_auto_detect false, Concurrency 4 ·
Watchdog 4 / 10 / 6 / 25 min, Recovery-Cooldown 90 s.

## Health-Check

Edge Function `lipsync-selftest` (GET, kreditfrei) prüft Contract, Secrets,
hängende Szenen, verwaiste Dispatch-Locks und den Golden Run. HTTP 200 = grün,
503 = Abweichung. Vor jedem Deploy an der Kette aufrufen.

## Dokumente

- `.lovable/LIPSYNC-FEATURE-FREEZE.md` — Scope und Regeln
- `docs/lipsync-pipeline-v400.md` — Vollspezifikation T1–T16 + Fehlercodes
- `docs/lipsync-golden-run-v400.md` — Referenzlauf
  (Scene `c934a823-47de-49b7-a62e-a116b49ca3b2`, 4 Pässe, sync-3, preclip_used=true)
