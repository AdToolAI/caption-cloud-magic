

## Wochenansicht neu gestalten: Horizontale Linie mit Plattform-Ringen

### Problem
1. Verpasste Posts bekommen nur +1h neue Zeit statt mindestens +6h
2. Layout ist ein Grid statt der gewuenschten horizontalen Linie (Mo-So)
3. Fehlende visuelle Plattform-Ringe mit Glow-Effekt
4. Klick auf Ring soll Composer/Editor oeffnen und Post in Kalender speichern

### Aenderungen

#### 1. `src/components/dashboard/WeekDayCard.tsx` — Komplett neu als horizontale Timeline-Karte

Neues Design pro Tag:
- Kompakte horizontale Darstellung in einer Reihe (Mo–So), scrollbar auf Mobile
- Jeder Tag zeigt: Tagesname + Nummer oben, darunter **leuchtende Plattform-Ringe**
- Ring-Farben:
  - YouTube: `ring-red-500 shadow-red-500/60`
  - Instagram: `ring-purple-500 shadow-purple-500/60`
  - Facebook: `ring-blue-500 shadow-blue-500/60`
  - LinkedIn: `ring-green-500 shadow-green-500/60`
  - X: `ring-violet-300 shadow-violet-300/60` (Schwarzlicht-Effekt)
  - TikTok: `ring-white shadow-white/60`
- Ring leuchtet (Glow via `shadow-[0_0_12px_...]`) **nur wenn Post published ist**
- Nicht-published Posts: Ring mit gedaempfter Farbe, kein Glow
- Klick auf Ring → oeffnet `WeekPostEditor` Dialog fuer diesen Post
- Plus-Button bleibt fuer neue Posts

#### 2. `src/pages/Home.tsx` — Layout + Reschedule-Logik

**Layout**: Grid ersetzen durch horizontale Flex-Reihe mit 7 Tagen (Mo–So statt ab heute), `overflow-x-auto` auf Mobile.

**Woche berechnen**: Start am Montag der aktuellen Woche, nicht ab heute.

**Reschedule-Logik anpassen**: Statt `currentMinutes + 60` → mindestens **+6 Stunden** nach der urspruenglichen Post-Zeit:
```text
newTime = originalPostTime + 6h
Falls newTime > 22:00 → naechster Tag 09:00
Falls newTime < jetzt → jetzt + 1h aufgerundet
```

**Ring-Click Handler**: `onRingClick(post)` → oeffnet `WeekPostEditor` mit dem Post, der beim Speichern ein `calendar_event` erstellt (schon implementiert im Editor).

#### 3. `src/components/dashboard/WeekTimelineDay.tsx` — Neue Komponente

Kompakte Tagesdarstellung:
- Tagesname (MO, DI, ...) + Nummer
- Darunter: Plattform-Ringe als klickbare Kreise
- Heute-Markierung mit Primary-Farbe
- Leerer Tag: kleiner "+" Button
- Ringe zeigen Plattform-Icon in der Mitte

### Verhalten
- Posts werden weiterhin in den Kalender gespeichert (createEvent/updateEvent via WeekPostEditor)
- Glow-Animation nur bei `status === 'published'`
- Verpasste Posts: mindestens 6h spaeter neu geplant
- Woche geht immer Mo–So

