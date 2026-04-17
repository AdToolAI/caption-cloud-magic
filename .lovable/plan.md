

## Befund

In Tab "Musik" gibt es nur Genre/Stimmung-Auswahl + "Musik suchen" (Stock-Library). Nutzer kann **keine eigene Musikdatei hochladen**. Voiceover-Tab und `AudioUpload`-Komponente zeigen, dass das Datenmodell (`MusicConfig.isUpload`) und der Storage-Bucket (`background-music`, public, RLS für Upload/Delete bereits vorhanden) **schon vorbereitet** sind — nur die UI fehlt.

## Plan

### 1. Upload-Sektion in `AudioTab.tsx` ergänzen
Direkt unter dem "Musik suchen"-Button eine Trennlinie + neuer Block "Eigene Musik hochladen":
- Drag-&-Drop-Zone (analog zu `src/components/video/AudioUpload.tsx`)
- Akzeptiert `audio/*` (mp3/wav/ogg/m4a)
- Limit: **20 MB** (Hintergrundmusik kann länger sein als VO)
- Upload via `supabase.storage.from('background-music').upload(\`${user.id}/${timestamp}_${filename}\`)`
- Public URL holen, dann `onUpdateAssembly({ music: { ...music, trackUrl, trackName: file.name, isUpload: true } })`
- Progress-Bar während Upload, Toast bei Erfolg/Fehler

### 2. Visuelles Feedback für Upload-Track
- Wenn `music.isUpload === true` und `music.trackUrl` gesetzt: Karte mit Dateiname + Play/Pause-Preview-Button + "Entfernen"-Button (analog zu Stock-Track-Auswahl, aber mit Upload-Icon)
- Klar erkennbar, dass es ein eigener Upload ist (z.B. kleiner "Upload"-Badge)

### 3. Beat-Sync unverändert
Funktioniert bereits mit jeder `trackUrl` — Upload-Tracks profitieren automatisch davon.

### 4. Lokalisierung (`src/lib/translations.ts`)
Neue Keys (DE/EN/ES):
- `videoComposer.uploadOwnMusic` — "Eigene Musik hochladen" / "Upload your own music" / "Sube tu propia música"
- `videoComposer.dropMusicHere` — "Audio hier ablegen oder klicken" / …
- `videoComposer.musicFormats` — "MP3, WAV, OGG, M4A bis 20MB"
- `videoComposer.musicUploaded` — "Musik hochgeladen"
- `videoComposer.musicUploadError` — "Fehler beim Hochladen"
- `videoComposer.musicTooLarge` — "Datei zu groß. Maximal 20MB"
- `videoComposer.orDivider` — "oder"
- `videoComposer.uploadedTrack` — "Hochgeladener Track"

### 5. Render-Pipeline
Keine Änderung nötig. `compose-video-assemble` nutzt schon `music.trackUrl` unabhängig von der Quelle. Upload-URLs aus dem `background-music`-Bucket sind public und Lambda-kompatibel.

## Geänderte Dateien
- `src/components/video-composer/AudioTab.tsx` — Upload-Zone + Upload-Handler + Display für hochgeladene Tracks
- `src/lib/translations.ts` — neue Keys (DE/EN/ES)

## Verify
- Tab "Musik": Unter "Musik suchen" erscheint eine "oder eigene Musik hochladen"-Drag-&-Drop-Zone
- Datei reinziehen → Upload-Progress → Track wird automatisch ausgewählt (kleiner "Upload"-Badge)
- Upload >20 MB → klare Fehlermeldung
- Im Preview-Player läuft die hochgeladene Musik mit korrekter Lautstärke
- Beat-Sync funktioniert auch mit hochgeladenen Tracks
- Im finalen Lambda-Render ist die Upload-Musik enthalten
- Stock-Suche und Upload können nebeneinander genutzt werden (zuletzt gewählter Track gewinnt)

