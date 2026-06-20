## Befund (warum v152 nicht gegriffen hat)

Live-Logs von `compose-dialog-segments` für die letzte Multi-Speaker-Szene:

- `[v82-gate] ... resolved=0 ... → variant=coords-pro (fallback-identity-unresolved)`
- `payload_video_url=.../p4-preclip-...mp4`, `active_speaker_detection={ auto_detect: true }`
- Kein einziger Log-Treffer für `v152_unified_bbox_primary` oder `bbox-url-pro`

v152 wurde also gar nicht aktiviert, weil das Gate zu eng (`resolvedCount > 0`) war UND der alte Preclip-/Auto-Detect-Code weiter im File hängt und automatisch greift. Genau das ist deine Beanstandung: der alte Pfad sollte weg sein, ist aber noch da.

## Ziel

Single-Path-Pipeline. Es gibt nur noch **plate-native bbox-url-pro**. Kein Preclip-Render, kein `auto_detect`, kein Silent-Downgrade auf `coords-pro`. Wenn der Pfad nicht sauber vorbereitet werden kann → sofortiger Hard-Fail mit Refund und klarer User-Message.

## Plan (v153 — „Preclip is dead“)

1. **Legacy-Pfade aus `compose-dialog-segments/index.ts` entfernen**
   - `wantPassPreclip`-Block + `EXPANSION_LADDER`-Loop (~Z. 3543–3878) → löschen.
   - `renderPassFacePreclip`-Import + alle Aufrufe → löschen.
   - Batch-Preclip-Prefetch-Block (`canBatchPrefetch`, `renderOnePassPreclip`, ~Z. 3217–3470) → löschen.
   - v126 Preclip-Hard-Fail-Guard → löschen (überflüssig, weil Preclip nicht mehr existiert).
   - v148 NOOP-Preclip-Bypass, v114 Stale-Preclip-Probe, v143 Preclip-Rehost → löschen.
   - Alle `preclip_url / preclip_render_id / preclip_crop / preclip_*` Felder im State + Logs entfernen.
   - `retryVariant`-Enum auf nur noch `bbox-url-pro` reduzieren. `coords-pro`, `coords-pro-box`, `coords-pro-lp2pro`, `sync3-coords`, `auto-pro`, `auto-standard` als Variant-Werte entfernen.
   - In `sync-so-webhook`: NOOP-Ladder + alle Retry-Variant-Eskalationen rausnehmen. NOOP → einmal Re-Dispatch mit fresh bbox, sonst Hard-Fail.

2. **Einzig zulässiger Dispatch-Branch**
   - `active_speaker_detection = { auto_detect: false, bounding_boxes_url: <signed-url> }`.
   - Kein `frame_number`/`coordinates`-Branch, kein `auto_detect: true`-Branch im Live-Pfad.
   - `sync_mode = "cut_off"`, Modell hartcodiert `sync-3`.

3. **Plate-native bbox als Single Source of Truth**
   - Pro Sprecher die Box in dieser Reihenfolge wählen:
     1. `speakerPlateBboxes[pass.speaker_idx]` (plate-native, kommt aus `resolvePlateFaceIdentities` Slot/Identity).
     2. `plateIdentityMap` matched by characterId.
     3. Synthetisch aus `pass.coords` + plate dims (nur N=1).
   - Sanity-Gate bleibt: Boxfläche zwischen 0.2 % und 45 % der Plate-Fläche, `nonNullFrames ≥ 1`.

4. **Hard-Fail-Policy statt Silent-Downgrade**
   Vor Dispatch ein einziger Pre-Flight-Check. Bei jedem dieser Failures sofort Refund + `lipsync failed` + klare DE-Message, **kein** weiterer Versuch:
   - `!plateDims` (Geometrie nicht messbar).
   - N≥2 und `plateIdentityMap` nicht eindeutig (`ambiguous=true` ODER weniger Faces als Speaker).
   - Keine plausible Box für mindestens einen Sprecher.
   - Bbox-Upload schlägt fehl oder `nonNullFrames < 1` oder `area_pct` außerhalb [0.2 %, 45 %].

5. **Build-/Log-Verifikation**
   - `COMPOSE_DIALOG_SEGMENTS_VERSION` → `"v153.0"`. BOOT-Log bumpen.
   - Strukturierter Dispatch-Log pro Pass: `v153_dispatch speakers=N pass=k bboxSource=… area_pct=… frames=… url=…`.
   - Nach Deploy in den Logs verifizieren: `version=v153.0`, kein `preclip`, kein `auto_detect: true`, ausschließlich `bounding_boxes_url`.

6. **Aufräumen**
   - Tote Helper löschen: `pass-face-preclip.ts`, ungenutzte Teile von `syncso-face-gate.ts`, alte `coords-*`-Codepfade in `_shared/asd-strategy.ts` markieren als unused → entfernen.
   - Memory aktualisieren: `mem/architecture/lipsync/v152-unified-bbox-pipeline.md` ersetzen durch v153-Doku („single-path bbox-url-pro, no preclip, no auto_detect, hard-fail on prep failure“).
   - `mem/index.md` Eintrag updaten.

## Was sich für dich konkret ändert

- Multi-Speaker-Pässe haben keine 1–3 Lambda-Preclip-Renders mehr → ~60–180 s weniger Latenz pro Pass.
- Wenn Sync.so eine Szene nicht sauber syncen könnte, siehst du das innerhalb von Sekunden statt nach 30 Minuten, mit Refund und klarer Meldung („Plate-Geometrie nicht eindeutig — bitte Szene neu rendern“ o. ä.).
- Sprecher 1 spricht für Sprecher 1, 2 für 2 usw., weil jeder Sprecher seine eigene plate-native Box bekommt und es keinen `auto_detect`-Pfad mehr gibt, der die Mapping-Reihenfolge umsortieren kann.

## Risiken & Annahmen

- Sync.so sync-3 + `bounding_boxes_url` ist laut Docs der empfohlene Multi-Speaker-Pfad, wir nutzen ihn dann ausschließlich. Falls Sync.so für einzelne stilisierte Plates damit reproducibly `provider_unknown_error` wirft, fällt das nicht mehr in einen Workaround — wir Hard-Failen und melden es transparent (gewollt).
- Ein- bis zweispur Single-Speaker-Szenen, die heute durch Preclip „schöner“ aussehen, könnten leicht abweichen. Falls dir das auffällt, ziehen wir die Single-Speaker-Variante separat nach.