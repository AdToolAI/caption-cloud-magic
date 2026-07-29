## Kontext

AWS-Quota bestätigt auf 100. Noch keine User → keine echten Peak-Daten, kein Grund zu aggressiver Verteilung. Wir wollen nur die **Launch-Klippe** absichern: falls Tag 1 durch einen viralen Post 30–80 Renders parallel reinkommen, sollen sie durchlaufen statt 429 zu werfen. Alles andere (Tier-Caps, distributed λ, Stability-Split) bleibt konservativ, bis echte Nutzungsdaten aus `LambdaHealth` vorliegen.

## Änderungen (Minimal-Variante)

### 1. `supabase/functions/_shared/render-concurrency.ts`
- `RENDER_SLOT_BUDGET_DEFAULT`: 60 → **80**
- `FOUNDER_RESERVE_HIGH_WATER`: 50 → **68** (letzte 12 Slots founders-only, ~85 %)
- Kommentar-Header oben aktualisieren (AWS-Quota 100 bestätigt, 80 Render / 20 Edge+Burst)

### 2. `src/hooks/useRenderSystemLoad.ts` (Frontend „System-Last"-Pill)
- `SLOT_BUDGET_DEFAULT`: 60 → **80**
- `HIGH_WATER`: 50 → **68**
- DB-Override-Logik (`system_config.render_queue_slot_budget`) bleibt.

### 3. DB-Config
```sql
insert into public.system_config (key, value)
values ('render_queue_slot_budget', '80')
on conflict (key) do update set value = excluded.value;
```
Ausführung via `supabase--insert` im Build-Schritt.

### 4. Memory
Neue Datei `mem://infrastructure/aws-lambda/quota-100-launch-distribution.md`:
- AWS-Quota 100 bestätigt (eu-central-1)
- Launch-Verteilung: 80 Render-Pool / 20 Edge+Burst-Reserve
- Founder-Reserve ab 68/80
- Tier-Caps + `TARGET_MAX_LAMBDAS=5` bewusst NICHT erhöht — erst wenn `LambdaHealth` peak > 60 an ≥ 3 Tagen zeigt.
- Nächster Ausbauschritt: AWS-Ticket auf 250 sobald peak > 70 dauerhaft, danach zweite Runde.

Referenz in `mem://index.md#Core`:
„AWS-Lambda-Quota 100 → Render-Pool 80 (Founder-Reserve ab 68). Tier-Caps unverändert bis reale Peak-Daten vorliegen."

## Was NICHT geändert wird

- `pickRenderTier` (short=3, standard=5, long=8, export=12)
- `TARGET_MAX_LAMBDAS = 5` in `remotion-payload.ts`
- Stability-Tiers, `framesPerLambda`-Boden 270
- Timeout 600 s, RAM 3008 MB
- Encode-Quality-Floor (JPEG 95 / CRF 16 / preset slow)
- Lip-Sync-Mux, Sync.so-Concurrency, Retry-/Circuit-Breaker

## Verifikation nach Deploy

1. `LambdaHealth`-Dashboard: „Normal max" zeigt 80.
2. Frontend „System-Last"-Pill zeigt Budget 80.
3. `system_config`-Row `render_queue_slot_budget = 80` per `supabase--read_query` prüfen.
4. Test-Render eines Standard-Videos läuft normal durch (kein Verhalten geändert bei niedriger Last).

## Nächster Schritt (nicht jetzt)

Wenn nach Launch peak concurrency in `LambdaHealth` an ≥ 3 Tagen > 60 zeigt:
- AWS Support Case auf 250 concurrency stellen
- Danach zweite Plan-Runde: Tier-Caps + `TARGET_MAX_LAMBDAS` hoch, Render-Pool auf ~200.

Sag Bescheid, dann setze ich es um.