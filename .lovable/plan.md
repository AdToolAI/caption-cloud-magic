## Was der Log tatsächlich zeigt (verifiziert in `syncso_dispatch_log`)

Für die letzten 4 Szenen (heute 14:30 und davor) ist das Muster identisch:

- `engine = "sync-segments"` (auch bei 1 Sprecher — Toggle-Pfad geht immer über `compose-dialog-segments`, das ist so gewollt).
- Jede Szene: erst `FACE_GATE_PROBE_UNAVAILABLE` / `face_probe_unavailable`, dann `DISPATCHED` mit HTTP 201.
- **`face_share_in_preclip`, `mouth_center_offset_px`, `noop_mouth_yavg`, `detector_used`, `retry_count` sind für ALLE Zeilen NULL.**

Damit ist klar, dass Lip-Sync zwar dispatcht wird, aber der v247/v248-Pfad, den wir letzte Runde gebaut haben, in der Praxis nicht scharf ist.

## Diagnose — drei Bugs, die zusammen "kein Lip-Sync" erzeugen

### 1. v247 Preclip-Metriken werden nicht persistiert (Hauptursache)
`compose-dialog-segments/index.ts:4998-5008` schreibt `preclip_anchor`, `preclip_face_share`, `preclip_mouth_offset_px` auf das lokale `pass`-Objekt und loggt sie nur nach stdout. Kein einziger `logSyncDispatch({...})`-Call reicht diese Felder als `face_share_in_preclip` / `mouth_center_offset_px` / `detector_used` weiter. Der Logger akzeptiert sie (`_shared/syncso-preflight.ts:985-989`), aber niemand füllt sie.

Folge: v248-Slice-4-Ladder in `report-lipsync-motion-probe` kann nicht sehen, ob der Preclip Face-Share ≥ 0.42 hatte, entscheidet blind, und der Coord-Pro-Box-Retry feuert bei kleinen Gesichtern nicht.

### 2. Face-Gate-Probe ist strukturell offline (`FACE_GATE_PROBE_UNAVAILABLE` in 100% der Dispatches)
Der v130-Face-Gate liefert konsistent `probe_unavailable`. `compose-dialog-segments:6428` lässt Dispatch trotzdem durch ("non-blocking signal"), womit die Coord-Snap-Sicherung nie greift. Ursache muss ich in der Slice-Untersuchung noch nachfassen (Gemini-Frame-Extract 5xx vs. Rekognition-Key vs. `probeEndpoint`-URL) — Datenpunkt: `raw_reply` / `http_status` in `meta.face_gate` der letzten Fehler.

### 3. Client-Yavg-Probe hat keine Preclip-Signale, mit denen sie eskalieren könnte
`useMouthYavgProbe` läuft in `SceneClipProgress`, aber weil (1) NULL bleibt, kann `report-lipsync-motion-probe` seine Rungs nicht sauber staffeln — jeder Fall sieht gleich aus.

## Plan v249 — Slice A/B/C

### Slice A — Preclip-Metriken durchreichen (fixt Hauptursache)
1. In `supabase/functions/compose-dialog-segments/index.ts` bei jedem `logSyncDispatch({...})`, der nach dem Preclip-Render steht (Dispatched, Coord-Snap, Face-Gate-Probe-Unavailable, Preflight-Blocked, Sync.so-Error), zusätzlich folgende Top-Level-Felder mitgeben:
   - `face_share_in_preclip: (pass as any).preclip_face_share ?? null`
   - `mouth_center_offset_px: (pass as any).preclip_mouth_offset_px ?? null`
   - `detector_used: (pass as any).preclip_anchor ?? null` (Werte: `mouth-centered` | `face-fallback` | `plate-fallback`)
   - `retry_count: currentAttempt ?? 0`
2. Marker `v249_preclip_metrics_persisted` im `meta` des jeweiligen Dispatch-Rows.
3. Test: nach nächstem Cinematic-Sync-Pass müssen die vier Spalten in `syncso_dispatch_log` gefüllt sein.

### Slice B — Face-Gate-Probe-Diagnose (nicht blind fixen)
1. Query auf `syncso_dispatch_log.meta->face_gate` der letzten 20 `FACE_GATE_PROBE_UNAVAILABLE`-Zeilen: `raw_reply`, `raw_error`, `http_status`.
2. Danach entscheiden:
   - Wenn `http_status = 429` oder `5xx` → nichts patchen, Retry-Ladder greift bereits.
   - Wenn `raw_error` ein fehlender Endpoint/Key ist → gezielt reparieren (config oder Secret setzen, kein Blind-Code-Push).
3. Solange Probe offline ist, in Slice A `detector_used` explizit auf `face-fallback` mappen, damit die yavg-Ladder das erkennt.

### Slice C — Ladder-Schärfung im Motion-Probe-Consumer
1. In `supabase/functions/report-lipsync-motion-probe/index.ts` (Slice-4-Consumer) beim yavg < 4.0-Fall zusätzlich lesen: letzter Dispatch-Row der Szene, Feld `face_share_in_preclip`.
2. Regel:
   - `face_share_in_preclip < 0.30` und `retry_count < 2` → dispatch mit `retry_variant='mouth-anchored-zoom'` (bereits vorhandener Preclip-Zoom).
   - `face_share_in_preclip >= 0.30` und `retry_count < 2` → weiterhin `coords-pro-box`.
   - `retry_count >= 2` → Hard-Fail + Refund (bestehender Pfad).
3. Marker `v249_slice_c_face_share_gate` im `syncso_dispatch_log`.

## Was NICHT im Plan ist

- **Router-Änderung**: `sync-polish` vs. `sync-segments` in `sceneEngineRouter` bleibt wie es ist. Beide Wege gehen bewusst durch `compose-dialog-segments` — kein Bug.
- **UI-Änderungen** an `SceneClipProgress` / `SceneCard`: Keine, Fix ist rein serverseitig.
- **Neue Migrationen**: nicht nötig — alle vier Spalten (`face_share_in_preclip`, `mouth_center_offset_px`, `noop_mouth_yavg`, `detector_used`, `retry_count`) existieren bereits.

## Akzeptanzkriterien

1. Nach dem nächsten Cinematic-Sync-Pass zeigt `SELECT face_share_in_preclip, detector_used, mouth_center_offset_px FROM syncso_dispatch_log ORDER BY created_at DESC LIMIT 5` echte Werte.
2. Bei einem Pass mit `noop_mouth_yavg < 4.0` UND `face_share_in_preclip < 0.30` erscheint eine automatische Retry-Dispatch-Zeile mit `retry_variant='mouth-anchored-zoom'`.
3. Logs enthalten Marker `v249_preclip_metrics_persisted` + `v249_slice_c_face_share_gate`.
