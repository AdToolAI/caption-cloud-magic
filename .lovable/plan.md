# Pre-Launch Bottleneck Audit + AWS Support Email

## Ziel
1. Echte Bottlenecks vor dem Go-Live identifizieren (nicht nur AWS).
2. Fertige Support-Email an AWS aufsetzen für Lambda-Concurrency-Erhöhung auf 100, inkl. Hinweis auf den gesperrten Vor-Account.

---

## Teil A — Bottleneck-Analyse (Liefer-Artefakt: Report im Chat)

Ich prüfe in einer Runde live über die vorhandenen Tools:

1. **AWS Lambda Remotion** (heißester Kandidat)
   - Aktuell: `MAX_LAMBDAS=8`, `framesPerLambda` min 270, `concurrencyPerLambda=1`. Peak-Schätzung: 5 parallele Renders × 8 λ = **~40 gleichzeitige Lambda-Invocations**.
   - AWS Default-Account-Quota: **10** concurrent executions auf neuen Accounts → wir laufen heute schon ins Limit, sobald 2 User parallel rendern.
   - Burst-Quota Region eu-central-1: 500, aber Account-Reserved/Unreserved muss freigeschaltet werden.
   - → klare Empfehlung: **Quota auf 100 hoch** (passt zu 12 parallelen Composer-Renders).

2. **Supabase Edge Cold-Starts** via `synthetic-probe` Daten der letzten 24h prüfen (Layer-3 Probes).

3. **pg_cron Locks** — `poll-dialog-shots-every-minute`, `qa-watchdog`, `process-email-queue`, autopilot, probes. `supabase--slow_queries` + `supabase--db_health` für Sättigung.

4. **Replicate / Provider-Concurrency**
   - Hailuo, HappyHorse, Sync.so (Creator-Plan $19 → harte Sync.so-Concurrency-Caps prüfen).
   - Sync.so ist beim Multi-Speaker-Lipsync der knappste Provider.

5. **Storage Egress** — `composer-frames`, `talking-head-renders`, `brand-assets` Buckets, Anzahl Files + Bandbreite.

6. **Realtime Channels** — Composer-Collaboration + qa_live_runs Polling. Bei >50 gleichzeitigen Usern relevant.

Ergebnis: Ranked Bottleneck-Liste mit „Fix vor Launch" / „OK für Launch" / „Skalierungs-Backlog".

---

## Teil B — AWS Lambda Quota-Increase Email (Liefer-Artefakt: copy-paste Text im Chat)

Eine Englisch + eine Deutsch-Version, beide enthalten:

- **Subject**: Service Quota Increase — Lambda Concurrent Executions (eu-central-1) + Re-instatement of suspended account
- **Account context**: Neuer Workspace + Verweis auf den gesperrten Vor-Account `bestofproducts4u@gmail.com` (6 Monate aktiv, keine Antwort auf Sperr-Inquiry, Bitte um Review/Closure-Statement).
- **Use case**: SaaS video-rendering platform (AdTool / useadtool.ai), Remotion Lambda renders, Go-Live in den nächsten Tagen, erwartete 50–100 parallele Renders.
- **Konkrete Requests**:
  1. Concurrent executions: 10 → **100** (Region eu-central-1).
  2. Ggf. burst concurrency Bestätigung.
  3. Klärung zum gesperrten Account (Grund + ob er reaktivierbar ist oder ob Migration sauber ist).
- **Technical details**: Function-Memory 3008 MB, Timeout 600 s, durchschnittliche Invocation 2–3 s/frame, Architektur x86_64, Workload Spike-Pattern (User-initiated, 1–5 Min Bursts).
- **Business justification**: Paid Beta-Launch, EU-Kunden, Stripe-Billing live, Compliance EU-AI-Act, MRR-Projektion.
- **Contact**: Geschäftliche Email, Telefon-Optional-Feld leer lassen.

Versendet wird die Mail vom User selbst über AWS Support Center → „Service quota increase" Case-Type (kein API-Call von uns, da wir keine AWS-Credentials haben).

---

## Out of Scope
- Keine Code-Änderungen am Lambda-Pfad in diesem Schritt (Code ist bereits optimiert: r42 scheduling, Circuit-Breaker, framesPerLambda=270 min).
- Keine Provider-Plan-Upgrades automatisch — nur Empfehlung.

## Output nach Approval
1. Bottleneck-Report (priorisiert, mit konkreten Metriken aus db_health / slow_queries / probes).
2. Zwei fertige Email-Texte (EN + DE) zum direkten Versenden an AWS Support.
3. Optional: kurze Checkliste „Go-Live Readiness" (1 Seite).
