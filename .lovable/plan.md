## Plan

1. **Alle Toggle-Einstiege vereinheitlichen**
   - Nicht nur den Button in `SceneCard.tsx`, sondern auch den `Switch` in `SceneAvatarMode.tsx` über denselben Persistenzpfad laufen lassen.
   - Dadurch wird der DB-Wert sofort geschrieben, egal von welcher UI-Stelle der Toggle bedient wird.

2. **Realtime-Rücksprung blockieren**
   - In `VideoComposerDashboard.tsx` eine kurze Pending-Map für `lipSyncWithVoiceover` einbauen.
   - Wenn direkt nach dem Klick ein alter Realtime-Snapshot kommt, behält die UI den gerade geklickten Wert, bis die DB den neuen Wert bestätigt oder der Write fehlschlägt.

3. **Lokalen Debounce nicht mehr mit altem Snapshot überschreiben lassen**
   - Den bestehenden debounced Scene-Persist so anpassen, dass er keine veralteten `lip_sync_with_voiceover` Werte zurück in die DB schreibt, während ein Toggle-Write pending ist.

4. **Fehlerverhalten sauber halten**
   - Bei DB-Fehler: Toggle sichtbar zurückrollen und Warnung loggen.
   - Bei Erfolg: Pending-State löschen, Realtime darf danach wieder normal DB als Source of Truth nutzen.

## Technische Details

- Betroffene Dateien:
  - `src/components/video-composer/VideoComposerDashboard.tsx`
  - `src/components/video-composer/SceneAvatarMode.tsx`
  - optional minimal: `src/components/video-composer/SceneCard.tsx` zur Nutzung desselben Handlers
- Keine Änderungen an Render-, Sync.so-, Audio-Mux- oder Backend-Pipeline.