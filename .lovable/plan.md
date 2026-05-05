## Problem

Auf dem Dashboard erscheinen zwei vertikale Scrollbars direkt nebeneinander am rechten Rand (siehe Screenshots).

## Ursache

In `src/index.css` (Zeile 181–186) ist aktuell:

```css
html, body {
  overflow-x: hidden;
  max-width: 100vw;
}
```

`overflow-x: hidden` auf **beiden** (html *und* body) setzt für `body` automatisch auch `overflow-y: auto` (CSS-Spezifikation: wenn eine Achse `hidden`/`scroll` ist, wird die andere zu `auto`). Dadurch wird `body` selbst zum Scroll-Container — zusätzlich zum `html`-Scroll-Container. Ergebnis: **zwei Scrollbars**.

Das war ursprünglich nötig, damit der E2E-Test `tests/mobile-responsive.spec.ts` (kein horizontaler Scroll auf 375px) grün bleibt.

## Fix

In `src/index.css` `overflow-x: hidden` durch `overflow-x: clip` ersetzen — und nur auf `html` anwenden, nicht zusätzlich auf `body`. `overflow-x: clip` verhindert horizontalen Overflow ohne einen neuen Scroll-Container zu erzeugen, also entsteht auch keine zweite Scrollbar.

```css
html {
  overflow-x: clip;
  max-width: 100vw;
}
body {
  /* keine overflow-Regel — nur das html-Element scrollt */
}
```

`overflow-x: clip` wird von allen modernen Browsern (Chrome ≥90, Safari ≥16, Firefox ≥81) unterstützt und ist hier der korrekte Mechanismus, um horizontalen Overflow von dekorativen Blur-Orbs / Hero-Transforms abzuschneiden, ohne einen Scroll-Kontext zu erzeugen.

## Geänderte Datei

- `src/index.css` (nur die `html, body { … }`-Regel im `@layer base`)

## Was sich nicht ändert

- Sidebar, Header, NewsTicker, Pinned Chat: unverändert.
- Mobile-Responsive-Test: bleibt grün, da `clip` ebenfalls horizontalen Overflow verhindert.
- Vertikales Scrolling der Seite: funktioniert weiter wie gewohnt — nur eben mit nur **einer** Scrollbar.