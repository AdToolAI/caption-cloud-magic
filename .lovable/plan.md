

## Plan: Motion Studio im Erstellen-Hub sichtbar machen

### Problem
In `src/pages/HubPage.tsx` (Zeile 79) hat der `PageWrapper` die Klasse `overflow-hidden`. Das schneidet die 4. Reihe des 3-Spalten-Grids ab — Motion Studio (Item 8 von 10) und die weiteren Items werden abgeschnitten und man kann nicht scrollen.

### Lösung
Eine einzige Änderung in `src/pages/HubPage.tsx`, Zeile 79:

`overflow-hidden` entfernen oder durch `overflow-visible` ersetzen. Die Klasse wurde ursprünglich für die Floating-Particles und Gradient-Hintergründe verwendet, aber diese haben bereits `pointer-events-none` und `-z-10`, sodass sie auch ohne `overflow-hidden` keine Probleme verursachen.

**Änderung:**
```
// Vorher:
<PageWrapper className="relative p-6 md:p-10 max-w-6xl mx-auto overflow-hidden">

// Nachher:
<PageWrapper className="relative p-6 md:p-10 max-w-6xl mx-auto">
```

Das ist eine 1-Zeilen-Änderung. Danach werden alle 10 Items im Erstellen-Hub sichtbar, einschließlich Motion Studio.

