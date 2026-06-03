## Diagnose

**Do I know what the issue is? Ja.** Der aktuelle Loop kommt nicht nur von Sync.so, sondern von mehreren widersprüchlichen Status-Pfaden:

1. **Client setzt laufende Jobs wieder auf `pending`**
   - `useTwoShotAutoTrigger` setzt stale `running`-Szenen selbst zurück, ohne zentralen Fail/Refund/Run-Abschluss und teils ohne `dialog_shots` sauber zu leeren.
   - Dadurch wird ein alter, fehlerhafter Lauf wieder als retry-fähig gesehen und erneut gestartet.

2. **v5-per-turn State wird nicht überall gleich behandelt**
   - `compose-dialog-scene` erzeugt für 3+ Sprecher `dialog_shots.version = 5` mit `shots[]`.
   - `poll-dialog-shots` akzeptiert das inzwischen.
   - `sync-so-webhook` behandelt den per-turn Legacy-Zweig aber noch primär als `version === 4`; v5+`shots[]` kann daher als `unknown_state_version` enden oder nur über Polling repariert werden.

3. **Provider-Job-Erkennung ist inkonsistent**
   - `useTwoShotAutoTrigger` erkennt Sync.so-Jobs in `dialog_shots.shots[]` nur für `version === 4`, nicht für v5+shots.
   - Genau deshalb kann eine real laufende 3-Personen-Szene fälschlich als „kein Provider-Job vorhanden“ gelten und vom Client wieder zurückgesetzt werden.

4. **Lock ist nicht hart genug**
   - Der aktuelle Dialog-Lock darf nach fehlgeschlagenem Lock-Versuch „WITHOUT lock“ weiterschreiben. Das ist für Webhook/Poller-Rennen gefährlich.
   - Für Lip-Sync brauchen wir kein Best-Effort-Lock, sondern eine harte Single-Flight-State-Machine.

5. **Sync.so schlägt in den Logs real fehl**
   - Die konkrete Szene `07a2a25f-...` bekommt mehrfach Sync.so `FAILED` mit `An unknown error occurred` auf kurzen per-turn Preclips.
   - Das darf retryen, aber nur begrenzt und serverseitig; danach muss die Szene terminal `failed` sein und darf den nächsten Versuch nicht blockieren.

## Provider-Pattern, das wir übernehmen

Robuste Video-/Lip-Sync-Anbieter wie Sync.so, HeyGen, Tavus, Runway, Replicate und Shotstack nutzen alle dasselbe Grundmuster:

- **Asynchroner Jobstart**: API startet Job und gibt sofort zurück.
- **Webhook ist primär**: Statusänderungen kommen per Webhook.
- **Polling ist nur Fallback**: Ein Watchdog pollt, falls Webhook fehlt.
- **Eine eindeutige Job-/Run-ID**: Jeder Versuch ist ein eigener Run, alte Webhooks werden ignoriert.
- **Terminale Zustände sind endgültig**: `completed`, `failed`, `canceled`, `expired` starten niemals automatisch neu.
- **Retries sind begrenzt und klassifiziert**: Provider-429/Timeout darf retryen; Validierungs-/Input-/Face-/Audio-Fehler nicht.
- **Reset ist explizit**: Ein neuer Versuch beginnt nur durch User-Aktion oder klar transienten Server-Watchdog, nicht durch UI-Polling.

## Zielarchitektur

Wir bauen eine dauerhafte **LipSyncRun-State-Machine**:

```text
idle
  -> preparing
  -> dispatching
  -> provider_running
  -> stitching
  -> completed
  -> failed
  -> canceled
  -> reset_requested
```

Pro Szene gibt es immer höchstens **einen aktiven Run**. Jeder Provider-Job hängt an `run_id`. Webhooks/Poller dürfen nur schreiben, wenn `run_id` noch aktuell ist.

## Umsetzungsschritte

### 1. Backend-State-Machine einführen

- Neue Tabelle `lipsync_runs` oder Erweiterung der bestehenden Inflight-Struktur:
  - `run_id`
  - `scene_id`
  - `project_id`
  - `status`
  - `phase`
  - `speaker_count`
  - `character_ids`
  - `provider_job_ids`
  - `attempt`
  - `retry_budget`
  - `failure_reason`
  - `refund_status`
  - `started_at`, `updated_at`, `finished_at`
- Harte aktive Eindeutigkeit:
  - Max. ein aktiver Run pro Szene.
  - Max. ein aktiver Provider-Job pro Szene/Run-Schritt.
  - Derselbe `character_id` darf in derselben Szene nur einmal aktiv vertreten sein.

### 2. Atomare Server-Operationen bauen

- `startLipSyncRun(sceneId)`:
  - validiert Cast: 1–4 unterschiedliche Charaktere.
  - erstellt atomar einen Run nur, wenn kein aktiver Run existiert.
  - setzt Szene auf `lip_sync_status='running'`.
- `failLipSyncRun(runId, reason)`:
  - idempotent.
  - storniert/entfernt offene Sync.so-Jobs.
  - refundiert genau einmal.
  - setzt Szene terminal auf `failed`.
  - löscht/markiert alte Inflight-Handles.
- `resetLipSyncScene(sceneId)`:
  - nur durch User-Aktion oder Admin/Watchdog.
  - beendet alten Run terminal.
  - setzt Szene sauber auf `pending`.
  - leert `dialog_shots`, `replicate_prediction_id`, Inflight-Jobs, stale stages.

### 3. Client darf nicht mehr automatisch resetten

- `useTwoShotAutoTrigger` wird entschärft:
  - Kein `running -> pending` mehr im Browser.
  - Kein `failed -> pending` Auto-Reset mehr im Browser.
  - Browser darf nur „starten“ anfragen.
  - Server entscheidet, ob ein neuer Run erlaubt ist.
- Fortschrittsbalken zeigt terminale Fehler klar an:
  - `failed` beendet den Balken.
  - Button: „Lip-Sync sauber neu starten“ ruft den Reset-Endpoint auf.

### 4. v5+shots überall offiziell unterstützen

- `sync-so-webhook` behandelt `dialog_shots.version === 5 && shots[]` genauso wie den per-turn Pfad.
- `hasRecordedProviderJob` erkennt Jobs in v5+`shots[]`.
- `poll-dialog-shots`, Webhook und Reset nutzen denselben Run/Status-Reducer.
- Alte Webhooks ohne aktuelle `run_id` werden ignoriert und geloggt.

### 5. 1–2 Sprecher nicht beschädigen

- 1–2 Sprecher bleiben auf dem stabilen `compose-dialog-segments` Pfad.
- Änderungen daran nur:
  - Run-ID
  - Single-Flight-Lock
  - zentraler Fail/Reset
  - idempotenter Refund
- Keine Änderung an bewährter Payload-/Face-/Audio-Logik.

### 6. 3–4 Sprecher dauerhaft stabilisieren

- 3–4 Sprecher bleiben auf per-turn/Preclip/Stitch-Architektur.
- Pro Turn begrenzter Retry-Budget.
- Wenn ein Turn endgültig scheitert:
  - Run wird terminal `failed`.
  - keine weiteren Turns starten.
  - offene Provider-Jobs werden gecancelt/freigegeben.
  - Szene wird nicht mehr automatisch neu gestartet.
- Optionaler Fallback nach finalem Fehlschlag:
  - Szene markiert „Clip neu rendern nötig“, wenn Face-/Preclip-Qualität strukturell schlecht ist.

### 7. Watchdog statt UI-Loop

- Server-Watchdog prüft:
  - Run ohne Fortschritt > definierte TTL.
  - Provider-Job ohne Webhook.
  - Webhook/Poller mismatch.
  - Inflight-Registry vs. Szene-Status.
- Watchdog ruft `failLipSyncRun()` auf, nicht `pending`.
- Optional: eindeutig transiente Provider-429s werden serverseitig einmal später neu eingereiht, aber nie endlos.

### 8. Aktuell hängende Szenen bereinigen

- Szene `07a2a25f-e0e5-4c0b-83b0-f6e4fb02526d` sauber über neuen Reset-Pfad beenden:
  - laufende Sync.so-Jobs freigeben/canceln.
  - Run terminal machen.
  - Credits einmalig erstatten, falls noch nicht refundiert.
  - Szene auf sauberen `pending` Zustand für manuellen Neustart setzen.

### 9. Verifikation

Ich prüfe danach konkret:

- 3-Personen-Szene geht bei Provider-Fehler terminal auf `failed`, kein Loop.
- „Neu starten“ erzeugt genau einen neuen Run.
- Keine zwei Sync.so-Jobs derselben Szene laufen gleichzeitig.
- 1- und 2-Sprecher-Szenen laufen weiter über bestehenden stabilen Pfad.
- 4-Sprecher-Szene wird akzeptiert, 5 Sprecher hart blockiert.
- Doppelte Charaktere in derselben Szene werden vor Provider-Dispatch blockiert.
- Alte Webhooks eines alten Runs verändern neue Runs nicht.
- Refund wird genau einmal gebucht.

## Ergebnis

Nach dieser Änderung ist Lip-Sync kein UI-getriebener Retry-Loop mehr, sondern eine serverseitige, idempotente Job-Pipeline mit klaren terminalen Zuständen, sauberem Reset und Provider-kompatibler Webhook/Polling-Fallback-Architektur.