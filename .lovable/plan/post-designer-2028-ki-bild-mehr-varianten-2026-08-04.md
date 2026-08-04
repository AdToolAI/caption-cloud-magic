# Post Designer 2028: KI-Bild + mehr Varianten

Ziel: Aus einem Briefing entsteht nicht nur Text auf Vorlage, sondern ein komplett fertiger Post — inklusive KI-Bild aus dem Picture Studio, mehr Layout-Richtungen und einer Auswahl-Oberfläche, die sich nach 2028 anfühlt.

## 1. Picture Studio verdrahten (Kern)

Im Briefing-Schritt eine Bildquelle wählen:
- **KI-Bild (Standard)** — die KI schreibt aus dem Briefing selbst einen Bild-Prompt und generiert das Motiv über das Picture Studio.
- Eigenes Bild / Mediathek / Stock (wie bisher)
- Ohne Bild (reines Typo-Design)

Ablauf bei "KI-Bild": Briefing → Copy + Bild-Prompt in einem KI-Schritt → Bild wird generiert, während die Varianten schon gesetzt werden → sobald das Bild da ist, erscheint es live in allen Varianten. Kein Warten auf einem leeren Screen.

Zusätzlich im Editor: Button **"Motiv neu denken"** — generiert ein alternatives Bild zum gleichen Briefing (anderer Winkel/Stimmung), direkt austauschbar.

Der Bild-Prompt wird bewusst als Negativ-Raum-Prompt gebaut (ruhige Fläche für Text an der Stelle, wo das Layout die Headline setzt), damit Typografie immer lesbar sitzt.

Kosten: KI-Bild kostet Bild-Credits wie im Picture Studio. Der Preis wird vor dem Generieren sichtbar angezeigt; ohne Bild-Option bleibt der Flow kostenfrei.

## 2. Mehr Varianten

Statt 4 fixer Vorlagen: **8 Varianten** in zwei Reihen, aus vier Design-Familien gemischt (Bold, Editorial, Split, Minimal) — je Familie eine mit Bild und eine typo-lastig. Vorlagen kommen aus dem bestehenden 22er-Katalog, gewichtet nach Plattform (Instagram/LinkedIn/Facebook) und Tonalität.

Dazu:
- **"Mehr Richtungen"**-Button lädt 4 weitere Varianten nach.
- **Würfel-Button** pro Variante: gleiche Vorlage, neue Copy-Zeile.
- Farbwelt-Umschalter über der Galerie: Brand-Kit / Dunkel-Gold / Hell / Kontrast — alle Varianten wechseln gleichzeitig.

## 3. 2028-Look der Auswahl

Das Raster wirkt aktuell wie ein Formular. Neu:
- Karten in einem gestaffelten Raster mit Tiefe: leichte 3D-Neigung bei Hover, goldener Rand-Glow, Reflexion am unteren Rand.
- Ladephase als Sequenz mit sichtbaren Schritten (Motiv → Typografie → Marke → Feinschliff) statt reiner Schimmer-Blöcke.
- Beim Erscheinen faden Varianten versetzt ein; ausgewählte Karte zoomt in den Editor (geteiltes Element, kein harter Sprung).
- Kopfzeile zeigt das erkannte Briefing-Thema und die genutzte Markenfarbe als kleine Chips.
- Fehlerbild bei zu langer Headline wird verhindert: Text skaliert automatisch, statt sich zu überlappen (siehe Screenshot "Minimal Overlay").

## 4. Textüberlauf-Fix

Der Renderer bekommt Auto-Fit: Schriftgröße wird pro Textebene reduziert, bis der Text in die Ebene passt (min. 55 % der Zielgröße), plus Zeilenumbruch-Logik. Damit sehen alle Varianten in der Galerie sauber aus.

## Technische Umsetzung

- `generate-post-design`: liefert zusätzlich `imagePrompt` (Englisch, für Bildqualität) und `variants` auf 8 erweitert.
- Neue Client-Funktion ruft `generate-studio-image` (`quality: 'fast'`, `aspectRatio: '1:1'`) asynchron auf; Ergebnis via `setSlideImage` in alle Varianten gespiegelt.
- `templates.ts`: Auswahlfunktion `pickVariants(platform, tone, count)` statt fester ID-Liste.
- `SlideRenderer.tsx`: Auto-Fit über Messung mit `ResizeObserver`/Kanvas-Textmessung, deterministisch auch im Export (gleiche Berechnung bei 1080 px).
- `VariantGallery.tsx`: neues Raster, Motion-Layout-Übergang in den Editor, Nachladen und Würfeln.
- `PostDesigner.tsx`: Bildquellen-Auswahl im Briefing, Kostenhinweis, Farbwelt-Umschalter, "Motiv neu denken".
