

## Plan: "In Album speichern"-Button auf jedem Medium in der Mediathek

### Übersicht
Auf jedem hochgeladenen Bild/Video in der Mediathek (Upload-Tab, Alle-Tab, etc.) wird ein neuer Button "In Album speichern" (Ordner-Icon) im Hover-Overlay hinzugefügt. Beim Klick öffnet sich der bestehende `SaveToAlbumDialog` — dort kann man ein bestehendes Album wählen oder mit "+" ein neues erstellen.

### Änderungen

**1. `src/pages/MediaLibrary.tsx` — Button + Dialog-Integration**
- Neuer State: `saveToAlbumImageId` (string | null) für den Dialog
- Im Hover-Overlay (Zeile 1085-1185) wird ein neuer `FolderPlus`-Button hinzugefügt
- Beim Klick: Das Medium wird in `studio_images` als Eintrag erstellt (falls noch nicht vorhanden), dann öffnet sich der `SaveToAlbumDialog` mit dieser ID
- Der `SaveToAlbumDialog` wird am Ende der Komponente eingebunden
- Import von `SaveToAlbumDialog` und `FolderPlus` hinzufügen

**2. Logik für "In Album speichern"**
- Neue Funktion `handleSaveToAlbum(item: NormalizedMediaItem)`:
  - Erstellt einen `studio_images`-Eintrag mit `image_url = item.url`, `user_id`, `prompt = item.title`
  - Speichert die neue ID in `saveToAlbumImageId`
  - Öffnet den Dialog
- Nach erfolgreichem Speichern: Dialog schließen, optional `loadMedia()` aufrufen

**3. Keine Änderungen an `SaveToAlbumDialog`**
- Der Dialog funktioniert bereits generisch mit einer `imageId` (studio_images) und unterstützt Album-Auswahl + Neu-Erstellen

### Betroffene Dateien
- `src/pages/MediaLibrary.tsx` — neuer Button im Overlay, neuer State, neue Funktion, Dialog einbinden

