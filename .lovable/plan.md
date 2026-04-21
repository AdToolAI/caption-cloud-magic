

# Plan: Phase 4 — Letzte sinnvolle Erweiterungen für den Superuser

## Aktueller Stand: 23/23 grün, 96 % Pass-Rate

Der Superuser deckt jetzt:
- 10 Content/Analytics-Generatoren (Caption, Bio, Trends, Performance, Hashtags, Posting Times, Image, Campaign, Comments)
- 5 System-Health-Funktionen (Trial, Calendar Dispatcher, Stripe Webhook, Social Health, Consistency)
- 4 Provider-Reachabilities (Replicate, ElevenLabs, Sora via Replicate, Lovable AI)
- 3 Render-Pipelines (Lambda Webhook, Render Queue, Health-Aggregator)
- 1 Storage-Health

## Was wirklich noch fehlt — 6 lohnende Erweiterungen

Ich habe die ~280 Edge-Funktionen gegen die kritischen User-Flows abgeglichen. Diese 6 Bereiche sind **echte Lücken**, nicht nur Nice-to-Have:

### Block D — Social Publishing Health (4 neue)
Wenn das bricht, können User nicht mehr posten — direkt umsatzrelevant. Alle bestehen bereits als Health-Endpoints, müssen nur eingebunden werden:

1. **Instagram Health** — `health-ig` (Token-Check + Graph API v24 Reachability)
2. **TikTok Health** — `tiktok-health` (Sandbox-Status + Token-Validität)
3. **YouTube Health** — `health-yt` (OAuth-Refresh-Pfad)
4. **X / Twitter Health** — `health-x` (Basic API Token-Check)

Alle existieren bereits als Edge-Funktion und sind dafür gebaut. Keine Implementierung nötig — nur in `SCENARIOS` aufnehmen.

### Block E — Credit & Billing Integrity (2 neue)
Credit-Bugs sind die Top-Quelle für Refund-Tickets:

5. **Credit Preflight Reachability** — `credit-preflight` mit Dry-Run-Body, prüft dass die Reservierungs-Logik antwortet
6. **Subscription Status Check** — `check-subscription` für den Test-User, prüft dass Stripe-Sync funktioniert

### Block F — Job Queue Health (1 neue)
7. **AI Queue Worker Reachability** — `ai-queue-worker` im Status-Mode, prüft dass der Worker antwortet und kein Backlog >100 Jobs existiert

## Bewusst NICHT aufgenommen

- **Cron-only Funktionen** (`tick-strategy-posts`, `process-drip-emails`, `cache-warming`) — laufen ohnehin geplant, eigene Logs reichen
- **Webhooks von Drittanbietern** (`replicate-webhook`, `resend-webhook`, `sora-scene-webhook`) — gleiche Mechanik wie Stripe/Lambda, schon abgedeckt
- **Twitch-Funktionen** (~14 Stück) — Nischenintegration, niedrige User-Anzahl
- **Director's Cut Sub-Funktionen** (~25 Stück) — werden über `render-queue-manager` indirekt mitgetestet
- **Echte Generierungen von Sora/Kling/Hailuo/Wan/Luma/Seedance** — würden ~3–5 € pro Komplett-Test kosten. Reachability via Replicate-Call (bereits drin) deckt 90 % ab.

## Geänderte Dateien

- `supabase/functions/ai-superuser-test-runner/index.ts` — 7 neue Einträge in `SCENARIOS`, alle `optional: true`, alle in Block D/E/F gruppiert mit Kommentar-Headern
- `src/pages/admin/AISuperuserAdmin.tsx` — `ACTIVE_SCENARIOS` Whitelist um die 7 Namen ergänzen, Latenz-Schwelle auf 80s grün / 120s gelb anheben (7 zusätzliche Calls × ~1–2s)

## Verifikation

„Komplett-Test" auslösen. Erwartung:
- **30 Szenarien** sichtbar (23 + 7)
- Alle grün oder klare Warnings (z. B. wenn ein Social-Token noch nicht verbunden ist → gelbe Warnung statt Fail)
- Gesamtlatenz: ~55–80s
- Pass-Rate bleibt ≥ 95 %

## Erwartetes Ergebnis

- Erstmals Sichtbarkeit auf alle 5 Social-Publishing-Pfade (IG, TikTok, YT, X, FB indirekt über Social-Health)
- Credit-System unter aktiver Überwachung
- Job-Queue-Backlog wird sofort sichtbar, nicht erst über User-Beschwerden
- Damit ist der Superuser auf einem Level, ab dem weitere Tests nur noch echtes Geld kosten würden

