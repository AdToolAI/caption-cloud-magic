## Status quo

Live Sweep zeigt **9/12 grün, 4.81 € ausgegeben**, aber:

1. **Hedra Talking Head + Runway Aleph → `skipped_budget`** mit `"only 0.05€ remaining of 20.00€ cap"`. **Kein Bug der Provider** — der DB-Akkumulator `qa_live_budget.spent_eur` steht bei **19.95 €** (akkumuliert aus allen historischen Sweeps seit dem Cap-Init), nicht aus diesem einen Run.
2. **Pika 2.2 Std → bleibt im Status `running`** in `qa_live_runs` (cost 0, duration NULL). Edge-Function-Logs zeigen, dass `generate-pika-video` korrekt gebootet hat und sofort 410 zurückgegeben hat. Der Sweep ist aber danach mit Kling/Veo weitergelaufen → das `update`-Statement für die Pika-Row hat schlicht nicht gefeuert oder das `expected`-Result wurde verworfen.
3. **Folgefehler**: weil Pika 0 € verbraucht hat und Hedra/Runway als `skipped_budget` markiert wurden, wirken die Kosten plausibel — der eigentliche Akkumulator-Bug fällt erst beim Lesen der DB auf.

## Ursachen-Analyse

### Ursache A: Budget-Akkumulator akkumuliert ewig

`qa_live_budget` hat **eine** Row mit `cap_eur=20`, `spent_eur=19.95`, last_run_at=heute 15:46. Jeder Sweep addiert auf `spent_eur` drauf, ohne jemals zu resetten. Nach ~5 erfolgreichen Sweeps à ~4.8 € ist die Kasse erschöpft.

Die naive Lösung „Cap erhöhen" ist falsch — der Sinn des Caps ist Schutz vor unkontrollierten Spend-Loops *innerhalb eines Runs*, nicht ein Lifetime-Limit.

### Ursache B: Pika-Row bleibt `running`

Im Sweep-Code (Zeile 477-514) wird:
1. Pending-Row mit `status: "running"` inserted (klappt)
2. `callProvider` wird aufgerufen → returnt `{ status: "expected", durationMs, error: "HTTP 410..." }`  
3. `finalRow` wird mit `status: result.status` (also `"expected"`) gebaut
4. `update(finalRow).eq("id", pending.id)` — ABER die DB zeigt weiterhin `running` mit `duration_ms=NULL`

Die wahrscheinlichste Erklärung: Die Pika-Edge-Function returnt 410 mit `code: "PROVIDER_DEPRECATED"` und einem Error-Text der zwar das Wort „Pika" enthält, aber die `expectedFailure.reasonContains: "Pika"`-Prüfung schaut in `(parsed.error || text).toLowerCase()`. Das funktioniert. **ABER**: Wenn die Pika-Update-Query irgendwo einen Constraint verletzt (z.B. bei `raw_response` mit non-serializable content), schluckt der Code den Error stillschweigend (kein await-error-Handling). Auch möglich: `pending?.id` ist `undefined`, weil der Insert wegen RLS-Race im `running`-Zustand stehen bleibt.

## Fix

### Phase A — Budget pro Sweep zurücksetzen

In `qa-live-sweep/index.ts` direkt **nach dem Laden des Budget-Eintrags und vor dem Loop** einen Reset einfügen:

```ts
// Reset spent_eur to 0 at the start of each sweep — the cap is per-run
await adminClient
  .from("qa_live_budget")
  .update({ spent_eur: 0, last_run_at: new Date().toISOString() })
  .eq("id", budget.id);
let totalSpent = 0;
```

So bleibt das 20 €-Cap pro Sweep gültig (Schutz vor Endlos-Loops in einem Run), aber jeder neue Sweep startet bei 0 €. Hedra (~0.30 €) und Runway (~3-5 €) werden wieder ausgeführt.

### Phase B — Pika-Update robuster machen

1. **Update-Error explizit behandeln**: `update(finalRow)` mit `.select()` + Error-Logging, damit silent failures sichtbar werden.
2. **Fallback-Update**: Falls `pending?.id` fehlt, Update via `(sweep_id, provider, mode)`-Composite ausführen.
3. **`raw_response` sanitisieren**: JSON-stringify mit `try/catch` und auf max. 4 KB beschneiden, um Postgres-Constraint-Fehler bei großen Replicate-Antworten zu vermeiden.

### Phase C — UI-Korrektur für Cap-Anzeige

Im `LiveSweepTab` die Cap-Restanzeige aus dem **aktuellen Run-Result** beziehen (`summary.total_spent_eur` vs `summary.cap_eur`), nicht aus der globalen `qa_live_budget`-Row. So sieht der Admin den realen Run-Spend, nicht den (jetzt bei 0 startenden) Akku.

### Phase D — Sofort-Reset ausführen

Vor dem nächsten Sweep ein **One-shot UPDATE** auf die Budget-Row, damit der erste Run nach Deployment direkt sauber startet:

```sql
UPDATE qa_live_budget SET spent_eur = 0;
```

### Phase E — Memory-Update

`mem://features/qa-agent/architecture` ergänzen:
> *Budget-Cap (20 €) ist per-run, nicht lifetime: Sweep resettet `spent_eur=0` beim Start. Pika-Row-Updates haben Fallback via Composite-Key + Error-Logging.*

## Erwartetes Ergebnis nach Re-Run

- **Hedra Talking Head → succeeded** (~0.30 €)
- **Runway Aleph → succeeded oder echter Fehler** (~3-5 € bei v2v)
- **Pika 2.2 → expected (HTTP 410)** in grau, mit korrekt geupdateter Row
- **Gesamt: 12/12 effektiv grün**, ~8-10 € pro Run, Budget startet jedes Mal frisch bei 0 €

## Dateien, die ich anfassen werde

- `supabase/functions/qa-live-sweep/index.ts` (Budget-Reset + robustes Update + raw_response-Sanitisierung)
- `src/pages/admin/LiveSweepTab.tsx` (Cap-Restanzeige aus Run-Summary)
- Migration: `UPDATE qa_live_budget SET spent_eur = 0`
- Memory-Update in `mem://features/qa-agent/architecture`

Soll ich loslegen?
