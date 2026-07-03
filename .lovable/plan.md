## Ziel
Zombie-Jobs (wie die 2.620 alten `pending`-Szenen) sollen sich künftig **selbst aufräumen**, damit weder Kunden noch Admin manuell abbrechen müssen.

## Ursache heute
Der bestehende `qa-watchdog` (läuft alle 2 min via pg_cron) fängt schon Folgendes ab:
- Lipsync-Jobs, die >10 min in `running` festhängen → auto-fail + Refund
- Master-Clips, die >10 min in `generating` ohne Webhook stehen → Recovery
- Lambda-Renders >20 min ohne Status
- Autopilot-Slots >15 min in `generating`

**Aber:** Szenen, die im Frontstatus `pending` oder `queued` liegen, weil das Dispatch (Replicate/Provider-Kapazität) nie startet, laufen aktuell **unbegrenzt** weiter. Genau die haben sich zu 2.620 alten Zombies aufgebaut.

## Vorschlag: 3 zusätzliche Schutzschichten

### 1. Watchdog-Regel für nie gestartete Jobs
Neuer Block in `qa-watchdog`:
- Alle `composer_scenes` mit `clip_status IN ('pending','queued')` und `updated_at < now() - 60 min` und `clip_url IS NULL`
- → `clip_status = 'canceled'`, `clip_error = 'watchdog_never_dispatched'`
- Idempotenter Credit-Refund pro User (wie bei Lipsync)
- In Batches à 200 Zeilen updaten
- Anomaly ins `ai_superuser_anomalies` mit `fingerprint: composer-never-dispatched`, damit man Trends sieht

### 2. Harte Max-Lebensdauer pro Job (TTL)
Eine zweite Regel für alle nicht-terminalen Statuswerte zusammen:
- `clip_status IN ('pending','queued','generating','composing','lipsync')` und `updated_at < now() - 6 h`
- → `canceled` + Refund + Anomaly `composer-hard-ttl-expired`
- Verhindert, dass irgendein exotischer Status jemals länger als 6 h aktiv bleibt.

### 3. Sichtbarkeits-Filter im Queue-UI
Solange die Watchdog-Runs alte Zombies noch nicht durchgekehrt haben, blendet `/queue` alles aus, was älter als 24 h und noch aktiv ist — mit einer sichtbaren Info „N sehr alte Jobs werden vom System bereinigt". So sieht der Kunde nie wieder eine Liste voller 188 h-Karten.

## Wirkung
- **Ohne Nutzeraktion**: Jobs, die im Dispatch hängen, sterben spätestens nach 60 min mit Refund.
- **Backstop**: Kein Job überlebt jemals länger als 6 h aktiv, egal in welchem Status.
- **Transparent**: Anomalien im Superuser-Dashboard zeigen, ob wir wiederholt Provider-Kapazität verlieren — dann wissen wir früh, dass AWS/Replicate-Concurrency erhöht werden muss.
- **UI**: Kunden sehen ab sofort eine saubere Queue, auch wenn im Backend gerade aufgeräumt wird.

## Technische Details
- Datei: `supabase/functions/qa-watchdog/index.ts` erweitern (kein neuer Cron nötig, läuft schon alle 2 min).
- Refund-Logik: analog zu Block 4 (Lipsync) — `wallets` lesen, pro User aufaddieren, ein Update pro User.
- Konstanten oben in die Datei: `NEVER_DISPATCHED_TTL_MIN = 60`, `HARD_ACTIVE_TTL_HOURS = 6`.
- UI: kleiner Filter in `useRenderQueueLive` (>24 h + aktiv wird als „bereinigung läuft"-Chip aggregiert, nicht als Einzelzeilen).
- Keine Migration nötig, keine neuen Tabellen.

## Verifikation
- Nach Deploy erneut `SELECT clip_status, count(*), max(age(now(), updated_at))` prüfen — nach spätestens 2 Watchdog-Läufen dürfen keine `pending`-Jobs älter 60 min mehr existieren.
- Anomalies-Log zeigt den ersten Sweep mit der Bereinigungsmenge.
- Neue Testszene, absichtlich in `pending` gelassen → nach 60 min automatisch `canceled` + Credits zurück.