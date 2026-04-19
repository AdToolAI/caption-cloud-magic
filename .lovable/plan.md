

## Plan: Doppelte Scrollbar — echte Ursache finden & fixen

### Diagnose-Update
Der erste Fix (Sidebar-Scrollbar verstecken) hat das Problem nicht gelöst, weil die zweite Scrollbar im Screenshot **rechts neben dem Hauptcontent** sitzt — nicht in der Sidebar. Das deutet auf einen **inneren Scroll-Container im Main-Bereich** hin (z. B. `overflow-y-auto` auf einem Wrapper in `App.tsx` oder `PageWrapper`), der zusätzlich zur Browser-Scrollbar einen eigenen Track erzeugt.

### Vorgehen (Read-Only-Phase)
Ich muss zuerst inspizieren:
1. `src/App.tsx` — Layout-Wrapper (`min-h-screen`, `h-screen`, `overflow-y-auto`?)
2. `src/components/layout/PageWrapper.tsx` — schon gesehen, kein overflow
3. `src/index.css` — globale `html`/`body`-Höhen-Regeln
4. `src/components/ui/sidebar.tsx` — `SidebarProvider`-Wrapper, der ggf. `h-svh overflow-hidden` setzt und damit den Main-Bereich zu einem Scroll-Container macht

### Wahrscheinlicher Verdacht
`SidebarProvider` von shadcn rendert ein Wrapper-Div mit `min-h-svh`. Wenn `App.tsx` zusätzlich einen Container mit fester Höhe (`h-screen`) und `overflow-y-auto` setzt, scrollt **dieser innere Container**, während gleichzeitig die Browser-Scrollbar erscheint, weil der Body ebenfalls overflow hat (z. B. durch `NewsTicker` oder `AICompanionWidget` mit `position: fixed` + großer Höhe).

### Geplanter Fix (nach Inspektion)
**Eine** der folgenden Maßnahmen — abhängig vom Befund:

**Option A** (wahrscheinlichster Fall): In `src/App.tsx` den Main-Wrapper von `h-screen overflow-y-auto` → **`min-h-screen`** ändern. So scrollt nur noch der Body/Browser, kein innerer Container mehr.

**Option B**: Falls `SidebarProvider` der Schuldige ist → Wrapper-Style überschreiben (`overflow-visible` auf dem äußeren Div).

**Option C**: Falls `body` und ein innerer Container beide scrollen → `body { overflow: hidden }` + nur **einen** definierten Scroll-Container (Main) behalten.

### Was NICHT geändert wird
- Sidebar-Inhalte, Routing, Komponenten-Logik
- Der bereits gemachte Sidebar-Scrollbar-Hide-Fix bleibt (schadet nicht)

### Risiko
Niedrig — eine gezielte Layout-Klassen-Änderung in `App.tsx` oder `index.css` nach Inspektion.

### Nächster Schritt nach Approval
Default-Mode: `App.tsx` + `index.css` lesen → exakte Stelle identifizieren → Single-Line-Fix anwenden → Browser-Verifikation.

