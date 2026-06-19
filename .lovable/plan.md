# v131.6 — Anchor Identity Auto-Recovery (3rd Attempt + Per-Slot Face-Lock)

## Problem

Im Composer rendert Nano Banana 2 für `cinematic-sync`-Szenen mit ≥2 Cast-Mitgliedern manchmal **fremde Gesichter** statt der gewählten Avatare (Sarah/Matthew/Samuel/Kailee). Heutiger Ablauf in `compose-video-clips/index.ts`:

```text
attempt-1  → audit (Gemini Vision) → swap erkannt
attempt-2  → swap-retry mit mismatch-Liste → audit
            ├─ ok   → weiter zu Hailuo/Sync.so
            └─ fail → HARD-FAIL „anchor_identity_failed" + Re-Render-Button
```

User-Beobachtung: „meistens wird sie dann korrekt ersetzt" — der Swap-Retry funktioniert normalerweise. Diesmal hat aber auch Attempt 2 den Swap nicht aufgelöst (Screenshot: ref #1 = Samuel und ref #4 = Sarah waren mit fremden Personen vertauscht), und die Szene endet als roter Fehler bevor überhaupt ein Hailuo-Credit ausgegeben wird.

Das ist ärgerlich, weil:
- der Re-Render-Klick fast immer beim 3. Versuch durchgeht → der User macht effektiv nur, was wir auch automatisch machen könnten
- es bricht die „one-click stitch all"-Pipeline, sobald **eine** Szene swappt
- es wirkt wie ein Lip-Sync-Problem, ist aber rein im Anchor-Compose

## Lösung — Auto-Recovery 3. Versuch + Per-Slot Face-Lock

### 1. Dritter Compose-Versuch mit verschärftem Prompt

In `compose-video-clips/index.ts` direkt nach attempt-2 einen `attempt-3` einbauen, **nur** wenn `identityFailure === "swap"` (clone/missing/extra haben andere Ursachen und profitieren nicht von einer 3. Runde). Stufung:

| Versuch | Modus | Prompt-Schärfe |
|---|---|---|
| 1 | normal | Standard-Framing |
| 2 | `strictSwapMode: true` mit Mismatch-Liste | „diese Slots wurden vertauscht — neu rendern" |
| 3 (**neu**) | `strictSwapMode: true` + `faceLockMode: true` | „pro Slot **face-only crop** des Identity-Portraits direkt übernehmen, keine kreative Interpretation der Gesichter" |

### 2. Neuer `faceLockMode` in `compose-scene-anchor`

`compose-scene-anchor/index.ts` erweitern um Flag `faceLockMode: boolean`. Wenn true:
- Identity-Portraits als **dedizierte „face exemplar"-Bilder** vor das Compose schicken (zusätzlich zu den Wardrobe-Refs)
- Prompt-Suffix: `"For each numbered reference, copy the FACE from the identity exemplar EXACTLY (geometry, jaw, eyes, nose, hairline). Do not invent new faces, do not blend faces, do not substitute. Outfits come from the wardrobe references."`
- `temperature: 0` für Gemini Image (deterministischer)

### 3. Forensik-Trail

Jeder Attempt schreibt einen Eintrag in `composer_scenes.audio_plan.twoshot.anchor_attempts[]`:
```json
{ "attempt": 3, "mode": "face-lock", "identity": "ok", "faces": 4, "humans": 4, "at": "..." }
```
Damit sieht der „Forensik"-Button im UI sofort, wie viele Runden gebraucht wurden.

### 4. UI: stiller Fortschritt statt rotem Fehler während Retry

`SceneCard` (Composer): wenn `twoshot_stage === "anchor"` und `clip_status === "in_progress"` → bestehender goldener Spinner bleibt. Erst wenn nach Attempt-3 noch `identityFailure` gesetzt ist, wird der bisherige rote „Re-Render empfohlen"-Block angezeigt (Logik unverändert, aber feuert seltener).

### 5. Tests + Doku

- Neuer Unit-Test `_shared/identity-audit.test.ts` (existiert noch nicht) — verifiziert swap-Erkennung
- Neuer Doku-Eintrag `mem/architecture/video-composer/v131-6-anchor-auto-recovery.md`
- `mem/index.md` aktualisieren

## Geänderte Dateien

- `supabase/functions/compose-video-clips/index.ts` — Attempt-3 Block + `anchor_attempts[]` Log
- `supabase/functions/compose-scene-anchor/index.ts` — neues `faceLockMode` Flag
- `src/components/video-composer/SceneCard.tsx` (oder äquivalente Fehler-UI) — keine sichtbare Änderung außer dass Fehler später erscheint
- `mem/architecture/video-composer/v131-6-anchor-auto-recovery.md` (neu)
- `mem/index.md`

## Was bewusst NICHT geändert wird

- Lip-Sync-Pipeline (v131.5 bleibt unangetastet — anderes Subsystem)
- Credit-Logik: Hailuo/Sync.so werden weiterhin erst NACH bestandenem Audit dispatched, kein zusätzlicher Spend
- Audit-Schwellen in `identity-audit.ts` — Erkennung war korrekt, nur Recovery hat gefehlt

## Verifikation

Nach Deploy + „Clip neu rendern" auf einer betroffenen Szene erwarten wir im Forensik-Log:
- `anchor_attempts.length ≤ 3`
- letzter Eintrag mit `identity: "ok"`
- `clip_status` läuft direkt zu `rendering` weiter, kein roter Toast mehr für ≥95 % der Fälle.
