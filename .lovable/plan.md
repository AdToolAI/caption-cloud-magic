## Ziel
Der Musiklautstärke-Regler soll tatsächlich hörbar wirken: in Step 4, in der rechten Live-Preview und im finalen Export.

## Ursache
Die aktuelle UI setzt zwar `audioConfig.music_volume`, aber der laufende Remotion Player aktualisiert die Audio-Lautstärke nicht zuverlässig während der Wiedergabe. Zusätzlich gibt es im Export-Step noch keine direkte Nachjustierung, obwohl dort oft erst auffällt, dass die Musik zu laut/leise ist.

## Plan
1. **Zentrale Lautstärke-Funktion einführen**
   - Eine kleine Helper-Funktion für `music_volume` erstellen: clamp 0..1, perzeptive Kurve, optionales Voiceover-Ducking.
   - Dadurch nutzen Live-Preview und Export exakt dieselbe Berechnung.

2. **Live-Preview wirklich aktualisieren**
   - `RemotionPreviewPlayer` so erweitern, dass Änderungen an `backgroundMusicVolume` nicht nur Props ändern, sondern den laufenden Player sauber neu synchronisieren.
   - Falls nötig: gezielter Re-Mount nur bei Audio-Volume/Audio-URL-Änderungen, nicht bei jeder visuellen Änderung.

3. **Step-4-Regler als echte Audio-Steuerung reparieren**
   - `AudioAssetSelector` lässt `onMusicVolumeChange` wie bisher bestehen.
   - Sicherstellen, dass der geänderte Wert sofort in den Preview-Payload geht und nicht durch alten Player-State überdeckt wird.

4. **Export-Step-Regler hinzufügen/verdrahten**
   - `PreviewExportStep` bekommt `onMusicVolumeChange` und optional `onMusicClear`.
   - Wenn Musik ausgewählt ist: kleine Hintergrundmusik-Karte mit Slider anzeigen.
   - Änderung wirkt auf Parent-State und damit direkt auf Preview und finalen Render-Payload.

5. **Render-Payload robust machen**
   - Finaler Export sendet immer die aktuell berechnete `backgroundMusicVolume` mit, wenn `selectedMusicUrl` vorhanden ist.
   - Keine Änderungen an Lip-Sync, Motion Studio, Composer oder Voiceover-Pipeline.

6. **Kurzer Check nach Umsetzung**
   - Prüfen, dass sich beim Bewegen des Sliders der `backgroundMusicVolume`-Wert in Preview und Export-Payload ändert.
   - Falls möglich per Browser-Test: Slider auf 0 %, 30 %, 100 % setzen und prüfen, dass die Preview-Komponente neu reagiert.