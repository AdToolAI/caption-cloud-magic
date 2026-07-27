# Plan v267 — Anchor als Referenz zurück, Audit als Soft-Signal

## Kontext / was v266 kaputtgemacht hat

v266 hat den composed Anchor (Nano Banana 2) für Multi-Speaker Cinematic-Sync komplett aus dem Provider-Input entfernt und nur die Rohportraits an Hailuo/HappyHorse gegeben. Ergebnis: Face-Morphs und Identitätsdrift kommen zurück, und Sprecher 2 wurde beim Lip-Sync nicht getroffen, weil die Face-Map ohne stabile 2-Shot-Referenz auf der Video-Plate driftet.

Der composed Anchor war also nicht das Problem — das Problem war der **harte Audit-Gate** davor, der bei „missing/clone/swap" die ganze Szene blockiert hat.

## Zielbild v267

- Composed Anchor (Nano Banana 2, 2-Shot / Group-Shot) wird wieder erzeugt und **als `reference_image_url` an den Video-Provider gegeben** (wie vor v266).
- Der Gemini Identity-Audit läuft weiter, aber **nur noch als Signal**, nie als Hard-Block:
  - `ok` → grün weiter
  - `missing/clone/swap/ambiguous` → weiter mit Warnung, Log-Tag `v267_anchor_soft_warn`, Warnung in `composer_scenes.warnings` persistieren
- Der einzige verbleibende Hard-Fail auf Anchor-Ebene ist **Face-Count < erwartete Anzahl** (klarer technischer Fehler, kein Identitätsurteil).
- Preview-Gate (AnchorPreviewGate) bleibt als optionale User-Bestätigung erhalten — der User kann den Anchor vor dem teuren Video-Render prüfen.

## Konkrete Änderungen

### `supabase/functions/compose-video-clips/index.ts`
- `CINEMATIC_SYNC_NO_ANCHOR` Default auf `"0"` (Anchor wieder AN).
- Anchor-Block (Attempt 1/2/3, Face-Lock, Strict-Retry) bleibt aktiv.
- **Aber:** finaler „identityFailure blockt Szene"-Zweig wird für alle N entschärft:
  - Nur noch blocken wenn `faces_detected < expected` (echter Headcount-Fehler).
  - `identity_missing / clone / swap / ambiguous` → nicht mehr `safeMarkSceneFailed`, sondern:
    - `warnings.push({ code, message, ts })` in `composer_scenes`
    - Log `v267_anchor_soft_warn`
    - Anchor trotzdem als `reference_image_url` speichern und Pipeline fortsetzen.
- v250 Soft-Pass / v262 Min-Face-Retry / v263 Missing-Guard bleiben als *Verbesserungsversuche* aktiv, dürfen aber nicht mehr failen.

### `supabase/functions/compose-dialog-segments/index.ts`
- Keine Logikänderung nötig — die Face-Map läuft auf der Video-Plate. Aber:
- Wenn `reference_image_url` vorhanden ist, wird sie beim Prompt an Hailuo/HappyHorse als Multi-Reference übergeben (wie vor v266). Das stabilisiert Sprecher 2/3/4 gegen Morph.

### `src/components/video-composer/AnchorPreviewGate.tsx` & `SceneCard.tsx`
- Bleiben. Preview-Modus zeigt den composed Anchor + Warnungen aus `warnings[]`.
- User-Buttons: „Trotzdem rendern" / „Neu komponieren" / „Abbrechen".
- Kein automatisches Blocken — der User entscheidet bei Warnungen.

### `SceneClipProgress.tsx`
- Zeigt Warnungen aus `scene.warnings` als gelbes Badge („Identity-Check unsicher"), ohne die Szene als failed zu markieren.

### Datenbank
- Migration: `warnings JSONB DEFAULT '[]'::jsonb` auf `composer_scenes` (falls noch nicht vorhanden).
- Reset für aktuell hängende v266-Szenen des Users, damit sie mit der zurückgeholten Anchor-Referenz sauber neu rendern.

### Feature-Flag
- `CINEMATIC_SYNC_NO_ANCHOR` bleibt als Kill-Switch, Default `"0"`. Auf `"1"` = v266-Verhalten (nur Notfall-Rollback).

## Was ausdrücklich NICHT geändert wird
- Sync.so Multi-Face-Pipeline, Face-Map, Preclips, v129/v264 Race-Guards.
- Single-Speaker Cinematic-Sync.
- `compose-scene-anchor` interne Logik (Two-/Group-Shot Prompt, Portrait-Cap 4, Outfit-Lock).
- Voice/Script/Dialog-Turn-Logik.

## Ergebnis
- Anchor stabilisiert wieder alle Sprecher gegen Morphs → Sprecher 2/3/4 werden vom Lip-Sync sauber getroffen.
- Falsch-positive Audit-Fehler (missing/clone bei ähnlichen Nachnamen) blockieren die Szene nie mehr — sie werden nur als Warnung angezeigt.
- Echte technische Fehler (Face-Count zu niedrig, Provider-Fehler) blocken weiterhin sauber mit Refund.
- User hat via Preview-Gate + Warnungen volle Kontrolle, ohne automatische Refund-Schleifen.
