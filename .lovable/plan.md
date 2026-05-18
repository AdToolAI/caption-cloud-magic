## Befund

Der Backend-Status ist gesund. Die aktuell sichtbare Szene ist nicht mehr „ewig laufend“, sondern korrekt als fehlgeschlagen markiert:

- Szene `bced5548-c277-487e-a7dc-536bfa8480c7`
- `lip_sync_status = failed`
- `twoshot_stage = failed`
- `clip_error = multi_speaker_scene_routed_to_single_lipsync`

Das bedeutet: Eine Multi-Speaker-Cinematic-Sync-Szene wurde weiterhin durch die Single-Speaker-Funktion `compose-lipsync-scene` getroffen. Diese Funktion blockt Multi-Speaker inzwischen absichtlich, deshalb erscheint jetzt „Lip-Sync fehlgeschlagen“ statt endlosem Laden.

Zusätzlich ist die rote Vorschau-Meldung irreführend: Sie sagt „wird neu angestoßen“, obwohl fehlgeschlagene Two-Shot-Szenen vom aktuellen Auto-Trigger nicht erneut gestartet werden.

## Problem

Es gibt noch zwei echte Restfehler:

1. **Falscher Retry-Button**
   - In `SceneCard.tsx` ruft „Lip-Sync neu rendern“ immer `compose-lipsync-scene` auf.
   - Für Cinematic-Sync mit mindestens zwei Sprechern muss aber `compose-twoshot-lipsync` aufgerufen werden.
   - Dadurch entsteht exakt der Fehler `multi_speaker_scene_routed_to_single_lipsync`.

2. **Fehlgeschlagene Two-Shot-Szenen werden nicht automatisch sauber wiederaufgenommen**
   - `useTwoShotAutoTrigger` startet nur `pending` oder `null`, aber nicht `failed`.
   - Die Preview zeigt trotzdem „wird neu angestoßen“.
   - Das UI suggeriert also einen Neustart, der nicht stattfindet.

## Plan

1. **Retry-Routing im UI korrigieren**
   - In `SceneCard.tsx` beim Klick auf „Lip-Sync neu rendern“ Sprecherzahl erkennen.
   - Für `engineOverride === 'cinematic-sync'` und ≥2 Sprecher `compose-twoshot-lipsync` aufrufen.
   - Für Single-Speaker weiter `compose-lipsync-scene` verwenden.
   - Den lokalen Status danach passend auf `running` setzen.

2. **Auto-Trigger für echte Retry-Fälle robust machen**
   - `useTwoShotAutoTrigger.ts` so erweitern, dass es bestimmte fehlgeschlagene Two-Shot-Szenen wieder anstoßen kann.
   - Erlaubte Retry-Gründe: falsches Single-LipSync-Routing, Watchdog-Stale, Timeout.
   - Nicht blind alle `failed`-Szenen endlos neu versuchen.
   - Pro Szene einen kurzen In-Memory-Retry-Lock setzen, damit keine Retry-Schleife entsteht.

3. **Irreführende Preview-Meldung korrigieren**
   - In `ComposerSequencePreview.tsx` bei `lipSyncStatus === 'failed'` nicht mehr „wird neu angestoßen“ anzeigen.
   - Stattdessen klar anzeigen: „Lip-Sync fehlgeschlagen — erneut rendern“ oder nur „fehlgeschlagen“, abhängig vom vorhandenen Retry-Status.

4. **Alten Single-Speaker-Auto-Trigger in `ClipsTab.tsx` endgültig entschärfen**
   - Sicherstellen, dass `ClipsTab.tsx` Cinematic-Sync-Multi-Speaker niemals zu `compose-lipsync-scene` schickt, auch wenn lokale `audioPlan.speakers` noch nicht aktuell ist.
   - Sprecherzahl aus DB-Feldern `audio_plan.twoshot.speakers`, `audio_plan.speakers` und `dialog_script` ableiten, nicht nur aus lokalem Scene-State.

5. **Aktuelle Szene reparieren**
   - Szene `bced5548-c277-487e-a7dc-536bfa8480c7` von `failed` zurück auf `pending` setzen.
   - `twoshot_stage` sinnvoll auf `master_clip` oder `null` zurücksetzen.
   - `clip_error` leeren und `replicate_prediction_id` leeren.
   - Credits nur dann zusätzlich erstatten, wenn für diesen fehlgeschlagenen Versuch noch keine Rückerstattung erfolgt ist.

6. **Validieren**
   - Geänderte Edge-/Frontend-Logik deployen bzw. anwenden.
   - Die aktuelle Szene direkt über `compose-twoshot-lipsync` testen.
   - In Datenbank und Logs prüfen, dass die Szene nicht mehr in `multi_speaker_scene_routed_to_single_lipsync` landet und mindestens `lipsync_1` startet.