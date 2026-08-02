## Ursache (verifiziert)

Die zuletzt fehlgeschlagene Szene (heute 08:49, `[invalid_prompt_rejected] [prompt_repair_exhausted]`) steht in der Datenbank auf `clip_status = 'failed'`, hat aber **weiterhin eine `replicate_prediction_id`** gesetzt.

In `src/hooks/usePipelineProgress.ts` (Clips-Phase) zählt der Block `backendActive` jede Szene mit gesetzter `replicatePredictionId` als „läuft" — ohne zu prüfen, ob die Szene bereits terminal fehlgeschlagen ist. Folge:

- `running = true` → Phase-Status bleibt `running`
- `failed` wird bewusst nur gemeldet, wenn `!running` → bleibt `false`
- `hasFailure = false`, `isActive = true` → der Balken zählt weiter hoch (6 %, 28s / ~8:00 min), obwohl die Szene rot und refundiert ist

## Fix

In `src/hooks/usePipelineProgress.ts`, `clipsReal`:

1. Helper `isFailed(s)` einführen (`clipStatus`/`clip_status === 'failed'`).
2. `backendActive` filtert fehlgeschlagene Szenen zuerst heraus — stale `replicatePredictionId`, `twoshotStage` oder `dialogShots` einer toten Szene erzeugen keinen „running"-Zustand mehr.
3. `generating` ebenfalls gegen `isFailed` absichern (Race zwischen optimistischem Patch und Realtime-Update).

Dadurch wird `running` false, `failed` true → Phase-Pill `failed`, `hasFailure = true`, `isActive = false`. `PipelineProgressBar` zeigt dann sofort „Fehler / Lip-Sync abgebrochen" plus den Button „Sauber neu starten"; Timer und ETA stoppen (`etaSeconds = 0`).

## Technische Details

- Nur Frontend-Änderung, eine Datei: `src/hooks/usePipelineProgress.ts`.
- Keine Änderung an Edge Functions, Credits oder Refund-Logik.
- Das gleiche Muster ist in `lipsyncReal` bereits korrekt umgesetzt (`cs === 'failed'` → kein Target), daher bleibt die Lipsync-Phase unverändert.
