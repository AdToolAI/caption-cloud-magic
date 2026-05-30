## Ziel
Der Lip-Sync-Schalter in Szene 2 soll nach dem Umschalten nicht durch Realtime-/DB-Sync wieder auf AUS springen.

## Befund
Der Toggle ändert aktuell zuerst nur den lokalen Scene-State. Danach feuert ein Realtime-Refetch und nimmt `lip_sync_with_voiceover` wieder aus der Datenbank als Source of Truth. Wenn der debounced Persist noch nicht durch ist, überschreibt der alte DB-Wert den lokalen Toggle sofort wieder.

## Plan
1. **Toggle atomar speichern**
   - Den Lip-Sync-Toggle in `SceneCard.tsx` nicht nur lokal umschalten, sondern bei persistierten Szenen sofort `composer_scenes.lip_sync_with_voiceover` aktualisieren.
   - Lokalen UI-State optimistisch setzen, damit die UI direkt reagiert.

2. **Realtime-Merge gegen Rücksprung härten**
   - In `VideoComposerDashboard.tsx` beim DB-Refetch ein kurzlebiges lokales Pending-Feld für `lipSyncWithVoiceover` respektieren, damit ein alter Realtime-Snapshot den gerade geklickten Wert nicht sofort überschreibt.
   - Nach erfolgreichem DB-Update darf die Datenbank wieder Source of Truth sein.

3. **Persist-Pfad vollständig machen**
   - Sicherstellen, dass auch `useComposerPersistence.ts` beim vollständigen Projektspeichern `lip_sync_with_voiceover` mitschreibt. Aktuell wird das Feld im regulären Project-Persist nicht gesetzt, wodurch der Toggle später erneut verloren gehen kann.

4. **Validierung**
   - Codepfade prüfen: Klick auf Toggle → lokaler State AN → DB-Update AN → Realtime-Refetch bleibt AN.
   - Keine Änderungen an Render-/Audio-Mux-Pipeline; nur UI-State/Persistenz des Schalters.