## Skalierungs-Plan: Lambda-Quota 100 + Render-Queue + Founders-Priority

Vorbereitet für 3.000+ Beta-User in Woche 1. Kein UI-Redesign, kein Preis-Change — nur Infrastruktur.

## 1. Slot-Budget (100 Lambdas gesamt)

| Zweck | Slots |
|---|---|
| Edge-Function-Reserve (Auth, DB, generate-*) | 30 |
| Burst-Puffer | 10 |
| **Render-Pool (Remotion)** | **60** |

## 2. Tiered Worker-Cap (pro Render)

```text
< 300 frames   →  3 workers   (Short)
300–900        →  5 workers   (Standard)
900–1800       →  8 workers   (Long)
> 1800         → 12 workers   (Director's Cut Export)
```

`framesPerLambda`: 200 Default; min. 120 für scene-aligned Composer.

**Änderungen in Code:**
- `supabase/functions/render-with-remotion/index.ts` — `maxWorkers` per Tier bestimmen
- `supabase/functions/render-directors-cut/index.ts` — dito
- Composer-Pfad — Untergrenze `framesPerLambda ≥ 120`

## 3. Render-Queue (nutzt bestehende `render_queue` Tabelle)

Die Tabelle existiert bereits (20 Spalten, 4 Policies). Wir erweitern sie um die für Slot-Bookkeeping und Founders-Priority nötigen Spalten:

```sql
ALTER TABLE public.render_queue
  ADD COLUMN IF NOT EXISTS estimated_workers int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS priority int NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_render_queue_dispatch
  ON public.render_queue (status, priority, created_at)
  WHERE status = 'queued';
```

Vor dem Schreiben: aktuelle Spalten per `read_query` validieren, damit die Migration keine Konflikte erzeugt.

**Priority-Werte:**
- `50` → Founders (die ersten 1000, `profiles.is_founder = true`)
- `100` → Normale Beta-User
- Sortierung: `ORDER BY priority ASC, created_at ASC`

## 4. Scheduler: `render-queue-tick`

Neue Edge Function, alle **10 Sekunden** per `pg_cron` + `pg_net`:

1. `SELECT sum(estimated_workers) FROM render_queue WHERE status='running'` → laufende Last.
2. Solange `laufend + next.estimated_workers ≤ 60`: nächsten Queued-Job auf `running` setzen und passenden Render (`render-with-remotion` / `render-directors-cut`) invoken.
3. Job callt bei Abschluss zurück → `status='done'` / `'failed'`; bei `failed` → automatischer Credit-Refund (bestehende Fail-Safe-Logik).
4. Stale-Job-Detection: `running` länger als 15 min → `failed`, Refund, Slot freigeben.

Cron-Insert läuft über das insert-Tool (enthält Project-URL + anon key, nicht in Migration).

## 5. Founders-Flag

- Neue Spalte `profiles.is_founder boolean DEFAULT false`.
- Bestehende `claim_founders_slot` RPC setzt sie beim erfolgreichen Claim auf `true`.
- Beim Enqueue: `priority = is_founder ? 50 : 100`, `is_founder` in Queue-Row spiegeln.
- Bei Kündigung/Status-Forfeit (bestehende Logik) → `is_founder = false` → nächster Render normal-priority.

## 6. Frontend: Queue-Anzeige

- Neuer Hook `useRenderQueue(jobId)` → subscribed via Realtime auf `render_queue` Row.
- `usePipelineProgress.ts` — vor "Rendering" neuer Zustand **"Queued · Position N · ~ETA"**.
- Founders bekommen goldenen "Priority"-Badge in der Wartemeldung.
- Kein Modal, kein neuer Screen — nur Text-Update im bestehenden Progress-UI.

## 7. Pre-Launch Health-Checks

Vor Go-Live (26.07.2026):

1. `db_health` — Memory-, Connection-Sättigung. Bei Warnsignalen: `resize_compute` anbieten.
2. `slow_queries` — Hot-Paths (Media Library, Cast & World, Wallet).
3. Nach Deploy: 24h `edge_function_logs` auf `TooManyRequestsException` + 5xx-Peaks.

## 8. Memory-Updates

- "Lambda Concurrency Policy" → neue Werte (tiered 3/5/8/12; 60-Slot-Pool).
- Neuer Eintrag: "Render-Queue Architecture" (Founders-Priority, 10s-Tick, Stale-Detection).

## 9. Rollback

- Feature-Flag `RENDER_QUEUE_ENABLED` (system_config) → deaktivieren = direktes Rendern wie heute.
- Worker-Cap = einzelne Config-Konstante → 1-Zeilen-Change.
- Cron-Job pausierbar per `cron.unschedule`.

## Nicht im Scope

- Kein Redesign der Studios.
- Kein Change an Provider-Renders (Sora/Kling/Veo/Replicate — die laufen außerhalb unseres Lambda-Quotas).
- Keine Preis-/Plan-Änderung.

Sag Bescheid, wenn ich starten soll — dann prüfe ich zuerst die aktuelle `render_queue`-Struktur mit `read_query` und lege dann Migration + Scheduler + Frontend-Wiring in einem Rutsch an.