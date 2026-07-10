## Befund

Der Fehler sitzt nicht primär im Scene Script Editor. Der Server-Log zeigt für die aktuelle Analyse:

```text
scene-count guard failed (non-fatal): Cannot access 'characters' before initialization
```

Dadurch läuft der entscheidende One-Take-Merge/Continuous-Dialog-Pfad zu früh in einen ReferenceError. Genau dort wird `extractSelectedCastFromBriefing(briefing, characters)` aufgerufen, bevor `characters` aus der Library geladen wurde. Danach macht die Pipeline weiter, aber ohne die korrekte Cast-basierte One-Take-Reparatur — deshalb kann am Ende wieder ein einzelner Sprecher/Turn im Storyboard landen.

## Plan

1. **Server-Reihenfolge korrigieren**
   - In `briefing-deep-parse` werden `characters` und `locations` direkt nach dem Library-Load initialisiert, bevor der Scene-Count-Guard läuft.
   - Der spätere doppelte `const characters = ...` Block wird entfernt/umgebaut, damit keine doppelte Deklaration entsteht.

2. **Continuous-One-Take-Trigger vereinheitlichen**
   - Den alten `continuousSceneLock` nicht mehr nur an `SHOT_MARKERS` koppeln.
   - Für `1 durchgehende Szene` muss der Pfad auch bei `SPEAKER_BLOCKS` greifen.

3. **Dialog-Turns nach jedem potenziellen Überschreiber erneut absichern**
   - Nach `applyContinuousScriptTurns`, `strictCast`, `fidelity`, `soloCast` und `bindTurnSpeakerIds` wird geprüft:
     - explizit 1 Szene
     - 2+ gebriefte Sprecher
     - weniger gültige `speakerCharacterId` UUIDs als gebriefte Sprecher
   - Falls ja, rekonstruiert `ensureContinuousSceneDialogTurns` deterministisch die Turns aus `scriptTiming` und bindet die Cast-UUIDs.

4. **Client-Apply gegen stale/kaputte Pläne absichern**
   - In `useApplyProductionPlan` vor `dialogScript`-Build eine letzte Safety-Net-Prüfung:
     - Wenn eine 1-Szene-Planung mehrere Cast-UUIDs hat, aber nur 0/1 gültige Dialog-Sprecher, werden Turns aus vorhandenem `dialogTurns`/`voiceover`/Cast-Reihenfolge rekonstruiert.
   - Damit auch ein alter Review-Plan nicht mehr als „1 Sprecher spricht alles“ gespeichert wird.

5. **Nachweis/Validierung**
   - Edge Function deployen.
   - Logs prüfen, dass kein `Cannot access 'characters' before initialization` mehr kommt.
   - Prüfen, dass `continuous_scene_split` und `turn_binding` für den One-Take-Fall laufen.
   - Danach muss der angewendete Scene Script Editor `4 Blöcke • 4 Sprecher` statt `1 Block • 1 Sprecher` zeigen.

## Erwartetes Ergebnis

Neue Briefing-Analyse und Apply erzeugen für den 15s-One-Take:

```text
1 Szene
4 Cast-Slots
4 Dialog-Turns
4 gültige speakerCharacterId UUIDs
Scene Script: 4 Blöcke • 4 Sprecher
```

Wichtig: Bereits angewendete kaputte Szenen werden durch den Fix nicht automatisch rückwirkend repariert. Nach Deployment muss die Briefing-Analyse neu gestartet und der Plan neu angewendet werden.