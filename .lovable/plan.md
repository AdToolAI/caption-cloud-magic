
## Plan: Doppelte Scrollbar jetzt an der echten Scroll-Quelle fixen

### Erkenntnisstand
Der bisherige Home-Fix war richtig, aber **nicht ausreichend**:
- `Home.tsx` hat aktuell **kein** `min-h-screen` mehr
- die zweite Leiste kommt also sehr wahrscheinlich **nicht mehr von Home selbst**
- im globalen App-Shell gibt es weiterhin mehrere starke Verdachtsmomente:
  - `SidebarProvider` mit `min-h-svh`
  - `AppLayout` mit `min-h-screen`
  - `AppSidebar` mit `sticky top-0 h-screen`
  - `AppHeader` und `OnboardingStepper` beide `sticky top-0`
  - viele weitere eingeloggte Seiten nutzen weiterhin `min-h-screen`

### Wahrscheinlichste Ursache
Es gibt weiterhin **mehr als einen Scroll-Kontext**:
```text
SidebarProvider
└ AppLayout (min-h-screen)
  ├ Sidebar (sticky + h-screen)
  └ Content column
    ├ Header (sticky)
    ├ NewsTicker
    ├ OnboardingStepper (sticky)
    └ main (Route-Inhalt)
```

Dadurch entsteht sehr wahrscheinlich ein Mix aus:
- globalem Dokument-Scroll
- zusätzlichem inneren Layout-/Content-Scroll
- plus einzelnen Seiten mit erneutem `min-h-screen`

### Umsetzung nach Approval
1. **Live-DOM gezielt prüfen**
   - im Browser den exakten Container identifizieren, der die zweite vertikale Scrollbar erzeugt
   - nicht mehr raten, sondern den echten Scroll-Owner bestimmen

2. **Eine klare Scroll-Regel durchziehen**
   - bevorzugt: **nur der Dokument-/Body-Scroll**
   - dafür alle inneren App-Wrapper ohne eigenes vertikales Scrolling
   - falls nötig: genau einen zentralen App-Scrollcontainer definieren und alle anderen deaktivieren

3. **Globales Layout bereinigen**
   - `App.tsx` / App-Shell so anpassen, dass Header, Ticker, Stepper und Main nicht versehentlich einen zweiten Scroll-Kontext aufspannen
   - besonders prüfen:
     - `SidebarProvider`
     - `AppLayout`
     - `AppSidebar`
     - Sticky-Kombination von `AppHeader` + `OnboardingStepper`

4. **Systematische Seiten-Angleichung**
   - alle eingeloggten Seiten mit weiterem `min-h-screen` im Shell-Kontext bereinigen
   - Fokus auf die noch betroffenen Seiten, nicht auf Public Pages wie Auth/Pricing/Legal

5. **Workarounds entfernen**
   - bisherige Scrollbar-Hide-CSS nur behalten, wenn sie nach dem echten Fix noch sinnvoll ist
   - Ziel bleibt: **echte Ursache beheben, nichts kaschieren**

### Betroffene Bereiche
- `src/App.tsx`
- `src/components/ui/sidebar.tsx`
- `src/components/AppSidebar.tsx`
- `src/components/layout/AppHeader.tsx`
- `src/features/onboarding/Stepper.tsx`
- weitere eingeloggte `src/pages/*.tsx` mit `min-h-screen`

### Technische Zielregel
```text
Erlaubt:
- genau 1 vertikale Scroll-Ebene pro App-Ansicht

Nicht erlaubt:
- Body scrollt
- und zusätzlich ein innerer App-/Main-/Sidebar-Container scrollt
```

### Ergebnis
Nach dem Fix soll auf Home und den anderen internen Seiten nur noch **eine einzige vertikale Scrollbar** sichtbar sein — unabhängig davon, ob Header, NewsTicker oder Onboarding-Leiste eingeblendet sind.
