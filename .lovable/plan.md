

## Plan: Horizontalen Overflow auf der Startseite beheben

### Problem
Die Seite kann horizontal gescrollt werden. Mehrere Ursachen:

1. **Kein `overflow-x-hidden` auf dem Root-Container** — der äußere `div` in Home.tsx hat nur `min-h-screen bg-background`, lässt aber seitliches Überlaufen zu.
2. **Video-Carousel mit negativen Margins** — die 3D-Karussell-Karten nutzen `marginLeft: '-32px'` und `marginRight: '-32px'`, was über den Container hinausragen kann.
3. **News-Ticker Marquee** — die doppelte Scroll-Animation mit `whitespace-nowrap` kann über die Seitenbreite hinausreichen, ist aber in `overflow-hidden` — sollte ok sein.
4. **CreditBalance-Karte** — wird als vollständige Card im Status-Bar gerendert, was unnötig breit ist (das ist eher ein Platzproblem als Overflow, aber trägt zur Gesamtbreite bei).

### Lösung

**`src/pages/Home.tsx`** (Zeile 491):
- `overflow-x-hidden` zum Root-Container hinzufügen: `<div className="min-h-screen bg-background overflow-x-hidden">`

**`src/components/dashboard/DashboardVideoCarousel.tsx`**:
- Den äußeren Carousel-Container ebenfalls mit `overflow-hidden` absichern, damit die negativen Margins nicht über den Seitenrand ragen.

### Betroffene Dateien
- `src/pages/Home.tsx` — 1 Zeile ändern
- `src/components/dashboard/DashboardVideoCarousel.tsx` — `overflow-hidden` auf den Perspective-Container

### Was sich nicht ändert
- Keine funktionalen Änderungen, keine DB-Migration, kein Redesign

