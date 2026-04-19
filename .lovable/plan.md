

## Befund

In Bild 1 ist klar zu sehen: Die Wochenleiste zeigt 3 Strategie-Vorschläge (Mo Instagram 21:00, Mi Facebook 21:00, Fr YouTube 21:00). Aber der Pill „Nächster Post" oben zeigt weiterhin **„Kein Post geplant"**.

### Root Cause

Der Pill „Nächster Post" wird in `Home.tsx` aus `calendar_events` (echte geplante Posts) gespeist — **nicht** aus `strategy_posts` (KI-Vorschläge des Strategie-Modus). Beide Quellen sind aktuell entkoppelt:

- **Wochenleiste (Strategy-Mode AN)** → liest aus `strategy_posts` via `useStrategyMode`
- **Pill „Nächster Post"** → liest aus `calendar_events` via bestehender Query in `Home.tsx`

Solange der User einen Strategie-Vorschlag nicht aktiv in den Kalender übernommen hat, existiert für ihn kein `calendar_event` → Pill bleibt leer.

## Plan: Pill „Nächster Post" mit Strategy-Modus verbinden

### Logik
Im Strategy-Mode wird die nächste anstehende Quelle aus **beiden Tabellen** ermittelt und die zeitlich nächste gewinnt:

```text
nextPost = min(
  nextCalendarEvent.start_at,
  nextStrategyPost.scheduled_at WHERE status='pending' AND scheduled_at >= now()
)
```

Bei Strategy-Mode OFF → nur `calendar_events` (wie bisher).

### Anzeige-Anpassungen im Pill
- Wenn der nächste Eintrag aus `strategy_posts` stammt:
  - Label-Zeile: „NÄCHSTER VORSCHLAG" (statt „NÄCHSTER POST")
  - Wert-Zeile: Plattform + lokalisiertes Datum/Zeit (z. B. „Mo 21:00 · Instagram")
  - Klick öffnet `StrategyPostDialog` (statt `NextPostDialog`)
- Wenn aus `calendar_events`: bestehendes Verhalten

### Visuelle Verbindung der Punkte (Bild 1)
Aktuell stehen die Tageskarten in `WeekStrategyTimeline` als isolierte Cards nebeneinander → keine erkennbare „Reise". Lösung:
- Dünne horizontale Verbindungslinie hinter den Tagen (wie eine Timeline-Schiene), gold/dimmed.
- An jedem Tag mit Vorschlag → kleiner glühender Knotenpunkt (Gold), an leeren Tagen → muted Punkt.
- Aktuelle Linie zwischen Punkten zeigt die wöchentliche Kontinuität.

```text
   ●━━━━━○━━━━━●━━━━━○━━━━━●━━━━━○━━━━━○
   So    Mo    Di    Mi    Do    Fr    Sa
```
(● = Tag mit Post, ○ = leerer Tag)

### Umsetzung

1. **`src/pages/Home.tsx`**:
   - Im Strategy-Mode den nächsten `pending` Strategy-Post aus `useStrategyMode().posts` ermitteln (frühestes `scheduled_at` ≥ jetzt).
   - Mit dem aktuellen `nextCalendarEvent` mergen → der zeitlich nächste gewinnt.
   - Daten-Objekt für `DashboardVideoCarousel` um Quelle (`source: 'calendar' | 'strategy'`) erweitern.

2. **`src/components/dashboard/DashboardVideoCarousel.tsx`** (Pill + Dialog-Routing):
   - Label dynamisch: „Nächster Post" vs. „Nächster Vorschlag".
   - Klick → bei `source='strategy'` öffnet `StrategyPostDialog`, sonst `NextPostDialog`.

3. **`src/components/dashboard/WeekStrategyTimeline.tsx`** (Verbindungslinie):
   - Hinter der 7-Spalten-Grid-Reihe ein absolut positioniertes `<div>` mit horizontaler Gradient-Linie (`from-warning/30 via-warning/50 to-warning/30`, `h-px`).
   - Pro Tageskarte einen kleinen Knotenpunkt (4×4px) auf der Linie zentrieren — bei `posts.length > 0` mit `bg-warning shadow-[0_0_8px_hsl(var(--warning))]`, sonst `bg-muted-foreground/30`.

### Betroffene Dateien
- `src/pages/Home.tsx` — Merge-Logik für nächsten Post
- `src/components/dashboard/DashboardVideoCarousel.tsx` — Dynamisches Label + Dialog-Routing
- `src/components/dashboard/WeekStrategyTimeline.tsx` — Verbindungslinie + Knotenpunkte

### Erwartetes Ergebnis
- Pill „Nächster Post" zeigt sofort den nächsten Strategie-Vorschlag (z. B. „Mo 21:00 · Instagram"), sobald Strategy-Mode AN ist — keine leere Anzeige mehr.
- Klick öffnet Detail-Dialog mit Caption-Entwurf und Reasoning.
- Wochenleiste hat eine sichtbare Timeline-Schiene mit Knotenpunkten — Tage wirken verbunden, nicht isoliert.

