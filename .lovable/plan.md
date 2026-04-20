

## Plan: Kapazitäts-Hardening Phase 1

Drei Module, die deine Kapazität von ~500 auf ~1.500 concurrent users heben — ohne dass du auf Probleme reagierst, sondern sie verhinderst.

---

### Modul 1: Lambda 3 → 6 parallel (mit Safety-Net)

**Was sich ändert:**
- Max parallele Lambda-Renders: 3 → 6
- Auto-Retry bei transienten Failures (Memory/Timeout): bis zu 2 Versuche
- Circuit Breaker: Bei >30% Fehlerquote in 10 Min automatisch zurück auf 3
- Memory-Spike-Detection: Lambda-Logs werden auf OOM gescannt → automatischer Fallback

**Technisch:**
- `mem://infrastructure/aws-lambda/rendering-concurrency-stability-policy` updaten (3 → 6)
- `_shared/aws-lambda.ts`: neue `MAX_CONCURRENT_RENDERS=6` Konstante
- Neue Tabelle `lambda_health_metrics` (timestamp, success/fail, memory_used, duration)
- Neue Edge Function `lambda-circuit-breaker` (cron alle 5 Min): wertet Metriken aus, setzt `system_config.lambda_max_concurrent`
- `render-queue-manager` liest `system_config.lambda_max_concurrent` statt Hardcoded-Wert

**Was du gewinnst:** 2x mehr parallele Renders ohne erhöhtes Risiko (Safety-Net greift automatisch).

---

### Modul 2: Render-Queue mit User-facing Status

**Was du baust:**
Wenn ein User auf „Render starten" klickt und alle 6 Slots belegt sind, sieht er statt einem leeren Spinner:

> 🎬 Du bist Position 3 in der Warteschlange  
> ⏱ Geschätzte Wartezeit: ~4 Min  
> [Status-Balken füllt sich live]

**Technisch:**
- `RenderQueuePanel.tsx` erweitern: aktuelle Position + ETA berechnen
- `useRenderQueue.ts`: neue Methode `getQueuePosition(jobId)` → zählt vor mir liegende Jobs
- ETA-Formel: `(position × avg_render_duration_letzte_24h)` — basierend auf historischen Daten aus `render_queue_stats`
- Realtime-Subscription bereits vorhanden (`render-queue-changes`) — nutzen wir, um Position live zu updaten
- Neue Komponente `<QueuePositionBadge>` für die Anzeige im `RenderOverlay.tsx` und `RenderQueuePanel.tsx`

**Was du gewinnst:** User wissen, was los ist → weniger Support-Anfragen, weniger Abbrüche.

---

### Modul 3: Provider-Quota-Monitoring + Email-Alerts

**Was du bekommst:**
Neuer Tab im Admin-Dashboard: **„Provider Health"** mit Live-Auslastung:

```
┌──────────────────────────────────────────┐
│ 🟢 Replicate     67% / 600 req per min   │
│ 🟢 Gemini        23% / 1000 req per min  │
│ 🟢 ElevenLabs    12% / 5 concurrent      │
│ 🟡 OpenAI Sora   84% / 100 req per hr    │ ← Warning
│ 🟢 AWS Lambda    50% / 6 parallel        │
└──────────────────────────────────────────┘
```

**Technisch:**
- Neue Tabelle `provider_quota_log`: `provider, timestamp, requests_used, requests_limit, response_time_ms`
- Edge Functions, die Provider aufrufen, loggen jeden Call (Wrapper in `_shared/provider-tracker.ts`)
- Neue Edge Function `provider-quota-aggregator` (cron alle 1 Min): aggregiert Last-Minute-Daten
- Neue Komponente `src/pages/admin/ProviderHealth.tsx` mit 5 Cards (Replicate, Gemini, ElevenLabs, OpenAI, Lambda)
- **Email-Alert bei >80%**: Neue Edge Function `provider-quota-alerter` (cron alle 5 Min): wenn ein Provider über 80% steht → Email an Admins via `send-transactional-email` mit Template `provider-quota-warning`
- Cooldown: 1 Email pro Provider pro Stunde (verhindert Email-Spam)

**Was du gewinnst:** Du weißt **vorher**, wann du einen Plan upgraden musst — nicht erst, wenn User „Service nicht verfügbar"-Fehler bekommen.

---

### Datenbank-Änderungen (3 neue Tabellen)

| Tabelle | Zweck | RLS |
|---|---|---|
| `system_config` | Single-Row config (z.B. `lambda_max_concurrent`) | Admin only |
| `lambda_health_metrics` | Render-Erfolg/Fehler-Tracking | Admin read, system write |
| `provider_quota_log` | API-Call-Tracking pro Provider | Admin read, system write |

---

### Neue Edge Functions (4)

1. `lambda-circuit-breaker` — Cron alle 5 Min, justiert Lambda-Concurrency
2. `provider-quota-aggregator` — Cron alle 1 Min, aggregiert Provider-Calls
3. `provider-quota-alerter` — Cron alle 5 Min, schickt Warnungen
4. `_shared/provider-tracker.ts` — Wrapper-Modul (kein eigenes Deploy)

---

### Wichtig zu wissen

- **Kein Code-Refactoring nötig** in bestehenden Edge Functions — nur 1-Zeilen-Imports vom neuen `provider-tracker.ts`
- **Kosten:** Lambda-Hochskalierung von 3→6 = ggf. höhere AWS-Rechnung bei Spitzen (linear), aber: Du zahlst nur, was läuft
- **Reversibel:** Falls Probleme → `system_config.lambda_max_concurrent = 3` setzen, fertig
- **User merken nichts** außer: schnellere Renders (Modul 1) + bessere Status-Anzeige (Modul 2)

---

### Zeitplan

Alles in einem Rutsch — nach Plan-Freigabe:
1. DB-Migration (3 Tabellen + system_config-Seed)
2. Edge Functions deployen (4 Stück)
3. Frontend (RenderOverlay-Update + neuer Admin-Tab „Provider Health")
4. Cron-Jobs aktivieren

Du kannst direkt nach Fertigstellung in `/admin` → „Provider Health" klicken.

