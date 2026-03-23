

# Plan: Video-Karussell reparieren und modernisieren

## Probleme identifiziert

1. **Videos sind leer / Play reagiert nicht**: Der Code greift auf `video.video_url` und `video.title` zu — diese Felder existieren nicht in der DB. Die richtigen Felder sind `output_url` und Titel aus `metadata` (JSON-Feld).

2. **Design nicht wie Zahnrad/Skizze**: Die Karten sind aktuell flach nebeneinander mit Lücken statt eng überlappend wie ein Zahnrad.

## Umsetzung

### 1. Feldnamen korrigieren
**Datei:** `src/components/dashboard/DashboardVideoCarousel.tsx`

- `video.video_url` → `video.output_url`
- `video.title` → `(video.metadata as any)?.title || 'Video ' + video.id.slice(0, 8)`

### 2. Design modernisieren — eng überlappende Karten
Gleiche Datei, Carousel-Bereich komplett überarbeiten:

- `flexBasis` von `45%` auf `35%` reduzieren, damit 3 Karten sichtbar
- Kein `px-2` Gap, sondern negatives Margin für Überlappungs-Effekt
- Aktive Karte: `scale-105`, `z-10`, volle Opacity, Glassmorphism-Border
- Seitliche Karten: `scale-85`, `z-0`, `opacity-50`, leicht gedreht mit `perspective`
- Thumbnail-Bereich: subtiler Gradient-Overlay statt flachem Grau
- Play-Button: größer, mit Glow-Effekt auf der aktiven Karte
- Info-Bar: Glassmorphism-Hintergrund statt solidem `bg-card`
- Dots: modernere Pill-Form

### 3. Nur fertige Videos anzeigen
Videos mit `status !== 'completed'` oder ohne `output_url` filtern, damit keine leeren Karten erscheinen.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/dashboard/DashboardVideoCarousel.tsx` | Feldnamen fix + Design-Overhaul |

## Erwartetes Ergebnis
- Videos werden korrekt angezeigt (Thumbnails + Play funktioniert)
- Karten überlappen sich eng wie ein Zahnrad
- Moderneres Glassmorphism-Design mit Tiefeneffekt

