# Post Designer: Motiv und Typografie kollidieren

## Was im Screenshot auffällt

1. **Das KI-Motiv enthält selbst Text und Logo.** Auf jedem Bild steht "AdTool AI" und "14 TAGE KOSTENLOS TESTEN" auf einem Tablet. Das ist kein Zufall: Der Bildauftrag wird aktuell mit dem rohen deutschen Briefing gestartet (`generateImage(brief)`), nicht mit dem dafür vorgesehenen englischen, textfreien Bild-Prompt. Die Edge Function liefert bereits ein Feld `imagePrompt` mit den Regeln "kein Text, keine Buchstaben, kein Logo" und "ruhige Negativfläche" — es wird nur nie benutzt.

2. **Headline liegt auf dem Bildtext.** Weil das Motiv in der Bildmitte volle Struktur hat (Tablet, Hände, Schrift), landet die Headline mitten darauf. Sichtbar bei "Mehr Performance. Weniger Aufwand." und "Werbung, die einfach konvertiert." — doppelt lesbarer Text übereinander.

3. **Headline und Subline überlappen sich gegenseitig** (Variante "Split Layout": "Mehr Sales durch KI-Power." liegt auf der Subline). Die Schriftgröße wird zwar automatisch verkleinert, aber die Ebenen wissen nichts voneinander — reines Schrumpfen verhindert die Kollision nicht.

4. **Alle acht Varianten zeigen dasselbe Motiv** in identischem Bildausschnitt. Die Galerie wirkt dadurch wie eine Vorlage statt wie acht Richtungen.

5. **Das Raster läuft rechts aus dem Bild.** Die vierte Spalte ist angeschnitten.

## Was geändert wird

### 1. Richtigen Bild-Prompt verwenden (Kern)
Die Bildanfrage nutzt `copy.imagePrompt` statt des Briefings. Da das Bild parallel zur Copy startet, läuft es zweistufig: sofortiger Start mit einem aus dem Briefing abgeleiteten, englischen Prompt inklusive harter Textverbote — und sobald die Copy da ist, wird bei Bedarf mit dem präziseren `imagePrompt` nachgeschärft. Zusätzlich werden die Verbote ("no text, no letters, no typography, no logo, no watermark, no UI screens") immer angehängt, unabhängig davon, was die KI liefert.

### 2. Negativfläche passend zum Layout
Der Bild-Prompt bekommt je nach gewählter Variantenfamilie die Angabe, wo die ruhige Fläche liegen soll (unteres Drittel, linke Hälfte, Mitte frei). Damit sitzt die Headline nicht mehr auf dem Motiv.

### 3. Lesbarkeit erzwingen
Jede Bildvariante bekommt einen abgestimmten Abdunkelungs-Verlauf hinter dem Textbereich, damit Headline auch bei unruhigem Motiv steht. Text- und Subline-Ebenen werden vor dem Rendern auf Überschneidung geprüft: bei Kollision rückt die Subline nach unten bzw. die Headline wird weiter verkleinert, statt sich zu überlagern.

### 4. Motiv-Vielfalt
Zwei bis drei Motiv-Varianten statt einer: die Galerie mischt sie über die acht Karten, damit die Auswahl nach echten Richtungen aussieht. Typo-lastige Varianten bleiben bewusst ohne Bild.

### 5. Rasterbreite
Die Galerie bekommt korrekte Containerbreite, damit die vierte Spalte vollständig sichtbar ist.

## Technische Umsetzung

- `src/pages/PostDesigner.tsx`: `generateImage` erhält `buildImagePrompt(brief | copy.imagePrompt, layoutFamily)`; Zweistufigkeit über ein Refinement, das nur greift, wenn der Nutzer kein eigenes Bild gesetzt hat. Optional zweiter/dritter Motiv-Call für Vielfalt.
- Neue Datei `src/lib/post-design/imagePrompt.ts`: Prompt-Komposition, Negativ-Klauseln, Negativraum-Zone je Layout-Familie.
- `src/components/post-designer/SlideRenderer.tsx`: Kollisionsprüfung zwischen Textebenen (gleiche Berechnung in Vorschau und Export bei 1080 px) plus Scrim-Layer hinter Textblöcken.
- `src/components/post-designer/VariantGallery.tsx`: Grid-Breite/Padding korrigieren; Motiv-Zuordnung pro Karte.
