# Two-Shot Render-Fehler `MISSING_PROJECT_ID` beheben

## Ursache

Im Two-Shot-Pfad in `SceneDialogStudio.tsx` (Zeile ~964) wird `compose-video-clips` mit
`pidFinal = (projectId || scene.projectId || '').trim()` aufgerufen. Wenn das Projekt
noch nicht in der DB persistiert ist (frisches Projekt, User hat noch nicht gespeichert),
ist `pidFinal` leer → die Edge Function antwortet mit `400 MISSING_PROJECT_ID`.

Die anderen Pfade in derselben Datei (z. B. `resolvePersistedIds` bei Zeile 415, sowie
der SRS-Pfad bei Zeile 741) lösen das bereits sauber via `onEnsurePersisted()`. Der
Two-Shot-Branch wurde dabei vergessen.

## Fix (nur Frontend, keine Business-Logik-Änderung)

**Datei:** `src/components/video-composer/SceneDialogStudio.tsx` (Zeilen ~960–985)

Vor dem `supabase.functions.invoke('compose-video-clips', …)`-Call:

1. `resolvePersistedIds()` aufrufen statt `pidFinal` direkt aus Props zu lesen.
2. Wenn das Ergebnis null/leer ist → freundlicher Toast
   („Projekt konnte nicht gespeichert werden — bitte erneut versuchen") +
   optimistic state rollback (`clipStatus: 'pending'`, `twoshotStage: null`).
3. Den zurückgegebenen `pid` (und ggf. `sceneId`) für `scenePayload.projectId`,
   `scenePayload.id` und das Body-Feld `projectId` benutzen.

Damit erhält `compose-video-clips` immer eine gültige `projectId` und der Two-Shot
verhält sich konsistent zu den übrigen Render-Pfaden.

## Out of Scope

- Edge Function `compose-video-clips` (die Validierung ist korrekt)
- Andere Render-Pipelines, Wallet-Logik, Sync.so, Continuity Guardian
- UI/Design-Änderungen
