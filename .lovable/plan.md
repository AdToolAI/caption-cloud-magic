## Ziel
Der 15s-One-Take darf im Production Plan und nach dem Anwenden nicht mehr zu `1 Block • 1 Sprecher` kollabieren, wenn im Briefing 4 Sprecher klar angegeben sind.

## Diagnose
Die aktuelle v219-Reparatur greift zu spät bzw. nicht breit genug:

1. `continuousSceneLock` ist nur aktiv, wenn der Detektor `SHOT_MARKERS` erkennt.
2. Bei Briefings mit Sprecher-Blöcken ohne harte Shot-Marker wird aber `SPEAKER_BLOCKS` erkannt.
3. Dadurch läuft `ensureContinuousSceneDialogTurns` nicht, obwohl explizit `1 durchgehende Szene` + 4 Sprecher gemeint ist.
4. Zusätzlich kann `applyContinuousScriptTurns` vorher/bei Merge Dialog-Turns aus dem Timing-Parser ohne `speakerCharacterId` schreiben.
5. Der Apply-Hook baut den finalen `dialogScript` ausschließlich aus `dialogTurns`; wenn dort nur ein Turn oder nur ein gebundener Sprecher ankommt, zeigt der Scene Script Editor korrekt nur `1 Sprecher`.

## Umsetzung

### 1. Continuous-Split für alle expliziten One-Take-Briefings aktivieren
In `briefing-deep-parse` wird der Trigger geändert von:

```text
continuousSceneLock = continuousScene && SHOT_MARKERS
```

auf:

```text
explicitContinuousScene = continuousScene && sceneCount === 1
```

Damit greift die Reparatur auch bei `SPEAKER_BLOCKS` und nicht nur bei `SHOT_MARKERS`.

### 2. Script-Timing-Turns bevorzugt übernehmen
`ensureContinuousSceneDialogTurns` bekommt optional `scriptTiming`.

Wenn der Detektor mehrere Sprecher-Turns findet, werden diese als Quelle genutzt:

```text
Sprecher 1 -> Cast[0].characterId
Sprecher 2 -> Cast[1].characterId
Sprecher 3 -> Cast[2].characterId
Sprecher 4 -> Cast[3].characterId
```

Vorteil: Kein künstliches Chunking mehr, wenn das Briefing bereits echte Sprecherzeilen enthält.

### 3. Nicht zu früh skippen
Die bestehende Skip-Logik zählt aktuell auch `speakerMentionKey`s. Das kann fälschlich als „genug Sprecher vorhanden“ gelten, obwohl keine echten UUIDs gebunden sind.

Änderung: Skip nur noch, wenn genügend eindeutige, gültige `speakerCharacterId` UUIDs vorhanden sind.

### 4. Solo-Cast für One-Take-Ensembles dauerhaft deaktivieren
`enforceSoloCast` wird bei expliziter 1-Szene + 2+ gebrieften Sprechern übersprungen — unabhängig davon, ob `SHOT_MARKERS` oder `SPEAKER_BLOCKS` erkannt wurde.

### 5. Debug/Version bumpen
- Server `pipelineVersion`: `v220`
- Client `CLIENT_PIPELINE_VERSION`: `220`
- Debug-Meta soll zeigen, ob die Quelle `script-timing`, `dialog`, `voiceover` oder `placeholder` war.

## Erwartetes Ergebnis
Nach neuer Briefing-Analyse:

```text
1 Szene
4 Cast-Slots
4 Dialog-Turns aus dem Briefing
4 eindeutige speakerCharacterId UUIDs
Apply erzeugt dialogScript mit 4 Sprecher-Blöcken
Scene Script Editor zeigt: 4 Blöcke • 4 Sprecher
```

## Wichtig
Der Nutzer soll Stimmen weiterhin manuell ergänzen können, aber das darf nicht die Sprecher-Zuordnung ersetzen. Erst wenn die 4 Sprecher-UUIDs korrekt gebunden sind, ist Voice-Mapping zuverlässig.