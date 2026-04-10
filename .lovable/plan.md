

# Fix: Facebook Analytics Detail-Seite zeigt nicht alle Posts

## Problem
- Die Plattform-Übersicht zeigt korrekt "18 Posts" (kein Zeitfilter)
- Die Detail-Seite (`PlatformAnalytics.tsx`) filtert standardmäßig auf **30 Tage** → nur 4 Posts sichtbar
- 14 ältere Posts (Aug 2025 – März 2026) werden ausgeblendet
- Die 4 sichtbaren Posts sind echte Facebook-Posts, haben aber denselben Inhalt wie Instagram (Cross-Posts)

## Lösung
In `src/pages/Analytics/PlatformAnalytics.tsx`:

1. **Mehr Zeitfilter-Optionen hinzufügen**: 7 Tage, 30 Tage, 90 Tage, **Alle**
2. **Standard-Filter auf "Alle" setzen**, damit alle 18 Posts sofort sichtbar sind
3. **Post-Limit erhöhen** von 10 auf 20 für die Anzeige

### Änderungen
- `timeFilter` State erweitern: `"7" | "30" | "90" | "all"`, Default `"all"`
- `loadData()`: Bei `"all"` den `.gte("posted_at", ...)` Filter weglassen
- Select-Optionen: "7 Tage", "30 Tage", "90 Tage", "Alle"
- `posts.slice(0, 20)` statt `posts.slice(0, 10)`

## Betroffene Datei
- `src/pages/Analytics/PlatformAnalytics.tsx`

