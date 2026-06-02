## Ziel

Die 3-Sprecher-Pipeline soll nicht mehr durch Orchestrator-Races oder unpräzises Face-Targeting blockieren. Der aktuelle Fehler ist kein reines Sync.so-Provider-Problem mehr: In den Logs wurden für denselben Turn mehrere parallele Dispatches ausgelöst, obwohl der Code pro Tick eigentlich nur einen Job starten soll.

## Befund

- Die neue Route greift: `useTwoShotAutoTrigger` ruft bei `speakers=3` korrekt `compose-dialog-scene` auf.
- Die Szene `d47e6e3c-13ca-42b0-abd0-2f3eae919c73` läuft im v4-Dialog-Shot-Pfad.
- Turn 0 und Turn 1 wurden erfolgreich von Sync.so verarbeitet.
- Turn 2 fällt mit `FAILED: An unknown error occurred.` aus.
- Kritisch: Turn 1 und Turn 2 wurden mehrfach nahezu gleichzeitig dispatched. Das bedeutet: mehrere Poller/Webhooks lesen denselben alten `dialog_shots`-JSON-State und starten denselben pending Turn parallel.

```text
Problemfluss aktuell:
Poller A liest Turn 2 = pending
Poller B liest Turn 2 = pending
A startet Sync.so Job
B startet kurz danach nochmal Sync.so Job
Webhook A/B schreiben konkurrierend in denselben JSON-State
Retries/Failures können fertige Zustände überschreiben oder zu früh terminal failen
```

## Plan

### 1. Szene-weiten Dispatch-Lock einführen
- Neue kleine Lock-Struktur in der Datenbank für Lip-Sync-Orchestrierung.
- `poll-dialog-shots` darf pro Szene nur noch von genau einer Instanz gleichzeitig ausgeführt werden.
- Webhook-, Cron- und Client-Kicks dürfen den Poller weiter anstoßen, aber wenn ein Lock aktiv ist, steigen sie sauber mit `deferred_locked` aus.
- Lock bekommt TTL, damit keine Szene dauerhaft hängen bleibt, falls eine Edge Function abstürzt.

### 2. `poll-dialog-shots` atomar machen
- Vor jeder Dispatch-Entscheidung Lock holen.
- Nach jedem Statuswechsel den aktuellsten Scene-State erneut lesen, bevor ein neuer Sync.so-Job gestartet wird.
- Wenn ein Shot inzwischen nicht mehr `pending` ist, wird kein Provider-Call ausgelöst.
- Doppelte Sync.so-Jobs für denselben Turn werden damit verhindert.

### 3. Multi-Speaker Face-Targeting verbessern
- `compose-dialog-scene` speichert zusätzlich zu `target_coords` auch `target_bbox` aus der vorhandenen FaceMap.
- `poll-dialog-shots` sendet bei 2+ Sprechern bevorzugt Sync.so `active_speaker_detection.bounding_boxes` statt nur `frame_number + coordinates`.
- Die Bounding Box wird für die Preclip-Frames wiederholt und ist robuster bei mehreren Gesichtern, weil Sync.so nicht nur einen Punkt, sondern die ganze Ziel-Gesichtsregion bekommt.
- Fallback bleibt: wenn keine Box vorhanden ist, werden weiterhin Koordinaten genutzt.

### 4. Retry-Logik im Webhook angleichen
- `sync-so-webhook` darf nicht nach nur einem schnellen Failure denselben Shot final degradieren, während der Poller mehr Retry-Strategien kennt.
- Webhook-Retry und Poller-Retry bekommen dieselbe Retry-Matrix:
  - anderer Sample-Frame
  - andere Temperatur
  - bei Bedarf Wechsel Preclip ↔ Master+segments
  - aber nie Auto-Detect bei Multi-Speaker, damit nicht das falsche Gesicht animiert wird.

### 5. Fehlgeschlagene Szene sauber zurücksetzen
- Die konkret fehlgeschlagene Szene `d47e6e3c-13ca-42b0-abd0-2f3eae919c73` wird zurückgesetzt:
  - `lip_sync_status` zurück auf pending/null
  - `twoshot_stage` leeren
  - `clip_error` leeren
  - `dialog_shots` leeren
  - bestehende Master-Plate und AudioPlan bleiben erhalten.
- Danach kann „Lip-Sync neu rendern“ denselben Clip mit der stabileren Orchestrierung erneut starten.

### 6. Validierung
- Edge-Function-Logs prüfen: pro Turn darf nur noch ein aktiver Dispatch entstehen.
- Datenbankstatus prüfen: kein doppelter `lipsyncing`/Retry-Race mehr.
- Bei 3-Sprecher-Szenen müssen alle Turns entweder echte `output_url`s bekommen oder sauber mit Refund stoppen; kein Zwischenzustand/Loop.

## Dateien, die voraussichtlich geändert werden

- `supabase/functions/poll-dialog-shots/index.ts`
- `supabase/functions/compose-dialog-scene/index.ts`
- `supabase/functions/sync-so-webhook/index.ts`
- Neue Migration für den Szene-Lock/RPC
- Recovery-Migration oder Datenkorrektur für die betroffene Szene
- Memory-Dokumentation zum 3-Sprecher-Orchestrator-Fix

## Erwartetes Ergebnis

- Keine doppelten Sync.so-Dispatches pro Turn mehr.
- Stabileres Face-Targeting bei 3 sichtbaren Personen.
- Webhook und Poller arbeiten nicht mehr gegeneinander.
- 3-Sprecher-Lip-Sync sollte dadurch deutlich näher an die gewünschte 99%-Stabilität kommen, statt an Race-Conditions zu scheitern.