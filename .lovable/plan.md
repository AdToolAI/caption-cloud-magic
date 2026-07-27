## Diagnose

Szene `d2aa4ad5…` (S01 HOOK):

- `clip_status='ready'`, `clip_url` vorhanden, Video ist gerendert.
- `audio_plan` existiert, aber `audio_plan.twoshot.url` ist `null` → Auto-Trigger ruft korrekt `compose-twoshot-audio` auf.
- Der Aufruf schlägt clientseitig fehl mit **`Failed to send a request to the Edge Function`** (`FunctionsFetchError`). Das ist ein reiner Netzwerk-/Cold-Start-Fetch-Fehler des Browsers zur Edge-Function — die Function selbst bootet sauber (direkter Curl-Test antwortet mit HTTP 401 „Unauthorized", also erreicht Requests). In den Function-Logs erscheint der Request nie, was den Netzwerk-Klassen-Fehler bestätigt.
- Der Fehler-Handler in `useTwoShotAutoTrigger.ts` (Zeile ~356–370) markiert die Szene bei **jedem** Fehler sofort als `twoshot_stage='failed' / lip_sync_status='failed'` — auch bei transienten Netzwerkfehlern. Dadurch bleibt die Szene ohne echten Grund als „fehlgeschlagen" liegen und der User muss manuell „Neu rendern" klicken.

Kurz: das Video ist okay, nur die Audio-Prep-Invocation ist einmal beim Fetch verunglückt und die Fehlerbehandlung ist zu hart.

## Fix (klein, UI/Client-only)

1. **Transiente Fetch-Fehler als retryable behandeln** in `src/hooks/useTwoShotAutoTrigger.ts` (Zweig `needsAudioPrep`):
   - Wenn `aErr` ein `FunctionsFetchError` ist **oder** die extrahierte Message eine der bekannten Netz-Signaturen enthält (`Failed to send a request`, `Failed to fetch`, `NetworkError`, `load failed`, `ECONNRESET`, `502`, `503`, `504`), **NICHT** `twoshot_stage='failed'` schreiben.
   - Stattdessen `twoshot_stage` zurücksetzen (auf `null`), `clip_error` als weichen Hinweis setzen (`audio_prep_transient_retry`) und den Inflight-Marker sofort freigeben, damit der nächste 2,5s-Poll-Tick die Szene erneut aufnimmt.
   - Harte Fehler (echte 4xx/5xx-Antworten mit strukturiertem Body wie `missing_voice`) verhalten sich weiter wie bisher: `twoshot_stage='failed'`.

2. **Max 2 Auto-Retries** pro Mount für diese Klasse (`autoRetried` Set wiederverwenden, Key `audio-prep-net:${sceneId}`). Danach als `failed` markieren, damit keine Endlos-Schleife entsteht.

3. **Sanftes Reset der aktuellen Szene** `d2aa4ad5…`: einmalige DB-Korrektur
   ```
   UPDATE composer_scenes
   SET twoshot_stage=NULL, lip_sync_status=NULL, clip_error=NULL, updated_at=now()
   WHERE id='d2aa4ad5-9964-41cb-8a4f-81f6571183b6'
     AND clip_url IS NOT NULL AND clip_status='ready';
   ```
   Kein Refund nötig (kein Sync.so-Job dispatched).

## Nicht Teil dieses Plans

- Keine Änderungen an `compose-twoshot-audio`, `compose-dialog-segments` oder Anchor/Seedream-Logik.
- Kein neues UI-Element — der bestehende „Lip-Sync wird gestartet…"-Progress bleibt sichtbar, während der stille Retry läuft.
- Kreditlogik unverändert (Audio-Prep verbraucht keine Video-Credits; TTS-Credits werden erst bei erfolgreicher Function-Ausführung abgebucht).

## Technische Details

- Datei: `src/hooks/useTwoShotAutoTrigger.ts` — `.then()`-Handler des `compose-twoshot-audio`-Invokes (~Z. 356–386).
- Klassifikator: kleine Helper-Funktion `isTransientInvokeError(err, msg)` direkt in derselben Datei, importfrei.
- DB-Korrektur: einmalige `UPDATE`-Migration via `supabase--migration` (idempotent auf `id`).
