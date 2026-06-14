## Diagnose

**Do I know what the issue is?** Ja.

Der neue Fehler ist **nicht** mehr der v118-Endlosloop. Er passiert früher: `compose-dialog-segments` blockiert schon im eigenen Face-Gate, bevor Sync.so überhaupt einen Job bekommt.

**Konkreter Fall:** Szene `90116518-0630-4379-b2da-b0e02b3b2026`

- Lovable Cloud Logs zeigen:
  - `plate-identity faces=4 resolved=4/4`
  - alle vier Gesichter wurden auf der gerenderten Plate erkannt
  - trotzdem blockiert das lokale Gate mit `plate_target_face_missing` für Samuel, Kailee und Sarah
- Offizielle Sync.so-Anleitung sagt:
  - Für Multi-Personen-Videos entweder `frame_number + coordinates` auf einem Frame verwenden, wo der Zielsprecher sichtbar ist
  - oder `bounding_boxes_url` verwenden; dann ersetzt die Bounding-Box-Datei `frame_number + coordinates`
- Unser Code macht aktuell zusätzlich ein eigenes striktes Multi-Frame-Target-Gate. Dieses Gate ist bei der Szene ein False Positive, obwohl `plate_identity=4/4` sauber ist.

## Ziel

Lip-Sync darf nicht mehr an unserem eigenen Gate scheitern, wenn die finale Plate bereits alle erwarteten Gesichter erkannt und zugeordnet hat. Danach muss Sync.so mit einem offiziellen, deterministischen Payload angesteuert werden.

## Umsetzung v119

### 1. Strict Face-Gate entschärfen

In `supabase/functions/compose-dialog-segments/index.ts`:

- Wenn `plateIdentityMap.resolvedCount >= speakers.length`, wird `plate_target_face_missing` **nicht mehr hart geblockt**.
- Das Gate wird dann nur noch als Diagnose geloggt: `v119_face_gate_SOFT_WARN`.
- Hart geblockt wird weiterhin nur, wenn wirklich zu wenige Gesichter auf der Plate erkannt wurden.

### 2. Offiziellen Sync.so-Pfad bevorzugen

Für Multi-Speaker mit sauberer `plateIdentityMap`:

- Default-Dispatch auf `bbox-url-pro` setzen.
- `options.active_speaker_detection` bekommt:
  - `auto_detect: false`
  - `bounding_boxes_url: <JSON URL>`
- Kein `frame_number` und keine `coordinates`, weil Sync.so laut offizieller Anleitung bei Bounding Boxes genau diesen Pfad vorsieht.

### 3. Bounding-Boxes direkt aus Plate-Identity verwenden

- Für jeden Speaker wird die erkannte echte Plate-BBox genutzt, nicht die Anchor-reskalierte FaceMap.
- Die JSON-Datei bleibt im offiziellen Format:

```json
{
  "bounding_boxes": [[x1, y1, x2, y2], null]
}
```

- Ein Eintrag pro Frame, wie Sync.so es verlangt.

### 4. Sync-3 Payload doc-strict halten

Für `sync-3`:

- Nur dokumentierte Optionen verwenden:
  - `sync_mode`
  - `active_speaker_detection`
- Keine experimentellen Optionen wie `temperature` oder `occlusion_detection_enabled` in diesem Pfad.

### 5. Fehlerstatus sauber machen

- `clip_error` soll künftig klar sagen, ob es ein echter Plate-Fehler war oder nur ein Gate-Warnhinweis.
- Keine erneute Credit-Belastung bei Retry/Reset.
- Idempotenter Refund bleibt für echte Provider-/Render-Failures bestehen.

### 6. Szene nach Implementierung zurücksetzen

Nach dem Code-Fix:

- Szene `90116518-0630-4379-b2da-b0e02b3b2026` aus dem falschen `plate_target_face_missing`-Status lösen.
- Lip-Sync-Status auf retry-fähig setzen, damit „Sauber neu starten“ oder Auto-Trigger den neuen v119-Pfad nutzt.

## Validierung

Nach Umsetzung prüfe ich:

- Edge-Function-Logs enthalten keinen `FACE-GATE BLOCK` mehr für diese Szene.
- Es wird ein Sync.so Dispatch mit `bbox-url-pro` und `bounding_boxes_url` erzeugt.
- Bei Sync.so wird nicht mehr unser eigener `plate_target_face_missing` vorab ausgelöst.
- Falls Sync.so selbst fehlschlägt, greift Circuit Breaker + Refund statt Endloslauf.

## Rückfalloption

Falls Sync.so trotz offiziellem `bounding_boxes_url` auf voller 4-Personen-Plate scheitert, bleibt als nächster Schritt nur eine klare Architekturentscheidung: pro Speaker ein echter einzelner Dialog-Shot/Plate-Crop, dann Sync.so `auto_detect:true`, danach Stitching zurück in die Szene. Das wäre stabiler, aber teurer/langsamer.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>