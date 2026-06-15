# v127 — Lipsync Pipeline Speed-Up (Sync.so $49 Plan, 6 concurrent)

## Aktueller Stand (verifiziert)

- `composer.parallel_sync_so_passes = true` ✅ schon an
- `composer.sync_so_concurrency_cap = 4` ❌ zu niedrig
- Code-Hardcap: `Math.min(4, …)` in `compose-dialog-segments` (Z. 3992) → **deckelt auf 4 obwohl Plan 6 erlaubt**
- `MAX_INFLIGHT = 4` (Z. 1988) → globaler Defer-Trigger zu früh
- v126 Recovery-Reference (sync-3, coords-pro, doc-strict, preclip-pipeline) bleibt **vollständig unangetastet**

## Realistischer Baseline (4 Sprecher, healthy)

- Prep + Plates: ~60–90 s
- 4× Sync.so seriell: ~6–7 min (~100 s/Pass)
- Mux + Stitch: ~20–40 s
- **Σ ~8–10 min** ← genau das was du beobachtest

Bottleneck = die 4 seriellen Sync.so-Pässe. Parallel ist Flag-an, aber der Hardcap auf 4 zwingt zwar 4-Sprecher-Szenen in eine Welle (gut), aber 5–6 Sprecher würden trotzdem chained werden, und die `MAX_INFLIGHT=4` Defer-Schwelle blockiert eine zweite Szene komplett sobald eine 4-Sprecher-Szene läuft.

## Was sich ändert (Hebel, sortiert nach Impact)

### Hebel 1 — Concurrency-Cap auf 6 anheben (Haupt-Speedup)

| Stelle | Vorher | Nachher |
|---|---|---|
| `system_config.composer.sync_so_concurrency_cap` | `4` | `6` |
| `compose-dialog-segments` Z. 3992 `Math.min(4, …)` | Cap 4 | Cap 6 |
| `compose-dialog-segments` Z. 1988 `MAX_INFLIGHT` | `4` | `6` |
| `countInflightSyncJobs(supabase, 10)` TTL | 10 min | unverändert |

**Effekt:**
- 4-Sprecher-Szene: bleibt 1 Welle (war schon so) → keine Veränderung, aber jetzt mit Sicherheitsmarge (2 Slots frei für parallele Szene/Retry)
- 5- und 6-Sprecher-Szenen: dispatchen jetzt in **einer** Welle statt 1+1 seriellem Tail → ~100 s Ersparnis pro extra Sprecher
- Zweite Composer-Szene blockiert nicht mehr sofort, solange Slots frei sind

**Erwartet: 4-Sprecher bleibt bei 4–5 min Sync-Zeit (Parallel-Welle ohne Tail), Gesamtszene ~5–6 min statt 8–10 min** — vorausgesetzt der Webhook chained nicht unnötig (siehe Hebel 2).

### Hebel 2 — Webhook-Chain bulletproof (Outlier-Schutz)

Problem aus v126-Run: Pass 3 → Pass 4 hatte 21 min Gap weil `sync-so-webhook` den nächsten `pending` Pass nicht zuverlässig kicked, sondern es auf den Watchdog ankam.

Änderungen in `sync-so-webhook/index.ts`:
- Nach jeder erfolgreichen Pass-Completion: wenn `passes[]` noch `pending` Einträge ohne `job_id` hat **und** Inflight-Count < cap, **immer** `compose-dialog-segments` mit `{advance: true, pass_idx: <nextPending>}` self-invoken (nicht nur wenn parallel-Flag aus).
- Telemetrie-Status `CHAIN_ADVANCED` in `syncso_dispatch_log` (Diagnose, falls Chain bricht).

Änderungen in `lipsync-watchdog/index.ts`:
- Zusätzlicher Trigger: Pattern `done + done + done + pending(no job_id)` → sofortiger Re-Dispatch (heute wartet Watchdog auf STALE_HARD_MS = 25 min).
- Polling-Intervall des Watchdogs bleibt 2 min, nur das Trigger-Pattern wird erweitert.

**Effekt:** Outlier-Szenen (Chain bricht durch Webhook-Drop, Sync.so 5xx, etc.) self-healen in < 1 min statt > 20 min. Keine Baseline-Veränderung im Healthy-Fall.

### Hebel 3 — Fan-out Jitter prüfen

Heute: `delayMs = i * 250` ms (Z. 4001). Bei cap=6 → 1.25 s Stagger insgesamt. Bleibt drin, schützt vor Sync.so Burst-Spike (HTTP 429).

### Was NICHT geändert wird

- v126 Frozen Invariants (sync-3, `sync_mode: cut_off`, `active_speaker_detection.auto_detect: true`, **kein** `bounding_boxes*`/`coordinates`/`frame_number`/`temperature`/`occlusion_detection_enabled`) → bleiben byte-identisch.
- Preclip-Pipeline (Remotion Lambda single-face square) → unverändert.
- Default-Variant `coords-pro` → unverändert.
- Retry-Clear-Liste in Webhook → unverändert.
- HappyHorse: bleibt Replicate (keine öffentliche Direkt-API).

## Erwarteter Effekt (Healthy-Case)

| Szenario | Heute | Nach v127 |
|---|---|---|
| 1 Sprecher | ~2 min | ~2 min (keine Änderung) |
| 2 Sprecher | ~3–4 min | ~3 min |
| 4 Sprecher | 8–10 min | **5–6 min** |
| 6 Sprecher | ~14 min (geschätzt, chained) | **5–6 min** |
| Outlier mit Chain-Bruch | 25+ min | < 6 min (Self-Heal) |

Damit liegen wir auf Artlist-Niveau (3–5 min für 4 Sprecher) bzw. besser.

## Rollout

1. SQL-Migration: `update system_config set value = '6' where key = 'composer.sync_so_concurrency_cap';`
2. Code-Edit `compose-dialog-segments/index.ts`: Cap 4 → 6 (Z. 3992) + MAX_INFLIGHT 4 → 6 (Z. 1988).
3. Code-Edit `sync-so-webhook/index.ts`: Chain-Advance auch im Parallel-Modus + `CHAIN_ADVANCED` Log.
4. Code-Edit `lipsync-watchdog/index.ts`: Pending-without-job-id Trigger.
5. Memory-Update: neuer Eintrag `mem/architecture/lipsync/v127-parallel-6-slots.md` + Index-Bump. v126-Recovery-Reference bleibt referenziert.
6. Live-Verifikation an 1 echter 4-Sprecher-Szene (du triggerst, ich werte aus).

## Risiken

- Sync.so $49 Plan = 6 concurrent **pro Account** (nicht pro Szene). Bei 2 parallelen Composer-Runs mit je 4 Sprechern = 8 Anfragen → 2 werden defered (sauber, kein 422). Defer-Pfad ist getestet (v98).
- Wenn Sync.so doch < 6 erlaubt (Plan-Limit anders dokumentiert), greift der Defer und 7./8. Pass chained nach 30 s Auto-Retry. Kein Crash.

Bestätige den Plan, dann führe ich die 6 Schritte aus.
