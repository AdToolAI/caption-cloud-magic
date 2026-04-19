

## Plan: Doppelte Scrollbar systematisch beheben

### Diagnose
Die Sidebar ist sehr wahrscheinlich **nicht** mehr die Ursache. Beim Lesen der Layout-Dateien fällt ein anderes Muster auf:

- `src/App.tsx` hat bereits einen globalen App-Shell-Wrapper mit  
  `className="flex min-h-screen w-full overflow-x-hidden"`
- Gleichzeitig nutzen viele eingeloggte Seiten erneut `min-h-screen`
- Konkret auf Home:
  - `src/App.tsx` stellt schon die volle Viewport-Höhe bereit
  - `src/pages/Home.tsx` rendert zusätzlich  
    `className="min-h-screen bg-background overflow-x-hidden"`

Dadurch wird die Seitenhöhe effektiv **noch einmal um eine volle Viewport-Höhe aufgespannt**, obwohl Header, NewsTicker und Shell bereits darüber liegen. Genau das erklärt, warum das Problem auch auf anderen Seiten auftaucht.

### Wahrscheinlichste Ursache
Die eigentliche Ursache ist ein **verschachteltes Full-Height-Layout**:
- globale App-Shell = `min-h-screen`
- eingeloggte Unterseite = nochmal `min-h-screen`

Das erzeugt unnötigen vertikalen Overflow und lässt eine zweite Scroll-Situation entstehen.

### Umsetzung nach Approval
1. **`src/pages/Home.tsx` anpassen**
   - obersten Wrapper von `min-h-screen` auf eine nicht-viewportbasierte Variante umstellen
   - wahrscheinlich:
     - `min-h-screen` entfernen, oder
     - auf `min-h-full` / normales `bg-background overflow-x-hidden` reduzieren

2. **Weitere eingeloggte Seiten prüfen und angleichen**
   - gleiche Korrektur für Seiten, die innerhalb `AppLayout` laufen und ebenfalls `min-h-screen` setzen
   - Fokus auf die Seiten, auf denen der Effekt laut User ebenfalls sichtbar ist

3. **Klare Regel für das Layout festziehen**
   - **nur die App-Shell** darf die Viewport-Höhe kontrollieren
   - innere App-Seiten dürfen **nicht erneut** `min-h-screen` setzen
   - öffentliche Standalone-Seiten wie Login/Pricing/Legal dürfen `min-h-screen` behalten

4. **Vorherige Scrollbar-Hide-Fixes bereinigen**
   - die globalen CSS-Hacks in `src/index.css` nur behalten, wenn sie wirklich noch gebraucht werden
   - Ziel ist ein echter Layout-Fix statt reines Verstecken

### Betroffene Dateien
- `src/App.tsx`
- `src/pages/Home.tsx`
- danach weitere betroffene eingeloggte `src/pages/*.tsx`
- ggf. `src/index.css` zur Bereinigung des bisherigen Workarounds

### Technische Details
```text
Richtig:
AppShell = min-h-screen
Page inside shell = auto / min-h-full

Problematisch:
AppShell = min-h-screen
Inner page = min-h-screen
Header + ticker + inner page => künstlicher Extra-Overflow
```

### Ergebnis
Nach dem Fix soll es pro App-Seite nur noch **eine echte vertikale Scroll-Ebene** geben, statt der aktuellen doppelten Scroll-Situation.

