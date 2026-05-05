## Ziel

Den Hero-Block (Sith Command Deck — Floating Header, Laptop, Holo Pills) optisch **schärfer und definierter** machen, ohne den Look zu verändern. Aktuell wirken die Goldränder leicht weich/verwaschen.

## Was schärfer wird

### 1. `LaptopFrame3D.tsx` — Laptop-Bezel & Außenkante

- Outer Carbon Shell bekommt eine **Triple-Ring Border** (1px Gold solid → 1px schwarz → 1px Gold soft) statt nur einer 18 %-Goldlinie. Dadurch wird die Außenkante deutlich definierter.
- Inneres Bezel: Inset-Border von 0.25 → 0.65 Opazität, plus zusätzliche 1px schwarze Trennlinie nach innen für klare „Display sitzt im Rahmen"-Wirkung.
- Top-Hairline: Von `via-primary/50` mit `inset-x-8` auf `via-primary` mit `inset-x-4` und `opacity-90` → kräftigere, längere Goldlinie oben am Deckel.
- Camera-Notch Ring: `ring-primary/20` → `ring-primary/40`.
- Keyboard-Base bottom hairline: `via-primary/20` → `via-primary/45`.

### 2. `FloatingAppHeader.tsx` — Schwebender App-Header

- Border von 0.35 auf **0.6 Opazität** + zusätzliche 1px schwarze Inset-Trennlinie, damit die Pille kantiger im Raum sitzt.
- Innerer Trenn-Strich (`bg-primary/20`) → `bg-primary/45` (deutlichere Sektionstrennung).
- Plan-Badge Border `border-primary/40` → `border-primary/70` und +0.5px feinere Innenkontur.
- Hairline darunter: `via-primary/30` → `via-primary/60`.

### 3. `HoloDataPills.tsx` — Stat-Pills (+43 %, 19:00, 2.4M)

- Gold-Pills Border-Opacity 0.4 → **0.65**, Rote Pille 0.55 → **0.8**.
- Doppelte Border via zweiter Box-Shadow-Layer (1px Gold/Rot solid + 1px schwarz innen) für „etched"-Wirkung.
- Top-Hairline Opazität 0.7 → 0.9.
- Icon- und Wert-Farben bleiben gleich (Brand-Gold/Rot).

## Was sich nicht ändert

- Layout, Tilt-Animation, Größen, Texte, Fonts, Animations-Timing.
- Farbpalette: weiterhin nur `hsl(var(--primary))` Gold, `hsl(355 …)` Rot, schwarzer Carbon.
- Lightsaber-Slit & Floor-Reflection: bleiben unverändert.

## Geänderte Dateien

- `src/components/landing/LaptopFrame3D.tsx`
- `src/components/landing/FloatingAppHeader.tsx`
- `src/components/landing/HoloDataPills.tsx`