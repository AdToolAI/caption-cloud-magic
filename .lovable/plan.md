## Problem

Beim Upload eines Fotos in der Instant-Avatar-Demo (Startseite):

1. **Layout wird riesig / verzerrt**: Die Bild-Container in `InstantAvatarDemo.tsx` haben nur `flex-1 min-h-[280px]` ohne feste Aspect-Ratio. Sobald ein Hochformat-Foto reinkommt, zieht `w-full h-full object-cover` in einem flex-Grid-Kind die Zelle auf die intrinsische Bildhöhe — beide Karten (links + rechts) wachsen dadurch auf ~800px+.
2. **Nur Gesicht sichtbar**: Der Edge-Function-Prompt in `supabase/functions/instant-avatar-demo/index.ts` fordert explizit `"shoulders-up medium shot"`. Das erzeugt Kopf-/Schulter-Porträts statt Ganzkörper-Charakter wie in Cast & World.

## Fix (nur Frontend + Prompt)

### 1. `src/components/landing/InstantAvatarDemo.tsx` — Layout stabilisieren
- Upload-Vorschau-Box und Turntable-Box bekommen eine **feste Aspect-Ratio** (`aspect-[3/4]`, passend zu Ganzkörper-Portrait) statt `flex-1 min-h-[…]`. Beide Karten bleiben dadurch immer gleich hoch, egal was hochgeladen wird.
- Bild-Rendering (Upload-Preview **und** generierte Frames) von `object-cover` → `object-contain` mit dezentem Deep-Black-Hintergrund (`bg-[#050816]`). Dadurch wird die ganze Figur ohne Beschnitt gezeigt.
- Style-Chips + Generate-Button + Privacy-Hinweis rutschen unter die fixe Bildbox (kein `flex-1` mehr nötig).

### 2. `supabase/functions/instant-avatar-demo/index.ts` — Ganzkörper-Framing
- Prompt umschreiben: `"shoulders-up medium shot"` → **„full-body three-quarter shot from head to knees, subject standing, whole character visible, Cast-&-World-style character portrait"**.
- Rest des Prompts (Identity-Lock, Bond-Gold-Rim-Light, Wardrobe-Suffix) bleibt unverändert.

### Was nicht angefasst wird
- Rate-Limit-Tabelle, ZIP-Export, Scrubber-Interaktion, Proof-Strip-Sektion.
- Backend-Logik ausserhalb des Prompt-Strings.

## Technische Details

```tsx
// vorher
<div className="flex-1 min-h-[280px] rounded-xl overflow-hidden …">
  <img className="w-full h-full object-cover" … />
// nachher
<div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-[#050816] …">
  <img className="w-full h-full object-contain" … />
```

```ts
// prompt-diff (compose)
- Camera framing: shoulders-up medium shot, subject looking …
+ Camera framing: full-body three-quarter shot from head to knees, subject standing upright, whole character visible edge-to-edge (Cast-&-World character portrait style), subject looking …
```

Ergebnis: Karten behalten konstante Größe beim Upload, User sieht den vollen Charakter (nicht nur Gesicht), Rest der Demo bleibt identisch.