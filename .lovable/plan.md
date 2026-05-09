# Plan: Lip-Sync Fehler beim Splitten beheben

## Diagnose

Die Fehlermeldung im Screenshot ist **nicht mehr der alte HeyGen-40099-Fehler**, sondern ein Insert-Problem:

```text
Matthew Dusatko: sub-scene insert failed
Sarah Dusatko: sub-scene insert failed
```

In der Datenbank sieht man: Die aktuelle Dialog-Szene hat Matthew + Sarah korrekt gespeichert, aber es wurden **keine** neuen Sub-Szenen angelegt.

Der wahrscheinlich konkrete Fehler: `SceneDialogStudio` ruft zwar `resolvePersistedIds()` auf und findet die echte gespeicherte Scene-ID, übergibt danach aber weiterhin `scene.id` an `onInsertScenesAfter`. Wenn die UI noch eine alte/temp/local ID hält, findet `insertScenesAfter` den Parent in `project.scenes` nicht und gibt für beide Inserts `undefined` zurück. Dadurch entstehen exakt die Toasts „sub-scene insert failed“.

## Umsetzung

### 1) Parent-ID korrekt verwenden
In `SceneDialogStudio.tsx`:
- `resolvePersistedIds()` liefert bereits `{ pid, sceneId }`.
- Für SRS-Splitting wird künftig diese aufgelöste `sceneId` als `parentSceneId` gespeichert.
- `onInsertScenesAfter(parentSceneId, partials, { removeParent: true })` statt `onInsertScenesAfter(scene.id, ...)`.

Damit wird die echte DB-Szene ersetzt, nicht eine veraltete lokale ID gesucht.

### 2) Fallback im Dashboard härten
In `VideoComposerDashboard.tsx`:
- Wenn `parentSceneId` nicht in lokalem State gefunden wird, zusätzlich per `orderIndex` fallbacken.
- Dadurch funktionieren Inserts auch dann, wenn die Child-Komponente noch eine stale ID hat, aber die Position korrekt ist.

### 3) Alte SRS-Reste bereinigen
Einmalige Datenbereinigung:
- verwaiste alte `dialog-srs:scene_%` Sub-Szenen löschen oder mindestens auf `failed` setzen.
- aktuelle Parent-Dialog-Szene mit Matthew + Sarah bleibt erhalten.

### 4) Bessere Fehlermeldung
Falls Insert trotzdem fehlschlägt:
- Statt nur „sub-scene insert failed“ im Toast: „Dialog-Szene konnte nicht ersetzt werden — bitte Seite aktualisieren und erneut Splitten“.
- Das vermeidet Verwechslung mit HeyGen/Lip-Sync-Renderfehlern.

## Erwartetes Ergebnis

Nach dem Fix:

```text
Vorher:
Szene 1 = Dialogcontainer mit Matthew + Sarah
Splitten → Fehler: beide sub-scene insert failed

Nachher:
Szene 1 wird ersetzt durch Matthew Lip-Sync
Szene 2 wird Sarah Lip-Sync
alte Szene 2–5 rutschen nach hinten
HeyGen-Fehler markieren nur die betroffene Sub-Szene als failed, statt alles abzubrechen
```

## Dateien

- `src/components/video-composer/SceneDialogStudio.tsx`
- `src/components/video-composer/VideoComposerDashboard.tsx`
- optional: kleine DB-Bereinigung für alte verwaiste SRS-Zeilen
