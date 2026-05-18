## Diagnose

Aktuelle hängende Szene (`1eb25cfb…`, order 0): `lip_sync_status='running'`, `twoshot_stage='lipsync_2'`, `audio_plan.twoshot.speakers` enthält **4 Einträge** (A,B,A,B — pro Wechsel ein eigener padded Track). `compose-twoshot-lipsync` führt deshalb **4 sequentielle Sync.so-Passes** aus (jeweils ~60–120s). Edge-Function-Log zeigt `pass 4/4` um 18:34 und Sekunden später `shutdown` — Pass 4 hat die Edge-Runtime gesprengt (Worker-CPU/Memory-Limit unter `EdgeRuntime.waitUntil`). Resultat: Szene bleibt für immer auf `running`, ohne Refund.

Sync.so `lipsync-2-pro` ist außerdem **per Pass auf das gesamte Source-Video** angewendet — jeder zusätzliche Pass kostet 14 Credits und ~1–2 min. Bei 4 Dialog-Turns = 56 Credits + 4–8 min Laufzeit = unbrauchbar.

## Plan (3 Edits, kein DB-Schema-Change)

### 1. `supabase/functions/compose-twoshot-audio/index.ts` — Per-Character statt Per-Turn

Aktuell wird pro Turn ein Track erzeugt (`spk0`, `spk1`, `spk2`, `spk3`). Stattdessen:
- Turns nach `character_id` gruppieren.
- Pro Charakter **einen** padded Track erzeugen: alle Segmente dieses Sprechers an ihren Originalzeitpunkten, Rest = Silence, gepaddet auf `sceneDur`.
- `metadata.speakers` enthält danach **N = Anzahl unique Charaktere** Einträge (typischerweise 2), nicht mehr 4–8.

Effekt: Sync.so-Passes sinken von 4 → 2, Laufzeit halbiert, Kosten halbiert, kein Runtime-Kill mehr.

### 2. `supabase/functions/compose-twoshot-lipsync/index.ts` — Watchdog & Refund-Sicherung

- **Heartbeat**: vor jedem Pass `lip_sync_started_pass_at` in `audio_plan.twoshot.heartbeat` schreiben (nur In-Memory ok, aber besser persistieren via UPDATE).
- **Hard-Timeout pro Pass**: `Promise.race([replicate.run(...), timeout(180_000)])`. Bei Timeout → Refund + `lip_sync_status='failed'`, `clip_error='lipsync_pass_N_timeout'`.
- **Sicherheits-Refund** im finalen `catch`: bereits vorhanden, aber sicherstellen, dass `lip_sync_status` immer auf `failed` oder `completed` landet, nie auf `running` ohne Promise.

### 3. Neuer Cron-Job — `qa-watchdog`-ähnlich für stuck Lipsync

Bestehender Watchdog (`mem://infrastructure/observability/heartbeat-watchdog-architecture`) erweitern:
```sql
-- composer_scenes mit lip_sync_status='running' UND updated_at < now() - interval '10 minutes'
-- → lip_sync_status='failed', clip_error='watchdog_stuck_lipsync', Refund via credit_transactions
```
Wenn Watchdog-Function bereits existiert: nur den neuen Check als zusätzlichen Block einfügen.

### 4. Manueller Reset der hängenden Szene

Nach Deploy:
```sql
UPDATE composer_scenes
SET lip_sync_status = NULL, twoshot_stage = NULL, replicate_prediction_id = NULL
WHERE id = '1eb25cfb-a4ec-419f-a110-e0c3f3bdfffc';
```
+ Credits-Refund für die 28 Credits (manuell oder via Watchdog beim ersten Lauf).

## Verifikation

1. Erneut Lipsync starten → Log zeigt nur noch **`pass 1/2` und `pass 2/2`** (statt 4 Passes).
2. Gesamtdauer < 3 min, Edge-Function bleibt am Leben.
3. Watchdog läuft alle 2 min und resetted alle Szenen die >10 min in `running` hängen.
4. Credits werden bei Timeout automatisch zurückerstattet.

## Out of Scope

- Kein Wechsel zu sync.so async/webhook (eigene API, größerer Umbau).
- Keine UI-Änderung — `lip_sync_status='failed'` rendert bereits korrekt.
- Bestehender Echo-Fix (Preview-Mute) bleibt unverändert.

OK so umsetzen?
