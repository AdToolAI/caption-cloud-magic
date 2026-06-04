## Ziel

Wir richten den Single-Call Segments-Pfad **wortwörtlich** nach der offiziellen Sync.so-Doku aus (`docs.sync.so/developer-guides/segments` + `/speaker-selection`) und beweisen mit einem echten Test-Call, was die API akzeptiert, bevor wir Production-Code umstellen. v5 Multi-Pass bleibt bis zum Beweis aktiv.

## Befund aus der aktuellen Doku-Lektüre

Direkt aus `docs.sync.so/developer-guides/segments`:

| Feld | Doku sagt | Unser v47 macht |
|---|---|---|
| `model` | `"lipsync-2"` in **allen** Multi-Speaker- und Segments-Beispielen | `"lipsync-2-pro"` ❌ |
| `input[].ref_id` | snake_case (Python) bzw. ohne `ref_id` (TS) | nur `refId` camelCase |
| `segments[].audioInput.refId` | camelCase | ✅ camelCase |
| `optionsOverride.active_speaker_detection.frame_number/coordinates` | snake_case | ✅ snake_case |
| `options.sync_mode` | snake_case | ✅ |
| Webhook-Feld | `webhookUrl` (camelCase) im REST-Body | ✅ |

→ Die wahrscheinlichste Wurzelursache der reproduzierbaren „unknown error" ist **`lipsync-2-pro` + `segments[]`**. Die Doku nennt `lipsync-2-pro` an keiner Stelle als kompatibel mit Segments; die Multi-Speaker-Beispiele nutzen ausschließlich `lipsync-2`.

## Vorgehen

```text
1. Doku-Audit (read-only)        →  Diff-Tabelle fixieren
2. Live Probe-Call gegen Sync.so →  beweisen welcher Payload akzeptiert wird
3. v49 implementieren            →  nur das, was Sync.so per Test bestätigt
4. Cleanup v47 + Memory          →  alte Pfade abklemmen, neue Regel speichern
```

### Schritt 1 — Doku-Audit (manuell, schon erledigt)
Resultat siehe Tabelle oben. Kernregel: **Segments + Multi-Speaker = `lipsync-2`**, nicht `-pro`.

### Schritt 2 — Live Probe-Call (kein User-Geld)
Neue Test-Edge-Function `sync-so-probe` (admin-only, JWT-gated), die das offizielle Beispiel mit unseren echten Assets durchspielt:

- Input = die `source_clip_url` der bereits bezahlten Szene `61edb887…` und ihre 3 Speaker-Track-URLs aus `audio_plan.twoshot.tracks`.
- Vier Probe-Varianten nacheinander, jeweils Polling bis `COMPLETED` oder `FAILED`:
  1. `lipsync-2` + `segments[]` + ASD `frame_number/coordinates` (Doku-exakt)
  2. `lipsync-2` + `segments[]` ohne ASD (auto)
  3. `lipsync-2-pro` + `segments[]` + ASD (= unser aktueller v47-Payload, Kontrollgruppe)
  4. `lipsync-2` + nur `options.active_speaker_detection` ohne Segments (1-Sprecher-Sanity)
- Output: Tabelle mit `model | segments | status | error | duration` als JSON-Response.

Das gibt uns in einem einzigen Tool-Lauf den faktischen Beweis, welche Kombination Sync.so wirklich akzeptiert.

### Schritt 3 — v49 implementieren (nur das, was Test bestätigt)
Annahme nach Probe (zu validieren): Variante 1 grün, Variante 3 rot.

- `compose-dialog-segments`: Konstante `LIPSYNC_MODEL` bleibt `lipsync-2-pro` **für den v5 Per-Speaker-Pfad** (1 Audio pro Call, dort funktioniert -pro). Neu: `LIPSYNC_SEGMENTS_MODEL = "lipsync-2"` ausschließlich im Single-Call-Segments-Block (heute „v47").
- v47-Block umbenennen auf v49, State-Felder konsistent (`version: 49`, `engine: "sync-official-segments"`, `model: "lipsync-2"`).
- `input[]` bekommt beide Schlüssel `ref_id` (snake_case) UND `refId` (camelCase), wie schon v46-Memo beschreibt — schadet nicht, deckt beide Parser ab.
- Pre-Dispatch-Validator bleibt: jede `segments[i].audioInput.refId` muss in `input[]` existieren, sonst 422 vor dem Sync.so-Call.
- Diagnostic-Log: `v49_official_segments_payload model=lipsync-2 ...`.

### Schritt 4 — Webhook + Cleanup
- `sync-so-webhook` Versions-Gate erweitern auf `41..49`.
- `COMPLETED` für v49 setzt `dialog_shots.status='done'`, `clip_url = outputUrl`, `lip_sync_applied_at`. Kein Audio-Mux nötig — Single-Call hat schon das richtige gemischte Audio drin (sync_mode `cut_off`).
- `FAILED` für v49 → genau ein Retry (mit `repair_audio: true`), danach harter Fail + idempotenter Refund. Kein Fallback in v5 (das wäre wieder Vermischung).
- Memory: `mem://architecture/lipsync/v49-docs-exact-segments` neu, `v46`/`v47` als superseded markieren, `mem/index.md` Core-Regel aktualisieren auf „Single-Call Segments nutzt **lipsync-2**, niemals lipsync-2-pro".

### Was NICHT passiert
- Kein Anfassen des v5 Multi-Pass für 1–2 Sprecher (läuft stabil).
- Kein Audio-Mux-Lambda-Pfad für v49 (Single-Call hat fertiges Audio).
- Kein automatischer v49→v5 Hybrid-Fallback (du hast in Option A explizit nur eine Pipeline gewollt).
- Keine UI-Änderungen.

## Akzeptanzkriterien

1. `sync-so-probe` zeigt schwarz auf weiß: Variante 1 (`lipsync-2` + segments) ergibt `COMPLETED` mit korrektem `outputUrl`, Variante 3 (`lipsync-2-pro` + segments) ergibt `FAILED`/unknown error. Damit ist die Memory-Behauptung „official single-call ist strukturell broken" widerlegt — und wir wissen warum.
2. Frischer Generate-Run auf Szene `61edb887…` produziert `v49_official_segments_payload model=lipsync-2 …` im Log und endet in `COMPLETED` mit fertigem MP4, alle 3 Sprecher korrekt lipgesynct.
3. Keine Szene wird mehr als „done" markiert, wenn ein Sprecher fehlt (v48-Schutz bleibt).
4. Wallet wird bei Fehler refundiert (idempotent).

## Risiken

- Probe kostet ~3× 9 ¢/s × ~10 s = ~3 € echtes Sync.so-Budget. Klein, aber real.
- Wenn die Probe zeigt, dass auch `lipsync-2` + `segments[]` scheitert, fallen wir auf Option B (bei v5 bleiben) zurück und sparen den Code-Umbau.
