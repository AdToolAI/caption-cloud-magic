## Ziel
Szenen dürfen beim Start von Szene 3/4/… niemals aus der Datenbank gelöscht, ersetzt oder durch einen veralteten lokalen Snapshot überschrieben werden. Einzel-Generate soll nur die angeklickte Szene starten.

## Ursache
Der Einzel-Generate ruft aktuell erneut `ensureProjectPersisted()` auf. Diese Funktion macht bei bereits gespeicherten Projekten einen Cleanup:

```text
lösche alle composer_scenes des Projekts,
deren ID im lokalen project.scenes Snapshot nicht enthalten ist
```

Wenn der lokale Snapshot durch Realtime, Add-Scene, Sleep/Tabwechsel oder laufende DB-Refetches kurz nicht alle Szenen enthält, wird eine echte DB-Szene gelöscht. Dadurch wirkt es so, als würde Szene 3 Szene 2 „schlucken“ oder an deren Stelle rücken.

## Plan
1. **Einzel-Generate sicher machen**
   - In `useSceneGenerate` bei bereits gespeichertem Projekt und UUID-Szene `ensureProjectPersisted()` überspringen.
   - Nur die angeklickte Szene per ID vormarkieren und an `compose-video-clips` senden.
   - Kein Match mehr primär über `orderIndex`, weil Order-Gaps/Races sonst die falsche Szene treffen können.

2. **`ensureProjectPersisted` nicht mehr destruktiv im normalen Save/Generate-Pfad verwenden**
   - Den pauschalen „lösche alle DB-Szenen, die lokal fehlen“-Cleanup entfernen oder hinter einen expliziten `reconcileDeletedScenes`-Modus setzen.
   - Normaler Save darf Szenen aktualisieren/einfügen/reordnen, aber keine unbekannten DB-Szenen löschen.

3. **Löschen explizit und sicher machen**
   - `deleteScene` soll die konkrete Szene per ID löschen, statt sich auf späteren Cleanup zu verlassen.
   - Danach Reindex/Refetch aus DB, damit die Szenenliste stabil bleibt.
   - Dadurch bleibt echtes Löschen möglich, ohne dass Generate versehentlich Szenen entfernt.

4. **Realtime/Refetch gegen Order-Lücken stabilisieren**
   - Nach Generate/Refetch die Anzeige nach DB-Order sortieren, aber nicht anhand von Arraypositionen Szenen ersetzen.
   - Bestehende Order-Lücken sollen die Anzeige nicht auf „nur 2 Szenen“ zusammenschrumpfen lassen.

5. **Prüfung**
   - Testfall: Szene 1 fertig, Szene 2 fertig/generating, Szene 3 starten → Szene 2 bleibt in DB und UI erhalten.
   - Testfall: mehrere schnelle Add/Generate-Klicks → keine DB-Deletes außer explizitem Löschen.
   - Aktuelles Projekt mit Order-Gap bleibt sichtbar; neue Aktionen dürfen keine weiteren Szenen schlucken.