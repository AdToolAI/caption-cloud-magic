

## Fix: Generierte Bilder sichtbar machen

### Problem
`bg-checkerboard` nutzt die dunkle `--muted` Farbe aus dem Theme. Transparente Bilder (Logos) sind damit kaum sichtbar.

### Änderung

**`src/components/picture-studio/ImageCard.tsx`** (Zeile 56)
- `bg-checkerboard` → `bg-white` ersetzen

Das sorgt dafür, dass alle Bilder — auch transparente PNGs — auf weißem Hintergrund sichtbar sind, genau wie beim Download.

