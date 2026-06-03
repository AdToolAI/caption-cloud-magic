## Befund

Der Fehler ist jetzt konkret sichtbar:

- Szene `4a56d6a1…` ist mit `sync_so_timeout_8min` fehlgeschlagen, obwohl bereits 2 Sync.so-Pässe liefen und Pass 3 noch `pending` war.
- Szene `85ecc55a…` hängt in `pending/deferred`, weil `compose-dialog-segments` seit Minuten `DEFER inflight=3/3` schreibt.
- Hauptursache ist nicht mehr die alte Sync.so-Output-Kette, sondern die neue v25-Fan-Out-Orchestrierung:
  - Sie startet mehrere Pässe, aber hat keinen robusten Server-Queue-/Polling-Fallback, wenn Webhooks fehlen oder alle Slots belegt sind.
  - Sync.so-Dokumentation bestätigt: verlorene Webhooks werden nicht automatisch erneut zugestellt; wir müssen terminale Jobs aktiv pollen.
  - Der aktuelle Watchdog markiert nach Timeout nur fehlgeschlagen, statt offene Sync.so-Jobs zuerst abzufragen und fertige Passes zu übernehmen.

## Fix-Plan

### 1. Webhook-Matching für Fan-Out korrigieren

In `supabase/functions/sync-so-webhook/index.ts`:

- Webhook darf nicht nur `dialog_shots.sync_job_id` prüfen.
- Er muss den Job in `dialog_shots.passes[].job_id` suchen.
- Damit werden Pass-1/Pass-2-Webhooks nicht ignoriert, wenn `sync_job_id` inzwischen auf einen anderen Pass zeigt.
- Bei `COMPLETED` wird exakt der passende Pass als `done` markiert.

### 2. Slot-aware Fan-Out statt blindem Parallelstart

In `supabase/functions/compose-dialog-segments/index.ts`:

- Fresh dispatch startet Pass 1.
- Weitere Pässe werden nur gestartet, wenn ein Sync.so-Slot frei ist.
- Bei `inflight=3/3` bleibt die Szene in einem serverseitigen Wartezustand mit bestehendem `dialog_shots`, statt immer wieder ohne Fortschritt `deferred` zu schreiben.
- Nach jedem fertigen Pass triggert Webhook/Watchdog den nächsten pending Pass.

Ziel:

```text
Pass pending -> slot frei -> dispatch
Pass rendering -> webhook/poll -> done
alle done -> compositor/audio mux
```

### 3. Polling-Fallback in den Watchdog einbauen

In `supabase/functions/lipsync-watchdog/index.ts`:

- Für v5 `sync-segments` mit `passes[].status='rendering'`:
  - Sync.so `GET /v2/generate/{job_id}` abfragen.
  - `COMPLETED` wie Webhook behandeln: Output re-hosten/Pass `done` setzen.
  - `FAILED/REJECTED` wie Webhook behandeln: bounded retry oder Refund + terminal fail.
- Erst wenn Polling ebenfalls keinen Fortschritt bringt und die harte TTL überschritten ist, wird die Szene fehlgeschlagen.

### 4. Audio-Mux/Fan-In nur einmal auslösen

In `sync-so-webhook` und ggf. `lipsync-watchdog`:

- Wenn alle Pässe `done` sind, exakt einmal `render-sync-segments-audio-mux` starten.
- Vor dem Dispatch prüfen, ob `dialog_shots.audio_mux.render_id` bereits existiert.
- Dadurch keine doppelten Lambda-Renders.

### 5. Stuck Scenes sauber zurücksetzen

Nach Code-Fix:

- `4a56d6a1…` und `85ecc55a…` auf einen konsistenten Zustand setzen.
- Alte `syncso_inflight_jobs` freigeben/entfernen, damit `inflight=3/3` nicht künstlich blockiert.
- Szene danach sauber auf `pending/master_clip` setzen, damit der neue Queue-Pfad übernimmt.

### 6. Validierung

Ich prüfe danach:

- Logs zeigen keine dauerhafte `DEFER inflight=3/3`-Schleife mehr.
- Rendering-Pässe werden per Webhook oder Polling als `done` übernommen.
- Pass 3 startet automatisch, sobald ein Slot frei ist.
- Bei verlorenen Webhooks beendet der Watchdog nicht blind, sondern pollt Sync.so zuerst.
- Bei echtem Provider-Fail: einmaliger Refund, terminaler Fehler, kein Loop.

## Dateien

- `supabase/functions/sync-so-webhook/index.ts`
- `supabase/functions/compose-dialog-segments/index.ts`
- `supabase/functions/lipsync-watchdog/index.ts`
- ggf. kleine Datenbereinigung für die beiden stuck scenes

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>