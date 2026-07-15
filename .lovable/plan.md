# Lambda-Wiring — Status & offene Punkte

Kurzantwort: **Fundament steht, aber es gibt 4 offene Kanten.** Das Queue-System (60-Slot-Pool, Founders-Prio, Tick-Scheduler, Stale-Reclaim, `pickRenderTier`) ist vorhanden und aktiv (`render_queue_enabled=true`, `render_queue_slot_budget=60`, `cron.job render-queue-tick-10s` läuft). Die Studios kippen ihre Renders aber aktuell **an der Queue vorbei** direkt in die Renderer — dadurch greift der Slot-Guard nicht bei Lastspitzen. Das sollten wir vor dem 26.07. schließen.

## Was heute sauber ist

- `_shared/render-concurrency.ts`: Tier-Logik (3/5/8/12 Worker, min. 120 fpl), Founders-Priority-Konstanten.
- `render-with-remotion` & `render-directors-cut`: nutzen `pickRenderTier` pro Job.
- `render-queue-manager`: Slot-Budget, Prio-Sort, Stale-Reclaim, atomisches Claim.
- `render-queue-add`: setzt `is_founder`, `priority`, `estimated_workers`.
- Cron-Job `render-queue-tick-10s` ist aktiv.
- DB-Spalten (`is_founder`, `estimated_workers`, `priority`) und Feature-Flag vorhanden.
- Frontend: `useRenderQueueJob` + `RenderQueueBadge` gebaut.

## Offene Punkte

### 1. Studios umgehen die Queue (kritisch)

Diese Aufrufe gehen **direkt** an die Renderer:

- `src/components/directors-cut/steps/ExportRenderStep.tsx` → `render-directors-cut`
- `src/components/directors-cut/studio/CapCutEditor.tsx` → `render-directors-cut`
- `src/components/universal-creator/steps/PreviewExportStep.tsx` → `render-with-remotion`

Ergebnis: Bei parallelem Launch-Traffic kann die AWS-Quote (100) trotzdem knapp werden, und Founders bekommen keine echte Vorfahrt.

**Fix:** dünner Wrapper-Hook `useEnqueuedRender()` — pusht in `render-queue-add`, pollt Status über `useRenderQueueJob`, öffnet das gerenderte Video wenn `status=completed`. Die drei Aufrufstellen darauf umbiegen. Kein Redesign der Studios, nur der Invoke-Punkt wechselt.

### 2. Tick-Frequenz 1 min statt 10 s

Cron ist auf `* * * * *` (pg_cron min. 1 min). Bei 60 Slots + kurzer Beta-Load reicht das, aber ETA-Anzeige wird träge.

**Fix:** ein Cron-Job, der intern 6× `net.http_post` mit 10s-Abstand feuert (via `pg_sleep(10)` in einer Schleife oder 6 einzelne Aufrufe mit `now() + interval`). Alternativ: kurzer Selbst-Ping am Ende jedes Tick, wenn noch Jobs queued sind und Budget frei ist — hat den Vorteil, dass leere Perioden gar nicht ticken.

### 3. Globaler Slot-Guard direkt in den Renderern

Auch wenn Punkt 1 gelöst ist, sollte `render-with-remotion` / `render-directors-cut` als Safety-Net vor `renderMediaOnLambda` einmal `render_queue_running_workers` prüfen und bei `used + tier.maxWorkers > slotBudget` mit 429 antworten. Der Client (via Wrapper aus Punkt 1) fällt dann automatisch auf die Queue zurück.

### 4. Beobachtbarkeit

Keine sichtbare Metrik für Slot-Auslastung. Empfehlung: kleine View `render_queue_load` (`used_workers`, `slot_budget`, `queued_count`, `founders_queued`) + Admin-Widget im vorhandenen Ops-Dashboard. Kein Muss für Launch, aber sinnvoll für die ersten 1000 Founders.

### 5. Badge-Einbau

`RenderQueueBadge` steht bereit, wird aber noch nirgends gerendert. Nach Punkt 1 hat jeder Studio-Export eine `jobId` — dann Badge in:
- Motion Studio Export-Panel
- Director's Cut `ExportRenderStep` (Progress-Sektion)
- Universal Creator `PreviewExportStep`
- AI Video Studio `ToolkitGenerator` Progress-Zone

## Technische Details

**Wrapper-Hook (skizze):**
```text
useEnqueuedRender({ engine, config, estimatedDurationSec })
  → render-queue-add   (bekommt jobId, priority, position)
  → useRenderQueueJob(jobId) subscribed
  → status=completed  → onDone(outputUrl)
  → status=failed     → onError(errorMessage)
```

**Slot-Guard (skizze in Renderer):**
```text
const running = await supabase.rpc('render_queue_running_workers');
if (running + tier.maxWorkers > slotBudget) return 429 { retry_via: 'queue' };
```

**Tick-Selbst-Ping:**
```text
if (queued.length > 0 && used < slotBudget) {
  fetch(SELF_URL, { method:'POST', body:{ trigger:'chain' } });
}
```

## Reihenfolge

1. Wrapper-Hook + drei Studio-Aufrufe (Punkt 1) — größter Impact.
2. Renderer-Slot-Guard (Punkt 3) — Safety-Net.
3. Tick-Selbst-Ping (Punkt 2) — bessere ETA.
4. Badge-Einbau in die vier Studios (Punkt 5).
5. Optional: Load-View + Ops-Widget (Punkt 4).

Sag Bescheid welche Punkte du mitnehmen willst — 1+3+5 reichen für einen sauberen Launch, 2 und 4 sind Komfort.
