

# Plan: Video-Karussell überarbeiten — Hover-Autoplay + Zahnrad-Design

## Probleme

1. **Hälfte der Videos funktioniert nicht**: `video.output_url` zeigt auf Storage-Pfade ohne vollständige URL. Manche Videos haben relative Pfade (z.B. `video-assets/...`) statt absolute URLs (`https://...supabase.co/storage/v1/object/public/...`).

2. **Kein Zahnrad-Feeling**: Karten haben zu viel Abstand, keine echte Überlappung. Braucht engere Anordnung mit negativem Margin.

3. **Kein Hover-Autoplay**: Aktuell muss man klicken. Stattdessen soll das Video bei Hover/Scroll automatisch (muted) abspielen, Klick öffnet dann den großen Player.

## Umsetzung

### 1. URL-Reparatur für alle Videos
Beim Rendern jeder Karte die `output_url` prüfen:
- Wenn sie mit `http` beginnt → direkt nutzen
- Wenn sie ein relativer Storage-Pfad ist → Supabase Public URL konstruieren via `supabase.storage.from(bucket).getPublicUrl(path)`
- Mehrere Buckets prüfen: `universal-videos`, `video-assets`, `ai-videos`

### 2. Zahnrad-Design mit echter Überlappung
- `flexBasis` auf `30%` reduzieren (statt 38%)
- Negativer Margin (`-16px`) zwischen Karten für Überlappung
- Aktive Karte: `scale(1.15)`, `z-20`, prominent
- Seitliche Karten: `scale(0.75)`, `z-0`, stärker gedreht (`rotateY(8deg)`)
- 2. Reihe seitlich: noch kleiner, fast verdeckt — echtes "Rad"-Gefühl
- Dunklerer Gradient auf inaktiven Karten

### 3. Hover-Autoplay mit `<video>` Tag
Jede Karte bekommt ein echtes `<video>` Element statt nur Thumbnail:
- **Standard**: Video zeigt erstes Frame (Poster/Thumbnail), pausiert
- **Hover (mouseenter)**: Video startet muted autoplay — sofortige Vorschau
- **Mouseleave**: Video pausiert, springt zurück zum Anfang
- **Klick**: Öffnet den großen `VideoPreviewPlayer` Dialog (mit Sound)
- Ref-Array für alle Video-Elemente, um play/pause per Hover zu steuern

### 4. Thumbnail-Fallback
Wenn kein `thumbnail_url` vorhanden, das `<video>` Element selbst als Poster nutzen (`preload="metadata"` zeigt erstes Frame).

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/dashboard/DashboardVideoCarousel.tsx` | URL-Fix, Zahnrad-Layout, Hover-Autoplay |

## Erwartetes Ergebnis
- Alle Videos spielen ab (keine kaputten URLs mehr)
- Karten überlappen sich eng wie ein Zahnrad/Rad
- Hover über eine Karte startet stumme Vorschau
- Klick öffnet den großen Player mit Ton

