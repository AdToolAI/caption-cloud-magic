# v430.0 Hotfix — Output-Invariante bei abgeschlossenem Lip-Sync

Nur dieser Hotfix. Keine Arbeiten an v430.1 oder v431 im selben Zug.

## Befund (bestätigt)

Schritt 1 nahm `lip_sync_status = 'applied'` als Marker für „fertig gemischt" an; die eingefrorene Lip-Sync-Kette schreibt in der Praxis `'done'`. Folge: `processed_video_url` ist in der gesamten Live-DB bei keiner Zeile gesetzt, `base_video_url` trägt die Platte, und `resolveSceneOutput()` liefert bei 228 abgeschlossenen Lip-Sync-Szenen die Platte statt des gemischten Clips.

## Guardrails (verbindlich)

1. `done` und `applied` gelten ausschließlich als **historische Kompatibilitätswerte** für „Lip-Sync abgeschlossen". Keine Änderung an Writer-Semantik; es wird nirgends neu `applied` geschrieben. Der Resolver versteht nur beide Formen.
2. Backfill streng und idempotent, keine Inferenz für fehlgeschlagene, abgebrochene oder zurückgesetzte Szenen.
3. Verifikation danach repo-/DB-weit über Invarianten, nicht nur über die bekannten Zeilen.

## Umsetzung

### 1. Resolver (Client + Backend-Spiegel)

In `src/lib/composer/output/resolveSceneOutput.ts` und `supabase/functions/_shared/resolve-scene-output.ts` die Prüfung `status === 'applied'` durch eine gemeinsame Konstante `LIPSYNC_DONE_STATES = ['done', 'applied']` ersetzen. Ein Wertepaar, sonst identische Logik und identische Rückgabefelder. Beide Dateien bleiben feldgleich (Paritätstest).

### 2. Backfill-Migration (einmalig, idempotent)

```
UPDATE composer_scenes
SET processed_video_url = clip_url
WHERE lip_sync_status IN ('done','applied')
  AND clip_url IS NOT NULL
  AND base_video_url IS NOT NULL
  AND clip_url IS DISTINCT FROM base_video_url
  AND processed_video_url IS NULL
```

Zusätzlicher Abschluss-Guard: Nur Zeilen, deren Zustandsmaschine den Clip als fertig ausweist (`pipeline_state = 'complete'` bzw. der äquivalente Legacy-Spiegel). Vor dem Ausführen wird geprüft, wie viele der 228 Zeilen diesen Guard erfüllen; erfüllen ihn nicht alle, wird die Abweichung berichtet statt stillschweigend gelockert.

### 3. Tests

- Regression: Zeile im `'done'`-Format → `effectiveUrl = processed`, `isLipsynced = true`, `baseUrl` bleibt die Platte.
- Äquivalenz: `'done'` und `'applied'` erzeugen identische Resolver-Ausgabe.
- Negativfälle: `failed`, `canceled`, zurückgesetzt → weiterhin Platte, `processed = null`.
- Client/Backend-Parität bleibt grün.

### 4. DB-Invariantencheck nach der Migration (repo-/DB-weit)

- fertiger Lip-Sync: `effectiveUrl = processed_video_url = clip_url`
- Basisvideo bleibt `base_video_url`
- normale Szene: `effectiveUrl = base_video_url`
- `clip_url = processed_video_url ?? base_video_url`
- Client- und Backend-Resolver liefern dasselbe
- `done` und `applied` mit identischer Semantik

Jede Invariante als Zählabfrage mit Zielwert 0 Verletzungen; das Ergebnis kommt in den Abschlussbericht.

### 5. E2E-Smoke (nach dem Hotfix)

Schwerpunkt Export/Assembly und Continuity: beide müssen nachweislich den fertigen gemischten Clip verwenden, nicht die Platte. Protokoll pro Pfad: Quelle von `effectiveUrl`, `pipeline_state`-Verlauf, Continuity-Flags.

## Reihenfolge

Hotfix → Tests → Migration → DB-Invariantencheck → E2E-Smoke → STOP. v430.1 erst danach als eigener Auftrag.

## Nicht enthalten

Keine Änderung an Lip-Sync-Writern, State Machine, Continuity-Kette, Provider-Matrix oder UI-Gates.
