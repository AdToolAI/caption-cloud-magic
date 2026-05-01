## Problem

Der Hedra-Eintrag im Live-Sweep bleibt dauerhaft auf **`running`** stehen (siehe DB: `started_at=15:40:41`, `completed_at=null`, `raw_response=null` — kein Error, kein Update). Status `async_started` wird also gar nicht erst geschrieben.

## Root Cause

1. **`system_config.heygen_talking_photo_id` ist leer** (DB-Query liefert `[]`). Der Cache, der laut Memory den HeyGen-Account-3-Photo-Limit umgehen soll, existiert in dieser Cloud-Instanz nicht.
2. Daher fällt der Sweep bei jedem Lauf in den vollen Bootstrap: `pruneAllCustom()` (mit `sleep(2000)`-Pausen) → `uploadOnce` → bei 401028 nochmal `sleep+prune+sleep+upload`. Das kann 30–90 s dauern.
3. **Zusätzlich** macht `generate-talking-head` selbst weitere synchrone HeyGen-Calls (`/v1/asset` Upload + `/v2/video/generate`) bevor es `{success:true,status:"processing"}` zurückgibt — nochmal 10–30 s.
4. Wenn Hedra als letzter Test in der Kette läuft, sind viele Sekunden Sweep-Zeit bereits verbraucht. Der Background-Worker (gestartet via `EdgeRuntime.waitUntil`) wird dann vom Edge-Runtime gekillt, **bevor** das DB-Update auf `async_started` geschrieben werden kann.
5. Ergebnis: Zeile bleibt auf `running` → UI pollt ewig.

## Lösung

### 1. HeyGen-Bootstrap aus dem Sweep-Worker raus
In `qa-live-sweep/index.ts` den `ensureHeyGenTalkingPhoto`-Aufruf **vor** dem Worker erledigen — direkt im Request-Handler, der das 202 zurückgibt. Vorteil: Der teure Prune+Upload läuft im normalen Edge-Function-Lifecycle (mit Idle-Timeout), nicht im Background-Worker, und sein Ergebnis wird einmal gecached. 

Alternative falls 150 s knapp wird: Bootstrap als **eigene Edge-Function** triggern (`qa-live-sweep-bootstrap`, existiert bereits gemäß Kommentar in Z. 264) und `EdgeRuntime.waitUntil` warten lassen. Wir wählen Variante A (inline vor `waitUntil`), da die existierende `qa-live-sweep-bootstrap`-Funktion den Cache schreibt und beim nächsten Sweep-Start sofort genutzt werden kann.

### 2. ID nach erfolgreichem Bootstrap persistieren
`heygen-bootstrap.ts` schreibt das Ergebnis bereits via `persistId(admin, up.id)` in `system_config`. Sicherstellen, dass der Key tatsächlich `heygen_talking_photo_id` (oder `qa.heygen_talking_photo_id` gemäß Memory) lautet und nach dem nächsten Lauf in der DB landet. Falls der Key falsch geschrieben ist, korrigieren.

### 3. Watchdog für stale `running`-Rows
Direkt nach dem `for`-Loop im Background-Worker einen "finalize"-Schritt hinzufügen: alle `qa_live_runs` zu diesem `sweep_id`, die noch auf `running` oder `pending` stehen und kein `completed_at` haben, automatisch auf **`failed`** mit `error_message: "Worker timeout: status update lost"` setzen. Schützt vor jedem zukünftigen Drop-Out.

Zusätzlich: einen einmaligen Recovery-Aufruf vor jedem neuen Sweep, der **alte** `running`-Zeilen (>10 min ohne Update) auf `failed` setzt — bereinigt die aktuell hängende Zeile beim nächsten Klick.

### 4. Hedra-Test als ersten Eintrag rendern
Die `PROVIDER_TESTS`-Reihenfolge so umstellen, dass **Hedra als erster** Test läuft. Damit ist der teuerste Provider erledigt, bevor das Worker-Wall-Clock-Budget knapp wird.

### 5. Re-Deploy + Verifikation
- `qa-live-sweep` neu deployen
- Sweep auslösen, beobachten:
  - alte `running`-Zeile sofort auf `failed` (Recovery)
  - Hedra-Zeile geht **direkt** auf `async_started` (gelb), nicht mehr auf `running` hängend
  - Restliche 11 Tests grün

## Files

- `supabase/functions/qa-live-sweep/index.ts` (Bootstrap-Reordering, Watchdog, Test-Reihenfolge, Stale-Recovery beim Start)
- `supabase/functions/_shared/heygen-bootstrap.ts` (sicherstellen, dass `persistId` den richtigen Key schreibt)
- `mem://features/qa-agent/live-sweep-async-pattern` (Update: "Bootstrap läuft im Request-Handler vor `waitUntil`")

Soll ich loslegen?