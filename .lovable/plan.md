

## Plan: "Aus Mediathek importieren"-Button im AI Video Studio Referenzbild-Bereich

### Überblick
Neben dem bestehenden Upload-Bereich für Referenzbilder im AI Video Studio wird ein zweiter Button hinzugefügt: **"Aus Alben importieren"**. Dieser öffnet ein Modal/Dialog, das die Alben aus der Mediathek (insbesondere "KI Picture Studio") anzeigt und es erlaubt, ein Bild auszuwählen.

### Änderungen

**1. Neue Komponente: `src/components/media-library/AlbumImagePicker.tsx`**
- Dialog/Sheet-Komponente mit Album-Liste (aus `studio_albums`) und Bild-Grid (aus `studio_images`)
- Zeigt zuerst alle Alben als Kacheln, bei Klick die Bilder im Album
- "Auswählen"-Button pro Bild → gibt die `image_url` zurück via Callback
- Props: `open`, `onOpenChange`, `onSelectImage: (url: string) => void`

**2. `src/pages/AIVideoStudio.tsx` anpassen**
- `AlbumImagePicker` importieren und State für Dialog-Steuerung hinzufügen
- Im Referenzbild-Bereich (Zeile ~442–487): Neben dem Upload-Feld einen Button **"Aus Alben wählen"** mit FolderOpen-Icon hinzufügen
- Bei Auswahl eines Bildes aus dem Picker: `referenceImageUrl` direkt setzen (kein erneuter Upload nötig, da die Bilder bereits im Storage liegen)

### Ergebnis
- User kann Referenzbilder entweder hochladen ODER aus den Mediathek-Alben auswählen
- Besonders praktisch für KI-generierte Bilder, die direkt als Video-Startpunkt dienen sollen

