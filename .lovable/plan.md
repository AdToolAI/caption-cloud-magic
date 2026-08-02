# v386 — Welle D: Enum-State im gesamten Composer-Client verbindlich machen

## Bestätigte Ursache

Der aktuelle Run der betroffenen Szene ist im Backend korrekt:

- `pipeline_state = plate_rendering`
- `plate_generation = 4`
- `clip_url = null`
- kein Audio-Plan und kein Sync.so-Job
- ein aktiver HappyHorse-Plate-Render für Generation 4

Der sichtbare Sprung zu „Lip-Sync startet“ ist ein Client-Fehler. Die serverseitige Enum-Migration ist fertig, aber zentrale UI-Reader verwenden noch `clip_status`, `twoshot_stage`, `lip_sync_status`, `dialog_shots` und alte persistierte Fortschrittswerte. Zudem schreibt die allgemeine Szenen-Persistenz lokale Lifecycle-Spiegel weiterhin zurück in die Datenbank. Damit kann ein neuer Run korrekt `plate_rendering` sein, während die Oberfläche einen alten Lip-Sync-Status anzeigt oder wiederbelebt.

## Umsetzung

### 1. Enum-Zustand vollständig in das Client-Modell übernehmen

- `ComposerScene` um `pipelineState`, `pipelineStateAt`, `pipelineStateRunId`, `activeRunId`, `plateGeneration` und `plateReadyGeneration` erweitern.
- Alle DB→Client-Mapper in `VideoComposerDashboard` und `ClipsTab` um diese Felder ergänzen.
- Bei Realtime-/Tab-Refreshes `clip_url = null` respektieren; niemals auf eine alte lokale URL zurückfallen.

### 2. Lifecycle-Spalten für den Client schreibgeschützt machen

- `useComposerPersistence` darf bei normalen Prompt-, Cast- oder Layout-Edits keine Lifecycle-Felder mehr schreiben:
  - `clip_url`
  - `clip_status`
  - `pipeline_state`
  - `twoshot_stage`
  - `lip_sync_status`
  - Run-/Generationsfelder
- Diese Felder werden ausschließlich durch `composer-start-scene-generation`, State-Transitions und generation-gebundene Webhooks geändert.
- Optimistische UI-Updates bleiben lokal, können aber keinen alten Run mehr in die Datenbank zurückschreiben.

### 3. `SceneInlinePlayer` vollständig auf `sceneState()` umstellen

- Anzeigezustände ausschließlich aus dem Enum ableiten:
  - Plate-Aufbau: `plate_queued`, `plate_rendering`
  - Audio: `audio_prep`, `audio_ready`
  - Lip-Sync: `lipsync_dispatched`, `lipsync_running`, `lipsync_muxing`
  - Fertig: `complete`
  - Terminal: `failed`, `canceled`
- `status === ready`, alte `twoshotStage`-Werte oder alte `lipSyncStatus`-Werte dürfen Lip-Sync nicht mehr sichtbar starten.
- Provider-/Pass-Daten bleiben nur Detailinformationen innerhalb eines bereits enum-bestätigten Lip-Sync-Zustands.

### 4. Globalen Fortschrittsbalken generation-sicher machen

- `usePipelineProgress` für Clips, Audio, Lip-Sync, Erfolg und Fehler ausschließlich über `sceneState()` ableiten.
- Ein Plate-Run darf niemals die Lip-Sync-Phase aktivieren.
- Persistierte Session-Snapshots an `sceneId + plateGeneration + activeRunId` binden.
- Bei neuer Generation oder neuem Run alle Floors, Event-Flags und den alten 99%-Stand verwerfen.
- Legacy-Events dürfen eine Phase nur anzeigen, wenn der aktuelle Enum-Zustand diese Phase bestätigt.

### 5. Auto-Trigger strikt an Enum-Transitions koppeln

- `useTwoShotAutoTrigger` nutzt:
  - Audio-Prep nur bei `plate_ready`
  - Lip-Sync-Dispatch nur bei `audio_ready`
  - sichtbare Lip-Sync-Arbeit nur bei `lipsync_dispatched|lipsync_running|lipsync_muxing`
- Alte clientseitige Self-Heals, die `twoshot_stage` oder `lip_sync_status` direkt schreiben, entfernen.
- Fehler werden nicht mehr clientseitig über Legacy-Spalten terminal gesetzt; die jeweilige Edge Function besitzt den Transition-Claim.

### 6. Weitere sichtbare Statuskomponenten migrieren

- `SceneClipProgress` auf den Enum umstellen.
- Reset-/Fehlerbuttons im globalen Fortschrittsbalken über `pipeline_state === failed` bestimmen.
- Legacy-Felder dürfen nur noch als Diagnose-/Kompatibilitätsdaten angezeigt, aber nicht zur Steuerung verwendet werden.

### 7. Alte Plate-Versuche sauber klassifizieren

Für die betroffene Szene existieren zwei abgeschlossene ältere `plate_attempts`, die noch nicht als `superseded` markiert sind. Sie sind durch Generation/Run bereits wirkungslos, werden aber zur forensischen Eindeutigkeit beim Start einer neuen Generation als `superseded` markiert. Abgeschlossene historische Ergebnisse werden nicht gelöscht; sie dürfen nur nie wieder als aktuelle Provenienz gelten.

### 8. Lockout nach erfolgreicher Migration

- Repository-Audit aller verbleibenden Client-Lese- und Schreibstellen für die vier Legacy-Lifecycle-Spalten.
- Verbleibende Steuerlogik auf `sceneState()` migrieren.
- Schutztest hinzufügen, der fehlschlägt, wenn Composer-Clientcode Lifecycle-Spalten direkt schreibt oder Lip-Sync aus Legacy-Spalten startet.

## Verifikation

1. Neue Generierung einer zuvor erfolgreich lip-synchronisierten Szene starten.
2. Sofort prüfen:
   - Enum ist `plate_queued|plate_rendering`
   - Clip-URL leer
   - UI zeigt ausschließlich „Szene wird gebaut“
   - Lip-Sync-Phase ist inaktiv
   - Fortschritt startet für die neue Generation neu, nicht bei 99 %
3. Während des Provider-Renders sicherstellen, dass kein `compose-dialog-segments`-Aufruf erfolgt.
4. Erst nach `plate_ready → audio_prep → audio_ready` darf der Dispatch erfolgen.
5. Erst nach `lipsync_dispatched` darf „Lip-Sync startet“ erscheinen.
6. Fehlgeschlagene Plate-Generierung muss terminal bleiben und darf Audio/Lip-Sync nie aktivieren.
7. F5/Tabwechsel darf weder alte URL noch alten Fortschritt noch alten Lip-Sync-Zustand wiederherstellen.
8. Selektive Tests für `sceneState`, Progress, Auto-Trigger und Persistenz ausführen.

## Ergebnis

Nach Welle D gibt es für Steuerlogik nur noch eine Wahrheit: `pipeline_state` des aktuellen `active_run_id` und der aktuellen `plate_generation`. Die Legacy-Spalten bleiben vorübergehend Spiegel für Kompatibilität, können aber weder die UI noch einen neuen Pipeline-Schritt auslösen.