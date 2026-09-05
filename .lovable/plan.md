# Visueller Video Source Picker für "Video verbessern"

Das Dropdown "Choose one of your videos" wird durch eine visuelle Auswahlfläche ersetzt: Galerie der letzten Videos, Drag & Drop und Datei-Upload in einem einzigen Element. Die Einstellungen erscheinen erst, wenn ein Video gewählt ist.

## Ablauf für den Nutzer

1. **Video wählen** — eine Fläche mit den Reitern "Mediathek" und "Hochladen". Standard ist die Mediathek. Die gesamte Fläche ist gleichzeitig Ablagezone: ein Video hineinziehen genügt.
2. **Empfehlung** — direkt nach der Auswahl erscheint ein Hinweis, welche Engine zum Material passt (KI-Clip → ByteDance vCube, Kameraaufnahme/Upload → Topaz, bereits 4K → "Verbesserung vermutlich nicht nötig"). Das nutzt die bereits vorhandene Empfehlungslogik.
3. **Einstellungen** — Engine, Materialart, Auflösung, Bilder pro Sekunde werden erst jetzt sichtbar.
4. **Ergebnis & Preis** — unverändert wie heute.

## Galerie

- 6–8 zuletzt erstellte Videos als Kacheln mit erstem Frame bzw. vorhandenem Vorschaubild, Titel, Dauer, Auflösung, Bildrate, Herkunfts-Badge (Modellname bzw. "Hochgeladen") und Datum.
- Ausgewählte Kachel bekommt den goldenen Rahmen des bestehenden Designs.
- Suchfeld und Filter: Zuletzt · Erstellt · Hochgeladen · Verbessert.
- "Alle Videos anzeigen" öffnet die vollständige Auswahl als Dialog mit derselben Kachel-Darstellung.

## Leerzustand

"Video hier ablegen — oder aus deiner Mediathek wählen" mit Schaltfläche "Video hochladen".

## Nach der Auswahl

Die Galerie klappt zu einer kompakten Karte zusammen: Vorschaubild, Titel, Maße · Bildrate · Dauer, Herkunfts-Badge und "Video ändern". Drag & Drop bleibt auf dieser Karte aktiv, ein neu abgelegtes Video ersetzt die Auswahl.

Alles in EN/DE/ES, responsiv, mit den bestehenden Design-Tokens.

## Technische Umsetzung

- Neue Komponente `src/components/ai-video/VideoSourcePicker.tsx` plus Kachel `VideoSourceCard.tsx` und Dialog `AllVideosDialog.tsx`.
- Neuer Hook `src/hooks/useEnhanceSourceVideos.ts`: liest `ai_video_generations` (Modell, Auflösung, Dauer, `thumbnail_url`) und `video_creations` (`output_url`, `framerate`, `thumbnail_url`, `metadata`), führt beides zu einem gemeinsamen Listentyp zusammen, sortiert nach Datum, mit Filter- und Suchparametern. Keine Duplizierung der Mediathek-Logik — dieselben Tabellen und Felder wie `src/pages/MediaLibrary.tsx`.
- Fehlende Bildrate/Maße werden clientseitig aus dem `<video>`-Element gelesen (nur für die Anzeige); maßgeblich für Preis und Lauf bleibt weiterhin die serverseitige Messung in `video-enhance`.
- Vorschaubilder: `thumbnail_url` wenn vorhanden, sonst der bestehende `LazyVideoThumb` mit `preload="metadata"` (kein Massen-Laden).
- Upload/Drop: Datei nach `composer-uploads` unter `${user.id}/…` (bestehendes Muster aus `SceneMediaUpload.tsx`), danach öffentliche URL als Quelle. Nur Videodateien, Größen-/Typprüfung vor dem Upload.
- `EnhanceVideoPanel.tsx`: Dropdown und die eigene `useQuery`-Abfrage entfernen, Picker einsetzen, Einstellungsblock hinter `sourceUrl` verstecken, Empfehlungshinweis über `recommendEnhancement` aus `src/lib/videoEnhance/recommend.ts` einblenden. Bei vorbelegter Quelle (`initialSourceUrl`) direkt die kompakte Karte zeigen.
- Keine Änderungen an `useEnhanceVideo`, Preislogik, Wallet, Edge Functions oder Kalibrierung.
