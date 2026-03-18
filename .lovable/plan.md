

# Phase 6: Loft-Film Visual Cleanup — Artefakte entfernen, Komposition verbessern

## Analyse der neuen Screenshots

**Fortschritt:** Sichtbar besser als Version 1. Badges, Character-Rotation, differenzierte Glass-Panels, CTA-Button — alles da. Aber es gibt 4 konkrete Störfaktoren, die den "Agentur-Look" brechen:

### Verbleibende Probleme

| # | Problem | Schwere | Screenshot |
|---|---------|---------|------------|
| 1 | **StatsOverlay zeigt Hex-Codes** — "#F5C76A" und "#55760" werden als Statistik-Text gerendert | Kritisch | Feature-Szene |
| 2 | **Emoji FloatingIcons** — ⚠️❌😰✨🎯 schweben im Frame, wirken billig und unprofessionell | Hoch | Problem & Hook |
| 3 | **DrawOnEffect-Artefakte** — Roter Kreis um Warndreieck, blaue Pfeile oben links wirken wie Debug-Overlays | Hoch | Problem & Hook |
| 4 | **Text zu tief** — bei Problem/Solution/Feature sitzt Glass-Panel am unteren Rand, schneidet teilweise ab | Mittel | Alle non-hook Szenen |

## Geplante Änderungen

### 1. StatsOverlay: Hex-Code-Sanitierung (Template)
**Datei:** `UniversalCreatorVideo.tsx` — `StatsOverlay` Komponente (Zeile 464-536)

Vor dem Rendern jedes Stats-Eintrags prüfen:
- Enthält der String ein `#` gefolgt von Hex-Zeichen → **verwerfen**
- String kürzer als 3 Zeichen oder nur Zahlen ohne Label → **verwerfen**
- Maximal 5 Wörter pro Stat erlauben, Rest abschneiden

### 2. FloatingIcons: Emoji durch dezente geometrische Formen ersetzen
**Datei:** `UniversalCreatorVideo.tsx` — `FloatingIcons` Komponente (Zeile 654-701)

Statt Emoji (⚠️❌😰) dezente, halbtransparente geometrische Formen rendern:
- Kreise, Rauten, kleine Linien in `primaryColor` mit 15-25% Opacity
- Größe 6-16px statt 32px Emoji
- Langsamer Float, weniger visuelles Rauschen
- Das erzeugt "lebendigen Hintergrund" ohne vom Inhalt abzulenken

### 3. DrawOnEffect: Auf CTA beschränken
**Datei:** `UniversalCreatorVideo.tsx` — Zeile 2736-2748

`DrawOnEffect` nur noch für `cta`-Szenen rendern (Checkmark/Arrow als Akzent). Für hook/problem/solution/feature deaktivieren, da die SVG-Overlays wie Fehler aussehen auf den generierten Hintergrundbildern.

### 4. Text-Panel höher positionieren
**Datei:** `UniversalCreatorVideo.tsx` — `TextOverlay` Komponente (Zeile 1927-1929)

Für non-hook/cta Szenen: `bottom: 60` → `bottom: 0` mit `padding-bottom: 40px` und Glass-Panel mit `maxWidth: 80%` statt 75%. Das Panel soll mehr Raum einnehmen und sich natürlicher in die Komposition einfügen.

### 5. Bundle-Canary
`UCV_BUNDLE_CANARY` auf `2026-03-18-r56-phase6-visual-cleanup`.

## Dateien

| Datei | Änderung |
|-------|----------|
| `UniversalCreatorVideo.tsx` | Stats-Sanitierung, FloatingIcons→Geometrie, DrawOnEffect einschränken, Text-Position |

## Hinweis
Template-Änderungen erfordern S3-Bundle-Redeploy. Edge Functions bleiben unverändert.

