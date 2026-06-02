## Befund (echtes Root-Cause, mit DB-Beweis)

Szene `d47e6e3c-13ca-42b0-abd0-2f3eae919c73`:

- 3 Sprecher, Master-Plate 1376×768
- Shot 0 (Samuel, links, x=315): preclip ✅ → Sync.so ✅
- Shot 1 (Matthew, Mitte, x=687): preclip ✅ → Sync.so ✅
- Shot 2 (Kailee, rechts, x=1055): **preclip-Render war ERFOLGREICH** (`video_renders` Eintrag `aeebf60b…` completed 19:08:47), **aber `preclip_url` wurde nie in `dialog_shots` geschrieben**. Stattdessen ist `sync_source_kind='master'`, Sync.so failt 4× mit "An unknown error occurred." auf dem Edge-Gesicht ganz rechts.

```text
Zeitleiste Shot 2:
19:07:43  poll-dialog-shots dispatched preclip render → status="rendering"
19:07:43  parallel: poll-tick flippt sync_source_kind="master"
          (überschreibt JSON, render_id geht verloren)
19:08:47  Lambda fertig → remotion-webhook patcht dialog_shots
          → patcht in einen JSON-Snapshot der NICHT mehr existiert
          → preclip_url Write geht verloren (RMW-Race)
19:10:31  Sync.so call auf master+target_coords[1055,170] → unknown error
19:14    nach 4 Retries → degraded → refunded → status="failed"
```

Der v15 Lock (`dialog_dispatch_locks`) schützt **nur `poll-dialog-shots`** — `remotion-webhook` macht weiterhin nackte read-modify-write auf `dialog_shots`. Und der `master`-Fallback ist eine Falle: er rettet den Pfad an genau der Stelle, wo Sync.so für 3+ Sprecher zuverlässig scheitert (Edge-Face, falsches Frame).

Das ist die letzte fehlende Pipeline-Ebene, die professionelle Anbieter (Artlist etc.) anders machen: sie lipsyncen **nie** auf der Wide-Plate mit Koordinaten, sondern **immer** auf isolierten Per-Speaker-Crops (Preclips). Wir haben die Architektur — wir benutzen sie nur nicht konsequent.

## Plan (Artlist-Parität, finale Stabilisierung)

### 1. Race zwischen Webhook und Poller schließen
Alle Schreibzugriffe auf `dialog_shots` müssen denselben per-Szene-Lock verwenden, den `poll-dialog-shots` bereits nutzt.

- `remotion-webhook` für `source='dialog-turn-preclip'` und `source='dialog-stitch'`: vor jedem RMW `try_acquire_dialog_lock(scene_id, 'webhook', 30)` aufrufen, in `finally` `release_dialog_lock`. Wenn Lock nicht erworben werden kann: 3× kurz retryen mit 200/500/1000 ms, dann normal weitermachen (Webhook darf nicht steckenbleiben, ist aber gleichzeitig die einzige Source-of-Truth-Schreibstelle für `preclip_url`).
- Identisch für den Sync.so-Webhook-Schreibpfad in `sync-so-webhook` (gleiche Symptomatik möglich beim Patchen von `output_url`).

### 2. Self-Healing Reconciliation am Anfang jedes Poll-Ticks
Wenn der Webhook trotz Lock seine Schreibung verliert (z.B. Funktion crasht), muss der Poller das von selbst aufholen statt master-Fallback zu fahren:

- Schritt 0 in `processSceneLocked`: für jeden Shot mit `preclip_status='rendering'` (oder `preclip_url` fehlt und `preclip_render_id` gesetzt) → `video_renders` abfragen. Wenn `status='completed'` und eine `video_url` existiert: `preclip_url` aus dem Render rehydrieren, `preclip_status='ready'`, `sync_source_kind='preclip'`.
- Wenn `status='failed'`: `preclip_status='failed'` mit der echten Fehlermeldung übernehmen (aktuell rätt der Poller blind weiter auf "rendering" bis Timeout).

### 3. Master-Fallback für 3+ Sprecher hart verbieten
Aus den Logs: Sync.so liefert auf der Wide-Plate mit Edge-Coords reproduzierbar "unknown error" — das ist nicht heilbar mit Retries, Frame-Override oder Temperatur. Verhalten ändern:

- `MAX_PRECLIP_RETRIES`: 1 → 4
- `PRECLIP_RENDER_TIMEOUT_MS`: 4 min → 10 min (Lambda-Cold-Start + Queue real beobachtet bei 5 min für Shot 0)
- `prepareShotRetry` flippt `sync_source_kind` nicht mehr auf `master`, wenn `speakers.length ≥ 3`. Stattdessen: Preclip neu rendern lassen (Reset `preclip_url=undefined`, `preclip_status=undefined`, `preclip_render_id=undefined`, `preclip_retry_count+=1`) und Sync.so-Retry auf neuem Preclip.
- Wenn alle Preclip-Retries erschöpft sind: terminal `failed` mit Refund — kein master-Fallback mehr. Sauberer Fehler statt stillem Garbage-Output.

### 4. Stale-Lock-Heilung für die Webhook-Schreibungen
Damit ein abgestürzter Webhook nicht den nächsten 60 Sekunden lang den Poller blockiert:

- TTL für Webhook-Lock auf 30 s setzen (vs 60 s für Poller-Lock).
- Vor `try_acquire_dialog_lock` immer stale Rows >TTL löschen (macht die existierende RPC bereits — sicherstellen, dass sie auch von Webhook-Holdern aufgeräumt werden).

### 5. Recovery der konkreten Szene
Migration setzt `d47e6e3c-13ca-42b0-abd0-2f3eae919c73` zurück und re-hydratet die zwei vorhandenen guten Preclips:

- Shot 0 + Shot 1: `preclip_url` aus den completed `video_renders` (`19e874cb…` / `6abc9a62…`), `preclip_status='ready'`, `sync_source_kind='preclip'`, Sync.so-Felder behalten (sie sind ready)
- Shot 2: `preclip_url` aus completed render `aeebf60b…` rehydrieren, `preclip_status='ready'`, `sync_source_kind='preclip'`, alle Sync.so-Felder (`sync_job_id`, `started_at`, `status`, `error`, `degraded`, `retry_count`) löschen → wird neu auf dem Preclip versucht
- Scene: `lip_sync_status='running'`, `twoshot_stage=null`, `clip_error=null`, `dialog_shots.status='lipsyncing'`, `dialog_shots.refunded=false`

### 6. Validierung
- Edge-Function-Logs `poll-dialog-shots` + `remotion-webhook`: pro Szene-Tick maximal ein aktiver Schreiber (Lock greift überall).
- `dialog_shots`-Snapshot nach Webhook-Eingang: `preclip_url` bleibt erhalten, auch bei parallelem Poll-Tick.
- 3-Sprecher-Szene mit Edge-Face muss durchlaufen ohne jemals `sync_source_kind='master'` zu sehen.
- Wenn ein Preclip-Render echt scheitert: bis zu 4 saubere Preclip-Retries, dann terminal Failed + Refund — keine "An unknown error occurred"-Schleife mehr.

## Dateien

- `supabase/functions/remotion-webhook/index.ts` — Lock-Wrapping für `dialog-turn-preclip` + `dialog-stitch` RMW-Blöcke
- `supabase/functions/sync-so-webhook/index.ts` — Lock-Wrapping für die Shot-Patch-Blöcke
- `supabase/functions/poll-dialog-shots/index.ts` — Reconciliation Step 0; `MAX_PRECLIP_RETRIES=4`; `PRECLIP_RENDER_TIMEOUT_MS=10min`; `prepareShotRetry` ohne Master-Flip bei ≥3 Sprechern; Hard-Fail statt Master-Fallback
- Neue Migration: Recovery der Szene + Re-Hydration der drei Preclip-URLs aus `video_renders`
- `mem/architecture/lipsync/sync-so-webhook-stage5` — v16 Doku: Webhook-Lock + Reconciliation + Hard-Forbid Master ≥3

## Erwartetes Ergebnis

- 3-Sprecher-Pipeline läuft wie 1- und 2-Sprecher: ausschließlich auf isolierten Per-Speaker-Preclips (eine Face = ein Sync.so-Job, exakt das, was Anbieter wie Artlist machen).
- Race-Conditions zwischen Lambda-Webhooks und Poller können `preclip_url`-Writes nicht mehr verlieren.
- Verlorene Webhook-Writes werden vom Poller automatisch aus `video_renders` rekonstruiert.
- Edge-Faces in Wide-Plates triggern keine "unknown error"-Schleife mehr, weil die Wide-Plate nie wieder direkt an Sync.so geht.
- Die betroffene Szene rendert nach Apply der Migration ohne weiteren User-Eingriff zu Ende.
