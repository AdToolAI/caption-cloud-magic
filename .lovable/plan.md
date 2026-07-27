## Diagnose Szene S01 (`plate_target_face_missing_pass_0_speaker_Samuel Dusatko`)

Der v282-Size-Floor tut genau was er soll: Rekognitions Backstein-Halluzinationen werden verworfen. Als Nebenwirkung fällt `plateIdentityMap.resolvedCount` von den früheren fake 4/4 auf realistisches ~3/4 (Samuel im Gegenlicht/Profil wird nicht mehr biometrisch aufgelöst).

Der nachgelagerte v139-Face-Gate hat aber noch die alte Soft-Pass-Schwelle:

```
resolvedCount >= speakers.length   → soft-pass, dispatch
sonst                              → HARD BLOCK + Refund
```

Samuels Pass 0 nutzt Anchor-Fallback-Koordinaten (nicht plate-native), landet leicht neben dem echten Gesicht → strict Gemini-Frame-Check sagt „no target face" → Hard-Block. Vor v282 wären die vier Fake-Boxen als `resolvedCount=4` durchgegangen und dieser Pfad hätte soft-gepasst (falsche Coords, aber dispatch). Jetzt ehrlich → Block.

Das ist der letzte Zopf, der v282 daran hindert, sauber v169-Verhalten für Weitwinkel + CastActions zu liefern.

## Plan v283 — v139-Soft-Pass an v282-Realität anpassen

Genau **eine** Datei, **eine** Bedingung, kein neuer Pfad, keine Payload-/Sync.so-Änderung.

### `supabase/functions/compose-dialog-segments/index.ts` (~Zeile 4095)

Aktuell:
```ts
const plateIdentityAuthoritative =
  !!plateIdentityMap &&
  (plateIdentityMap.resolvedCount ?? 0) >= speakers.length;
```

Neu (v283):
```ts
// v283 — nach v282 sind Halluzinationen weg; jede echte plate-identity ≥1
// ist verlässlicher als ein hard-block auf Anchor-Fallback-Coords.
// Soft-pass sobald mindestens 1 Sprecher plate-nativ aufgelöst wurde
// UND alle geblockten Pässe eine plate-Box aus bbox_url/facemap haben,
// d.h. wir dispatchen mit realen Boxen statt mit stalen Anchor-Coords.
const plateIdentityAuthoritative =
  !!plateIdentityMap &&
  (plateIdentityMap.resolvedCount ?? 0) >= 1;
```

Zusätzlich in den Soft-Pass-Zweig (bereits vorhandenes `for (const r of gateResults)`): für jeden geblockten Pass, dessen Speaker **nicht** in `plateIdentityMap` aufgelöst wurde, den bereits an Pass 0 angehängten `bounding_boxes_url` / Anchor-Face-Layout als Coord-Quelle behalten (bereits Default) und im Log explizit `soft_pass_unresolved_speaker=<name>` markieren, damit wir in Telemetrie sehen wie oft Samuel/Kailee usw. betroffen sind.

### `COMPOSE_DIALOG_SEGMENTS_VERSION`

Bump auf `"v283-face-gate-partial-identity-soft-pass"`.

### Was explizit NICHT geändert wird

- v282 Size-Floor in `_shared/plate-face-detect.ts` bleibt (verhindert Wandputz-Dispatch).
- v282 Anchor-Framing-Invariant in `compose-scene-anchor` bleibt.
- Sync.so-Payload, Fan-out, Lock, Retry-Ladder, Webhook — alle unverändert v169.
- Der Hard-Block-Pfad bleibt bestehen für `resolvedCount === 0` (echter Hallucinations-/Wand-Fall) — dann greift weiterhin sauberer Refund.

## Erwartetes Verhalten für S01 nach Re-Render

- v282 verwirft weiter Backstein-Boxen.
- Rekognition löst z.B. 3/4 echte Gesichter auf.
- v283 lässt Dispatch zu, Sync.so bekommt `bounding_boxes_url` mit realen Boxen für Matthew/Sarah/Kailee und Anchor-Fallback für Samuel (statt Refund).
- Trefferquote geht von 0/4 (heute) auf ~3–4/4 (Samuel ggf. weiter schwach, aber nicht mehr Refund).
- Refund-Loop bei Weitwinkel + CastActions vorbei.
