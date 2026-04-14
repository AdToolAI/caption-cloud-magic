
Ziel: das horizontale Scrollen endgültig entfernen. Die News-Leiste wirkt zwar „zu lang“, aber im Code sind aktuell drei eigentliche Ursachen sichtbar:

1. `src/App.tsx`: Der Haupt-Content läuft neben der Sidebar mit `flex-1 w-full`. Das kann den Bereich breiter als den Viewport machen.
2. `src/components/dashboard/NewsTicker.tsx`: Der Marquee-/Flex-Bereich ist nicht überall sauber mit `min-w-0` begrenzt.
3. `src/pages/TrendRadar.tsx`: Dort existiert zusätzlich noch ein zweiter, alter `NewsRadarTicker` im Seiteninhalt, obwohl der globale Ticker schon über dem Header sitzt.

Umsetzung:

1. `src/App.tsx`
- Den App-Content von `flex-1 w-full flex flex-col` auf `min-w-0 flex-1 flex flex-col overflow-x-hidden` umstellen.
- Den äußeren Layout-Wrapper ebenfalls gegen seitliches Overflow absichern.

2. `src/components/dashboard/NewsTicker.tsx`
- Dem äußeren Ticker `w-full max-w-full overflow-hidden` geben.
- In der inneren Leiste und im Scroll-Container `min-w-0` ergänzen, damit das Marquee nie die Seitenbreite mitbestimmt.
- Die sichtbare Meldungsbreite etwas reduzieren, damit die Leiste kompakter bleibt.

3. `src/pages/TrendRadar.tsx`
- Den lokalen `NewsRadarTicker` entfernen, weil der globale Header-Ticker bereits vorhanden ist.
- Die Seite zusätzlich mit `overflow-x-hidden` absichern.

Betroffene Dateien:
- `src/App.tsx`
- `src/components/dashboard/NewsTicker.tsx`
- `src/pages/TrendRadar.tsx`

Ergebnis:
- Keine horizontale Scrollbar mehr durch die News-Leiste
- Kein doppelter News Radar mehr auf Trend Radar
- Keine Änderung an News-Logik, Aktualisierung, API-Anbindung oder bestehenden Verbindungen

Technische Details:
- Der wichtigste globale Fix ist: neben der fixen Sidebar kein `w-full` mehr auf dem flexenden Content-Panel, sondern `min-w-0`.
- Beim Ticker ist `min-w-0` entscheidend, weil Flex-Children sonst trotz `overflow-hidden` das Layout seitlich verbreitern können.
