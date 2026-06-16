# v129.2.1 — Revised: Doc-Strict ASD im aktiven Preclip-Pfad + Ambiguity-Guard

## Entscheidung

- **GO** für Root-Cause A2 (Floor-Override schließt Nachbar in Samuels Crop ein).
- **NO-GO** für den vorgeschlagenen 6-Zeilen `computeFaceCrop`-Shrink als Haupt-Fix. 30–70 px Crops auf 720 hochskaliert sind kein funktionierender Lipsync-Output, nur ein Wrong-Face-zu-No-Op-Trade.
- **GO** für v129.2.1-revised: **Doc-Strict-Koordinaten im real aktiven Preclip-Dispatch erzwingen**, plus **Ambiguity-Guard** vor Provider-Dispatch. Crop-Geometrie bleibt unverändert (kommt erst in v129.2.2).

## Was passiert (in Worten)

Heute geht jeder Multi-Speaker-Preclip-Pass mit `auto_detect:true` raus. Sync.so wählt dann selbst ein Face im Crop — und wenn der Crop (wegen 220 px Floor bei engen vertikalen Stacks) den Nachbarn enthält, animiert es das falsche Gesicht. Das wird per Audio-Mux zurück auf Samuels Position composited → Samuel wirkt statisch.

v129.2.1 entfernt dieses Raten: Bei Multi-Speaker mit persistierten Plate-Coords + Preclip-Crop werden die Coords ins Preclip-Space transformiert und als `{auto_detect:false, frame_number, coordinates:[x',y']}` gesendet. Sync.so muss dann den Speaker an dieser Stelle selektieren, nicht raten. Falls Coords/Crop fehlen oder transformierte Coords out-of-bounds sind oder der Crop nachweislich mehrdeutig ist (Sibling-Center im Crop) und keine Coords vorhanden — Dispatch blockieren, idempotenter Refund, kein verbrannter Provider-Call.

Crops bleiben in dieser Version exakt wie heute (inkl. 220 px Floor). Die These ist: Sync.so kann mit explizitem `coordinates` im 720×720 auch dann den richtigen Speaker treffen, wenn der Nachbar im Frame liegt. Wenn das stimmt → echter Lipsync-Fix ohne Crop-Verkleinerung. Wenn nicht → bewiesener Grund für v129.3 (bbox_url / Two-Face / Mask).

## Forensik-Vorab (vor Code)

`supabase/functions/compose-dialog-segments/index.ts` enthält in Zeile 3279ff. **bereits** den `usePassPreclip` + Multi-Speaker Doc-Strict-Branch (`asd_mode = preclip_coords_doc_strict`). Die v129.2.0-Forensik zeigt aber `asd_mode = preclip_auto_detect` in Produktion. Vor dem Patch muss geklärt werden, warum dieser Branch in den geloggten Runs nicht griff:

- Sind die Forensik-Rows **vor** dem v129.1-Deploy entstanden? (Timestamp vs. Function-Deployment-Time vergleichen via `supabase--edge_function_logs` + `syncso_dispatch_log.created_at`.)
- Falls **nach** Deploy: Welche Bedingung im if-else greift stattdessen? Wahrscheinlich `passFaceCount`-Pfad oder `usePassPreclip=false`. → 2–3 frische Multi-Speaker-Scenes triggern, `_v102_probe.asd_mode` + `_v1291_block` aus DB lesen.

Ohne diese Klärung wird der Patch im Blindflug gesetzt. Findings landen in `docs/lipsync/v129-2-1-preflight.md`.

## Code-Änderungen (eng gefasst)

Eine Datei: `supabase/functions/compose-dialog-segments/index.ts`.

1. **Doc-Strict-Branch garantiert greifen lassen**: Im `usePassPreclip`-Block sicherstellen, dass Multi-Speaker (`speakers.length >= 2`) immer den Coords-Transform-Pfad nimmt, sobald `plateCoords && cropOk`. Falls die Forensik zeigt, dass eine vorgelagerte Bedingung (z.B. `passFaceCount`-Branch oder ein anderer Early-Return) greift, diese Bedingung entschärfen, sodass Multi-Speaker den v1291-Pfad nicht umgehen kann.
2. **Ambiguity-Diagnose pro Pass berechnen und loggen** in `_v102_probe.preclip_ambiguity`:
   - `sibling_centers_inside_crop: boolean` — alle anderen `faceMap.faces`-Center in Plate-Coords gegen `preclip_crop`-Rect testen.
   - `min_neighbor_dist`, `crop_size`, `crop_x`, `crop_y`, `preclip_face_count`.
   - `risk: "neighbor_inside_crop" | "clean"`.
3. **Hard-Block für unsichere Auto-Detect-Pfade**: Wenn `usePassPreclip && isMultiSpeaker && asd.auto_detect === true && sibling_centers_inside_crop === true` → `DISPATCH_BLOCKED_PAYLOAD_PRECHECK` mit `reason: "auto_detect_with_ambiguous_crop"`, idempotenter Refund über bereits existierenden Refund-Path, kein Sync.so-Call. Dieser Block ist eine Belt-and-Suspenders-Schutz, falls (1) doch nicht alle Pfade abdeckt.
4. **outbound_payload + coord_transform persistieren** wie in v129.1 (unverändert übernehmen) auch für die jetzt zwingend greifenden Multi-Speaker-Passes, damit Forensik per `syncso_dispatch_log.meta.v1291_payload_contract = true` verifizierbar wird.

Bewusst **nicht** in diesem Patch:
- `computeFaceCrop`-Floor ändern.
- `MIN_VIABLE_SYNC_CROP_PX` einführen.
- State-Machine, Retry, Watchdog, Plan-D, UI, `lipsync-2-pro`, Stage 4 A/B, Segments.
- `bounding_boxes_url`-Promotion oder Two-Face-Crops.

Diese gehen in v129.2.2 (Crop-Safety) bzw. v129.3 (Stack-Strategie).

## Canary

- **1 User, 1 frische Multi-Speaker-Scene** mit vertikal eng gestapelten Sprechern (Δy < 100 px, idealerweise das Samuel/Sarah- oder Samuel/Kailee-Layout reproduzieren).
- **Pre-Deploy-Baseline**: aktuelle Produktion auf derselben Scene → `asd_mode = preclip_auto_detect`, Samuel visuell statisch.
- **Post-Deploy-Erwartung** für **alle** Multi-Speaker-Passes (Samuel **und** Sarah/Kailee — Korrektur zum vorherigen Plan, der Pass 1–3 als "unverändert" deklarierte): `asd_mode = preclip_coords_doc_strict`, `meta.v1291_payload_contract = true`, `coord_transform` mit `in_bounds: true`, **alle** Sprecher animieren, Frame-Diff im Mouth-ROI während Audio-aktiver Frames > 0 für jeden Pass.
- **Abbruch-Bedingungen**:
  - Doc-Strict-Coords gesendet, Sync.so liefert weiterhin No-Op → A2-These widerlegt, reopen als **v129.3 (Stack-Strategie)** mit `bounding_boxes_url` oder Two-Face-Crop.
  - `DISPATCH_BLOCKED_PAYLOAD_PRECHECK` feuert für Passes, die heute funktionieren → Block-Bedingung zu scharf, sofort lockern.

## Deliverables

- `docs/lipsync/v129-2-1-preflight.md` (Forensik vor dem Patch: warum v129.1-Branch in geloggten Runs nicht griff).
- Diff in `supabase/functions/compose-dialog-segments/index.ts` (eng auf `usePassPreclip`-Block + neue Ambiguity-Diagnose).
- `docs/lipsync/v129-2-1-implementation.md` (analog zu v129-implementation.md: Vorher/Nachher, Log-Signaturen, SQL-Verifikationsqueries).
- `.lovable/plan.md` Update.
- Memory-Update unter `mem/architecture/lipsync/` nach erfolgreichem Canary.

## Roadmap nach v129.2.1

- **v129.2.2 — Crop-Safety-Guard**: `computeFaceCrop`-Floor sauber überarbeiten, **aber** `MIN_VIABLE_SYNC_CROP_PX = 160` enforcen — wenn sicherer Single-Face-Crop darunter fällt, `PASS_FAILED_PRECLIP_AMBIGUOUS` + Refund statt unbrauchbarer Tiny-Crop-Dispatch. Kommentar präzisieren: "hard cap only when cap < 160, quality floor wins in 160–220 band".
- **v129.3 — Stack-Strategie**: `bounding_boxes_url`, Two-Face/Twoshot-Crop, Mouth-Mask-Compositing, Layout-Preflight für Layouts, die mit reinen Coords nicht lösbar sind.
