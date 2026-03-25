

## Muelleimer-Button zum Loeschen von Bildern

### Aenderungen

#### 1. `src/components/picture-studio/ImageCard.tsx`
- Neuen `onDelete` Callback als optionale Prop hinzufuegen
- `Trash2` Icon importieren
- Neuen Button neben den bestehenden Action-Buttons (Download, Folder, Maximize) einfuegen
- Button ruft `onDelete(image)` auf mit `e.stopPropagation()`

#### 2. `src/components/picture-studio/ImageGenerator.tsx`
- `onDelete` Handler implementieren: Bild aus `studio_images` Tabelle loeschen + aus Storage loeschen
- Bild aus `generatedImages` State entfernen
- Handler an `ImageCard` weitergeben

#### 3. `src/components/picture-studio/AlbumManager.tsx`
- Gleiche Loesch-Logik fuer unsortierte Bilder und Album-Bilder
- `onDelete` Handler an `ImageCard` weitergeben
- Nach Loeschen: Listen-State aktualisieren

### Technische Details
- DB: `supabase.from('studio_images').delete().eq('id', imageId)`
- Storage: URL parsen, Datei aus `background-projects` Bucket loeschen
- Bestaetigung per `toast.success`

### Dateien
1. `src/components/picture-studio/ImageCard.tsx` — Trash-Button + onDelete Prop
2. `src/components/picture-studio/ImageGenerator.tsx` — Delete Handler
3. `src/components/picture-studio/AlbumManager.tsx` — Delete Handler

