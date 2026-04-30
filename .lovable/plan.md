## Diagnose

Drei reale Bug-Klassen blockieren die Smoke-Suite:

### 1. Browserless `timeout`-Query-Param wird in der falschen Einheit gesendet (Root-Cause für 400er und 408er)

`browserlessClient.ts` schickt aktuell `?timeout=${SERVER_TIMEOUT_MS}` mit Werten wie `30000` oder `60000`. Browserless erwartet hier **Sekunden, nicht Millisekunden** (Server-Errortext: *"Timeout must be an integer between 1 and 60,000 seconds based on the limit for your plan"*).

Folgen:
- `?timeout=30000` → 30000 Sekunden gefordert, Hobby-Cap = 30s → **400 Bad Request** ("smoke-02-picture-studio-mock", "smoke-02-secondary-tour")
- `?timeout=60000` → akzeptiert, aber Plan greift trotzdem → Mission läuft bis Plan-Cap und kriegt **408** ("smoke-11-avatars-talking-head", "smoke-01-dashboard-tour")

### 2. `smoke-11-avatars-talking-head` (6 Steps) sprengt 30s-Cap

Auch nach dem Timeout-Fix wird die Mission knapp. Login (~5–7s) + 6 Schritte (~3–4s/Step) = ≈30s. Wir müssen smoke-11 ähnlich wie smoke-04/05/06 minimal halten: navigate → sleep → console-check.

### 3. `smoke-03-ai-video-toolkit` Step 5 `expect_visible "Generate"` failt

UI hat den Button-Text geändert (vermutlich "Generieren" auf DE oder "Create" auf der Toolkit-Seite). Schnell prüfen und Mission anpassen.

## Lösung

### Fix 1: `browserlessClient.ts` — Timeout in Sekunden senden

```ts
// Convert to seconds for the query param (Browserless cap is in seconds, max 60).
const SERVER_TIMEOUT_SEC = Math.min(60, Math.max(1, Math.ceil(SERVER_TIMEOUT_MS / 1000)));
const url = `${BROWSERLESS_BASE}/function?token=${...}&timeout=${SERVER_TIMEOUT_SEC}`;
```

Client-side Abort bleibt in ms (`SERVER_TIMEOUT_MS + 5_000`). Errormessage erweitern, sodass beide Einheiten angezeigt werden.

### Fix 2: smoke-11 minimieren (DB-Migration)

Mission auf 4 Steps reduzieren: navigate `/avatars` → sleep 1500 → expect_visible header → expect_no_console_error.

### Fix 3: smoke-03 anpassen

Per Browser-Tool kurz `/ai-video-toolkit` öffnen, den tatsächlichen Button-Text auslesen, dann Mission-Step 5 entsprechend updaten (oder zu einer stabileren Assertion wie `expect_visible` auf einen Selektor wechseln).

### Cleanup-Migration

Alle aktuell offenen `Browserless 400`/`408`-Bugs der betroffenen Missionen auf `resolved` setzen (sie verschwinden nach der nächsten grünen Run-Auto-Resolve-Sweep ohnehin, aber wir räumen die Inbox jetzt schon auf).

## Files

- `supabase/functions/_shared/browserlessClient.ts` — Sekunden-Konvertierung im Query-Param
- `supabase/migrations/<new>.sql` — smoke-11 minimieren + smoke-03 Step-Fix + Bug-Cleanup
- Browser-Tool: `/ai-video-toolkit` öffnen, korrekten Button-Text/Selektor ermitteln
- `mem://features/qa-agent/browserless-timeout-policy.md` — Notiz zur Sekunden-Einheit ergänzen

## Erwartetes Ergebnis

- Keine `Browserless 400 Timeout must be an integer`-Fehler mehr.
- `smoke-11-avatars-talking-head` läuft in <15s grün durch.
- `smoke-03-ai-video-toolkit` Step 5 passt zur tatsächlichen UI.
- Bug-Inbox sauber.