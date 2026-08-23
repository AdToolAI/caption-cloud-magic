# V461 Stufe 2 — Face-Gate (A) + Semantik-Dedup (B) + ehrliche Telemetrie (C)

Grundlage: `docs/v461-stage1-dispatch-parity.md` (Stufe 1, read-only, PASS).
Motion-Detektor, Motion-Schwellen und die Provider-Zertifizierung bleiben
unverändert eingefroren.

## A — v400-Face-Gate ist wieder hart

Modul: `supabase/functions/_shared/v461-face-gate.ts` (pure).
Aufruf: `compose-dialog-segments`, unmittelbar vor dem Dispatch-Block, vor
jedem Provider-Call.

| Prüfung | Regel | Verstoß |
| --- | --- | --- |
| Geometrie | Crop-Größe, Output-Größe und Face-Bbox vorhanden | `preclip_geometry_unavailable` |
| T8 | `face_share ≥ 0.24` | `preclip_face_share_below_floor` |
| T9 | `face_size_provider_px ≥ 144` (Face-Bbox × `outputSize/crop.size`) | `preclip_face_size_below_floor` |
| Mund-ROI | Band vollständig im Crop (ungeclampt geprüft) | `preclip_mouth_roi_outside_crop` |
| Identität | eingefrorene Geometrie gehört zu Run/Generation/Pass/Speaker | `preclip_identity_mismatch` |

- Share und Pixelgröße sind **zwei unabhängige** Guards; die normierte Fläche
  ersetzt nie die Pixelgröße.
- Ein reiner Pose-Estimate ohne Mund-Landmark blockt **nicht** — die ROI-Prüfung
  wird als `unchecked` gemeldet (Stufe 1 liefert dafür keine Evidenz).
- Full-Plate-Dispatches (Einzelsprecher) sind `skipped`.
- Verstoß = **Kontraktbruch vor dem Provider**, kein Provider-Noop: Abbruch über
  `failBeforeProviderDispatch` mit `error_class = lipsync_input_contract_violation`,
  Refund, keine NOOP-Ladder. Der V460-Fall (Pass 4, `face_share 0.218`) blockt.

## B — Keine semantisch identische Wiederholung

Modul: `supabase/functions/_shared/v461-input-fingerprint.ts` (pure).

Der Fingerprint trennt zwei Achsen:

- **semantisch**: Video-Objektpfad (ohne Signatur-Token), Bytes, Audio-Objekt +
  Dauer, Framecount, FPS, Box-Sequenz-Hash, Koordinatenraum, Voiced-Windows,
  Modell, `sync_mode`, Speaker-Index.
- **transport**: `bounding_boxes_url` vs. inline, `retry_variant`.

`coords-pro-box` bleibt als Rung erhalten (Stufe 1 hat sie als Ursache
entlastet). Blockiert wird nur die **Wiederholung ohne semantische Änderung**:
`sync-so-webhook` eskaliert nicht mehr, wenn die geplante Rung transport-only
ist und derselbe semantische Fingerprint bereits versendet wurde — der Pass geht
direkt in den Hard-Fail-Pfad (`NOOP_LADDER_EXHAUSTED`, Meta
`v461_semantic_dedup`). `compose-dialog-segments` prüft dasselbe noch einmal als
letzte Linie vor dem Geldausgeben
(`sync_noop_semantic_input_unchanged`). Fehlt der Fingerprint, bleibt das
Verhalten wie bisher (fail-open).

Persistenz am Pass: `semantic_input_fingerprint`, `noop_semantic_fingerprints`
(max. 8 Einträge).

## C — Telemetrie beschreibt die real gesendete Datei

- `pass.preclip_dims` wird beim Rendern des Preclips gesetzt
  (`outputSize × outputSize`).
- Der Fingerprint-Block probt jetzt die **Dispatch-URL** statt der Plate.
- `video.width/height/bytes/content_type` stammen aus der Dispatch-Probe bzw.
  aus der Preclip-Geometrie; ein Plate-Fallback existiert nicht mehr. Unbekannt
  ist `null`, zusätzlich wird `dims_source` (`dispatch_probe` /
  `preclip_geometry` / `unknown`) und der unsignierte `object_path` geloggt.

## Tests

- `src/test/v461-face-gate.test.ts` — 0.218 blockt, 0.306/0.313 passieren,
  Pixel-Floor unabhängig, ROI-Verlassen blockt, Pose-Estimate blockt nicht,
  Identitätsbruch blockt, Full-Plate `skipped`.
- `src/test/v461-input-fingerprint.test.ts` — Token-Invarianz, `bbox-url-pro` ==
  `coords-pro-box` semantisch, Dedup-Entscheidung, Fail-open, Telemetrie ohne
  Plate-Dimensionen.
