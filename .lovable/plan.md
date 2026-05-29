# Was die DB wirklich sagt

Ich habe die letzten Szenen direkt aus `composer_scenes` gelesen:

| Szene | dialog_shots.version | engine | status | Bemerkung |
|---|---|---|---|---|
| `386381bd…` (zuletzt erfolgreich gerendert) | **5** | `sync-segments` | `applied` | ✅ v5 hat 1 Sync.so-Call mit 3 segments[] gemacht und ein clip_url zurückgegeben |
| `6005fa3c…` (davor steckengeblieben) | **4** | – | `failed` | alte v4-Zeile von vor dem Env-Var-Fix |
| `e9ce0e05…` | **4** | – | `failed` | dito |

**Ja, v5 läuft.** Der Beweis ist `engine=sync-segments` + `sync_job_id` (Sync.so Generation-UUID) auf der einen erfolgreichen Szene. Die zwei "failed"-Zeilen sind alte v4-Reste, die der Watchdog refundet hat.

# Das echte Problem: Face-Targeting fehlt in v5

In `compose-dialog-segments` wird folgendes an Sync.so geschickt:

```ts
segments: segments.map((s) => ({
  startTime, endTime,
  audioInput: { refId, startTime, endTime },
}))
```

Kein `targetCoords`, kein `faceBbox`, kein `personId` pro Segment. Sync.so hat genau zwei Modi:

1. Wir sagen pro Segment **welches Gesicht** angesteuert werden soll.
2. Wir sagen es nicht → Sync.so wählt **ein** Gesicht (in der Regel das größte / links erkannte) und legt ALLE Audio-Segmente darauf.

Genau das siehst du: "der erste Charakter spricht das gesamte Skript".

Die alte v4-Pipeline (`compose-twoshot-lipsync`) löst das, weil sie pro Sprecher einen separaten Sync.so-Call mit `targetCoords: firstTarget.coords` (Gemini-Vision detektiert die zwei Gesichter im Two-Shot-Anker und mappt sie auf die Charaktere, gecached in `audio_plan.twoshot.faceMap`). v5 nutzt diese vorhandene `faceMap` schlicht nicht — der Speed-Gewinn wurde mit dem Verlust der Face-Disambiguierung erkauft.

# Zweites Problem: Progress-Bar bleibt bei 95 % stehen

Der "fertig"-Badge an der Szene stimmt (lip_sync_status=applied). Der globale `PipelineProgressBar` zählt aber alle 5 Szenen-Phasen und scheint einen Stage nicht als terminal zu erkennen — wahrscheinlich weil eine andere Szene (`ccd1e3a4…`, ohne clip_url, lip_sync_status=NULL) noch als "in Arbeit" zählt obwohl sie nie gestartet wurde. Muss ich kurz im Komponentencode verifizieren.

# Plan

### 1. Face-Targeting in v5 nachrüsten (Hauptfix)
- `compose-dialog-segments` liest dieselbe `audio_plan.twoshot.faceMap` wie v4 (Gemini-Vision-Cache existiert bereits).
- Falls keine `faceMap` da ist: gleicher Gemini-Vision-Call wie in v4 nachholen (oder Helper aus `compose-twoshot-lipsync` in `_shared/` ziehen — Stage H der Lipsync-Stages).
- Pro `segment` wird `options.targetCoords: [nx, ny]` mitgegeben, basierend auf dem `character_id` des `speakerIdx`. Sync.so segments-API akzeptiert `options` pro Segment (gleicher Shape wie auf der Top-Level-API, die v4 verwendet).
- Bei Single-Speaker-Szenen passiert nichts Neues — kein Regression-Risiko.

### 2. Sync.so-Output in eigenes Storage downloaden
- `sync-so-webhook` schreibt aktuell `clip_url = https://api.sync.so/v2/generations/{id}/result?token=…`. Der Token läuft nach ~24 h ab → Composer-Replays brechen später.
- Nach COMPLETED: fetch + Upload nach `ai-videos/composer/{userId}/{sceneId}-lipsync.mp4`, dann `clip_url` auf die Storage-URL setzen. Idempotent über bestehenden `state.refunded`-Pfad erweitert.

### 3. PipelineProgressBar Stuck-at-95 %-Fix
- Komponente kurz auditieren: Szenen ohne `lip_sync_status` aber mit `clip_url` als terminal zählen, "skipped" Szenen (kein Dialog) komplett aus Lipsync-Phase ausschließen. Reine Frontend-Änderung.

### 4. Alte v4-Failed-Szenen aufräumen
- Die zwei `failed`-Reihen sind harmlos (Watchdog hat refundet), aber blockieren ggf. UI-Polling. Per "Erneut versuchen"-Klick laufen sie jetzt sauber durch v5 — kein DB-Eingriff nötig.

# Bewusst NICHT Teil dieses Plans
- Wechsel auf Sync.so `personActiveSegments` / multi-person preview API. `targetCoords` pro Segment ist die kleinste Änderung mit größtem Effekt; ein Pipeline-Rewrite auf das neuere Person-Detection-Schema lohnt sich erst, wenn 3+ Sprecher Standard werden.
- Keine Änderungen an der Routing-Logik, Concurrency-Limits oder Webhook-Pfaden — die laufen alle korrekt.

# Aufwand
~30 min. 1 Edge-Function (`compose-dialog-segments`), 1 Webhook (`sync-so-webhook`), 1 Komponente (`PipelineProgressBar.tsx`), optional 1 Helper in `_shared/twoshot-face-map.ts`. Kein DB-Migration, kein Secret-Touch.

# Frage
Soll ich alle drei Punkte (1+2+3) zusammen umsetzen oder erst nur den Face-Targeting-Fix (1) ausrollen und 2+3 separat?
