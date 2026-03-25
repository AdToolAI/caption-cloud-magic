

## Album-Zuordnung fuer Bilder: Ordner-Button, Drag & Drop, Auto-Ausblenden

### Uebersicht
Der FolderPlus-Button auf Bildern oeffnet ein Popover/Dialog mit Album-Auswahl. Bilder koennen per Drag & Drop auf Album-Karten gezogen werden. Nach Zuordnung verschwinden sie aus der Generierungs-Ansicht.

### Aenderungen

#### 1. Neue Komponente: `src/components/picture-studio/SaveToAlbumDialog.tsx`
- Dialog mit Liste aller bestehenden Alben (aus `studio_albums`)
- Button "Neues Album erstellen" mit Inline-Input
- Klick auf Album → `UPDATE studio_images SET album_id = X WHERE id = Y`
- Toast-Bestaetigung, Callback zum Entfernen des Bildes aus der aktuellen Liste

#### 2. `src/components/picture-studio/ImageGenerator.tsx`
- State: `albums` laden beim Mount (einfacher Supabase-Query)
- `onSaveToAlbum` Handler: oeffnet den `SaveToAlbumDialog`
- Nach erfolgreichem Speichern: Bild aus `generatedImages` entfernen
- `onSaveToAlbum` an jede `ImageCard` weitergeben

#### 3. `src/components/picture-studio/ImageCard.tsx`
- Der FolderPlus-Button ruft bereits `onSaveToAlbum` auf — das funktioniert schon, es fehlt nur der Handler
- Drag-Support hinzufuegen: `draggable`, `onDragStart` setzt `image`-Daten ins DataTransfer

#### 4. `src/components/picture-studio/AlbumManager.tsx`
- Album-Karten als Drop-Targets: `onDragOver`, `onDrop`
- Bei Drop: `album_id` updaten, Bild aus `unsortedImages` entfernen, Album-Count erhoehen
- Visuelles Feedback: Border-Highlight beim Drag-Over

#### 5. `src/pages/PictureStudio.tsx`
- Shared State oder Callback zwischen `ImageGenerator` und `AlbumManager` (z.B. `onImageSaved` Callback der die Album-Daten refreshed)
- Alternativ: Einfacher Ansatz — jeder Tab laedt seine eigenen Daten beim Mount

### Technische Details
- Drag & Drop: Native HTML5 `draggable` + DataTransfer API (kein Extra-Library noetig)
- Album-Query: `supabase.from('studio_albums').select('id, name').eq('user_id', user.id)`
- Image-Update: `supabase.from('studio_images').update({ album_id }).eq('id', imageId)`
- SaveToAlbumDialog zeigt Alben als klickbare Liste + "Neu erstellen" Option

### Dateien
1. `src/components/picture-studio/SaveToAlbumDialog.tsx` — NEU
2. `src/components/picture-studio/ImageGenerator.tsx` — onSaveToAlbum Handler + Album-State
3. `src/components/picture-studio/ImageCard.tsx` — draggable + onSaveToAlbum durchreichen
4. `src/components/picture-studio/AlbumManager.tsx` — Drop-Targets auf Album-Karten
5. `src/pages/PictureStudio.tsx` — ggf. minimale Anpassung fuer Tab-Kommunikation

