# Composer-Pipeline-Stall: Befund + Plan

## Was tatsächlich passiert ist (DB-Befund)

Innerhalb von **6 Sekunden** wurden beim Klick auf **„Alle generieren"** **zwei** Composer-Projekte angelegt:

```text
afb52dad  status=storyboard   (Scene 0 = ai-happyhorse + cinematic-sync)
d6879016  status=generating   (Scene 0 = ai-hailuo + cinematic-sync)
```

Beide Projekte haben dieselben 6 Szenen — nur mit **unterschiedlichen Scene-UUIDs** und unterschiedlichem `clip_source`. Alle 12 Szenen-Rows stehen seit ~22:23 UTC auf `clip_status='pending'`, `lip_sync_status=NULL`, `clip_error=NULL`. Es ist seit über 20 Minuten **gar nichts mehr passiert** — kein Pre-Mark auf `generating`, keine Replicate-Prediction-ID, kein Fehler. Die `compose-video-clips` Edge Function hat **stillschweigend abgebrochen**, bevor sie auch nur eine Szene angefasst hat.

Der Fortschrittsbalken steht trotzdem bei **95 %** mit **„Slots 0/3"** — weil:

1. der Client nach Klick optimistisch alle Szenen lokal auf `generating` flippt,
2. `usePipelineProgress` daraus 55 % errechnet und zusätzlich die Lipsync-Phase auf „settled → 100 %" forciert, weil keine Dialog-Shots existieren.

## Drei zusammenhängende Bugs

### Bug A — Doppel-Projekt-Race in `ensureProjectPersisted`
`useComposerPersistence.ensureProjectPersisted()` ist nicht idempotent: Wenn der Button-Handler und ein parallel laufender Auto-Save (oder ein zweiter Klick / Re-Render) gleichzeitig laufen und `project.id` noch keine UUID ist, läuft der `INSERT` zweimal. Ergebnis: zwei Projekte, zwei Scene-Sätze, und der **lokale State** hält die UUIDs des **zweiten** Inserts — der erste wird zur Karteileiche, und im schlimmsten Fall greift `compose-video-clips` auf Scene-IDs zu, die nicht zum übermittelten `projectId` gehören.

### Bug B — `compose-video-clips` bricht still ab
Der async-Dispatch-Pfad (`EdgeRuntime.waitUntil(processScenes())`) macht den **Pre-Mark auf `clip_status='generating'` erst INNERHALB von `processScenes`**. Wenn dort früh ein Throw kommt (z. B. fehlendes Asset für HappyHorse→Hailuo-Migration, ungültige Scene-IDs aus dem Doppel-Projekt-Race, Credit-Reservation-Konflikt), bleiben die Szenen für immer auf `pending` stehen — der HTTP-Call hat aber schon 202 zurückgegeben, also sieht der Client nie einen Fehler.

### Bug C — Fortschrittsbalken lügt
`usePipelineProgress` hat keinen **Stall-Detector**. Sobald `clipStatus='generating'` lokal gesetzt ist, klettert die Bar in den Soft-Floor-Bereich (95 %) und bleibt dort, auch wenn die DB seit 20 min nichts neues meldet.

---

## Fix-Plan

### 1. Idempotency-Lock in `ensureProjectPersisted` (`src/hooks/useComposerPersistence.ts`)
- Modul-scoped `Map<localKey, Promise<PersistResult>>` cached die laufende Insert-Promise pro Projekt (Key = `project.id` solange nicht UUID, sonst die UUID).
- Zweiter parallel Aufruf bekommt **dieselbe Promise** zurück → garantiert ein einziger `INSERT INTO composer_projects`.
- Cache wird gelöscht, sobald die Promise resolved/rejected — kein Stale-State.

### 2. Hard-Pre-Mark + Stall-Aware Watchdog in `compose-video-clips`
- Vor `EdgeRuntime.waitUntil(...)`: synchroner Bulk-Update `clip_status='generating', updated_at=now()` für alle übergebenen Scene-IDs **innerhalb des Request-Handlers**, bevor 202 zurückkommt. So sieht der Client den State auch wenn der Background-Task crasht.
- In `processScenes()`: pro Szene `try/catch` auf oberster Ebene — bei jedem Throw `clip_status='failed', clip_error=<message>` schreiben, damit „Slots 0/3" → „Slots 0/3 (3 failed)" wird.
- Bestehende `qa-watchdog`-Cron (Memory: Heartbeat-Watchdog) um composer_scenes erweitern: `clip_status='generating' AND updated_at < now() - interval '15 min'` → auto-fail mit `clip_error='timeout: edge function never reported progress'`.

### 3. Stall-Detector im Fortschrittsbalken (`src/hooks/usePipelineProgress.ts`)
- Neuer `lastProgressTimestamp`-Ref: wird jedes Mal neu gesetzt, wenn sich `clipsReady`, `dialogShotsDone` oder `progressPct` ändert.
- Wenn der Soft-Floor-Wert ≥ 90 % steht **und** seit > 4 Min kein realer Fortschritt → Phase-Status `failed` setzen, Bar von gold/grün auf rot, neuer Hint „Pipeline scheint zu hängen — bitte neu starten".
- `<PipelinePanel>` zeigt dann den existierenden „Retry"-CTA an.

### 4. Einmalige DB-Bereinigung der zwei hängenden Projekte
Migration (oder direkter Update) für die zwei betroffenen Projekte:
```sql
UPDATE composer_scenes
SET clip_status='failed',
    clip_error='Pipeline-Stall vom 31.05.2026 — bitte erneut generieren'
WHERE project_id IN ('d6879016-…','afb52dad-…')
  AND clip_status='pending';

UPDATE composer_projects
SET status='storyboard'
WHERE id='d6879016-…';
```
Danach kann der User **„Alle generieren"** einfach erneut klicken — diesmal sauber.

---

## Was bewusst NICHT angefasst wird
- Sync.so-Pipeline, N-Slot-Face-Map, HappyHorse-Master-Guard — die funktionieren laut Memory korrekt, sind hier nicht die Ursache.
- 3-Charakter-Lipsync-Logik aus dem vorigen Schritt bleibt unverändert.
- Edge-Function-Schema und Realtime-Subscribes bleiben unberührt.

## Erwartetes Ergebnis
- Kein doppeltes Projekt mehr beim Klicken (auch nicht bei Doppelklick).
- Wenn `compose-video-clips` crasht, sieht der User innerhalb ≤ 2 s eine echte Fehlermeldung statt 20 Min „95 %".
- Hängende alte Projekte werden vom Watchdog nach 15 Min sauber als `failed` markiert.
- Der aktuelle Stall-Zustand wird mit der Cleanup-Migration aufgelöst, ohne dass der User irgendwas in der DB anfassen muss.
