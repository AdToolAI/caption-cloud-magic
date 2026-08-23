# V461 Stufe 1 — Provider Dispatch Parity (READ-ONLY)

Szene `be60d106-6908-4002-95d1-2bd01c5cfa6c`, Run vom 23.08.2026 17:46–17:50 UTC.
Keine Provider-Dispatches, keine Schwellen-Änderung, keine Code-Änderung im Pipelinepfad.
Motion-Schwellen 3.6827 / 15.4057 unverändert.

## 1. Vollständige Attempt-Matrix (Versuche, nicht Endzustände)

| Turn | Sprecher | Attempt | Variante | ASD-Transport | dispatched Objekt | Verdikt | delta_mean |
|---|---|---|---|---|---|---|---|
| 0 | Sarah | 1 | bbox-url-pro | bounding_boxes_url | p1-preclip-820c83402dbd1d4f.mp4 | NOOP | −16.08 |
| 0 | Sarah | 2 | coords-pro-box | inline bounding_boxes | p1-preclip-820c83402dbd1d4f.mp4 | NOOP | −29.04 |
| 1 | Sarah | 1 | bbox-url-pro | bounding_boxes_url | p2-preclip-c1d72815a0e4d0bc.mp4 | OK | — |
| 2 | Samuel | 1 | bbox-url-pro | bounding_boxes_url | p3-preclip-f172333f15d537ba.mp4 | OK | — |
| 3 | Samuel | 1 | bbox-url-pro | bounding_boxes_url | p4-preclip-b43a216e5b6a348a.mp4 | OK | — |
| 4 | Matthew | 1 | bbox-url-pro | bounding_boxes_url | p5-preclip-dc5b9cca8118b9b0.mp4 | NOOP | −1.34 |
| 4 | Matthew | 2 | coords-pro-box | inline bounding_boxes | p5-preclip-dc5b9cca8118b9b0.mp4 | NOOP | −1.29 |
| 5 | Kay Mark | 1 | bbox-url-pro | bounding_boxes_url | p6-preclip-e2d4e5b1ab68b457.mp4 | NOOP | −0.78 |
| 5 | Kay Mark | 2 | (rearm) | — | nie dispatcht | pending | — |

Korrigierte Zählung: `bbox-url-pro` = 6 Dispatches, 3 OK / 3 NOOP. `coords-pro-box` = 2 Dispatches, 0 OK / 2 NOOP — beide auf Turns, die zuvor **auf `bbox-url-pro`** genoopt hatten. Die frühere Lesart „4/4 vs. 3/3" war eine Endzustands-Zählung.

## 2. Asset-Parität (SHA-256-Beweiskette)

| Objekt | bytes | sha256 (16) | dims | fps | frames | dauer |
|---|---|---|---|---|---|---|
| p1-preclip (Turn 0, beide Attempts) | 470 524 | 322a2690c70de69a | 720×720 | 30 | 67 | 2.233 s |
| p5-preclip (Turn 4, beide Attempts) | 252 431 | b843b5afcc499883 | 720×720 | 30 | 62 | 2.000 s |
| p6-preclip (Turn 5) | 199 862 | 6b8b52d6695edd5a | 720×720 | 30 | 47 | 1.567 s |
| Plate | 4 808 741 | 88b3d680094440f8 | 1284×718 | 24 | 361 | 15.042 s |

Pro Attempt:

```text
Turn 0 / Attempt 1 + Attempt 2 (identisch)
  dispatch_video_object = lipsync-plates/shared/be60d106…/p1-preclip-820c83402dbd1d4f.mp4
  dispatch_video_sha256 = 322a2690c70de69a…
  dispatch_video_bytes  = 470524
  dispatch_video_dims   = 720x720 @30fps, 67 frames
  matches_frozen_preclip = true
  matches_plate          = false
```

`matches_plate = false` für **alle** Dispatches. Es ging nie das Plate an den Provider.

**Telemetrie-Defekt bestätigt:** `provider_input_fingerprint.video.bytes = 4 808 741` und `width/height = 1284×718` sind exakt die Plate-Werte und stehen so in **jedem** Preclip-Dispatch. Ursache: `fpVideoDims` fällt auf `plateDims` zurück, wenn `pass.preclip_dims` fehlt (hier durchgehend `null`), und `videoProbe` stammt aus der frühen Plate-Probe. Nur `url_hash`, `frame_count` und `duration_sec` sind assetgetreu. Zusätzlich falsch: `audio.duration_sec = 15` bei allen Passes und `audio.lead_in_sec = 4.87` bei Turn 4 — beide Werte werden von den realen Dateien widerlegt.

## 3. Audio-Parität

Die reale Datei jedes Passes wurde geladen und vermessen:

| Pass | bytes | Dauer | Sprachfenster | Peak |
|---|---|---|---|---|
| 1 (Turn 0) | 194 348 | 2.203 s | 0.08–1.88 s | 0.609 |
| 2 (Turn 1) | 131 726 | 1.493 s | 0.16–1.32 s | 0.830 |
| 3 (Turn 2) | 193 114 | 2.189 s | 0.14–1.84 s | 0.437 |
| 4 (Turn 3) | 164 450 | 1.864 s | 0.12–1.48 s | 0.889 |
| 5 (Turn 4) | 180 942 | 2.051 s | 0.18–1.74 s | 0.891 |
| 6 (Turn 5) | 135 872 | 1.540 s | 0.12–1.16 s | 0.891 |

Beide Turn-0-Attempts verweisen auf **dieselbe URL** (`…pass-1-tight-1787507155095.wav`), gleicher Hash `1e94559f5c39`, gleiche Bytes. `normalized` im Fingerprint ist ausschließlich `!!pass.sync_audio_url`, also ein Pointer-Flag; auf dem Frozen-Retry wird `sync_audio_url` auf **dieselbe** Datei gesetzt (`mode: skipped_v406_frozen_retry`). `voiced_end_sec: null` entsteht, weil die Re-Normalisierungs-Diagnose auf dem Frozen-Retry übersprungen wird. **Kein Payload-Unterschied, reine Telemetrie.** Audio scheidet als Differenz zwischen den Rungs aus, und alle sechs Audios enthalten passendes, sauber liegendes Sprachmaterial.

## 4. Bounding-Box-Parität (geometrisch und zeitlich)

| Turn | Ergebnis | Frames | distinct Boxen | Box (Clip-Raum 720×720) | Fläche | Randkontakt |
|---|---|---|---|---|---|---|
| 0 | NOOP | 67 | 1 | [160, 0, 556, 513] | 39.2 % | ja (y=0) |
| 1 | OK | 45 | 1 | [160, 0, 556, 513] | 39.2 % | ja (y=0) |
| 2 | OK | 66 | 1 | [176, 0, 544, 514] | 36.5 % | ja (y=0) |
| 3 | OK | 56 | 1 | [176, 0, 544, 514] | 36.5 % | ja (y=0) |
| 4 | NOOP | 62 | 1 | [180, 51, 534, 456] | 27.7 % | nein |
| 5 | NOOP | 47 | 1 | [156, 0, 561, 514] | 40.2 % | ja (y=0) |

URL-Variante und Inline-Variante wurden Frame für Frame verglichen:
- Turn 0: URL-Datei 67 Boxen, inline 67 Boxen, jeweils konstant `[160,0,556,513]` — **byteweise dieselbe Sequenz**.
- Turn 4: URL-Datei 62 Boxen, inline 62 Boxen, jeweils konstant `[180,51,534,456]` — identisch.
- Frameanzahl = Preclip-Framecount (67/62), also 1:1-Index-Mapping bei identischen 30 fps; kein Timestamp-vs-Index-Versatz möglich, weil beide Transporte dieselbe Länge und dieselbe Reihenfolge haben und die Boxen über die gesamte Sequenz konstant sind. Koordinatenraum in beiden Fällen Clip-Space 720×720, ganzzahlig, `[x1,y1,x2,y2]`.

Turn 0 und Turn 1 haben eine **identische Box** — einer scheitert, einer gelingt.

## 5. Wochenstatistik (supporting correlation, NOT causal evidence)

Letzte 30 Tage, alle Dispatches: `bbox-url-pro` 298 Dispatches / 48 NOOP (16.1 %), `coords-pro-box` 26 Dispatches / 19 NOOP (73.1 %). Wegen des Ladder-Selection-Bias (nur bereits genoopte Turns erreichen die zweite Rung) ist dieser Wert **keine** Kausalevidenz und wird nur als Kontext geführt.

## 6. Befund

**Fall 4 aus dem Entscheidungsbaum: gleiche Assets, beide Rungs scheitern ähnlich.**

Bei beiden gepaarten Turns (0 und 4) sind Video-Asset (SHA-256-identisch), Audio-Asset, Modell, `sync_mode`, Boxsequenz und Koordinatenraum identisch; der einzige Unterschied ist der ASD-Transport `bounding_boxes_url` → inline `bounding_boxes`. Beide Transporte liefern denselben NOOP. Die Rung ist damit **nicht** die Root Cause; ein Ladder-Umbau würde nichts lösen. Die Ladder schickt zweimal denselben Input an Sync.so.

Ergänzende Beobachtung aus den eingefrorenen Preclips (Bildmaterial, keine neue Regel): Turn 0 zeigt Sarah nahezu im **Profil**, Turn 1 (dieselbe Person, dieselbe Box, dieselbe Geometrie, erfolgreich) zeigt sie **frontal**. Turn 4 zeigt Matthew mit stark **gesenktem Kopf**. Turn 5 ist frontal und sauber und noopt trotzdem. Der Fehlerraum verschiebt sich damit von der Provider-Selection auf die **Eignung des Preclip-Inhalts** (Kopfhaltung/Sichtbarkeit des Mundes) plus einen bislang unerklärten frontalen Fall.

## 7. Konsequenzen für Stufe 2 (kein GO in diesem Dokument)

- 2B: Rung **nicht** entfernen. Stattdessen offen: NOOP-Eskalation, die denselben Input unverändert wiederholt, ist wirkungslos und verbrennt Zeit/Geld.
- 2A: Der belegte Kontraktbruch bleibt Turn 4 mit `face_share = 0.218 < 0.24`. Ein harter Floor existiert im aktuellen Dispatch-Pfad nicht — `preclip_face_share` wird berechnet und geloggt, aber nie ausgewertet. Zu härten sind: `face_share ≥ 0.24`, T9-Mindestgesichtsgröße 144 px im Provider-Raum, Mund-ROI vollständig im Crop, gültiger Identity-Contract. `pose_estimate` wird **nicht** pauschal verboten.
- 2C: Fingerprint muss das real gesendete Asset beschreiben (Bytes/Dims/Content-Type aus der Probe des Dispatch-Assets, plus Content-SHA-256 und unsignierter Objektpfad; keine signierten URLs loggen). Zusätzlich sind `audio.duration_sec` und `audio.lead_in_sec` fehlerhaft und gehören in denselben Fix.
