## Befund

Die Backend-Infrastruktur ist gesund. Der neueste konkrete Lauf `699e85ff-0933-4606-99ae-6a207f1d517c` zeigt im Backend inzwischen:

```text
v4 Dialog-Shot Pipeline
Shot 0 ready
Shot 1 ready
Shot 2 ready
Stitching done
lip_sync_status = done
final_url vorhanden
```

Der alte sichtbare Fehler kam aber real aus einem vorherigen Versuch derselben Szene:

```text
sync-so-webhook v5 FAILED
job=6f9a29a4...
mode=coords-pro
active_speaker_detection auto_detect=false + coordinates
provider: An unknown error occurred.
```

Danach wurde zwar korrekt auf die v4-Dialog-Shot-Pipeline geroutet, aber es gibt noch zwei strukturelle Risiken, die den Eindruck „Loop / schlägt immer wieder fehl“ erzeugen können:

1. **Alte v5-Fehlerzustände bleiben UI-seitig sichtbar oder triggern Retry-Logik**, obwohl die v4-Pipeline bereits erfolgreich weiterläuft.
2. **Es gibt keinen expliziten Abbrechen/Reset-Zustand.** Wenn ein Nutzer mitten im Lip-Sync neu starten will, bleibt `dialog_shots`, `syncso_inflight_jobs`, `twoshot_stage` oder ein später eintreffender Webhook als Zombie-Zustand erhalten.

Außerdem habe ich einen wichtigen Code-Widerspruch gefunden, der zwingend bereinigt werden muss:

```text
v17 sagt: Preclip = auto_detect true, keine Koordinaten.
Der alte Multi-Speaker-Integrity-Kommentar erwartet aber noch deterministische Koordinaten.
```

Der aktuelle Lauf kam trotzdem durch, weil ältere `deterministic_coords`-Flags noch in den Shots standen. Das ist fragil und muss auf die neue Wahrheit umgestellt werden: **Bei `sync_source_kind='preclip'` ist Auto-Speaker der korrekte deterministische Pfad.**

## Plan

### 1. v4/v5-Routing endgültig sauber trennen

- `useTwoShotAutoTrigger` bleibt bei der richtigen Regel:
  - 1–2 Sprecher: `compose-dialog-segments` / v5
  - 3+ Sprecher: `compose-dialog-scene` / v4 Dialog-Shot-Pipeline
- Zusätzlich wird die Retry-/Failure-Erkennung so angepasst, dass ein alter v5-Fehler nicht mehr dieselbe 3-Sprecher-Szene in den v5-Pfad zurückzieht.
- Für 3+ Sprecher gilt künftig hart:

```text
failed v5 sync-segments state -> clear dialog_shots -> restart via compose-dialog-scene only
```

### 2. Integrity-Guard auf v17-Preclip-Logik korrigieren

In `poll-dialog-shots` wird der alte Guard angepasst:

- Für `sync_source_kind='preclip'` ist gültig:
  - `output_url` vorhanden
  - `preclip_url` vorhanden
  - Dispatch war `mode=auto`
- Für `sync_source_kind='master'` bleibt gültig:
  - `target_coords` vorhanden
  - `deterministic_coords === true`

Damit blockiert der Stitcher nicht mehr versehentlich eine korrekt gerenderte v17-Preclip-Pipeline.

### 3. Späte Webhooks idempotent ignorieren

`sync-so-webhook`, `remotion-webhook` und `poll-dialog-shots` bekommen eine gemeinsame Abbruchprüfung:

```text
if dialog_shots.status in ('canceled', 'aborted') or lip_sync_status = 'canceled'
  -> keine Retry-Dispatches
  -> keine Stitch-Dispatches
  -> keine UI-Fehler neu setzen
  -> Webhook nur ack'en
```

Damit kann ein später eintreffender Sync.so- oder Lambda-Webhook keinen bereits abgebrochenen Lauf wiederbeleben.

### 4. Neue Edge Function: Lip-Sync sauber abbrechen

Ich erstelle eine neue Backend-Funktion, z. B. `cancel-dialog-lipsync`.

Sie macht idempotent:

- Nutzer authentifizieren und Scene-Besitz prüfen.
- Per Dialog-Lock die Szene sperren.
- Aktive `sync_job_id`s aus `dialog_shots.shots` sammeln.
- `syncso_inflight_jobs` für diese Jobs entfernen.
- `dialog_shots` auf einen terminalen Abbruchzustand setzen:

```text
status: 'canceled'
canceled_at: now
shots[*].status: pending/failed/lipsyncing -> canceled
```

- `composer_scenes` sauber setzen:

```text
lip_sync_status: 'canceled'
twoshot_stage: null
clip_error: null oder 'lipsync_canceled_by_user'
replicate_prediction_id: null
dialog_shots: canceled-state oder null je nach Neustart-Modus
```

- Falls Sync.so einen Cancel-Endpunkt unterstützt, wird er best-effort aufgerufen. Falls nicht, bleibt das lokale Ignorieren später Webhooks die zuverlässige Absicherung.

### 5. UI-Button während laufendem Lip-Sync

In der Szenenkarte bzw. dort, wo „Lip-Sync neu rendern“ sitzt, kommt ein Button während laufender Zustände:

```text
Lip-Sync abbrechen
```

Sichtbar bei:

```text
lipSyncStatus in ('pending', 'running', 'stitching', 'audio_muxing')
twoshotStage aktiv
oder dialog_shots.status in ('queued', 'lipsyncing', 'stitching')
```

Nach Klick:

- Button wird disabled und zeigt „Bricht ab…“.
- Edge Function `cancel-dialog-lipsync` wird aufgerufen.
- Lokaler Scene-State wird optimistisch auf abgebrochen/idle gesetzt.
- Danach ist „Lip-Sync neu rendern“ wieder möglich, ohne dass alte Einträge weiterlaufen.

### 6. Reset/Neu rendern robuster machen

Der vorhandene Button „Lip-Sync neu rendern“ wird erweitert:

- Vor Neustart wird dieselbe Cleanup-Logik genutzt wie beim Abbrechen.
- Danach wird für 3+ Sprecher explizit `compose-dialog-scene` gestartet.
- Es werden alte Felder entfernt:

```text
dialog_shots
replicate_prediction_id
twoshot_stage
clip_error
lip_sync_applied_at
lip_sync_source_clip_url nur wenn wirklich nötig
```

Wichtig: Der Master-Clip bleibt erhalten, wenn nur Lip-Sync neu gerendert wird. „Clip + Lip-Sync neu rendern“ bleibt der harte Komplett-Neustart.

### 7. Recovery für aktuelle/alte Zombie-Zustände

Per einmaliger Datenbereinigung werden betroffene laufende/fehlgeschlagene Szenen normalisiert:

- Fertige Szene `699e85ff...` bleibt `done` und wird nicht angerührt.
- Szenen mit altem v5-Failure, aber 3+ Sprechern, werden auf den neuen sicheren v4-Neustartzustand gesetzt.
- Hängende `syncso_inflight_jobs` ohne aktiven Scene-State werden entfernt.

### 8. Validierung

Nach Umsetzung prüfe ich:

- 3-Sprecher-Szene startet ausschließlich `compose-dialog-scene`.
- Sync.so-Dispatch für Preclips bleibt `auto_detect: true` ohne Koordinaten.
- Alle drei Shots werden `ready`.
- Stitching setzt `lip_sync_status='done'`, `twoshot_stage='done'`, `final_url` und `lip_sync_applied_at`.
- Abbrechen während `running` verhindert weitere Poller/Webhook-Wiederbelebung.
- Nach Abbrechen kann „Lip-Sync neu rendern“ sauber von vorne starten.

## Dateien/Funktionen

- `supabase/functions/poll-dialog-shots/index.ts`
- `supabase/functions/sync-so-webhook/index.ts`
- `supabase/functions/remotion-webhook/index.ts`
- neue Funktion `supabase/functions/cancel-dialog-lipsync/index.ts`
- `src/hooks/useTwoShotAutoTrigger.ts`
- `src/components/video-composer/SceneCard.tsx`
- ggf. `src/components/video-composer/PipelineProgressBar.tsx` / `usePipelineProgress.ts`
- technische Memory-Doku zur v18-Regel

## Zielzustand

Die 3-Sprecher-Pipeline läuft wie ein professioneller Anbieter:

```text
Master-Clip bleibt stabil
pro Turn Preclip
pro Turn isolierte Audio
Sync.so Auto-Speaker auf Single-Face-Preclip
deterministisches Stitching
späte Webhooks idempotent ignoriert
Nutzer kann laufenden Lip-Sync sauber abbrechen und neu starten
```