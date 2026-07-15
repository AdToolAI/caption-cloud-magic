# Plan v243 — Multi-Speaker Plate Stability (Root-Cause-Fix)

## Diagnose

Szene `53976949…476d`: `plate_identity` sauber (4 Gesichter, 1 Reihe, IDs korrekt, 1284×718 @ Frame 0). Master driftet bei ~t=4 s von einer Reihe zu 2×2. Overlays sitzen ab dann auf leeren Positionen und überdecken die neuen Kacheln.

Root Cause:
1. Der HappyHorse-Master rendert 10 s Single-Take und **schneidet / reframed** unaufgefordert.
2. Face-Detection ist ein Frame-0-Snapshot — jede spätere Drift geht unbemerkt in den Sync-Pass.

Wichtig (User-Klärung): Sprecher **dürfen** sich bewegen, gestikulieren, schreiben, laufen. Was NICHT passieren darf:
- Kamera-Cut, Kamera-Zoom, Kamera-Pan, Reframing
- Layout-Wechsel (Reihe → Raster)
- Sprecher verlassen den Frame (dann ist der Lip-Sync tot)

Also: Wir sperren **Kamera + Frame-Composition + Sprecher-Präsenz**, nicht die Sprecher selbst.

## Stufe 1 — Master gar nicht erst driften lassen

**1.1 Prompt-Layer-Hardening** (`src/lib/composer/promptLayers/dialogPlateLayer.ts`)
- Neuer harter Suffix für Multi-Speaker-Plates:
  „**Locked static camera on tripod. Fixed frame, fixed focal length, no camera movement of any kind. All speakers remain fully visible in frame, in the same relative positions, from start to end. Speakers may move naturally (gesture, look around, write, subtle body movement) but must not leave frame or swap positions. Single continuous shot, no cuts, no transitions, no reframing, no zoom, no pan, no dolly.**"
- Negative-Prompt: „camera cut, camera pan, camera zoom, dolly, reframe, split screen, grid layout, new shot, transition, speaker leaves frame, speaker walks out, character disappears, new characters entering, rearrangement".
- Positive Bewegungs-Freigabe explizit lassen (User will lebendige Szenen): Actions aus `dialog_turns[].action` / `scene_action_en` bleiben im Prompt.
- Nur aktiv wenn `character_shots.length ≥ 2` und `dialog_mode = true`.

**1.2 Fixer Seed** (`compose-dialog-plate/index.ts`)
- Multi-Speaker: `seed` deterministisch aus `sceneId` — konstant bis Drift erkannt, dann bewusst wechseln.
- Realism-Preset auf „documentary/interview / handheld-static" clampen (natürliche Mikrobewegung, aber keine Cuts).

**1.3 Chunk-Split für lange Dialoge** (`src/lib/composer/dialogPlateChunker.ts`, neu)
- Wenn `duration_seconds > 5` **und** `speakers ≥ 3`: Master in n Chunks à ≤ 5 s parallel, dann concat via `concat_dialog_plate_chunks`.
- Jeder Chunk erbt Seed + letzten Frame des Vorgängers als `first_frame_url`.
- Nur einschalten, wenn Stufe 1.1 / Guard alleine nicht reichen (Feature-Flag).

## Stufe 2 — Per-Frame Face-Tracking statt Snapshot

**2.1 Multi-Sample Plate Probe** (`supabase/functions/plate-face-detect/index.ts`)
- Samples bei t = 0.3 s, 25 %, 50 %, 75 %, 90 %.
- Pro Sample: face count + row-major Bboxes + Character-Match (Re-ID via Embedding).
- Persistieren in `plate_identity.samples[]` mit Timestamps.

**2.2 Dynamische bounding_boxes_url für Sync.so** (`compose-dialog-segments/index.ts`)
- Statt statisches Bbox-Objekt: Zeitachsen-JSON (`[{t, boxes:[{characterId, bbox, mouth}]}…]`) generieren, in Storage schreiben.
- Sync.so bekommt diese URL als `bounding_boxes_url` → Overlays **folgen** dem Sprecher, wenn er sich im Frame bewegt (z. B. beim Schreiben, Gestikulieren).
- Zwischen Samples linear interpolieren.

**2.3 Overlay-Mute bei Face-Loss** (`DialogStitchVideo.tsx`)
- Wenn Zielgesicht in Segment `[tA, tB]` verschwindet (Sample: Face-Count sinkt oder Re-ID matched nicht):
  - Overlay in diesem Fenster → `opacity: 0`, kein Sync-Overlay.
  - Audio-Line des Speakers bleibt (Voiceover-Track läuft weiter, wie „Off-Screen"-Kommentar).
- Verhindert „schwebende Münder über leerem Hintergrund".

## Stufe 3 — Drift-Guard als Sicherheitsnetz

**3.1 Drift-Score** (`src/lib/composer/plateDriftScore.ts`, neu)
Vergleicht Samples aus 2.1. Unterscheidet bewusst zwischen erlaubter Bewegung und verbotener Kamera-Drift:

- **Erlaubt (kein Drift):** Bbox verschiebt sich in derselben Region, Face-Count stabil, Row-Cluster stabil, Character-ReID stabil.
- **Soft Drift (Warnung, kein Fail):** Bbox-Center wandert um bis zu 25 % der Frame-Breite.
- **Hard Drift (Fail):**
  - Face-Count ändert sich (Sprecher verschwindet oder neuer taucht auf).
  - Row-Cluster-Wechsel (1 Reihe → 2 Reihen = Layout-Cut).
  - Bbox verlässt Frame (< 0 oder > width) oder springt > 50 % Frame-Breite zwischen Samples (= Kamera-Cut).
  - Character-ReID matched < 0.5 gegen den ersten Sample → Sprecher ausgetauscht.

Ergebnis: `{ layoutStable, driftScore, hardDrift, transitions[] }`.

**3.2 Pre-Sync Gate** (`compose-dialog-segments/index.ts`)
- Vor Fan-out:
  - `hardDrift = false` → normal fortfahren mit dynamischen Bboxen (Stufe 2).
  - `hardDrift = true` → Sync-Pässe **nicht starten** (Credits nicht belastet). Auto-Retry Master-Render (max 2×) mit:
    - neuem Seed
    - verstärktem Anti-Cut/Anti-Frame-Loss-Suffix
    - falls schon gechunked: kleinere Chunks (3 s).
- Nach 2 fehlgeschlagenen Retries: `clip_status = 'unstable_master'`, klarer Fehler + „Prompt anpassen"-CTA in UI.

**3.3 UI-Sichtbarkeit** (`src/components/composer/SceneCard.tsx`)
- Badge „Master instabil (Sprecher verlässt Frame / Kamera-Cut) — wird neu gerendert (N/2)".
- Nach Erfolg: normaler Sync-Flow.

## Stufe 4 — Cleanup + Verifikation

**4.1 Reset der aktuellen Szene**
- Für `53976949…476d`: `dialog_shots.status = 'needs_regenerate'`, `plate_identity = null`. Rerender ohne Doppelabrechnung (v242-Dedup greift).

**4.2 Test-Suite** (`src/__tests__/composer/plateDrift.test.ts`, neu)
- Fixtures: stabiler Plate, morphender Plate (Face-Count-Wechsel), leichter Drift (soft only, erlaubt), Sprecher verlässt Frame (hard). Erwartete Gates + Retry-Verhalten.

**4.3 Observability**
- Neuer `composer_drift_checks`-Eintrag pro Szene mit Samples + Score → messbar wie oft der Guard greift, um Prompt-Layer iterativ zu tunen.

## Rollout-Reihenfolge

1. Stufe 1.1 + 1.2 (Prompt-Hardening, Seed-Lock) — Low-Risk, sofort.
2. Stufe 2.1 + 3.1 + 3.2 (Samples + Guard + Auto-Retry) — schützt Credits ab Deploy.
3. Stufe 2.2 + 2.3 (dynamische Bboxes + Face-Loss-Mute) — größte Qualitätswirkung, kompatibel mit User-Anforderung „Sprecher dürfen sich bewegen".
4. Stufe 1.3 (Chunk-Split) — nur, wenn Guard weiterhin > 5 % Szenen ablehnt.

## Nicht enthalten

- Wechsel des Video-Modells (HappyHorse bleibt Default).
- Änderungen an v242-Sorting / `assignmentLock`.
- Änderungen an Credit-Refund-Automation (greift automatisch, wenn Pässe nicht starten).
- Einschränkung von Sprecher-Aktionen (schreiben, laufen, gestikulieren bleibt erlaubt — es wird nur die Kamera und Frame-Composition gesperrt).
