## Plan: Headbar-Bug bei den 3 Dropdown-Buttons sauber beheben

### Ziel
Die Headbar soll sichtbar und stabil bleiben, wenn nach dem Scrollen einer dieser Buttons geöffnet wird:
- Sprachmenü
- Benachrichtigungen
- Profilmenü

### Diagnose
Der vorherige Fix deckt Route-Wechsel ab, aber diese drei Buttons sind Dropdowns. Beim Öffnen eines Radix-Dropdowns kann Focus/Scroll-Locking bzw. Popper-Positionierung nach langem Scrollen den Viewport kurz neu justieren. Dadurch wirkt die sticky Headbar weiterhin so, als würde sie verschwinden.

### Umsetzung
1. **Dropdown-Komponente zentral härten**
   - `src/components/ui/dropdown-menu.tsx` anpassen.
   - `DropdownMenuContent` bekommt stabile Portal-/Popper-Einstellungen:
     - kein automatisches Focus-Scrollen in den Header zurück
     - kein Layout-Shift durch unnötige Repositionierung
     - hoher, konsistenter z-index über Header/Sidebar

2. **Header-Actions gezielt absichern**
   - `LanguageSwitcher`, `NotificationBell`, `UserMenu` behalten ihre Funktion.
   - Ihre Menüs bekommen bei Bedarf explizite `side="bottom"`, `align="end"`, `sideOffset` und viewport-sichere Max-Höhen.
   - Bei `NotificationBell` bleibt die interne Liste scrollbar, aber sie darf nicht den Seiten-Scroll beeinflussen.

3. **AppHeader stabiler machen**
   - `AppHeader` bekommt eine feste Header-Höhe und bleibt über Dropdown-Portalen visuell sauber.
   - Falls nötig: `isolate`/höherer z-index, damit Header nicht hinter Overlays oder Scroll-Containern landet.

4. **Verifikation**
   - In der Preview einloggen/Session nutzen, weit nach unten scrollen.
   - Sprachmenü, Glocke und Profilmenü einzeln öffnen.
   - Erwartung: Header bleibt oben sichtbar, keine Sprünge, Dropdown öffnet korrekt unter dem Button.

### Nicht enthalten
- Keine Änderung am Design der Buttons.
- Keine Änderung an Support/Einstellungen-Routen.
- Keine Änderung an der Sidebar oder am Feature-Verhalten.