## Ziel
Das per Szenen-Skript erzeugte Voiceover soll im Vorschau-Player hörbar sein — nicht nur im finalen Render oder als gespeicherter Datenbankeintrag.

## Ursache
Die Voiceover-Blöcke werden als `scene_audio_clips.kind = 'voiceover'` gespeichert, aber der Preview-Loader lädt aktuell nur `ambient`, `sfx` und `foley`. Zusätzlich sendet `SceneDialogStudio` nach der Generierung ein anderes Event (`scene-audio-clips-changed`) als der Loader erwartet (`composer:scene-audio-clips-changed`). Dadurch werden die neuen Voiceover-Clips im Player nie geladen.

## Plan
1. **Audio-Clip-Loader erweitern**
   - `useSceneAudioClips` so ändern, dass auch `kind = 'voiceover'` geladen wird.
   - Event-Namen vereinheitlichen, damit neue Clips direkt nach der Generierung im Preview auftauchen.

2. **Voiceover-Clips in der Preview synchron abspielen**
   - `ComposerSequencePreview` nutzt bereits `sceneAudioClips`; diese Logik soll auch Voiceover-Clips akzeptieren.
   - Die vorhandene Timeline-Logik bleibt erhalten: `scene_id + start_offset + duration` bestimmt den Zeitpunkt.
   - Beim Play-Button werden die versteckten Audio-Elemente geprimed, damit Browser-Autoplay-Regeln nicht blockieren.

3. **Voiceover-Tab ebenfalls an die Szenen-Audio-Clips anschließen**
   - `VoiceSubtitlesTab` bekommt `projectId` und lädt `scene_audio_clips` wie der Export-Tab.
   - Diese Clips werden an `ComposerSequencePreview` übergeben, damit der Player auf dem aktuell sichtbaren Tab das Szenen-Voiceover abspielt.

4. **Nach Generierung korrekt refreshen**
   - `SceneDialogStudio` ruft nach erfolgreichem Insert den bestehenden `emitSceneAudioClipsChanged(projectId)` Helper auf statt eines abweichenden CustomEvent-Namens.

## Dateien
- `src/hooks/useSceneAudioClips.ts`
- `src/components/video-composer/SceneDialogStudio.tsx`
- `src/components/video-composer/VoiceSubtitlesTab.tsx`
- `src/components/video-composer/VideoComposerDashboard.tsx`
- ggf. kleine Anpassung in `src/components/video-composer/ComposerSequencePreview.tsx`, falls Voiceover-Clips für Lautstärke/Priming noch explizit behandelt werden müssen

## Nicht enthalten
Keine Datenbank-Migration, keine Änderung an ElevenLabs, kein UI-Redesign.