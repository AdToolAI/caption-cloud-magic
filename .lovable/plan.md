# Was wirklich passiert ist

Die "Edge Function Fehler"-Meldung im UI kommt von `compose-dialog-segments` → **500 `missing_sync_api_key`**. Direktes curl gegen die laufende Funktion bestätigt das.

Ursache ist ein simpler **Env-Var-Naming-Mismatch**, kein Sync.so-Outage und kein Bug in der Lipsync-Logik:

| Funktion | gelesene Env-Var-Namen |
|---|---|
| `poll-dialog-shots` (v4-Pfad) | `SYNC_API_KEY` → `SYNC_SO_API_KEY` → `SYNCSO_API_KEY` ✅ |
| `compose-twoshot-lipsync` (legacy) | `SYNC_API_KEY` ✅ |
| `poll-twoshot-lipsync` (legacy) | `SYNC_API_KEY` ✅ |
| **`compose-dialog-segments` (v5)** | `SYNC_SO_API_KEY` → `SYNCSO_API_KEY` ❌ — `SYNC_API_KEY` fehlt |

Das im Supabase-Vault hinterlegte Secret heißt `SYNC_API_KEY` (alle anderen Funktionen lesen es seit Monaten erfolgreich). Beim Bau der neuen v5-Pipeline wurde der erste Fallback-Name vergessen → die Funktion bootet, kommt sofort in den Key-Check, returnt 500 — kein Log, keine Telemetrie.

Konsequenz: Seit der Default-Switch auf v5 (vorherige Iteration) **jede** Dialog-Szene mit `engine_override='cinematic-sync'` oder `'sync-segments'` läuft sofort in diesen 500 — der Hook setzt dann `engine_override='cinematic-sync'` zurück, der v4-Watchdog übernimmt, und am Ende kommt der bekannte `watchdog_stuck_lipsync_refunded`. Genau das Muster der letzten zwei Szenen in der DB.

# Plan

### 1. Env-Var-Lookup in `compose-dialog-segments` fixen
Eine Zeile: `Deno.env.get("SYNC_API_KEY")` als ersten Lookup ergänzen, identisch zu `poll-dialog-shots`. Plus dieselbe `checked:`-Liste im 500-Body wie dort, damit zukünftige Naming-Fehler sofort sichtbar sind statt stumm im Log.

### 2. Shared Helper (`_shared/syncso-preflight.ts`)
`getSyncApiKey()` Helper hinzufügen, der die drei Namen in fester Reihenfolge prüft. `compose-dialog-segments` und `poll-dialog-shots` ziehen den Helper. Künftige Sync.so-Funktionen müssen nicht mehr raten welcher Name "richtig" ist.

### 3. Stuck Scene aufräumen
Die aktuell hängende Szene `6005fa3c-…` steht seit ~12 min in `lip_sync_status='running'` mit v4-Shots. Der `twoshot-lipsync-watchdog` pickt sie beim nächsten cron-tick auf und refundet. Sobald der Fix deployed ist, kann der User per UI "Lip-Sync erneut" klicken — diesmal greift v5 mit korrektem API-Key.

Kein DB-Eingriff nötig, kein User-Refund-Hack — der bestehende Refund-Pfad ist idempotent.

### 4. Memory-Update
Kurze Notiz in `mem/architecture/lipsync/syncso-default-segments-engine.md` ergänzen: "Sync.so secret heißt `SYNC_API_KEY` (legacy) — neue Funktionen MÜSSEN alle drei Namen in der Reihenfolge `SYNC_API_KEY → SYNC_SO_API_KEY → SYNCSO_API_KEY` lesen, sonst booten sie in 500."

# Bewusst NICHT Teil dieses Plans

- Umbenennung des Vault-Secrets auf den "schöneren" Namen. Das würde alle Legacy-Funktionen brechen und ist eine separate Operation.
- Weitere Änderungen an der Lipsync-Logik. Die Pipeline ist nach diesem Fix funktional korrekt; der Rest (Concurrency, Segment-Längen-Guard, …) ist bereits in den vorigen Stages umgesetzt.

# Aufwand

~5 min. 2 Dateien (`compose-dialog-segments/index.ts`, `_shared/syncso-preflight.ts`), 1 Memory-Update, 1 Edge-Function-Redeploy.

# Frage

Soll ich direkt umsetzen?
