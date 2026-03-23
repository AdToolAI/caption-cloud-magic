

# Plan: Video-Karussell komplett überarbeiten

## Analyse der Probleme

1. **Videos sind schwarz/leer**: Die URLs sind gültig (AWS S3 Links), aber `preload="metadata"` lädt bei Cross-Origin oft kein Frame. Ohne `thumbnail_url` (alle `null`) bleibt alles schwarz.
2. **Hover-Autoplay funktioniert nicht**: Embla Carousel fängt Pointer-Events für Drag-Gesten ab — `mouseenter`/`mouseleave` werden blockiert.
3. **Kein Zahnrad-Gefühl**: Die Karten liegen nicht dicht genug übereinander.

## Lösungen

### 1. Video-Vorschau reparieren
- `preload` von `"metadata"` auf `"auto"` ändern und `crossOrigin="anonymous"` hinzufügen
- Fallback: Wenn kein Poster/Thumbnail, ein dunkles Gradient-Overlay mit Play-Icon zeigen
- `onLoadedData` Event nutzen um zu erkennen ob Video geladen wurde

### 2. Hover-Autoplay ohne Embla-Konflikt
- Statt `mouseenter`/`mouseleave` auf dem Embla-Container: **IntersectionObserver** + Embla's `select` Event nutzen
- Das **aktive** (zentrierte) Video spielt automatisch muted ab
- Alle anderen Videos pausieren automatisch
- Beim Swipen: altes Video pausiert, neues startet

### 3. Echtes Zahnrad-Design
- Embla-Einstellungen: `slidesToScroll: 1`, `containScroll: false`, `align: 'center'`
- `flexBasis: 50%` für die aktive Karte (größer), Karten überlappen sich durch CSS `margin: -24px`
- Aktive Karte: `scale(1.0)`, `z-index: 30`, volle Opacity, primärer Glow-Ring
- 1. Nachbar: `scale(0.82)`, `z-index: 20`, `opacity: 0.6`, `translateX(±10px)` nach innen geschoben
- 2. Nachbar: `scale(0.65)`, `z-index: 10`, `opacity: 0.3`
- **Kein `rotateY`** — die Skizze zeigt flache Überlappung, kein 3D-Drehen
- Runde Ecken (`rounded-2xl`) auf allen Karten

### 4. Klick zum Vergrößern
- Klick auf aktive Karte öffnet den `VideoPreviewPlayer` Dialog (mit Ton)
- Klick auf inaktive Karte scrollt zu dieser Karte (wird zur aktiven)

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/dashboard/DashboardVideoCarousel.tsx` | Komplett überarbeitet |

