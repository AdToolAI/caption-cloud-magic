

# Phase 4: Loft-Film Quality Upgrade

## Analyse der aktuellen Screenshots

Die Szenen sehen bereits gut aus -- Badges, sauberer Text, Charakter rechts. Aber es fehlt noch der "Wow-Faktor" von Loft-Film. Die konkreten Lücken:

1. **Gleicher Charakter in jeder Szene** -- immer derselbe blaue Typ ("presenter"). Keine Abwechslung.
2. **Charakter fehlt in Feature-Szene** -- `shouldShowCharacter` zeigt ihn nur in hook/intro/problem/solution/cta, nicht in feature/proof.
3. **Charakter zu klein** -- 180x340px SVG ist im 1920x1080 Frame sehr klein.
4. **`truncateToWords` hat noch "..."** -- Zeile 1808 fügt immer noch `…` hinzu (wird zwar nicht mehr aufgerufen, aber als Safety Net sollte es sauber sein).
5. **CTA-Button statisch** -- kein Pulsieren, kein Glow-Effekt.
6. **Kein visueller Unterschied zwischen Szenen-Typen** -- alle Glass-Panels sehen gleich aus.

## Geplante Änderungen

### 1. Template: Charakter in ALLEN Szenen zeigen + Typ-Rotation
**Datei:** `UniversalCreatorVideo.tsx`

- `shouldShowCharacter`: `feature` und `proof` hinzufügen -- Charakter soll in allen inhaltlichen Szenen sichtbar sein.
- Charakter-Typ je nach Szene rotieren: `hook` = presenter, `problem` = user, `solution` = expert, `feature` = presenter, `proof` = expert, `cta` = presenter. Das bringt visuelle Abwechslung.

### 2. Template: Charakter größer skalieren
- SVG-Container von `180x340` auf `220x400` vergrößern (viewBox bleibt, `width`/`height` steigt).
- Bottom-Position von `5%` auf `2%` anpassen für bessere Verankerung.

### 3. Template: Glass-Panel pro Szenen-Typ differenzieren
- Hook/CTA: Stärkerer Blur (20px), leichter Glow-Border in primaryColor.
- Problem: Roter Akzent-Border links (4px solid, rot).
- Solution: Grüner Akzent-Border links.
- Feature: Blauer Akzent oben statt links.
- Proof: Subtiler Zitat-Rahmen mit Anführungszeichen-Glow.

### 4. Template: CTA-Button Puls-Animation
- Pulsierender `boxShadow` auf dem CTA-Button: `0 4px 24px ${primaryColor}` oscilliert zwischen 60% und 100% Opacity.
- Subtiler Scale-Pulse: `1.0 → 1.03 → 1.0` alle 60 Frames.

### 5. Template: `truncateToWords` Safety-Fix
- Zeile 1808: `…` durch `.` ersetzen (falls je aufgerufen, endet Text mit Punkt statt Ellipsis).

### 6. Bundle-Canary
`UCV_BUNDLE_CANARY` auf `2026-03-10-r55-phase4-loftfilm-polish`.

## Dateien

| Datei | Änderung |
|-------|----------|
| `UniversalCreatorVideo.tsx` | Charakter alle Szenen + Typ-Rotation, größer, Glass-Panel Differenzierung, CTA-Pulse, truncate-Fix |

## Hinweis
Template-Änderungen erfordern erneutes S3-Bundle-Deploy.

