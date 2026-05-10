## Ziel
Der Klick auf **„In echte Szene einbauen“** muss sofort sichtbar reagieren und garantiert die Cinematic-Sync-Pipeline starten: Hailuo rendert die echte Szene, danach läuft Sync.so Lip-Sync.

## Diagnose
- In der Browser-/Network-Snapshot des Nutzers taucht **kein** `compose-video-clips` Request auf. Das heißt: Der Klick kommt aktuell nicht zuverlässig bis zur Backend-Funktion durch.
- In den Backend-Logs gibt es keine aktuellen `cinematic`/`Hailuo` Treffer. Das bestätigt: Die Pipeline startet nicht, statt nur unsichtbar zu laufen.
- Der aktuelle Code setzt den Status erst nach `ensureProject()` und `prepareSceneAnchor()`. Wenn einer dieser Schritte hängt/überschrieben wird, sieht der Nutzer keinerlei Fortschritt.
- Außerdem kann `ensureProjectPersisted(project)` mit einem alten Parent-`project` arbeiten und die kurz zuvor gesetzten `engineOverride: 'cinematic-sync'` / `clipSource: 'ai-hailuo'` wieder überschreiben.

## Umsetzung
1. **Cinematic-Sync eigenen Startpfad geben**
   - Nicht mehr über den normalen `handleGenerateSingle(scene)`-Pfad starten.
   - Neue Funktion `handleStartCinematicSync(scene)` in `ClipsTab.tsx`.
   - Diese Funktion setzt sofort lokal:
     - `clipStatus: 'generating'`
     - `engineOverride: 'cinematic-sync'`
     - `clipSource: 'ai-hailuo'`
     - optional `lipSyncStatus: 'pending'`
   - Dadurch sieht der Nutzer direkt im Clip-Slot den Fortschritt, noch bevor langsame Zwischenschritte laufen.

2. **Persistenz ohne stale React-State**
   - Vor dem Rendern wird gezielt nur diese Szene direkt in `composer_scenes` aktualisiert:
     - `engine_override = 'cinematic-sync'`
     - `clip_source = 'ai-hailuo'`
     - `clip_status = 'generating'`
     - `clip_url = null` oder alter Clip bleibt bewusst als Source-Preview erhalten, je nachdem was für die UI besser passt
   - Danach wird der Payload aus dem lokal aktualisierten Scene-Objekt gebaut, nicht aus einem alten `project`-Snapshot.

3. **Backend-Aufruf garantiert absetzen**
   - `compose-video-clips` wird direkt mit `engineOverride: 'cinematic-sync'` und `clipSource: 'ai-hailuo'` aufgerufen.
   - Falls `prepareSceneAnchor()` vorher länger dauert, bekommt die UI einen klaren Zwischenstatus wie „Szene wird vorbereitet…“.
   - Fehler werden als Toast + roter Status angezeigt, statt still zu verschwinden.

4. **Polling auch während Sync.so Phase aktiv halten**
   - Polling darf nicht stoppen, sobald Hailuo `ready` ist, wenn `lipSyncStatus === 'running'` oder `engineOverride === 'cinematic-sync'` noch nicht fertig ist.
   - So wird auch die zweite Phase sichtbar aktualisiert.

5. **Button-Feedback verbessern**
   - Während des Starts wird der Button disabled und zeigt Loader/Text wie „Cinematic-Sync startet…“.
   - In der Szenenkarte wird zusätzlich ein Badge „Cinematic-Sync läuft“ angezeigt, nicht nur der normale „Fertig/Generiert…“-Status.

## Technische Details
- Änderung primär in `src/components/video-composer/ClipsTab.tsx`.
- Kleine Ergänzung in `SceneClipProgress.tsx`, falls ein eigener `pending/preparing` LipSync-Status für die Overlay-Anzeige nötig ist.
- Keine Datenbankmigration nötig, da die benötigten Felder bereits existieren (`engine_override`, `clip_source`, `clip_status`, `lip_sync_status`).

## Validierung
- Nach Klick muss im Network ein `compose-video-clips` Request erscheinen.
- Request-Payload muss enthalten:
```json
{
  "clipSource": "ai-hailuo",
  "engineOverride": "cinematic-sync"
}
```
- Die Karte muss sofort auf Fortschritt wechseln.
- Backend-Logs müssen Hailuo/Cinematic-Sync zeigen.
- Nach Hailuo-Ready muss Sync.so automatisch starten und der Poller weiterlaufen.