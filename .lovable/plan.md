## Diagnose
Der Render wird im UI kurz auf `generating` gesetzt, danach fällt die Szene wieder auf den alten Zustand zurück. In den Logs/Netzwerk-Snapshots erscheint kein `compose-video-clips` Request; in der Datenbank sind die betroffenen Szenen weiterhin `engine_override='heygen'` und `clip_status='ready'`. Der wahrscheinlich verbleibende Reset kommt nicht mehr aus `ensureProject()`, sondern aus dem globalen debounced `setScenes`/`persistScenesToDb` im Dashboard: Der optimistische Status wird als normale Storyboard-Änderung behandelt und 600 ms später mit einem alten Szenen-Snapshot zurückgeschrieben.

## Fix-Plan
1. **Cinematic-Sync Start von normalem Szenen-Debounce entkoppeln**
   - In `ClipsTab` nicht mehr `onUpdateScenes(optimistic)` für den Start verwenden, weil das automatisch die Dashboard-Persistenz triggert.
   - Stattdessen einen dedizierten Callback vom Dashboard nutzen, der nur lokalen State setzt und keinen debounced DB-Flush plant.

2. **Dashboard bekommt sichere Status-Update-Funktion**
   - In `VideoComposerDashboard.tsx` eine `setScenesLocalOnly`/`onUpdateScenesLocal` Funktion ergänzen.
   - Diese aktualisiert `project.scenes`, speichert den Draft lokal, aber ruft nicht `persistScenesToDb` auf.
   - `ClipsTab` bekommt diese Funktion optional als Prop.

3. **Startpfad persistiert nur die Zielszene atomar**
   - `handleStartCinematicSync` setzt lokal sofort `engineOverride='cinematic-sync'`, `clipSource='ai-hailuo'`, `clipStatus='generating'`, `lipSyncStatus='pending'`.
   - Danach wird ausschließlich die Zielzeile in `composer_scenes` aktualisiert, inklusive `engine_override`, `clip_source`, `clip_status`, `lip_sync_status`, `lip_sync_with_voiceover`.
   - Kein Full-Project-Save und kein Debounce darf diesen Status überschreiben.

4. **Backend-Aufruf garantiert sichtbar machen**
   - Direkt nach erfolgreichem Single-Row-Update `compose-video-clips` mit `targetSceneId`, `engineOverride='cinematic-sync'` und `clipSource='ai-hailuo'` aufrufen.
   - Wenn der Aufruf oder DB-Update fehlschlägt, bleibt ein klarer Fehlerstatus/Toast sichtbar statt still auf den alten HeyGen-Zustand zurückzuspringen.

5. **Polling übernimmt Engine/LipSync vollständig**
   - `pollScenes` soll neben `clip_status` auch `engine_override`, `clip_source`, `lip_sync_status`, `lip_sync_with_voiceover` in den lokalen Szenenstate übernehmen.
   - Dadurch bleibt der Cinematic-Sync-Banner bestehen und die Sync.so Phase wird nach Hailuo-Ready weiter verfolgt.

## Erwartetes Ergebnis
Nach Klick auf „In echte Szene einbauen“ bleibt die Szene dauerhaft im Renderzustand, der Datenbankstatus bleibt `cinematic-sync/generating`, `compose-video-clips` wird wirklich aufgerufen, und die Szene fällt nicht nach 1 Sekunde zurück auf den alten HeyGen-Clip.