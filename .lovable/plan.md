

## Befund (Live-Logs)
Aus `video_renders` für `source='composer'`:
```
status=failed, error=concurrencyPerLambda is set higher than the amount of CPU cores
available. Available CPU cores: 2, value set: 10
```

Beide letzten Composer-Renders sind **innerhalb von 1–7 Sekunden** nach dem Insert mit Lambda-Validierungsfehler abgeschmettert worden. Die UI merkt das aber nicht, weil:
1. `AssemblyTab` schickt nur `compose-video-assemble` ab, zeigt einmalig „Rendering läuft" und **pollt danach nichts mehr**.
2. Der Webhook kann nichts liefern, weil Lambda nie startet.
3. `composer_projects.status='failed'` wird zwar gesetzt, aber im UI nicht abgefragt.

## Fix in 3 Teilen

### 1. Lambda-Payload: `concurrencyPerLambda` korrekt setzen
In `compose-video-assemble/index.ts`:
- `concurrencyPerLambda: 10` → **`1`** (so wie auch `validate-music-track` und alle anderen Pipelines es nutzen)
- Optional `framesPerLambda: 270` ergänzen (passend zur Lambda-Concurrency-Policy aus dem Memory)

### 2. UI: echtes Polling auf Render-Status
`AssemblyTab.tsx` erweitern:
- Nach erfolgreichem `invoke` → alle 4s `video_renders.select('status, video_url, error_message').eq('render_id', renderId)` abfragen
- Drei Endzustände:
  - `completed` + `video_url` → Erfolgs-Card mit **Vorschau-Player** + **Download-Button** + Toast „Video fertig"
  - `failed` → Fehler-Card mit echter `error_message` + Toast (rot)
  - `rendering`/`pending` → unverändert weiterpollen (max 10 Min, danach Hinweis „dauert länger als erwartet")
- Während des Pollings einen kleinen `Progress`-Indikator zeigen (Spinner + „Lambda rendert …")

### 3. Composer-Project-Status zurück in den Dashboard-State
Im Dashboard nach Mount/Tab-Wechsel zusätzlich `composer_projects.output_url` + `status` mitziehen, damit auch nach Reload das fertige Video sichtbar bleibt.

## Geänderte Dateien
- `supabase/functions/compose-video-assemble/index.ts` — `concurrencyPerLambda: 1`
- `src/components/video-composer/AssemblyTab.tsx` — Polling, Vorschau, Download
- `src/components/video-composer/VideoComposerDashboard.tsx` — beim DB-Sync `output_url` mitlesen

## Verify
- „Video rendern" → Render startet ohne Lambda-Validation-Error
- UI zeigt Spinner mit Live-Status
- Nach ~1–3 Min: Player + „Herunterladen"-Button erscheinen automatisch
- Bei Fehler: konkrete Lambda-Meldung statt nur „Rendering läuft" für immer
- Reload behält fertiges Video bei

## Was unverändert bleibt
- DB-Schema, RLS, Pricing, Webhook-Logik, andere Studios

