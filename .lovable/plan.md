## Plan

1. **Doppelten Ladebalken entfernen**
   - Den globalen `PipelineProgressBar` unter dem Top-Stepper aus `VideoComposerDashboard.tsx` entfernen.
   - Nur der Ladebalken im Storyboard bleibt sichtbar.

2. **Progress bei 0% starten und nicht bei 60%**
   - `usePipelineProgress.ts` so anpassen, dass ein neuer Lauf seine Floors/Startzeiten sauber zurücksetzt.
   - Bereits fertige alte Clips dürfen den neuen Lauf nicht auf 60%+ springen lassen.
   - Für den Storyboard-Balken wird der aktive Generierungsprozess als eigener Lauf betrachtet: Start direkt nach Klick, dann simuliert über ca. 7–8 Minuten, echte Fertig-/Fehlerzustände dürfen ihn beenden oder korrigieren.

3. **Abgeschlossene Steps grün markieren**
   - `PipelineProgressBar.tsx` optisch verbessern: fertige Phasen bekommen grünen Glow/Check, laufende Phasen gold/cyan, ausstehende Phasen gedimmt.
   - Kein „fertig“-Signal, solange Lip-Sync noch läuft oder fehlgeschlagen ist.

4. **Grünen „Generiert“-Haken erst nach vollständiger Pipeline zeigen**
   - `SceneInlinePlayer.tsx` korrigieren: `✓ Generiert` nur anzeigen, wenn der Clip wirklich final ist.
   - Bei Cinematic-Sync/Talking-Head/Lip-Sync-Szenen zählt `clipStatus === 'ready'` allein nicht mehr; zusätzlich muss `lipSyncStatus === 'done'` oder `twoshotStage === 'done'` erfüllt sein.
   - Solange Lip-Sync `pending`/`running` ist, bleibt der Status „Baut“ bzw. „Lip-Sync läuft“.
   - Bei `lipSyncStatus === 'failed'` wird kein grüner Haken gezeigt, sondern ein Fehlerstatus.

5. **Lip-Sync-Ausfall absichern, ohne die Pipeline umzubauen**
   - Die Ursache ist sehr wahrscheinlich ein Trigger-Konflikt/Auth-Konflikt: `compose-clip-webhook` versucht Auto-Lip-Sync aus einem Backend-Kontext zu starten, aber `compose-lipsync-scene` und `compose-twoshot-lipsync` erwarten aktuell User-JWT.
   - Ich stabilisiere das, indem der Webhook nicht mehr fälschlich einen geschützten Lip-Sync-Call auslöst, sondern die bestehende clientseitige `useTwoShotAutoTrigger`-Logik sauber übernehmen lässt.
   - Dadurch wird die vorher funktionierende Pipeline nicht ersetzt, sondern der doppelte/fehleranfällige Auto-Trigger entfernt.

6. **Statuslogik für Progress und Szenen synchronisieren**
   - `usePipelineProgress.ts` soll Lip-Sync-Failure als roten/fehlgeschlagenen Zustand berücksichtigen und nicht weiter „alles läuft gut“ vortäuschen.
   - `readyCount/allReady` im Storyboard darf für Lip-Sync-Szenen nur „bereit“ zählen, wenn der finale Lip-Sync abgeschlossen ist.

## Betroffene Dateien

- `src/components/video-composer/VideoComposerDashboard.tsx`
- `src/components/video-composer/StoryboardTab.tsx`
- `src/components/video-composer/PipelineProgressBar.tsx`
- `src/components/video-composer/SceneInlinePlayer.tsx`
- `src/hooks/usePipelineProgress.ts`
- `src/hooks/useGenerateAllClips.ts`
- `supabase/functions/compose-clip-webhook/index.ts`

## Ergebnis

- Nur noch ein Ladebalken im Szenenboard.
- Der Balken startet sichtbar bei 0%.
- Fertige Schritte leuchten grün.
- `✓ Generiert` erscheint erst, wenn Clip plus Lip-Sync wirklich fertig sind.
- Lip-Sync wird nicht mehr durch konkurrierende Trigger/geschützte Backend-Aufrufe blockiert.