
# Stage 2-Hotfix + Stage 5 — Lip-Sync Stabilität

## Warum jetzt zuerst ein Hotfix

DB-Check der gerade gerenderten Szene (`f863d0e8…`):

```
clip_source      = ai-happyhorse
engine_override  = cinematic-sync
lip_sync_status  = done
3 dialog_shots, lip_sync_applied_at gesetzt
```

Stage 2 hat technisch nicht "versagt" — der Guard sitzt in `compose-video-clips` und greift nur beim **Master-Render**. Du hast aber „🔁 Lip-Sync neu rendern" benutzt, was direkt `compose-dialog-scene` triggert und den **bereits existierenden HappyHorse-Master** wiederverwendet. Resultat: Sync.so animiert Münder auf einer Plate, die für 2-Sprecher-Dialog nicht stabil genug ist → Lippen sitzen falsch, egal wie gut Sync.so arbeitet.

Bevor wir Stage 5 angehen, muss dieser Pfad geschlossen werden, sonst bleibt der Effekt bestehen.

---

## Teil A — Stage 2 Hotfix: HappyHorse-Master retroaktiv ersetzen

1. **`compose-dialog-scene`** bekommt am Eingang denselben Guard wie `compose-video-clips`:
   - Wenn `clip_source='ai-happyhorse'` + `engine_override='cinematic-sync'` + ≥2 Sprecher im `dialog_script`:
     - `clip_source` wird auf `ai-hailuo` umgesetzt
     - `clip_url`, `dialog_shots`, `lip_sync_status`, `lip_sync_applied_at` werden gecleart
     - Aufruf an `compose-video-clips` für diese eine Szene, damit der Master mit Hailuo neu erzeugt wird
     - Erst danach läuft die Dialog-Pipeline
   - User-facing Info im Response: `master_regenerated_for_lipsync_stability`
2. **„🔁 Lip-Sync neu rendern"-Button** (`SceneCard`) bekommt einen kleinen Hinweis-Toast, wenn ein Master-Wechsel ausgelöst wurde („Master-Plate wird mit Hailuo neu erzeugt — Lip-Sync startet danach automatisch").
3. Einmaliges Cleanup-Script (read-only SELECT zuerst, dann gezielte UPDATEs): alle Szenen mit `clip_source='ai-happyhorse' AND engine_override='cinematic-sync'` werden auf `ai-hailuo` + clip_url=NULL gesetzt, damit beim nächsten Aufruf automatisch sauber neu gerendert wird. **Kein Auto-Render** — passiert erst, wenn du die Szene aktiv triggerst.

Akzeptanz: deine aktuelle Szene rendert mit Hailuo-Master und Sync.so-Lip-Sync, der Mund-Versatz verschwindet.

---

## Teil B — Stage 5: Stabilität & Recovery

Damit nach dem Hotfix die Pipeline auch unter Last sauber bleibt.

### 1. Sync.so Webhook statt Polling
- `compose-dialog-scene` registriert pro Sync.so-Job eine `webhook_url` (Edge-Function `sync-so-webhook`), die direkt in `dialog_shots.shots[i]` die Felder `status`, `output_url`, `error` schreibt.
- Webhook-HMAC wird mit `SYNC_SO_WEBHOOK_SECRET` (neuer Secret) verifiziert.
- `poll-dialog-shots` bleibt als Sicherheitsnetz: wenn nach 90s kein Webhook-Event kam, fällt es auf Polling zurück (heutiges Verhalten).
- Erwarteter Effekt: 12-min-Watchdog-Fälle gehen praktisch auf 0.

### 2. Lambda Concurrency-Aware Stitch
- `render-dialog-stitch` liest vor jedem Dispatch das `aws_concurrency_budget` (existiert bereits aus der DC-Policy).
- Wenn < 1 Slot frei: Szene bleibt auf `lip_sync_status='stitching'`, Eintrag wird in `pg_cron`-Tabelle `render_stitch_queue` (neu, leichtgewichtig) gequeued.
- Cron-Tick alle 60s leert die Queue, sobald Slots frei sind.
- Erkennt 3-Layer (englische + deutsche AWS-Limit-Strings + 429) wie schon der Deep Sweep.

### 3. Idempotente Refund-Audit
- Audit-Pass in `compose-dialog-scene`, `poll-dialog-shots`, `render-dialog-stitch`, `twoshot-lipsync-watchdog`: jeder Fail-Pfad löst genau einmal `refund-credits` mit deterministischer UUID `dialog-refund:{scene_id}:{stage}` aus.
- Heute lückenhaft bei `dialog_missing_face_coords` und bei stitch-failed nach Webhook-Fehler.

### 4. Watchdog 12 min → 8 min mit klarem Error-Code
- `twoshot-lipsync-watchdog` setzt Timeout-Schwelle auf 8 min, schreibt `clip_error='sync_so_timeout_8min'` mit Diagnosefeldern (letzter Sync.so-Status, Webhook-Empfang ja/nein, AWS-Concurrency zum Zeitpunkt).
- pg_cron-Intervall bleibt 1 min.

---

## Reihenfolge der Implementierung

1. Teil A (Hotfix) — danach kannst du deine aktuelle Szene sofort sauber neu rendern
2. Teil B.1 (Webhook) — die größte Stabilitäts-Wirkung pro investierter Zeile
3. Teil B.4 (Watchdog kürzen) — trivial, sofort als Pair mit B.1
4. Teil B.3 (Refund-Audit) — defensiv, kein User-sichtbarer Effekt aber wichtig
5. Teil B.2 (Lambda-Queue) — größter Aufwand, dann wenn AWS wieder Druck macht

## Technische Details (intern)

Betroffene Dateien:
```text
supabase/functions/compose-dialog-scene/index.ts         (Teil A, B.3)
supabase/functions/poll-dialog-shots/index.ts            (B.1, B.3)
supabase/functions/sync-so-webhook/index.ts              (B.1, NEU)
supabase/functions/render-dialog-stitch/index.ts         (B.2, B.3)
supabase/functions/twoshot-lipsync-watchdog/index.ts     (B.3, B.4)
supabase/functions/_shared/sync-so.ts                    (B.1 — webhook_url field)
src/components/composer/SceneCard/*                      (Teil A Toast)
mem/architecture/lipsync/sync-so-pro-model-policy        (Update nach B.1+B.4)
mem/features/video-composer/dialog-shot-pipeline         (Update nach B.1+B.2)
```

Neue Tabellen: `render_stitch_queue` (B.2, 3 Spalten: scene_id, queued_at, attempts).
Neue Secrets: `SYNC_SO_WEBHOOK_SECRET`.
Migrationen: 1× für Queue-Tabelle + pg_cron-Job; sonst nur Edge-Functions + Frontend-Toast.

Sag mir bitte:
- soll ich mit **Teil A + B.1 + B.4** in einem Rutsch loslegen (klein, hoher Impact, entsperrt deine Szene)?
- oder zuerst nur **Teil A** rein, du verifizierst, und dann gehen wir Stage 5 in Ruhe durch?
