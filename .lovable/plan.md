## Befund

Die "kleine Sidebar" rechts neben dem `40 %`-Fortschrittsbalken ist keine UI-Komponente, sondern eine native vertikale Windows-Scrollbar mit den klassischen ▲ ● ▼ Buttons. Sie stammt vom Top-Stepper im Motion Studio.

In `src/components/video-composer/MotionStudioTopStepper.tsx` (Zeile 49) steht:

```tsx
<div className="... flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar">
```

Zwei Probleme:

1. **`no-scrollbar` ist nirgendwo definiert** (weder in `src/index.css` noch in `tailwind.config.ts`). Die Klasse wirkt nicht, der Browser zeigt die Default-Scrollbar.
2. **`overflow-x: auto` macht laut CSS-Spec aus `overflow-y: visible` automatisch `overflow-y: auto`.** Sobald ein inneres Element minimal vertikal überläuft (z. B. die Pulse/Shadow-Animation des aktiven Steps oder die `h-1`-Progress-Bar im Flex-Kontext), erscheint zusätzlich eine **vertikale** Scrollbar — exakt das, was im Screenshot zu sehen ist.

## Plan

### 1. Globales `.no-scrollbar`-Utility ergänzen
In `src/index.css` (im `@layer utilities`-Block) einmalig hinzufügen, damit die bereits an mehreren Stellen verwendete Klasse tatsächlich wirkt:

```css
@layer utilities {
  .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
  .no-scrollbar::-webkit-scrollbar { display: none; }
}
```

### 2. Vertikalen Overflow im Top-Stepper explizit unterdrücken
In `MotionStudioTopStepper.tsx` Zeile 49 die Klasse erweitern auf:

```tsx
overflow-x-auto overflow-y-hidden no-scrollbar
```

Damit kann auch dann keine vertikale Scrollbar mehr aufpoppen, wenn die Pulse-Animation des aktiven Steps kurzzeitig minimal über die Container-Höhe hinauswächst. Horizontales Scrollen (für sehr schmale Viewports mit allen 5 Steps) bleibt erhalten, ist aber dank Utility unsichtbar.

### 3. (Optional) Pulse-Container fix-höhig halten
Falls die vertikale Über­dehnung tatsächlich von der `motion.span`-Pulse stammt, reicht `overflow-y-hidden` am Container; die Animation selbst bleibt sichtbar, weil sie nur im 7×7-Kreis pulsiert.

## Erwartetes Ergebnis

- Die ▲ ● ▼-Mini-Sidebar verschwindet komplett.
- Der Stepper bleibt auf schmalen Viewports horizontal scrollbar, aber ohne sichtbare Scrollbar.
- Alle anderen Stellen im Code, die bereits `no-scrollbar` benutzen (z. B. horizontale Picker-Reihen), profitieren ebenfalls.

## Betroffene Dateien

- `src/index.css` — `.no-scrollbar`-Utility ergänzen
- `src/components/video-composer/MotionStudioTopStepper.tsx` — `overflow-y-hidden` hinzufügen
