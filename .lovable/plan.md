# v157 — Tight-Mouth-Box (fix der „Animorphs" bei Sprecher 2–4)

## Was die Logs verraten

Alle 4 Pässe laufen sauber durch v156-AWS-Anchor-Detection, jede Box ist **distinkt und plate-nativ** (links → rechts: Samuel, Matthew, Kailee, Sarah):

| Pass | Sprecher          | Box                    | W×H        | Aspect (H/W) | Area % |
|------|-------------------|------------------------|-----------|---------------|--------|
| 1    | **Samuel** (links, ✅) | [228, 59, 397, 318]    | 169 × 259 | **1.53**      | 3.5 %  |
| 2    | Matthew (❌)       | [459, 94, 604, 292]    | 145 × 198 | 1.37          | 2.7 %  |
| 3    | Kailee (❌)        | [818, 181, 947, 357]   | 129 × 176 | 1.36          | 2.2 %  |
| 4    | Sarah (rechts, ❌) | [1006, 128, 1163, 372] | 157 × 244 | **1.55**      | 3.6 %  |

Eine echte Face-Bbox hat Aspect ≈ 1.1–1.3 (Stirn→Kinn). **Alles über 1.4 ist Kopf + Hals + Schultern.** Im Dispatch wird die Box dann zusätzlich um **+15 %** gepaddet (Z. 3775–3780), und vorher hat der Cluster-Code in `face-detect-mediapipe.ts` (Z. 372–377) bereits **+10 %** draufgelegt. Effekt: aus einer 1.5er-Torso-Box wird eine 1.7er Brust-Box.

Was Sync.so jetzt sieht:
- **Samuel (funktioniert):** er steht ganz außen links, redet aktiv, sein eigener Kopf füllt die obere Hälfte der Box gut — Sync.sos faceMask findet seine Lippen.
- **Matthew / Kailee / Sarah (Animorphs):** die Boxen reichen weit ins Schulter-/Hals-/Hintergrund-Areal. Der Sync.so-FaceMask trifft Pixel, wo gar kein Mund ist → er „morphed" das nächstbeste Mund-ähnliche Muster (Schatten, Kinn des Nachbarn, Hemd-Falte) = der typische **„Animorph"-Artefakt**.

Die `validatePlateFacesGeometry` (die genau solche Torso-Boxen mit `bbox_aspect_torso_like` raussiebt) wird **nur auf Gemini-Ergebnisse angewendet**, nicht auf AWS — das ist die offene Flanke.

Zusätzlich: AWS Rekognition liefert pro Gesicht ein präzises **`mouth`-Landmark** (`mouthLeft/Right/Down`). v155 hat das schon teilweise verdrahtet, aber Sync.so bekommt aktuell **die volle Bbox**, nicht den Mund.

---

## Lösung v157 — drei chirurgische Eingriffe

### 1. AWS-Geometry-Gate + Auto-Tighten (`_shared/plate-face-detect.ts`)

Nach dem AWS-Detect (Z. 515) und **bevor** das Ergebnis cached/zurückgegeben wird, prüfen:

- Wenn `bbox.h / bbox.w > 1.35` ODER `bbox.h / plateH > 0.22` → **Auto-Tighten**:
  - Anker = `mouth`-Landmark falls vorhanden, sonst Bbox-Center
  - Neue Box: Breite = bisheriges `w`, Höhe = `w * 1.15` (Stirn→Kinn-Verhältnis), zentriert auf Mund-y (bzw. obere ⅓ der alten Box)
- Falls die getightete Box immer noch über 25 % Höhe ist → `hard fail` (sauberer Refund, kein Pseudo-Lipsync).

Wir behalten damit den AWS-Vorteil (korrekte Links-rechts-Position, korrektes Mund-Landmark) und werfen nur den Torso-Anteil weg.

### 2. Dispatch-Padding entfernen, Mouth-zentrierte Box bauen (`compose-dialog-segments/index.ts`, Z. 3771–3786)

Heute:
```ts
const padX = (bx2 - bx1) * 0.15;
const padY = (by2 - by1) * 0.15;
```
→ vergrößert eine bereits zu hohe Box weiter.

Neu, **wenn `plateFace.mouth` vorhanden** (AWS-Anchor-Pfad ≙ Default):
- Box-Breite = `face.bbox.w * 0.90` (leicht tighter als Gesicht — Sync.so will den Mundbereich)
- Box-Höhe = `Box-Breite * 0.55` (Lippen-Region, nicht ganzes Gesicht)
- Zentriert auf `mouth = [mx, my]`
- Geclampt an Plate-Dimensionen

Ohne `mouth` (Legacy / Cartoon-Rescue): Bbox-Center + Höhe-Anteil = nur obere 55 % der Bbox (Stirn–Kinn), `padX/padY` werden auf **0 %** reduziert.

Loggen unter `v157_tight_mouth_box` mit `aspect_in`, `aspect_out`, `mouth_used`.

### 3. Cluster-Pad reduzieren (`_shared/face-detect-mediapipe.ts`, Z. 372–373)

Da wir bei v156-Anchor-First **genau einen Frame** an AWS schicken, gibt es nichts zu „clustern". Die +10 % bringen nur Pixel-Bleed:
```ts
const padX = Math.round((ux2 - ux1) * 0.10);  // wird 0
const padY = Math.round((uy2 - uy1) * 0.10);  // wird 0
```
→ auf `0` setzen. Geometry-Gate und ggf. Tighten erledigen das saubere Sizing in Schritt 1.

---

## Cache-Migration

Bestehende `plate_face_cache`-Zeilen wurden mit den fetten Torso-Boxen gespeichert. Migration: alle Zeilen mit `detector LIKE 'aws_rekognition%'` evicten (`expires_at = now()-1s`), damit der nächste Render neu detektiert mit v157-Tighten.

---

## Akzeptanzkriterien

- Logs: `v157_tight_mouth_box mouth_used=true aspect_in=1.53 aspect_out=0.55` für alle 4 Pässe.
- Box-Area % sinkt auf ~0.5–1.5 % (statt 2.2–3.6 %).
- Visuelles Ergebnis: alle 4 Sprecher (Samuel, Matthew, Kailee, Sarah) bekommen saubere Lip-Sync ohne Morphs.
- Anchor-Drift (Hailuo ±5–15 %) wird durch das engere Box-Profil rund um das Mund-Landmark toleriert.

---

## NICHT angefasst

- AWS-Anchor-First-Strategie selbst (v156 bleibt korrekt).
- Cartoon-Fallback (Gemini-Pro auf Anchor).
- Hard-Fail-Logik bei partial / 0 Faces.
- Slot→Speaker Identity-Mapping (per-character-hungarian bleibt).

## Token-/Kostenwirkung

Keine — nur Geometrie-Anpassungen auf bereits berechneten Detection-Ergebnissen. Kein zusätzlicher AI-Call, kein zusätzliches Storage.
