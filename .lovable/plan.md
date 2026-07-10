## Diagnose
Der Fehler ist sehr wahrscheinlich kein fehlender Voice-Pool mehr, sondern eine Reihenfolge-/Binding-Lücke im neuen v218-Fix:

- Der neue Continuous-Scene-Split erzeugt zwar 4 Dialog-Turns.
- Diese Turns bekommen aber `speakerCharacterId: null`, wenn `requiredCast` aus dem Briefing keine echten UUIDs trägt.
- Danach blockiert das Review korrekt mit: „4 Dialog-Turns haben keine eindeutige Charakter-ID“.
- Zusätzlich kann `enforceSoloCast` vorher eine Szene mit nur einem erkannten Sprecher als Solo-Szene trimmen, bevor der Continuous-Split die 4 Sprecher repariert.
- Im Code gibt es außerdem einen Syntax-/Struktur-Risiko-Punkt: `ensureContinuousSceneDialogTurns` muss sauber geschlossen sein, bevor `applyContinuousScriptTurns` beginnt.

## Plan

1. **Server-Reihenfolge korrigieren**
   - Continuous-Scene-Split vor `enforceSoloCast` ausführen.
   - `enforceSoloCast` für explizite 1-Szene/Mehrsprecher-Briefings überspringen oder erst nach dem Split nur noch anwenden, wenn wirklich nur 1 Sprecher vorgesehen ist.

2. **UUID-Binding robuster machen**
   - `ensureContinuousSceneDialogTurns` nicht blind `requiredCast.characterId` übernehmen.
   - Stattdessen die finale Szene-Cast-Liste als UUID-Quelle nutzen.
   - Wenn `requiredCast` nur MentionKeys/Namen hat, werden diese in Reihenfolge gegen `scene.cast[]` mit echten UUIDs gebunden.
   - Ergebnis: 4 Turns → 4 echte `speakerCharacterId`s.

3. **Review-Safety-Net ergänzen**
   - Im Production Plan Sheet eine automatische Reparatur einbauen:
     - Wenn es genau eine Continuous-Szene gibt,
     - 2+ Cast-Mitglieder vorhanden sind,
     - und Dialog-Turns ohne `speakerCharacterId` existieren,
     - dann werden die Turns positionsbasiert an die vorhandenen Cast-UUIDs gebunden.
   - Dadurch wird auch ein bereits geöffneter/staler Plan nicht unnötig blockiert.

4. **Apply-Prüfung unverändert streng lassen**
   - `useApplyProductionPlan` bleibt ID-only.
   - Keine Namens-Fuzzy-Logik, keine Vornamen-Heuristik.
   - Wenn nach den Reparaturpässen noch IDs fehlen, blockiert die UI weiterhin korrekt.

5. **Version & Debug erhöhen**
   - Pipeline-Version bumpen.
   - `_meta.debug.turnBinding` / `continuousSceneSplit` so ergänzen, dass man im Debug sieht: erwartete Sprecher, erzeugte Turns, gebundene IDs.

## Ergebnis
Ein 15s-One-Take-Briefing mit 4 klar gewählten Sprechern landet im Review als:

```text
4 Dialog-Turns
4 Sprecher
4 speakerCharacterId UUIDs
4 Voice-Zuordnungen beim Apply
```

Der Nutzer muss Stimmen nur noch manuell setzen, wenn ein Charakter wirklich keine Stimme/Pool-Stimme bekommen kann — nicht wegen kaputter Sprecher-ID-Verdrahtung.