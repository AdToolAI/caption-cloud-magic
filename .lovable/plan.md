## Ziel
Wenn du im Storyboard auf **Generieren** klickst und die Szene auf **Baut** springt, soll der obere/inline Ladebalken sofort sichtbar bleiben und den aktiven Renderstatus anzeigen.

## Plan
1. **Root Cause fixen**
   - Die Einzel-Szene-Generierung sendet zwar ein `clips:start` Event, aber die Progress-Bar-Komponente sitzt innerhalb von `StoryboardTab` und kann das Event im selben Render-Tick verpassen.
   - Ich mache die Progress-Bar nicht mehr nur event-getrieben, sondern zusätzlich state-getrieben: sobald eine Szene `clipStatus='generating'`, aktive `lipSyncStatus`/`twoshotStage` oder einen `replicatePredictionId` hat, bleibt sie sichtbar.

2. **`usePipelineProgress.ts` robuster machen**
   - `eventFlags.clips` weiterhin für sofortige Rückmeldung nutzen.
   - Zusätzlich echte aktive Jobs aus den Szenen ableiten, inklusive Dialog-Shot/Lipsync-Pipeline.
   - Wenn ein Job läuft, aber kein Start-Event mehr vorhanden ist, automatisch Baseline/Startzeit setzen, damit ETA und Soft-Floor sauber laufen.

3. **Einzel-Generierung korrekt abschließen lassen**
   - `useSceneGenerate.ts` so anpassen, dass `clips:end` nur bei echtem Fehler/Abbruch gesendet wird, aber der Ladebalken über den realen Szenenstatus weiterläuft.
   - Falls die Edge Function sofort einen terminalen Status zurückgibt (`ready`/`failed`), bleibt die UI konsistent.

4. **Anzeigeort prüfen**
   - Die vorhandene Progress-Bar im Storyboard bleibt bestehen; falls nötig, bekommt sie einen etwas höheren `z-index`, damit sie nicht hinter dem rechten Szenenpanel/Sticky-Header verschwindet.

## Erwartetes Ergebnis
Nach Klick auf **Generieren** siehst du wieder einen Ladebalken mit Phase **Clips**; er bleibt sichtbar, solange die Szene wirklich baut, und verschwindet erst nach Abschluss oder Fehler.