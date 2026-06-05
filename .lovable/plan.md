## Befund

Das Problem ist nicht mehr primär die Sync.so-3-Nutzlast selbst, sondern unsere Retry-State-Machine:

- Sync.so-3 `segments[]` schlägt weiterhin mit `An unknown error occurred.` fehl.
- Der v58-Fallback wird korrekt ausgelöst und startet `force_multipass`.
- Beim ersten Multipass-Dispatch überschreibt `compose-dialog-segments` aber `dialog_shots` mit einem neuen `version: 5 / engine: sync-segments` State ohne `force_multipass` / `multipass_fallback_attempted`.
- Wenn Pass 1 danach fehlschlägt, ruft der Webhook einen Retry ohne `force_multipass` auf.
- Dadurch denkt `compose-dialog-segments` wieder: `3 Sprecher + kein forceMultipass = offizieller Sync-3 segments[] Pfad` und springt zurück in den kaputten Sync-3-Pfad.
- Ergebnis: `lipsync-2-pro` Pass 1 schlägt fehl → Retry → versehentlich Sync-3 segments[] → v58 Fallback → wieder von vorne.

Die Sync.so-Doku bestätigt: Für `segments[]` ist die Form grundsätzlich korrekt (`input[]`, `refId`, `segments[]`, `audioInput`, optional `optionsOverride.active_speaker_detection`), aber alle offiziellen Beispiele nutzen `lipsync-2`; `sync-3` unterstützt Active Speaker Detection, ist aber bei unserem `segments[]`-Setup offenbar instabil. Der Loop entsteht durch unseren State-Verlust, nicht durch eine fehlende erneute Doku-Option.

## Plan

1. **v58-State dauerhaft erhalten**
   - In `compose-dialog-segments` beim Erzeugen des Multipass-State die Felder aus dem v58-Fallback übernehmen:
     - `force_multipass: true`
     - `multipass_fallback_attempted: true`
     - `multipass_fallback_reason`
     - `previous_engine`, `previous_model`, `previous_error`
   - Dadurch bleibt bei jedem Retry klar: Diese Szene darf nicht zurück in `sync-3 segments[]`.

2. **Offiziellen Sync-3-`segments[]` Pfad härter sperren**
   - `useV41Official` zusätzlich blockieren, wenn der existierende State irgendein v58-/Multipass-Fallback-Marker enthält.
   - Auch bei `retry=true` sicherstellen: Wenn Multipass aktiv ist, immer in den Pass-Retry gehen, nie in v56/v41.

3. **Webhook-Retry mit Multipass-Kontext absichern**
   - In `sync-so-webhook` bei v5/v58 Pass-Retry den Body um `force_multipass: true` ergänzen, wenn der Scene-State Multipass aktiv markiert.
   - Das ist ein zweiter Schutz, falls der State später erneut teilweise überschrieben wird.

4. **Loop-Brake einbauen**
   - Wenn eine Szene bereits `multipass_fallback_attempted` hat und trotzdem ein Sync-3-`segments[]`-Fehler zurückkommt, nicht nochmal v58 starten.
   - Stattdessen sauber terminal fehlschlagen, inflight Slots freigeben und Credits idempotent refundieren.

5. **Aktuelle Szene sauber zurücksetzen**
   - Szene `ac044e0a-e72a-4aac-9153-25e3e82bdcfd` aus dem Loop holen.
   - Danach auf `pending` setzen und alte `dialog_shots`/`replicate_prediction_id`/Fehlerfelder bereinigen, damit der nächste Start mit dem korrigierten v58-Multipass-State beginnt.

## Technische Stellen

- `supabase/functions/compose-dialog-segments/index.ts`
  - Gate um `useV41Official`
  - State-Erzeugung rund um `version: 5, engine: "sync-segments"`
  - Retry-/Advance-Merge

- `supabase/functions/sync-so-webhook/index.ts`
  - v58-Fallback-Entscheidung
  - v5 Retry-Fire-and-forget Body
  - Terminaler Schutz gegen erneuten Sync-3-Fallback-Loop

## Validierung

- Edge Functions deployen.
- Logs prüfen: Nach v58 darf kein neuer `v56_official_segments_payload model=sync-3` für dieselbe Szene erscheinen.
- Erwartete Logfolge nach Fix:

```text
v58 FORCE_MULTIPASS active
DISPATCH pass=1/3 ... model=lipsync-2-pro or sync-3-coords retry variant
FAILED/RETRY stays inside sync-segments multipass
NO v56_official_segments_payload after v58
```

- DB prüfen: `dialog_shots.force_multipass = true` bleibt auch nach Pass-Retry erhalten.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>