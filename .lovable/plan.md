

## Plan: Videos nach Render nicht mehr temporär verschwinden lassen

### Ursache
Wenn ein neuer Render abgeschlossen wird, ruft der Code `invalidateQueries({ queryKey: ['video-history'] })` auf. Dadurch:
1. Der Query hat kein `staleTime` — jede Invalidierung löst sofort einen Refetch aus
2. Während des Refetch wird `videos` kurzzeitig `undefined` oder leer, was **alle** Video-Elemente im Carousel unmountet
3. Die `<video>`-Elemente mounten neu und müssen sich alle gleichzeitig neu laden — das dauert bei 10 Videos mit S3-URLs leicht 1-2 Minuten
4. Das `errorVideos`/`retriedVideos` State wird durch den Re-Mount zurückgesetzt, was zu erneuten Ladefehlern führt

### Fix

**1. `useVideoHistory.ts` — Query-Caching härten**
- `staleTime: 60_000` (1 Minute) setzen, damit nicht jeder Invalidate sofort refetcht
- `placeholderData: keepPreviousData` verwenden, damit die vorherigen Videos sichtbar bleiben, während im Hintergrund neue Daten geladen werden

**2. `DashboardVideoCarousel.tsx` — Video-Elemente stabil halten**
- `videoUrl` memoizen, damit sich die `src` der Video-Elemente nicht ändert, wenn dieselben Daten zurückkommen
- `errorVideos` und `retriedVideos` State beim Datenrefresh nicht zurücksetzen

### Betroffene Dateien
- **Edit:** `src/hooks/useVideoHistory.ts` — `staleTime` + `placeholderData` hinzufügen
- **Edit:** `src/components/dashboard/DashboardVideoCarousel.tsx` — stabile Video-Keys + memoized URLs

### Ergebnis
- Bestehende Videos bleiben während eines Refetch sichtbar
- Neue Videos tauchen nahtlos auf, sobald der Refetch abgeschlossen ist
- Kein 2-Minuten-Blackout mehr nach einem neuen Render

