# Visueller Video Source Picker für "Video verbessern"

Das Dropdown "Choose one of your videos" wird durch eine visuelle Auswahlfläche ersetzt: Galerie der letzten Videos, Drag & Drop und Datei-Upload in einem einzigen Element. Die Einstellungen erscheinen erst, wenn ein Video gewählt ist.

## Ablauf für den Nutzer

1. **Video wählen** — eine Fläche mit den Reitern "Mediathek" und "Hochladen". Standard ist die Mediathek. Die gesamte Fläche ist gleichzeitig Ablagezone: ein Video hineinziehen genügt.
2. **Empfehlung** — direkt nach der Auswahl eine kompakte Zeile, keine große Karte:
   "✦ ByteDance vCube empfohlen · am besten für KI-generiertes Material" bzw. bei Uploads Topaz, bei 4K "✓ Bereits hohe Auflösung · Verbesserung bringt vermutlich wenig".
3. **Einstellungen** — Engine, Materialart, Auflösung, Bilder pro Sekunde, Modus/Stufe werden erst jetzt sichtbar.
4. **Ergebnis & Preis** — unverändert wie heute.

## Galerie

- 6–8 zuletzt erstellte Videos als Kacheln mit Vorschaubild, Titel, Dauer, Auflösung, Bildrate, Herkunfts-Badge (Modellname bzw. "Hochgeladen") und Datum.
- Ausgewählte Kachel bekommt den goldenen Rahmen des bestehenden Designs.
- Suchfeld und Filter: Zuletzt · Erstellt · Hochgeladen · Verbessert.
- "Alle Videos anzeigen" öffnet einen Dialog mit derselben Kachel-Darstellung und Nachladen beim Scrollen.

## Leerzustand

"Video hier ablegen — oder aus deiner Mediathek wählen" mit Schaltfläche "Video hochladen".

## Nach der Auswahl

Die Galerie klappt zu einer kompakten Karte zusammen: Vorschaubild, Titel, Herkunft, Maße · Bildrate · Dauer und "Video ändern". Drag & Drop bleibt aktiv, ein neu abgelegtes Video ersetzt die Auswahl.

Materialart wird automatisch gesetzt, wenn die Herkunft eindeutig ist ("KI-generiert — erkannt aus Seedance 2.5", mit "Ändern"-Möglichkeit). Nutzer wählen nichts, was das System sicher weiß.

Alles in EN/DE/ES, responsiv, mit den bestehenden Design-Tokens.

## Technische Umsetzung

### Kanonische Auswahl = Asset-ID (verbindlich)

- Der Picker liefert immer ein `CanonicalVideoAsset`:
  `assetId, assetSource ('generation' | 'creation'), url, thumbnailUrl, title, width, height, fps, durationSeconds, sourceModel, workflowType, createdAt`.
- An `video-enhance` geht **`sourceAssetId`**, nie eine freie URL. Der Server löst die ID heute schon gegen `ai_video_generations` bzw. `video_creations` mit `user_id`-Prüfung auf und lehnt Quellen außerhalb des AdTool-Speichers ab — dieser Pfad bleibt der einzige.
- `EnhanceVideoPanel` bekommt `initialSourceAssetId` als bevorzugte Schnittstelle; `initialSourceUrl` bleibt nur als veralteter Fallback für noch nicht migrierte Aufrufer (Mediathek-Lightbox, Director's Cut, AI Video Studio werden auf die ID umgestellt).

### Upload erzeugt ein echtes Asset

- Datei nach AdTool-Speicher unter `${user.id}/…`, danach **Datensatz in `video_creations`** anlegen (`user_id`, `output_url`, `status: 'completed'`, `metadata: { source_type: 'upload', original_filename, width, height, fps, duration }`) und dessen ID als `assetId` verwenden.
- Kein Weiterreichen einer rohen Public-URL an Video Enhance — Ownership, Lineage und Wiederauffindbarkeit in der Mediathek bleiben so intakt.
- Nur Videodateien, Typ- und Größenprüfung vor dem Upload; Fortschritt und Fehlermeldung in der Dropzone.

### Ein Listentyp, dedupliziert

- Neuer Hook `src/hooks/useEnhanceSourceVideos.ts` normalisiert `ai_video_generations` und `video_creations` in `CanonicalVideoAsset`.
- Dedupe-Regel: gleiche zugrundeliegende Datei (identische Video-URL bzw. `video_creations.metadata.generation_id` / `parent_video_id`-Verkettung) erscheint genau einmal; das persistierte `video_creations`-Asset gewinnt gegenüber der Generation.
- Verbesserte Ausgaben (`enhance`-Lineage) erscheinen als eigener Eintrag mit Badge "Verbessert", nicht als Dublette der Quelle.

### Laden und Filtern serverseitig

- Startansicht lädt nur 6–8 Einträge pro Quelle.
- "Alle Videos anzeigen", Suche und Filter laufen als paginierte Abfragen (Range/Keyset, Suche über Titel/Prompt, Filter über Status/Herkunft) — nie komplette Mediathek laden und im Browser filtern.
- Vorschaubilder: `thumbnail_url` wenn vorhanden, sonst der bestehende `LazyVideoThumb` mit `preload="metadata"`.

### Metadaten-Invariante

- Client-seitig aus dem `<video>`-Element gelesene Maße/Bildrate/Dauer sind **ausschließlich Anzeige-Fallback**.
- Maßgeblich für Preis, Empfehlung, Fähigkeitsprüfung und Provider-Auftrag bleiben die persistierten bzw. serverseitig gemessenen Werte aus `video-enhance`. Weicht die Servermessung ab, aktualisiert die UI die Anzeige nach der Preisvorschau.

### Neue und geänderte Dateien

- Neu: `src/components/ai-video/VideoSourcePicker.tsx`, `VideoSourceCard.tsx`, `AllVideosDialog.tsx`, `src/hooks/useEnhanceSourceVideos.ts`, `src/lib/videoEnhance/canonicalVideoAsset.ts` (Typ + Normalisierung + Dedupe).
- Geändert: `EnhanceVideoPanel.tsx` (Dropdown und eigene Abfrage raus, Picker rein, Progressive Disclosure, kompakte Empfehlungszeile über `recommendEnhancement`), `EnhanceVideoDialog.tsx` und die drei Aufrufer auf `initialSourceAssetId`.
- Keine Änderungen an Preislogik, Wallet, Kalibrierung oder den Edge Functions außer optional der Annahme von `sourceAssetId` aus neuen Upload-Assets (bereits unterstützt).
