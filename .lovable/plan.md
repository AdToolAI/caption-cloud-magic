
Ziel: Die Navigation bleibt exakt wie sie ist. Wir ändern nicht die linke Icon-Leiste als Feature, sondern nur den zusätzlichen vertikalen Scroll-Owner, der die zweite sichtbare Scrollbar erzeugt.

Befund aus dem Code:
- `src/components/ui/sidebar.tsx` setzt in `SidebarContent` fest `overflow-y-auto`.
- `src/components/AppSidebar.tsx` versucht das aktuell nur mit Klassen wie `!overflow-hidden` zu übersteuern.
- Genau dieser Ansatz war schon aktiv und hat das Problem nicht zuverlässig entfernt.
- Auf `Home` selbst gibt es im normalen Seitenlayout keinen offensichtlichen vertikalen Inner-Scroll-Container; die klar sichtbare dauerhafte Kandidatenquelle bleibt daher der Sidebar-Content-Container.

Umsetzung:
1. `src/components/AppSidebar.tsx`
   - `SidebarContent` in dieser einen Sidebar nicht mehr verwenden.
   - Stattdessen den Inhalt in ein normales `div` mit nicht-scrollendem Layout legen:
     - `flex min-h-0 flex-1 flex-col overflow-hidden`
   - Die Icon-Struktur, Tooltips und Navigation bleiben unverändert.

2. `src/components/AppSidebar.tsx`
   - `h-full` auf dem inneren Content-Wrapper weglassen, damit keine künstliche Überhöhe entsteht.
   - Falls nötig `SidebarRail` entfernen, falls es optisch als zusätzliche schmale Leiste daneben wirkt.

3. `src/components/ui/sidebar.tsx`
   - Unverändert lassen, damit andere echte Scroll-Kontexte im Projekt nicht kaputtgehen.
   - Wir lösen das gezielt nur für diese eine feste App-Leiste.

4. Sichtprüfung
   - Auf `/home` prüfen: rechts nur noch eine normale Seiten-Scrollbar.
   - Icon-Leiste bleibt vollständig sichtbar und klickbar.
   - Mobile Menü-Toggle im Header bleibt funktionsfähig.

Betroffene Datei:
- `src/components/AppSidebar.tsx`

Erwartetes Ergebnis:
- Keine Änderung an der Sidebar-Navigation selbst.
- Die zusätzliche innere Scrollbar verschwindet.
- Es bleibt nur die echte Seiten-Scrollbar sichtbar.
