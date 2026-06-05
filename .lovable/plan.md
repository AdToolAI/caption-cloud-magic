## Antwort vorab: Nein, wir sind noch NICHT 1:1 mit Sync.so

Die letzte Szene `57a28235…` ist nach 11 min in der **v5 Multi-Pass Fan-out**-Schleife verbrannt (`engine: "sync-segments"`, `version: 5`, `retry_variant: coords-pro → coords-pro-box → sync3-coords`), nicht im neuen v49 Single-Call. Sync.so hat in allen 7 Anläufen `"An unknown error occurred."` zurückgegeben — exakt das Symptom, das die Juni-Probes als "bounding_boxes + per-Pass-Coords" identifiziert haben.

### Warum v49 nicht gegriffen hat
In `compose-dialog-segments/index.ts` (Zeile 805 + 819–849) ist v49 hinter zwei Gates eingesperrt:

1. `speakers.length >= 3` ✓ (3 Sprecher — okay)
2. **Plate-native Face-Detect muss ≥ N Gesichter finden**, sonst `useV41Official = false` → Rückfall auf v5 Fan-out.

Die Hailuo-Plate in deinem Screenshot zeigt die Sprecher **mit abgeschnittenen Köpfen** — Gemini Face-Detect findet darin < 3 Gesichter, also greift v49 nie. Wir landen auf der v5-Schleife, die per Doku *nicht* das ist, was Sync.so vorgibt.

### Was Sync.so wirklich vorgibt (Doku-Stand)
```text
POST /v2/generate
{ model: "lipsync-2",
  input: [ {type:"video",url}, {type:"audio",url,ref_id:"a1"}, {type:"audio",url,ref_id:"a2"}, … ],
  segments: [ { startTime, endTime, audioInput:{ refId, startTime, endTime } }, … ],
  options: { sync_mode: "cut_off" } }
```
ASD ist **optional**. Wenn man sie setzt, sind die 4 Modi *mutually exclusive*:
`auto_detect` | `v3` | `frame_number+coordinates` | `bounding_boxes(_url)`.

Unsere v49 ohne ASD = exakt Doku-Beispiel "Multiple Segments with Multiple Audio". ✓
Unsere v5 mit `bounding_boxes` + `coords` zugleich = Doku-Verstoss (mutually exclusive). ✗

### Differenzen, die wir noch haben

| Bereich | Sync.so Doku | Wir aktuell | Fix |
|---|---|---|---|
| Multi-Speaker Pfad | 1 Call, `segments[]` | v5 = N Calls, fan-out | v49 immer nehmen |
| v49-Gate | nur Audio + Video Pflicht | wir verlangen zusätzlich N Face-Boxes auf Plate | Face-Gate entfernen |
| Fallback ASD | `auto_detect` legal | v5 nutzt `bounding_boxes` + coords gleichzeitig | auf `auto_detect` umstellen |
| `track_url` pro Sprecher | Pflicht für Multi-Audio | wir prüfen es ✓ | bleibt |

## Plan — "Wirklich 1:1 mit Sync.so"

### Schritt 1 — v49 Face-Gate entfernen
In `compose-dialog-segments/index.ts` Block Z. 819–851 (`v47 plate-native face repair`) komplett deaktivieren. Coords werden in v49 sowieso nicht mehr verwendet (`void cx; void cy`), also keine Funktion mehr — der Gate killt nur Szenen mit Crop/Long-Shot-Plates.

→ `useV41Official` bleibt true, sobald `speakers.length >= 3` UND jeder Sprecher ein `track_url` hat (Zeile 909-Check bleibt der einzige berechtigte Skip).

### Schritt 2 — Wenn v49 trotzdem nicht passt: Doku-konformer Fallback
Statt v5 Fan-out (nicht doku-konform), neuer 1-Call-Fallback `v49b` mit `optionsOverride.active_speaker_detection: { auto_detect: true }` pro Segment. Das ist explizit in der Doku als legaler Modus gelistet und kombiniert NICHT mit Coordinates → kein "unknown error".

### Schritt 3 — v5 Fan-out abklemmen für 3+ Sprecher
Den `bounding_boxes` / `coords-pro-box` / `sync3-coords` Retry-Ladder (Z. ~1700–2050) für `speakers.length >= 3` deaktivieren. Wenn v49 + v49b beide failen → sauber refunden + Szene als `failed` markieren statt 15 min Provider-Loops.

1- und 2-Sprecher-Szenen bleiben unverändert auf v5 (war stabil).

### Schritt 4 — Cleanup
- `mem://architecture/lipsync/v49-docs-exact-segments.md` aktualisieren: Face-Gate entfernt + `auto_detect`-Fallback dokumentiert.
- Szene `57a28235…` einmalig zurücksetzen, damit der nächste Trigger über v49 läuft.
- `compose-dialog-segments` neu deployen.

### Trade-off
Ohne Coords delegieren wir die Speaker-Zuordnung komplett an Sync.so Auto-ASD. Bei sehr ähnlichen Stimmen kann es zu Vertauschungen kommen — laut Doku ist `auto_detect` aber für Multi-Speaker-Szenen der empfohlene Modus, und es liefert vorhersagbar (kein "unknown error" wie der `coords`-Pfad).

### Akzeptanz
- Log-Marker `v49_official_segments_payload model=lipsync-2 asd=auto` erscheint für alle 3+ Sprecher Szenen.
- Keine `engine: "sync-segments", version: 5` Zeilen mehr für 3+ Sprecher in `composer_scenes`.
- Failure-Zeit < 4 min statt 15 min (kein Retry-Ladder).
