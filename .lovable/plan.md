## Problem

Der Remotion-Preview-Player im Universal Content Creator wird bei Hoch-Formaten (9:16, 4:5) extrem in die Länge gezogen, weil sein Frame `w-full` + `aspectRatio` verwendet — ohne Höhen-Deckel. In der breiten Preview-Spalte wird die volle Breite genutzt und die Höhe wächst proportional (bei 9:16 auf ~1.7× die Breite), was den Player unnatürlich hoch macht.

Betroffene Aufrufe:
- `src/pages/UniversalCreator/UniversalCreator.tsx:660` — kein `maxWidth`, kein `maxHeight`
- `src/components/universal-creator/steps/PreviewExportStep.tsx:601` — hat zwar `previewMaxWidth`, aber immer noch keinen Höhen-Deckel bei sehr hohen Viewports

## Fix (rein Frontend/Presentation)

**`src/components/universal-creator/RemotionPreviewPlayer.tsx`** — Frame-Container so ändern, dass bei portrait-Formaten die Höhe der begrenzende Faktor ist, bei landscape die Breite:

```tsx
const isPortrait = height > width;
// ...
<div className="mx-auto flex items-center justify-center">
  <div
    className="relative overflow-hidden rounded-lg bg-black"
    style={{
      aspectRatio,
      maxWidth: '100%',
      maxHeight: '70vh',
      ...(isPortrait
        ? { height: 'min(70vh, calc(100vw * ' + aspectRatio + '))', width: 'auto' }
        : { width: '100%', height: 'auto' }),
    }}
  >
    <MemoizedPlayer ... />
  </div>
</div>
```

Vereinfachte, robuste Variante: nur `maxHeight: '70vh'` + `width: 'auto'` bei portrait, damit die Höhe nie 70% des Viewports übersteigt und die Breite automatisch aus dem `aspectRatio` folgt.

Kein Backend-Change, keine Renderlogik-Änderung — nur die Wrapper-Größe.

## Verifikation

- Preview in Step 3/4 bei 9:16, 1:1 und 16:9 checken (Screenshot via Playwright, Viewport 1280×1800).
- Bestätigen: Player-Höhe ≤ 70vh; keine Verzerrung; Aspect-Ratio korrekt.
