

## Verstanden — zwei separate Probleme

### Problem 1: KI Picture Studio → Image-to-Image Upload (Screenshot 2)
Aktuell (Zeile 287–308 in `ImageGenerator.tsx`): Nutzer aktiviert den "Image to Image"-Switch, lädt **ein** Foto hoch — danach gibt es nur einen kleinen X-Button auf dem Thumbnail. Wer ein **anderes** Foto nutzen will, muss erst X klicken (Switch toggeln zählt der User als "Schieber zweimal klicken"), dann den Upload-Button. Umständlich.

**User will:** Ohne Toggle/X direkt ein neues Foto hochladen, das alte wird automatisch ersetzt.

### Problem 2: Mediathek → Bilder zwischen Alben verschieben (Screenshot 1)
Aktuell (`MediaAlbumManager.tsx`): Drag-and-Drop funktioniert **nur für unsortierte Bilder** (Zeile 199–216 — Drop ändert `album_id`). In der **Album-Detail-Ansicht** (Zeile 260–313) gibt es **keinen Weg**, ein Bild in ein anderes Album zu verschieben — nur Lightbox/Delete. Der User will z.B. ein Foto aus "KI Picture Studio" in "Heiße Weiber in Test" verschieben.

**User will:** Bilder aus einem Album in ein anderes Album verschieben können.

### Änderungen

**1. `src/components/picture-studio/ImageGenerator.tsx` — Upload-UX vereinfachen**
- Den Reference-Thumbnail klickbar machen → öffnet sofort den File-Picker und ersetzt das Bild beim Auswählen
- Kleines "Ändern"-Overlay (Pencil/Replace-Icon) beim Hovern über dem Thumbnail
- Der separate "Upload Image"-Button bleibt für den initialen Upload — aber nach Upload wird das Thumbnail selbst zur Replace-Zone
- Alternativ: zusätzlicher kleiner "↻"-Button neben dem X für "anderes Bild wählen"
- Switch bleibt — nur das Replace-Verhalten wird intuitiver

**2. `src/components/media-library/MediaAlbumManager.tsx` — "In Album verschieben" aus Album-Ansicht**
- In der Album-Detail-Ansicht (Zeile 260–313): jeder `ImageCard` bekommt zusätzlich einen "In anderes Album verschieben"-Button (Folder-Icon, nutzt bereits vorhandenen `SaveToAlbumDialog`)
- Dafür `onSaveToAlbum={handleSaveToAlbum}` zur Album-Detail-`ImageCard` hinzufügen (aktuell nur in Unsorted-Sektion, Zeile 388)
- `handleUnsortedImageSaved` umbenennen zu `handleImageMoved` und so erweitern, dass es **auch aus `albumImages`** entfernt (nicht nur aus `unsortedImages`)
- Bonus: Drag-and-Drop auch in Album-Detail-Ansicht ermöglichen — Bild ziehen → "Zurück"-Button-Bereich zeigt Album-Liste als Drop-Targets (optional, kann phase 2 sein)

**3. `src/components/picture-studio/SaveToAlbumDialog.tsx`**
- Funktioniert bereits — kein Refactor nötig. Setzt einfach `album_id` neu, das ist genau das, was beim Verschieben gebraucht wird.
- Eventuell Title je nach Kontext umbenennen ("In Album verschieben" statt "In Album speichern", wenn Bild bereits in einem Album ist)

### Was NICHT geändert wird

- DB-Schema bleibt
- Drag-Drop für unsortierte Bilder bleibt unverändert (funktioniert)
- Andere Tabs der Mediathek bleiben

