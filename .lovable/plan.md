

## Plan: Doppelte Scrollbar auf Home entfernen

### Befund
Die zweite Scrollbar erscheint jetzt **nur noch auf `/home`**, nicht mehr auf den Hub-Seiten (Erstellen etc.). Das bestätigt der Vergleich der Screenshots.

Ursache liegt in `src/pages/Home.tsx`, Zeile 491:
```tsx
<div className="bg-background overflow-x-hidden">
```

Dieser äußere Home-Wrapper hat `overflow-x-hidden`. Sobald in CSS `overflow-x` auf etwas anderes als `visible` gesetzt wird, **erzwingt der Browser implizit `overflow-y: auto`** auf demselben Element. Da der Wrapper genug Inhalt enthält, um die Viewport-Höhe zu überschreiten, entsteht damit ein **eigener vertikaler Scroll-Container innerhalb der Seite** — zusätzlich zur normalen Dokument-Scrollbar.

Die Hub-Seiten nutzen `PageWrapper` ohne `overflow-x-hidden` und haben deshalb das Problem nicht.

### Fix
In `src/pages/Home.tsx` Zeile 491:
- `overflow-x-hidden` vom äußeren Home-Wrapper entfernen.
- Begründung: Der App-Shell selbst (`min-w-0 flex-1` in `App.tsx`) verhindert bereits horizontales Überlaufen. Die Klasse hier ist redundant und erzeugt den unerwünschten zweiten Scrollkontext.

### Konkret
```tsx
- <div className="bg-background overflow-x-hidden">
+ <div className="bg-background">
```

Falls nach dem Entfernen tatsächlich ein horizontaler Overflow auftritt (z. B. durch den Wochen-Strip oder den Video-Carousel), dann gezielt nur **auf den betroffenen inneren Containern** `overflow-x-hidden` setzen — nicht auf dem Seiten-Root.

### Betroffene Datei
- `src/pages/Home.tsx`

### Erwartetes Ergebnis
- Auf `/home` ist nur noch **eine** vertikale Scrollbar sichtbar (die Dokument-Scrollbar).
- Hub-Seiten bleiben unverändert (waren bereits korrekt).
- Sidebar bleibt unverändert.

