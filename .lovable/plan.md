## Befund

Nein — die Pipeline ist aktuell noch nicht vollständig so, wie Sync.so sie erwartet.

Die Logs zeigen zwei unterschiedliche Probleme:

1. **Der v44-Webhook wird nicht verarbeitet**
   - `compose-dialog-segments` speichert neue Jobs als `version: 44`.
   - `sync-so-webhook` akzeptiert aber nur `41 | 42 | 43`.
   - Ergebnis: Sync.so meldet `FAILED`, aber unser Backend ignoriert den Terminal-Webhook. Die Szene bleibt auf `running/rendering`, Retry/Refund greifen nicht sauber.

2. **Sync.so verwirft weiterhin die `segments` intern**
   - Im Sync.so-Failure-Echo fehlen die `segments` komplett.
   - Das deutet darauf hin, dass der Request zwar angenommen wird, aber die Kombination noch nicht robust genug ist.
   - Besonders auffällig: v44 sendet `model: "lipsync-2-pro"`, obwohl Sync.so `sync-3` als Default/robusteres Modell für komplexe Multi-Person-Shots beschreibt und unser eigener Code bereits sync-3 als schwierige Multi-Speaker-Fallback-Variante kennt.

## Plan

### 1. Webhook-Gate für v44 reparieren

In `sync-so-webhook/index.ts`:

- `version === 44` in den Branch für `engine: "sync-official-segments"` aufnehmen.
- Damit werden `COMPLETED`, `FAILED`, `REJECTED`, `CANCELED` für v44 korrekt verarbeitet.
- Retry, Refund und finales Speichern des Output-Videos greifen dann wieder.

### 2. Offiziellen Multi-Speaker-Payload auf v45 härten

In `compose-dialog-segments/index.ts`:

- Für 3+ Sprecher einen separaten v45-Konstantenpfad verwenden.
- Modell auf `sync-3` setzen, statt `lipsync-2-pro`, weil Sync.so `sync-3` für schwierige Multi-Person-/Obstruction-/Static-Lip-Fälle empfiehlt.
- `options.sync_mode` von `loop` auf `cut_off` ändern, damit Segment-Audio nicht wiederholt wird.
- In jedem Segment explizit setzen:

```text
optionsOverride.active_speaker_detection = {
  auto_detect: false,
  frame_number: <frame im Segment>,
  coordinates: [x, y]
}
```

- `refId` bleibt camelCase und muss exakt mit `audioInput.refId` übereinstimmen.

### 3. Sync.so-Kompatibilität validieren, bevor ein Job bezahlt wird

Vor Dispatch:

- Prüfen, dass jedes Segment einen gültigen `audioInput.refId` hat.
- Prüfen, dass alle `refId`s im `input[]` existieren.
- Prüfen, dass Koordinaten innerhalb der echten Video-Dimensionen liegen.
- Prüfen, dass Segmentzeiten gültig und sortiert sind.
- Den finalen Payload als kompaktes Diagnose-Summary loggen: Modell, Segmentanzahl, RefIds, ASD-Modus, Video-Dimensionen.

### 4. Alte fehleranfällige Bounding-Box-Fallbacks entschärfen

Im v5/Fallback-Bereich:

- Keine per-frame `bounding_boxes` mehr mit hardcoded 24fps erzeugen.
- Entweder auf `frame_number + coordinates` umstellen oder nur dann Bounding-Boxes nutzen, wenn eine echte Frame-Count/FPS-Probe verfügbar ist.
- Das verhindert denselben Fehler, den v43 bereits ausgelöst hat.

### 5. Failed/Stuck-Szenen sauber zurücksetzen

Nach Deploy:

- Die aktuell fehlgeschlagenen Szenen `4992cff4...` und `7dcdcfc7...` sauber auf `pending` setzen.
- `dialog_shots` leeren, `clip_error` entfernen.
- Danach v45 neu triggern.
- Bestehende Refund-Logik bleibt idempotent, damit keine Doppelgutschrift entsteht.

### 6. Dokumentation/Memory aktualisieren

- v43/v44-Memory als superseded markieren.
- Neue Memory `v45-sync3-official-segments` anlegen.
- Core-Memory auf v45 aktualisieren: `sync-3`, `segments[]`, `refId`, `frame_number + coordinates`, `auto_detect:false`, `cut_off`, Webhook akzeptiert v41–v45.

## Erwartetes Ergebnis

- Sync.so-Webhook verarbeitet v45 terminal korrekt.
- Multi-Speaker-Szenen laufen über den robusteren Sync.so-Standardpfad.
- Fehlversuche führen zu Retry oder Refund statt zu hängenden Szenen.
- Die Pipeline ist danach deutlich näher an Sync.so-Doku und dem aktuellen Modellverhalten.