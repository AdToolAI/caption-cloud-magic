
Problem neu formuliert:
Es geht sehr wahrscheinlich nicht mehr um Sidebar oder App-Shell, sondern um mindestens einen echten Inner-Scroll-Container im Content-Bereich. Deshalb haben die bisherigen Layout-Fixes nicht nachhaltig geholfen.

Do I know what the issue is?
Ja, jetzt deutlich eher: Der stärkste konkrete Verursacher auf Home ist nicht `App.tsx`, sondern ein bewusst eingebauter Radix-Scrollbereich im Dashboard.

Warum ich das jetzt so bewerte:
- `src/App.tsx` hat aktuell keinen `overflow-y-auto`-Main-Wrapper mehr; dort sehe ich keinen klaren vertikalen Inner-Scroll-Owner.
- `src/components/dashboard/RecentActivityFeed.tsx` rendert dagegen explizit:
  - `<ScrollArea className="h-[400px] pr-4">`
- `src/components/ui/scroll-area.tsx` rendert immer einen eigenen Radix-Scrollbar:
  - `<ScrollBar />`
- Genau so entsteht zusätzlich zur normalen Seiten-Scrollbar eine zweite sichtbare vertikale Leiste.
- Das passt auch zum Screenshot: Die zweite Leiste sitzt rechts im Content-Bereich, nicht links an der Sidebar.
- Zusätzlich gibt es denselben Mechanismus auch in anderen Panels/Widgets (z. B. AI-Companion bei geöffnetem Panel), weshalb reine Shell-Fixes das Problem nie komplett lösen konnten.

Plan:
1. Falsche Global-Fixes zurückbauen
   - die bisherigen `index.css`-Workarounds für Sidebar-Scrolling entfernen
   - keine weiteren globalen Scroll-Hacks auf `SidebarContent`/Shell anwenden

2. Home an der echten Quelle fixen
   - `src/components/dashboard/RecentActivityFeed.tsx` von festem `ScrollArea h-[400px]` auf normale Dokument-Scroll-Logik umstellen
   - bevorzugt: Liste ohne inneren Scrollbereich
   - falls die Höhe begrenzt bleiben muss: stattdessen kompaktere Liste + “Mehr anzeigen”/Collapse, aber keine zweite sichtbare Scrollbar im Dashboard-Card

3. ScrollArea-Nutzung systematisch trennen
   - Regel festziehen:
     - normale Seiteninhalte: kein eigener vertikaler Scrollcontainer
     - nur Dialoge, Drawer, Sidepanels, Editoren dürfen intern scrollen
   - `src/components/ui/scroll-area.tsx` nur dort weiterverwenden, wo Inner-Scroll wirklich gewollt ist

4. Zweite Kandidaten mit gleichem Muster prüfen
   - besonders:
     - `src/components/ai-companion/AICompanionWidget.tsx`
     - weitere Dashboard-/Card-Komponenten mit `ScrollArea` oder `overflow-y-auto`
   - Ziel: auf normalen App-Seiten keine “Card mit eigener sichtbarer Vertikal-Scrollbar”, außer bewusst in Modals/Panels

5. Sichtprüfung nach Umsetzung
   - Home zuerst
   - danach 1–2 weitere interne Seiten mit ähnlichen Panels
   - sicherstellen, dass nur noch die Seiten-/Browser-Scrollbar sichtbar ist

Betroffene Dateien:
- `src/components/dashboard/RecentActivityFeed.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/index.css` (Bereinigung der bisherigen Workarounds)
- optional je nach Befund:
  - `src/components/ai-companion/AICompanionWidget.tsx`

Technische Zielregel:
```text
Erlaubt:
- 1 Seiten-Scrollbar pro normaler App-Seite

Nur ausnahmsweise erlaubt:
- zusätzliche Inner-Scrollbars in Dialogen, Drawern, Chat-/Editor-Panels

Nicht erlaubt:
- Dashboard-Karten oder normale Seitenabschnitte mit eigener sichtbarer Vertikal-Scrollbar
```

Erwartetes Ergebnis:
Der sichtbare Doppel-Scrollbar-Effekt verschwindet auf Home, weil der echte zusätzliche Scroll-Owner im Content entfernt wird, statt weiter am globalen Layout zu raten.
