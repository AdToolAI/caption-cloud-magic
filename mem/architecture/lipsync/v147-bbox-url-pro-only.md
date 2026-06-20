---
name: v147 bbox-url-pro Primary für Multi-Speaker
description: Full-Plate Multi-Speaker Dispatch nutzt `bbox-url-pro` als Default statt `coords-pro`/auto_detect. Pre-Dispatch Validation + sauberer Downgrade ersetzen den v126-Provider-Unknown-Loop.
type: feature
---

## Kontext
- v146 Forensik (Run `0b3dafc5`, Gemini-2.5-Flash) bewies: Hailuo-Plates sind sauber — Sarah-Gesicht bei 32.6% Frame-Coverage, Mund sichtbar.
- `face_gate_failed:count=0` in Produktion kommt nicht von schlechten Plates, sondern von Sync.so `auto_detect`, das auf stilisierten Multi-Face Hailuo-Plates nicht zuverlässig lockt.
- v126 hatte bbox-url-pro deaktiviert wegen `provider_unknown_error` (Szene cba18767) — aber ohne Pre-Validation/Fallback.

## Änderung (compose-dialog-segments/index.ts)

### Fresh-Dispatch Variant
```ts
const v147BboxEligible =
  speakers.length >= 2 &&
  havePlateIdentityForDispatch &&
  !!plateDims &&
  !hasPassPreclipForDispatch;
const freshDefaultVariant = v147BboxEligible ? "bbox-url-pro" : "coords-pro";
```

### Collapse-Gate
v144-Collapse (bbox-url-pro → coords-pro) wird auf Fresh-Dispatch übersprungen (`isFreshBboxPrimary`). Legacy-Retry-Inheritance bleibt gekappt, um v126-Loops zu vermeiden.

### Pre-Dispatch Validation
Nach `uploadBoundingBoxesJson`:
- `usedUrl && nonNullFrames >= 1` → bbox-url-pro Dispatch.
- Sonst → deterministischer Downgrade auf `coords-pro` (kein stiller inline-Fallback mehr für `bbox-url-pro` Variante).
- `coords-pro-box` Variante behält den inline-Pfad (explizite Admin-Wahl).

## Was NICHT geändert wurde
- Preclip-Path: Rule 0 → `auto_detect:true` auf single-face Crops bleibt (well-understood, kein face_gate_failed).
- Single-Speaker Fresh-Dispatch: bleibt `coords-pro`.
- `_shared/asd-strategy.ts`: keine Änderung.
- `sync-so-webhook` Retry-Ladder: unverändert.
- Schema, Pricing, Refund-Logik: unverändert.

## Risiko & Mitigation
- **Risiko**: v126-Regression (`provider_unknown_error`).
- **Mitigation**: Pre-Validation (`nonNullFrames >= 1`) + Downgrade-Pfad auf `coords-pro`. v126 hatte beides nicht.

## Validierung
1. Multi-Speaker Szene auf `/video-composer` triggern.
2. Log nach `v147_bbox_url_pro_primary` und `v147_BBOX_URL_PRIMARY` greppen.
3. Bei Upload-Fail: `v147_BBOX_DOWNGRADE_TO_COORDS_PRO` muss erscheinen.
