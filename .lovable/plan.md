## Befund

Die aktuelle Szene `ec22e048…` hängt nicht bei Sync.so selbst, sondern **vor** dem Sync.so-Call:

- `lip_sync_status = pending`
- `twoshot_stage = master_clip`
- `clip_url` vorhanden
- `audio_plan.twoshot.url` vorhanden
- `syncso_dispatch_log` leer
- `dialog_dispatch_locks` leer
- `syncso_inflight_jobs` leer
- Watchdog hat einmal `dispatch-recovery` geloggt, aber danach gibt es keinen echten Dispatch und keinen Fehlerzustand.

Das bedeutet: Sync.so bekommt sehr wahrscheinlich gar keinen Request. Die UI zeigt korrekt „Lip-Sync wird gestartet…“, aber die Recovery markiert sich selbst als „ausgelöst“ und blockiert danach weitere Recovery-Versuche, obwohl kein Sync.so-Job entstanden ist.

## Sync.so v3 Abgleich

Die eigentliche Payload-Form im Dispatcher passt zur offiziellen Sync.so-v3-/sync-3-Anleitung:

- Endpoint: `POST /v2/generate`
- `model: "sync-3"`
- `input`: Video + Audio
- `options.active_speaker_detection`: `auto_detect`, `coordinates` oder `bounding_boxes_url`
- `webhookUrl` für asynchrone Completion

Der Fehler liegt daher nicht in „Sync.so antwortet nicht“, sondern im **Start-/Invoke-/Recovery-Layer vor dem Provider-Dispatch**.

## Plan

### 1. Watchdog-Recovery wirklich idempotent machen

Datei: `supabase/functions/lipsync-watchdog/index.ts`

- Recovery nicht mehr dauerhaft durch `dialog_shots.recovery_dispatched_at` blockieren.
- `recovery_dispatched_at` nur als temporären Versuch behandeln:
  - wenn nach 60–90 Sekunden kein `syncso_dispatch_log` und kein `sync:`-Job existiert, darf der Watchdog erneut auslösen.
- Den internen Aufruf zu `compose-dialog-segments` härten:
  - `apikey`/Auth-Header vollständig setzen
  - HTTP-Status und Body prüfen
  - Fehler loggen, statt still weiterzulaufen
- Nur dann als „recovered“ zählen, wenn `compose-dialog-segments` wirklich akzeptiert wurde oder ein Dispatch-/Wait-State geschrieben wurde.

### 2. Dispatcher-Eintritt sichtbar machen

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Direkt nach erfolgreichem Lock einen leichten `syncso_dispatch_log`-Eintrag schreiben, z. B. `sync_status = 'DISPATCH_ATTEMPT_STARTED'`.
- Dadurch ist künftig sofort unterscheidbar:
  - Dispatcher wurde nie erreicht
  - Dispatcher wurde erreicht, aber Preflight blockt
  - Sync.so wurde erreicht
- Für `auto: true`/`recovery: true` 202-Zustände einheitlich zurückgeben, damit Watchdog und Client dieselbe Sprache sprechen.

### 3. Current stuck scene aktiv retten

Nach dem Code-Fix:

- Szene `ec22e048…` serverseitig aus dem falschen Recovery-Limbo lösen.
- `compose-dialog-segments` direkt erneut anstoßen.
- Danach prüfen:
  - `syncso_dispatch_log` enthält mindestens `DISPATCH_ATTEMPT_STARTED`
  - anschließend entweder `DISPATCHED` mit Sync.so-Job-ID oder ein klarer Preflight-Fehler
  - UI wechselt von „wird gestartet“ zu „läuft“ oder zeigt einen echten Fehler

### 4. UI-Fallback für Start-Limbo ergänzen

Datei: `src/components/video-composer/SceneInlinePlayer.tsx`

- Wenn eine Szene länger als ca. 3 Minuten in `master_clip` ohne Provider-Job hängt:
  - nicht weiter nur Spinner zeigen
  - Text ändern zu „Start hängt — wird automatisch neu angestoßen“
- Optional im bestehenden CTA-Konzept: „Neu anstoßen“ anzeigen, wenn kein Lock und kein Dispatch-Log existiert.

### 5. Validierung

Nach Umsetzung prüfe ich konkret:

1. Szene `ec22e048…` bekommt innerhalb von 1–2 Minuten einen sichtbaren Dispatch-/Preflight-Log.
2. Wenn Sync.so wirklich erreicht wird, entsteht ein `sync:`-Job und `syncso_dispatch_log.DISPATCHED`.
3. Wenn Preflight scheitert, wird die Szene sauber `failed` mit verständlichem `clip_error`, kein Endlosspinner.
4. Watchdog darf denselben Start-Limbo mehrfach recovern, aber nicht parallel doppelt dispatchen.
5. Keine Credit-Doppelbuchung: Recovery-/202-Pfade dürfen keine zusätzlichen Credits verbrennen.