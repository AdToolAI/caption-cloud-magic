---
name: V461 Face-Gate + Semantik-Dedup + ehrliche Dispatch-Telemetrie
description: v400-Face-Gate (face_share 0.24 / 144 Provider-Pixel / Mund-ROI / Identität) blockt hart vor dem Provider; NOOP-Ladder wiederholt keinen semantisch identischen Input mehr; Dispatch-Telemetrie zeigt nie wieder Plate-Werte
type: architecture
---

**VERBINDLICH ab V461.** Motion-Detektor und Motion-Schwellen bleiben eingefroren.

## A — Face-Gate (hart, vor jedem Provider-Dispatch)

`supabase/functions/_shared/v461-face-gate.ts` ist die einzige Stelle, die über
die Eignung eines Preclips entscheidet. Floors: `face_share ≥ 0.24` UND
`face_size_provider_px ≥ 144` (unabhängige Guards, Pixelgröße = Face-Bbox ×
`outputSize/crop.size`). Zusätzlich: Mund-ROI vollständig im Crop (ungeclampt
geprüft) und Geometrie-Identität == Dispatch-Identität.

Ein Verstoß ist ein **Kontraktbruch vor dem Provider**
(`lipsync_input_contract_violation`), kein Provider-Noop: Abbruch mit Refund,
keine NOOP-Ladder. Ein reiner Pose-Estimate ohne Mund-Landmark blockt NICHT.
Full-Plate-Dispatches sind out of scope.

## B — Keine semantisch identische Wiederholung

`_shared/v461-input-fingerprint.ts` trennt **semantischen** Input (Video-/Audio-
Objektpfad ohne Signatur-Token, Boxen, Framecount, FPS, Koordinatenraum, Modell,
sync_mode, Speaker) vom **Transport** (bounding_boxes_url vs. inline, Variante).

Stufe 1 hat bewiesen: `bbox-url-pro` und `coords-pro-box` senden denselben
semantischen Input. Die Rung wird deshalb NICHT entfernt — aber eine
transport-only Wiederholung mit bereits gesehenem Fingerprint wird verweigert
(Webhook primär, Dispatcher als letzte Linie). Ohne Fingerprint: fail-open.

## C — Telemetrie

`provider_input_fingerprint.video` beschreibt die tatsächlich gesendete Datei
(Probe der Dispatch-URL + `preclip_dims`). Plate-Fallback ist verboten;
unbekannt ist `null` mit `dims_source: "unknown"`.

Belege: `docs/v461-stage1-dispatch-parity.md`,
`docs/v461-stage2-face-gate-and-dedup.md`.
Tests: `src/test/v461-face-gate.test.ts`, `src/test/v461-input-fingerprint.test.ts`.
