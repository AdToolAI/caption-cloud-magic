# Plan: Kanban-Board auf echtes 2028-Niveau heben

## Beobachtete Probleme (aus Screenshot)
1. **Keine Karten** — User hat noch keine Events mit Pipeline-Status. Das Board zeigt 4× „Keine Karten" was lieblos wirkt.
2. **Hässliche weiße Browser-Scrollbar** quer unter den Spalten — sofortiger 2006-Look.
3. **Roh-Übersetzungs-Keys sichtbar**: `common.search`, vermutlich auch andere (`calendar.kanban.*`).
4. **Optik wirkt billig**: 
   - Spaltenköpfe als blanke farbige Linien-Outlines ohne Tiefe
   - Toolbar-Buttons („Kanäle", „Board") wirken wie Standard-Shadcn
   - Drop-Zonen sind dunkle leere Rechtecke ohne Bond-Charakter
   - Keine Gold-Akzente, kein Glow, keine Serif-Headlines wo es zählt
5. **Letzte Spalte abgeschnitten** („Freig…") — Layout schiebt über den Container hinaus.

## Lösung

### A. Optik komplett auf James-Bond-2028 ziehen
- **Header-Strip oben über dem Board**: dünner Gold→Cyan-Verlauf, links Status-Legende mit Mini-Dots, rechts Live-Counter „X Posts in Pipeline".
- **Spaltenköpfe** als kompakte Glass-Pills mit:
  - Vertikaler Gold-Glow-Akzent links (analog Enterprise-Pattern aus mem)
  - Status-Name in **Playfair Display** Small-Caps, nicht in der Akzentfarbe sondern in Foreground mit subtilem Glow
  - Count + WIP rechts als monospaced Tabular-Number-Chip
  - Dezenter Backdrop-Blur, kein farbiger Border-Frame
- **Drop-Zonen** mit feiner Punkt-Grid-Textur (CSS radial-gradient) im Hintergrund statt platter Fläche — bewegt sich subtil beim Hover.
- **Empty State** schöner:
  - Gold-Outlined-Plus-Icon, „Erste Karte erstellen"-CTA pro Spalte
  - Animierter Gold-Shimmer am Rand (subtil, 8s loop)
  - Mikro-Hinweis: „Karten von hier nach rechts ziehen, um Status zu ändern"
- **Toolbar** mit Glass-Background, alle Buttons im Ghost-Style mit Gold-Hover, **keine Outline-Buttons**.

### B. Scrollbar fixen
- Container nicht horizontal überlaufen lassen; statt nativem Scroll:
  - Spalten in **CSS-Grid mit `auto-fit`** packen, sodass sie sich den verfügbaren Platz teilen (min 240px, max 1fr)
  - Bei >5 sichtbaren Spalten: Spaltenbreite reduziert auf min 200px
  - Falls Overflow nötig (sehr schmaler Viewport): native Scrollbar via `scrollbar-width: none` + Webkit-Hide komplett ausblenden, stattdessen die bereits vorhandenen Chevron-Buttons als einzige Scroll-Methode
- Letzte Spalte „Freigegeben" wieder vollständig sichtbar, da Grid responsive füllt.
- Default-Setup: Standardmäßig nur **5 Kern-Spalten sichtbar** (Briefing, In Arbeit, Review, Zur Freigabe, Veröffentlicht). `Approved` + `Scheduled` standardmäßig ausgeblendet (über Board-Menü einblendbar).

### C. Übersetzungen aufräumen
- Statt `t('common.search')` (Key existiert nicht → wird roh angezeigt): direkte Strings „Suchen…", „Kanäle", „Board" verwenden. Diese Komponente ist bereits stark mit deutschen Fallbacks durchsetzt — komplette i18n hier ist Phase 2.
- Alle sichtbaren Strings als saubere DE-Defaults setzen, damit nichts mehr roh erscheint.

### D. „Keine Karten"-Wirklichkeitsfix
- Wenn das gesamte Board leer ist (nicht nur eine Spalte): **board-übergreifender Onboarding-State** mittig:
  - Großes Gold-Icon (Kanban-Stack)
  - „Dein Content-Board ist bereit"
  - Subtext: „Erstelle den ersten Post, um deine Pipeline zu starten"
  - Großer Gold-CTA „+ Erster Post" → öffnet Day-Cockpit für heute
  - Darunter dünne, leere Geist-Spalten als Vorschau (50% opacity)
- Wenn einzelne Spalten leer: dezenter Empty-State (1 Icon + 1 Zeile), nicht 3-zeilig wie aktuell.

### E. Spalten visuell aufwerten
- Pro Status eigene **Mood-Glow-Farbe** als sehr subtiler Radial-Gradient am Spaltenkopf (nicht als Border)
- Drag-Hover-State: gesamte Spalte glüht innen mit Gold (statt nur Inset-Ring)
- Karten beim Drag: 3D-Tilt + Drop-Shadow in Gold

## Out-of-Scope (jetzt nicht)
- Echte Assignee-Avatare aus `profiles`-Tabelle (zeigen aktuell Initial-Bubbles)
- Realtime-Cursor anderer User
- Custom Spalten-Definitionen pro Workspace

## Technisch
- Nur `KanbanView.tsx` anfassen (kein neues File)
- CSS-Grid statt `flex overflow-x-auto`
- Webkit-Scrollbar mit `[&::-webkit-scrollbar]:hidden` ausblenden, falls Overflow doch passiert
- Standardspalten in `loadSettings()` Default-Hidden-Liste: `["approved", "scheduled"]`
- Strings deutsch hartkodiert (i18n später)
- Keine DB-/Edge-Function-Änderungen

## Ergebnis
Aus dem aktuell sterilen Board wird eine echte „Content Command Bridge": volle Bond-Optik mit Glow & Serif-Headlines, keine hässliche Scrollbar, kein roher i18n-Key, ein einladender Onboarding-State wenn leer — und alle Spalten passen sauber in den Container.
