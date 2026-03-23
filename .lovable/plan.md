

# Plan: Dashboard Hero durch Video-Karussell ersetzen

## Überblick
Der aktuelle `HeroBanner` (KI-gestützt Badge, CTAs, Trust Section) wird durch ein swipbares Video-Karussell ersetzt. Mittleres Video groß, seitliche Videos kleiner sichtbar — genau wie in der Skizze.

## Datenquellen

**Priorität 1: Best-performendes Video**
- Aus `video_creations` Tabelle: sortiert nach `download_count + share_count` (= Performance-Score)
- Platz 1 = höchster Score, wird initial zentriert angezeigt

**Priorität 2: Letzte 10 selbst erstellte Videos**
- Wenn kein Video Performance-Daten hat: `video_creations` sortiert nach `created_at DESC LIMIT 10`

**News-Player (Platzhalter)**
- Eigener Bereich unter/neben dem Karussell für Update-/Feature-/Demo-Videos
- Aktuell mit Platzhalter-Karten, da Videomaterial noch kommt

## UI-Aufbau (basierend auf Skizze)

```text
┌──────────────────────────────────────────────┐
│  ┌─────┐   ┌───────────┐   ┌─────┐          │
│  │  ▶  │   │     ▶     │   │  ▶  │          │
│  │small│   │   GROSS   │   │small│          │
│  └─────┘   └───────────┘   └─────┘          │
│         ← swipe links / rechts →             │
│  ● ○ ○ ○ ○  (Dots)                          │
└──────────────────────────────────────────────┘
```

- Embla Carousel (bereits im Projekt vorhanden)
- Mittlere Karte skaliert größer (`scale-100`), seitliche kleiner (`scale-85 opacity-60`)
- Play-Button Overlay auf jeder Karte
- Klick öffnet `VideoPreviewPlayer` Dialog (existiert bereits)

## Umsetzung

### 1. Neue Komponente `DashboardVideoCarousel.tsx`
**Datei:** `src/components/dashboard/DashboardVideoCarousel.tsx`

- Nutzt `useVideoHistory()` für eigene Videos
- Sortiert nach Performance-Score (downloads + shares), Fallback: `created_at`
- Embla Carousel mit `loop: true`, `align: 'center'`
- Jede Karte zeigt: Thumbnail (erstes Frame oder Platzhalter), Titel, Erstellungsdatum, Play-Button
- Aktive Karte (Mitte) ist größer, seitliche sind kleiner und leicht transparent
- Swipe-Gesten + optionale Pfeile links/rechts
- Pagination Dots unterhalb

### 2. News-Sektion (Platzhalter)
Unterhalb des Video-Karussells ein kleiner Bereich "News & Updates":
- 2-3 Platzhalter-Karten mit "Demnächst" Badge
- Wird später mit echten Demo-/Feature-Videos gefüllt

### 3. HeroBanner ersetzen
**Datei:** `src/pages/Home.tsx`

- `<HeroBanner />` (Zeile 185) durch `<DashboardVideoCarousel />` ersetzen
- Wenn keine Videos vorhanden: Fallback-UI mit "Erstelle dein erstes Video" CTA

### 4. Auto-Update
- `useVideoHistory()` nutzt bereits `react-query` mit `queryKey: ['video-history']`
- Nach jedem neuen Video-Render wird `invalidateQueries(['video-history'])` aufgerufen → Karussell aktualisiert sich automatisch

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/dashboard/DashboardVideoCarousel.tsx` | **Neu** — Video-Karussell mit Performance-Ranking |
| `src/pages/Home.tsx` | `HeroBanner` → `DashboardVideoCarousel` ersetzen |

## Erwartetes Ergebnis
- Dashboard zeigt sofort die besten/neuesten Videos im Karussell
- Swipebar links/rechts mit zentriertem Fokus-Video
- Klick auf Play öffnet Video im Dialog
- Neue Videos erscheinen automatisch nach Erstellung

