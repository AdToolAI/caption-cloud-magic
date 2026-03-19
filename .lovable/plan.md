

# Analyse: Aktueller Stand vs. Loft-Film 95%

## Was bereits gut funktioniert (ca. 80-85%)

- KI-generierte Hintergründe sind stimmig und kontextbezogen (Dashboard, Charts, Office)
- Szenen-Badges (HOOK, PROBLEM, LÖSUNG, FEATURE, JETZT HANDELN) sind farbcodiert und professionell
- Glasmorphismus-Panels mit szenenspezifischer Bordüre (rot/grün/blau) sehen hochwertig aus
- Character-Rotation (Presenter/User/Expert) mit passenden Emotionen und Gesten
- CTA-Szene zeigt die volle URL `www.useadtool.ai`
- Sättigungs-Filter auf Hintergründen verhindert blasse KI-Bilder
- Text ist kurz und scanbar gehalten

## Gap-Analyse: Was fehlt zu 95%

### 1. SVG-Charaktere wirken amateurhaft (Hauptproblem)
Die Strichfiguren-Charaktere (großer Kopf, dünner Körper) brechen den Premium-Look massiv. Loft-Film nutzt illustrierte 2D-Charaktere mit Details: Kleidung, Haare, Proportionen, weiche Schatten. Die aktuellen SVG-Charaktere sehen aus wie Whiteboard-Skizzen neben KI-fotorealistischen Hintergründen — ein Stilbruch.

### 2. Übergänge zwischen Szenen sind unsichtbar
Im Screenshot sieht man abrupte Schnitte. Loft-Film nutzt weiche, cineastische Übergänge (Wipe, Cross-Dissolve, Zoom-Through) mit 15-25 Frames Overlap. Aktuell wird `fade` als Default verwendet, was kaum wahrnehmbar ist.

### 3. Text-Panels sind statisch positioniert
Alle Non-Hook-Panels sitzen unten links mit identischem Layout. Loft-Film variiert: mal links, mal rechts, mal Vollbild-Overlay, mal minimaler Text. Die Monotonie fällt bei 6 Szenen auf.

### 4. Kein subtiles Motion im Hintergrund
Die KI-Bilder sind komplett statisch. Loft-Film wendet auf statische Bilder immer einen langsamen Ken-Burns-Effekt (2-3% Zoom über die Szene) an, damit das Bild "atmet".

### 5. CTA-Szene: Zwei Charaktere wirken deplatziert
In der CTA-Szene stehen links und rechts je eine Figur — das lenkt vom CTA ab und wirkt unnatürlich.

## Vorgeschlagener Plan: Phase 13 — Loft-Film Polish

### Schritt 1: Ken-Burns auf alle KI-Hintergründe
In `SceneBackground` einen subtilen Ken-Burns-Effekt (scale 1.0→1.06, translateX ±15px) über die Szenen-Dauer einbauen, damit statische Bilder lebendig wirken.

**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx` (SceneBackground-Sektion)

### Schritt 2: Szenenübergänge verbessern
Den Default-Übergang von `fade` auf `crossfade` mit 20 Frames Dauer setzen. Für spezifische Szenentypen: Hook→Problem: `wipe`, Solution→Feature: `slide`, Feature→CTA: `zoom`. Dies wird im Edge Function `auto-generate-universal-video` konfiguriert.

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts` (Transition-Zuweisung)

### Schritt 3: Text-Panel Layout-Variation
Statt alle Non-Hook-Panels identisch unten-links zu platzieren, Layout per Szenentyp variieren:
- Problem: unten-links (wie jetzt)
- Solution: unten-links mit breiterem Panel
- Feature: unten-rechts (gespiegelt)
- Proof: zentriert mit Zitat-Stil

**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx` (TextOverlay positionStyle)

### Schritt 4: SVG-Charaktere aufwerten
Die aktuellen Strichfiguren durch detailliertere SVG-Illustrationen ersetzen: proportionaler Körper, Kleidungsdetails, weiche Schatten, größere Variation zwischen den Typen. Das ist der größte einzelne Qualitätssprung.

**Datei:** `src/remotion/components/AnimatedCharacter.tsx` (oder wo die SVG-Pfade definiert sind)

### Schritt 5: CTA-Szene: Nur ein Charakter
Die CTA-Szene sollte maximal einen Charakter (Presenter, rechts) zeigen, nicht zwei. Der zweite Charakter links lenkt ab.

**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx` (shouldShowCharacter Logic)

## Priorisierung

| Prio | Maßnahme | Impact auf Loft-Film % |
|------|----------|----------------------|
| 1 | Ken-Burns auf Hintergründe | +3% (alles wirkt lebendig) |
| 2 | Text-Panel Layout-Variation | +2% (weniger repetitiv) |
| 3 | Bessere Übergänge | +2% (flüssiger Film-Look) |
| 4 | SVG-Charaktere aufwerten | +5% (größter Stilbruch behoben) |
| 5 | CTA: nur ein Charakter | +1% (saubererer Fokus) |

**Geschätzter Stand nach Phase 13: ~92-95%**

Der größte verbleibende Gap wäre dann Audio (Voiceover + Musik), das separat vom visuellen Rendering adressiert werden muss.

## Technische Details

- Keine DB-Migration nötig
- Ken-Burns und Layout-Variation sind reine Template-Änderungen (Remotion-Bundle muss re-deployed werden)
- Übergangs-Konfiguration erfordert Edge-Function-Änderung
- Charakter-Upgrade ist die aufwändigste Einzelmaßnahme (neue SVG-Pfade)
- Alle Änderungen sind abwärtskompatibel

