## Was der Fehler tatsächlich sagt

```text
preclip_face_share_too_low: 13.8 % _crop128px_face41x55
```

Nachgerechnet aus dem Code (`_shared/compute-mouth-centered-crop.ts`, `_shared/pass-face-preclip.ts`):

- Samuels Gesicht auf der Plate ist **41 × 55 px** (Vierer-Shot, er sitzt weit hinten).
- Ziel-Face-Share 0,42 ⇒ idealer Crop = `55 / sqrt(0.42)` ≈ **85 px**.
- `minSize: 128` hebt den Crop auf **128 px** an.
- Die Kontrolle danach rechnet **Flächenanteil**: `41*55 / 128²` = **13,8 %** < Floor 0,15 ⇒ Hard-Fail.

Das heißt: **die Geometrie ist nicht schlecht — der Gate widerspricht sich selbst.** Der Crop wurde von `minSize` künstlich vergrößert und danach genau dafür bestraft. Für jedes Gesicht unter ca. 50 px ist der Floor systematisch unerfüllbar. Zusätzlich vergleicht er eine Fläche (41×55, nicht quadratisch) gegen ein Quadrat; linear füllt das Gesicht 55/128 = **43 %** der Crop-Kante — also exakt das, was die Pipeline eigentlich will.

## Warum das der saubere Schnitt ist

Ein Gate darf nur blocken, was er auch wirklich misst. Deshalb: **ein** Maß, **eine** Stelle, und die endgültige Wirksamkeitsentscheidung bleibt beim serverseitigen Motion-Verdict (Phase 1), der die Realität misst statt sie zu schätzen. Keine zweite spekulative Vorab-Hürde.

## Fix

**1. Ein einziges, lineares Share-Maß (`_shared/compute-mouth-centered-crop.ts`)**
Zusätzlich zu `faceShareInCrop` (Fläche, bleibt Telemetrie) wird `faceSideShare = max(faceW, faceH) / cropSize` zurückgegeben — das Maß, das der Sync.so-Wirksamkeit entspricht.

**2. Gate auf das lineare Maß umstellen (`_shared/pass-face-preclip.ts`)**
- Floor wird `faceSideShare < 0.34` statt `faceArea/crop² < 0.15`.
- Verletzt wird er nur, wenn der Crop wirklich zu weit ist (z. B. nach Expansion-Retries) — nie durch `minSize`.
- `minSize` 128 → 96; wenn `idealSide < minSize`, wird das als `min_size_widened` protokolliert, nicht geblockt.
- Fehlermeldung enthält beide Werte: `side_share=… area_share=… crop=… face=…`.

**3. Upscale-Realitätscheck statt Blindflug**
Ein 128-px-Crop auf 720 px ist 5,6× Upscale — grenzwertig. Neu: `faceSide < 48 px` ⇒ Warnung `preclip_low_source_face` in `syncso_dispatch_log.meta`, Dispatch läuft weiter. Der Motion-Verdict entscheidet danach faktisch.

**4. Kein stiller Hard-Fail der Szene**
`v187_preclip_required_no_fullplate_fallback` bleibt nur für echte Geometriefehler (Crop enthält nachweislich kein isoliertes Gesicht). Gesichtsgröße allein löst ihn nicht mehr aus.

## Technische Details

- `compute-mouth-centered-crop.ts`: `faceSideShare` im Result-Typ; Test für den Fall 41×55/128 ergänzen (muss durchgehen).
- `pass-face-preclip.ts`: `FACE_SHARE_FLOOR` → `FACE_SIDE_SHARE_FLOOR = 0.34`, `minSize: 128` → `96`, Recompute nach Expansion nutzt dasselbe lineare Maß.
- Telemetrie: `preclip_side_share`, `preclip_face_side_px`, `preclip_min_size_widened` in `syncso_dispatch_log.meta`.
- Deploy von `compose-dialog-segments` (zieht die `_shared`-Module), danach Re-Render der Szene zur Verifikation.

## Was nicht passiert

- Keine neuen Tracker, keine Bewegungs-Bboxes, kein Rückgriff auf v334–v341-Geometrie.
- Kein Anfassen von Dispatch-Payload, Webhook oder Mux-Gate (Phase 1 bleibt unverändert).
