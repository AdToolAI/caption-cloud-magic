## Diagnose
Der Slider ändert zwar den State, aber der eigentliche Mix im `UniversalCreatorVideo` nutzt die Voiceover-Lautstärke nicht korrekt: `voiceoverVolume` wird im Template gar nicht aus den Props gelesen, sondern Voiceover läuft nur über `masterVolume`. Gleichzeitig wird Musik über `backgroundMusicVolume * masterVolume` gemischt. Dadurch kann die Musik trotz 30% subjektiv lauter bleiben und Slider-Änderungen wirken in der Live-Preview nicht zuverlässig.

## Plan
1. **Voiceover-Lautstärke im Remotion-Template korrekt anschließen**
   - `voiceoverVolume` in `UniversalCreatorVideoSchema` ergänzen.
   - `voiceoverVolume` in `UniversalCreatorVideo` aus Props lesen.
   - Voiceover-Audio mit `voiceoverVolume * masterVolume` statt nur `masterVolume` rendern.

2. **Hintergrundmusik stärker und konsistenter ducken**
   - Die zentrale Helper-Funktion so anpassen, dass Musik bei vorhandenem Voiceover deutlich niedriger gemischt wird.
   - Ziel: 30% Musik darf niemals lauter wirken als 100% Voiceover.
   - Live-Preview und Export nutzen weiter dieselbe Funktion, damit kein Unterschied zwischen Vorschau und finalem Render entsteht.

3. **Live-Preview-Player robuster re-synchronisieren**
   - Den Remotion-Player bei Audio-Mix-Änderungen gezielt remounten lassen, aber den Player-Master-Volume nicht als Ersatz für Track-Mix verwenden.
   - Der Control-Slider unten rechts bleibt Master-Lautstärke; der Musik-Slider bleibt Track-Lautstärke.

4. **Export-Payload unverändert in der Pipeline lassen**
   - Keine Änderungen an Motion Studio, Lip-Sync, Composer, Datenbank oder Render-Funktionen.
   - Nur die Universal-Creator-Audio-Props werden korrigiert.

5. **Verifikation**
   - Prüfen, dass `backgroundMusicVolume` bei 0%, 30%, 100% sichtbar unterschiedliche Werte in Preview und Export-Payload erhält.
   - Prüfen, dass `voiceoverVolume` im Template nicht mehr ignoriert wird.

## Risiko
Sehr gering: Die Änderung betrifft nur den Audio-Mix des Universal Content Creators. Die bestehende Video-/Lip-Sync-Pipeline wird nicht angefasst.