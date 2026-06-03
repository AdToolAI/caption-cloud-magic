## Befund

Der neue fehlgeschlagene Run ist Szene `ace1a0d0-f9bd-4982-b306-3414db03c12b`.

Was wir jetzt genauer isolieren konnten:

1. **Sync.so liefert weiterhin keinen echten Fehlercode**
   - Webhook und GET-Fallback melden beide nur:
     - `error: "An unknown error occurred."`
     - `error_code: null`
   - Damit ist der externe Provider-Fehler selbst nicht weiter maschinenlesbar klassifizierbar.

2. **Unsere Audio-Trim-Reparatur hat teilweise gegriffen**
   - Matthew wurde von `2.46s` Lead-In auf `0.20s` getrimmt.
   - Kailee wurde von `3.75s` Lead-In auf `0.20s` getrimmt.
   - Samuel hatte nur `0.10s` Lead-In und wurde im ersten Versuch nicht getrimmt.

3. **Der eigentliche neue Blocker ist ein Multi-Pass-Race im Retry-State**
   - Pass 2 und Pass 3 wurden parallel gestartet.
   - Als deren FAILED-Webhooks ankamen, fand `sync-so-webhook` deren `job_id` nicht mehr in `dialog_shots.passes[]`:
     - `job=... not in passes[] (count=3) and not top-level — skip`
   - Ursache: Der Retry von Pass 1 schreibt einen älteren `passes[]`-Snapshot zurück und überschreibt dadurch parallel gestartete Pass-Job-IDs.
   - Dadurch werden die Webhooks von Pass 2/3 verworfen, und die Szene fällt anschließend anhand von Pass 1 hart durch.

4. **Der Retry-Ladder-Guard ist zu streng für 3+ Sprecher**
   - Nach `coords-pro + repair_audio` blockiert der Code `auto-pro`, um Face-Swaps zu vermeiden.
   - Das ist grundsätzlich richtig, aber aktuell führt es dazu, dass nach nur einem reparierten Versuch sofort endgültig failed/refunded wird.

## Ziel

Lip-Sync bei 3-Sprecher-Szenen stabilisieren, ohne Face-Swaps zu riskieren und ohne Credits doppelt zu belasten.

## Plan

### 1. Webhook-State-Merge statt Snapshot-Overwrite

In `supabase/functions/sync-so-webhook/index.ts`:

- Vor jedem Retry-Update die Szene erneut aus der Datenbank laden.
- `passes[]` gezielt nach `idx` mergen statt den alten Array-Snapshot komplett zurückzuschreiben.
- Bereits vorhandene `job_id`, `status`, `started_at`, `diagnostic_id` anderer parallel laufender Pässe dürfen nicht überschrieben werden.
- Damit können Pass-2/Pass-3-Webhooks wieder zuverlässig zugeordnet werden.

### 2. `compose-dialog-segments` Retry-State ebenfalls merge-sicher machen

In `supabase/functions/compose-dialog-segments/index.ts`:

- Beim Retry/Advance vor dem Speichern erneut den aktuellen `dialog_shots`-State laden.
- Nur den gerade gestarteten Pass ersetzen.
- Alle anderen Pass-Objekte aus dem neuesten DB-Stand übernehmen, falls dort bereits neuere `job_id`s existieren.

### 3. 3+ Sprecher: keine komplette Szene beim ersten Pass-Fehler abbrechen

In `sync-so-webhook`:

- Wenn 3+ Sprecher parallel laufen und ein Pass fehlschlägt, nicht sofort alle anderen Pässe canceln, solange andere Passes noch `rendering` sind.
- Stattdessen:
  - fehlgeschlagenen Pass markieren,
  - laufende Geschwister weiter auswerten lassen,
  - erst final failen, wenn klar ist, dass kein verwertbarer/repairbarer Pfad mehr offen ist.

### 4. Reparatur-Ladder für `provider_unknown_no_code` erweitern

Für 3+ Sprecher mit `error_code=null`:

- Nicht auf `auto-pro` wechseln, solange Face-Swap-Risiko besteht.
- Stattdessen eine zweite sichere `coords-pro`-Reparatur erlauben:
  - Audio immer re-encoden/trimmen, auch bei Pass 1.
  - Optionales `force_pcm_s16le`/normalisierte WAV-Metadaten setzen, falls die vorhandene Trim-Funktion nur Lead-In entfernt.
- Erst danach endgültig failen/refunden.

### 5. Diagnose im UI präziser machen

In `src/components/video-composer/ComposerSequencePreview.tsx`:

- Wenn `sync_error_bucket = provider_unknown_no_code`, anzeigen:
  - Sync.so hat keinen offiziellen Fehlercode geliefert.
  - Der Run wurde mit Audio-Repair und merge-sicherem Pass-Retry versucht.
  - Falls danach noch failed: Ursache liegt sehr wahrscheinlich bei Sync.so `lipsync-2-pro` + manuelles Face-Targeting auf 3-Personen-Plate.

### 6. Nach Implementierung deployen und validieren

- Betroffene Edge Functions deployen:
  - `sync-so-webhook`
  - `compose-dialog-segments`
- Logs prüfen, dass:
  - Pass-2/Pass-3-Webhooks nicht mehr mit `not in passes[]` verworfen werden.
  - `passes[]`-Job-IDs bei parallelen Writes erhalten bleiben.
  - Refund weiterhin nur einmal erfolgt.

## Technische Kurzfassung

Das Problem ist jetzt klarer isoliert: **Sync.so bleibt bei `error_code=null`, aber unser System verliert durch parallele Pass-Updates Job-IDs im State. Dadurch werden Webhooks verworfen und der Retry wird zu früh als endgültig ausgeschöpft behandelt.**

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>