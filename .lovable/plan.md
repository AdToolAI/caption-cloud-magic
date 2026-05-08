## Ziel
Das im Szenen-Skript erzeugte Voiceover soll im Preview-Player hörbar sein, und der Skripttext soll nicht als sichtbares Textoverlay/Untertitel erscheinen, außer der Nutzer erzeugt explizit Untertitel.

## Plan
1. **Szenen-Voiceover als eigenständige Audiotracks behandeln**
   - `scene_audio_clips.kind = 'voiceover'` bleibt die Quelle für per-scene Dialog/Monolog-Audio.
   - Im Preview werden diese Clips nicht mehr wie SFX mit Fade-/Fensterlogik behandelt, sondern als Voiceover-Spoken-Tracks ohne Fade und mit voller Lautstärke synchron zur Szene abgespielt.

2. **Autoplay-/Gesture-Problem im Preview beheben**
   - Beim Klick auf Play werden sowohl SFX-Clips als auch der globale Voiceover-Audiotrack und die per-scene Voiceover-Clips “geprimed”.
   - Dadurch blockiert der Browser die späteren `audio.play()`-Aufrufe nicht mehr, wenn ein Voiceover erst nach Szenenstart oder nach einem Scrub beginnt.

3. **Dialog-/Skripttext nicht als sichtbares Overlay rendern**
   - Die bestehende Logik, die Szenen-Skripte in den AI-Prompt schreibt, bleibt für die Videogenerierung erhalten.
   - Es wird aber sichergestellt, dass `dialogScript` nicht in `textOverlay`, `globalTextOverlays` oder automatische Untertitel wandert.
   - Legacy-/Migrationslogik wird so abgesichert, dass nur echte Textoverlay-Felder migriert werden, nicht das Voiceover-Skript.

4. **Preview-Synchronisation nach Voiceover-Generierung stabilisieren**
   - Nach dem Insert von per-scene Voiceover-Clips wird der Preview-Loader zuverlässig aktualisiert.
   - Falls die Szene durch `ensureProjectPersisted()` eine neue DB-ID bekommt, wird der Audioclip weiter sauber der sichtbaren Szene zugeordnet.

## Technische Details
- Betroffene Dateien voraussichtlich:
  - `src/components/video-composer/ComposerSequencePreview.tsx`
  - `src/components/video-composer/SceneDialogStudio.tsx`
  - ggf. `src/components/video-composer/VoiceSubtitlesTab.tsx`
- Keine Datenbankmigration nötig.
- Keine Änderung an ElevenLabs selbst; Fokus liegt auf Playback, Clip-Timing und Overlay-Trennung.