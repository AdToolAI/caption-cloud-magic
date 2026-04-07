

## Plan: Album-System in die Mediathek integrieren & KI Picture Studio verknüpfen

### Überblick
Das Album-System aus dem KI Picture Studio wird als neues Segment "Alben" in die Mediathek verschoben. KI-generierte Bilder landen automatisch im nicht-löschbaren Unterordner "KI Picture Studio". Nach der Bildgenerierung gibt es einen Button, der direkt zur Mediathek → Alben → KI Picture Studio navigiert.

### Änderungen

**1. Mediathek: Neues "Alben"-Tab hinzufügen**
- `src/pages/MediaLibrary.tsx`: Tab-Leiste von 6 auf 7 Tabs erweitern (+ "Alben" mit FolderOpen-Icon)
- `categoryFilter`-Type um `"albums"` erweitern
- URL-Parameter `?tab=albums&album=ki-picture-studio` unterstützen
- Wenn "Alben" aktiv: `AlbumManager`-Komponente anzeigen statt der normalen Media-Grid

**2. AlbumManager für Mediathek anpassen**
- `src/components/picture-studio/AlbumManager.tsx` → nach `src/components/media-library/AlbumManager.tsx` verschieben/refactoren
- Systemalbum "KI Picture Studio" automatisch erstellen (is_system: true) beim ersten Laden, falls nicht vorhanden
- Systemalben können nicht gelöscht werden (Delete-Button ausblenden)
- Eigene Alben weiterhin erstellbar/löschbar
- URL-Parameter `album` auswerten: bei `?tab=albums&album=ki-picture-studio` direkt ins KI-Album navigieren

**3. DB-Migration: Systemalbum-Flag**
- `studio_albums`-Tabelle: Spalte `is_system BOOLEAN DEFAULT false` hinzufügen
- Damit kann das "KI Picture Studio"-Album als nicht-löschbar markiert werden

**4. KI Picture Studio: Auto-Save ins Systemalbum**
- `src/components/picture-studio/ImageGenerator.tsx`: Nach erfolgreicher Generierung das Bild automatisch mit der `album_id` des "KI Picture Studio"-Systemalbums in `studio_images` speichern
- Nach der Generierung: Button "Zur Mediathek" anzeigen, der zu `/mediathek?tab=albums&album=ki-picture-studio` navigiert

**5. KI Picture Studio: Album-Tab entfernen**
- `src/pages/PictureStudio.tsx`: Den "Meine Alben"-Tab aus dem Picture Studio entfernen (nur noch "Generieren" und "Smart Background")
- AlbumManager-Import entfernen

### Ablauf für den User
1. Bild im KI Picture Studio generieren
2. Button "Zur Mediathek" klicken
3. Wird zur Mediathek weitergeleitet → Tab "Alben" → Ordner "KI Picture Studio" ist automatisch geöffnet
4. Das neue Bild ist dort sichtbar
5. User kann eigene Alben erstellen und Bilder zwischen Alben verschieben

