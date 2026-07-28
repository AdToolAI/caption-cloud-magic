## Problem

Die „Letzte Aktivitäten"-Karte zeigt echte, aber sehr alte Events an (`performance.account.disconnected`, `performance.synced` — alle „vor 3 Monaten"). Zwei Baustellen:

1. **Inhaltlich**: Es fließen nur technische System-Events (`connections_tab`) rein, weil aktuell keine neuen Nutzer-Events entstehen. Zusätzlich fehlen für `performance.*` die freundlichen Labels — deshalb sieht der Nutzer den rohen Event-Key.
2. **Visuell**: Der Feed ist eine einfache vertikale Liste mit gleichförmigen Kacheln — solide, aber nicht „AdTool-AI-würdig".

## Fix Teil 1 — Datenqualität (klein, gezielt)

`src/components/dashboard/RecentActivityFeed.tsx` + `src/lib/eventBus.ts`

- `getRecentEvents(limit, sinceDays = 30)` erweitern: optional `occurred_at >= now() - interval` Filter.
- Feed ruft mit `sinceDays: 30` auf. Wenn `< 3` Events → Fallback: die 10 neuesten ohne Zeitfilter, aber mit sichtbarem „Archiv"-Badge statt „Neu".
- Friendly-Labels ergänzen für: `performance.synced`, `performance.account.disconnected`, `performance.account.connected`, `performance.token.expired`, `performance.insight.generated` (DE/EN/ES).
- Zeit-Formatierung: bei Events älter als 14 Tage statt „vor 3 Monaten" das Datum („28. Apr. 2026") — wirkt weniger nach „tote Seite".
- Leerer/veralteter Zustand bekommt CTA: „Verbinde einen Kanal → live Signale sehen" (Link zu `/performance-tracker?tab=connections`).

## Fix Teil 2 — Visueller Redesign „Signal Log" (das, was noch keiner hat)

Neuer Look statt der klassischen Timeline: eine **cinematische Oszilloskop-Zeitleiste** im Bond-Gold-Stil.

```text
┌──────────────────────────────────────────────────────────┐
│  ● SIGNAL LOG          [30-Tage Puls Sparkline ▁▂▅▇▃▁▂]  │
├──────────────────────────────────────────────────────────┤
│  HEUTE ─────────────────────────────────────────────────  │
│    ╱╲    ● Caption erstellt        · Instagram · 14:02   │
│   ╱  ╲___● Post geplant            · LinkedIn · 11:20    │
│  DIESE WOCHE ───────────────────────────────────────────  │
│     ·────● Hook generiert          · TikTok · Mo         │
│  ÄLTER ─────────────────────────────────────────────────  │
│     ·────○ performance.synced      · 28. Apr.            │
└──────────────────────────────────────────────────────────┘
```

Konkret gebaut:

1. **Header-Sparkline**: 30-Tage Aktivitäts-Heatline (eigene Aggregation aus `app_events` per Tag), als goldener SVG-Path mit Glow. Live-Puls-Dot am rechten Ende.
2. **Zeit-Buckets** statt flacher Liste: `Heute`, `Diese Woche`, `Diesen Monat`, `Archiv`. Jede Gruppe collapsible, mit Count-Badge.
3. **Oszilloskop-Rail** links: geschwungene SVG-Kurve (keine gerade Linie), die zwischen den Event-Knoten oszilliert; Knoten-Amplitude reflektiert „Signal-Wichtigkeit" (Goal completed = hoher Ausschlag, Sync = flach).
4. **Event-Karten**: horizontale Glass-Tiles mit
   - Icon-Chip (bestehend)
   - Titel + Plattform-Chip mit Plattform-Farbe (Instagram/LinkedIn/TikTok/YouTube/X/Facebook)
   - Rechts: Uhrzeit für heute, Wochentag für Woche, Datum für älter
   - Hover: sanfter Gold-Sweep (`hub-card-shimmer`-Klasse gibt's schon), Card lift `-y-0.5`
5. **Newest-Event Hero-Zeile**: erstes Event doppelt so hoch, mit animiertem Puls-Ring um Icon und dezenter Waveform-Animation im Hintergrund.
6. **Filter-Chips** oben rechts: `Alle · Content · Performance · Ziele` — filtern in-place.
7. **Empty-/Stale-State**: statt Sparkles-Icon eine ruhig pulsierende Radarkreisen-SVG + „Verbinde Kanäle für Live-Signale" CTA-Button.

### Technische Details

- Neue Datei `src/components/dashboard/signal-log/`:
  - `SignalLog.tsx` — Ersatz-Export für `RecentActivityFeed` (alter Import bleibt kompatibel via re-export in `RecentActivityFeed.tsx`).
  - `SignalSparkline.tsx` — SVG 30-Tage Puls (nutzt `getDailyMetrics` bzw. aggregiert `app_events`).
  - `SignalRail.tsx` — SVG-Oszilloskop-Kurve zwischen Knoten (framer-motion `path` draw-on).
  - `SignalRow.tsx` — Einzelne Event-Zeile inkl. Plattform-Chip.
  - `signalBuckets.ts` — Gruppierung nach Heute/Woche/Monat/Archiv (date-fns `isToday`, `isThisWeek`, `isThisMonth`).
  - `platformStyles.ts` — Plattform → Farbe/Icon Mapping (Instagram-Pink, LinkedIn-Blau, TikTok-Cyan, YouTube-Rot, X-White, Facebook-Blau).
- `friendlyEventLabels` in eigene Datei `src/lib/friendlyEventLabels.ts` extrahieren und um `performance.*`-Keys erweitern.
- Kein Backend-Change, keine neue Tabelle. `app_events` bleibt Quelle.
- Design-Tokens ausschließlich (`primary` = gold, `accent` = cyan, `card/50`, `white/10`). Keine hardcoded Farben außer Plattform-Brand-Chips.

## Nicht-Ziele

- Keine Änderung am `app_events` Schema oder RLS.
- Kein neuer Realtime-Channel (bereits über `useGoalCompletionListener` etc. abgedeckt; kann später ergänzt werden).
- Keine Änderung an Performance-Tracker oder Analytics-Seiten.

## Deliverable

Home-Feed wirkt live, gruppiert und cinematisch; alte Events landen im Archiv-Bucket mit klarem Datum statt „vor 3 Monaten"; leere Konten sehen einen einladenden CTA statt technische Log-Zeilen.