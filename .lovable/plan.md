# v194 — Silent-Speaker-Pass (Multi-Face-Lipsync, Hintergrund bleibt lebendig)

## Kern-Constraint (hart)

**Kein `auto_detect: true` oder `active_speaker_detection: auto` — NIE.**
Jeder einzelne Sync.so-Pass (aktiv wie silent-stabilizer) bekommt eine explizite `bounding_boxes_url` mit dem präzisen Face-Rect dieser einen Face-Region. Deterministisch, reproduzierbar, doc-compliant zu sync-3 (siehe Memory `sync-3-doc-strict-options-v106`).

## Warum die bisherigen Lösungen scheitern

| Version | Ansatz | Warum es nicht sauber ist |
|---|---|---|
| v183 | Ghost-Portrait über Listener kleben | Fremdes Gesicht, "Morph"-Effekt sichtbar |
| v193 | Kleiner Freeze-Patch (Frame 0) über Listener-Mund | Kopf/Licht bewegen sich weiter → Patch "atmet" am weichen Rand → dezenter Morph (deine Screenshots) |
| v194-A (Full-Plate-Freeze) | Ganzen Frame einfrieren, nur aktiver Sprecher lebt | Hintergrund + andere Personen komplett tot → sieht wie Standbild aus, unprofessionell |

Gemeinsames Problem: Die AI-Plate (Hailuo/Kling i2v) generiert **alle** Personen mit natürlicher Mund-Mikro-Bewegung. Sync.so ersetzt aber nur **einen** Mund. Die anderen bleiben "am reden".

## Der professionelle Weg — Silent-Speaker-Pass

**Sync.so selbst als Listener-Stiller einsetzen.** Für jeden Turn:

1. **1 aktiver Sync.so-Pass** — bbox der aktiven Face-Region, echte VO-Audio.
2. **M-1 stille Sync.so-Passes** — je ein Pass pro Listener, je mit eigener bbox, gefüttert mit einem deterministischen `silence_<dur>.wav` (Room-Tone ~−55 dBFS).
3. **Compositing** wie heute: jeder Pass überlagert nur seine bbox-Region.

Ergebnis:
- Aktiver Sprecher: korrekt gelipsynct.
- Listener: geschlossene Münder, aber **Kopf/Blick/Körper/Haare/Hintergrund bewegen sich frei** (Plate läuft normal weiter, Sync.so ändert nur den Lippenbereich head-tracked).
- Keine Ränder, keine Freeze-Patches, keine Ghost-Portraits, keine `auto_detect`-Nichtdeterminismus.

## Konkrete BBox-Regeln (nicht verhandelbar)

- Für **jeden** Sync.so-Dispatch (aktiv + silent) wird eine `bounding_boxes_url` gebaut und übergeben.
- BBox-Quelle pro Pass = `preclip_crop` dieses Passes (identisch zur bestehenden aktiven-Pass-Logik).
- Payload verwendet **ausschließlich** `sync_mode` und `active_speaker_detection` als Optionen (v106-Doc-Strict) — kein `temperature`, kein `occlusion_detection_enabled`, kein `auto_detect`.
- Falls für einen Listener keine deterministische bbox verfügbar ist (z.B. Face-Extraktion fehlgeschlagen) → dieser eine Listener fällt auf v193-Freeze-Matte zurück (**nicht** die ganze Szene, **nicht** auto_detect als Fallback).

## Technische Änderungen

### 1. `compose-dialog-segments` (Edge Function)
- Beim Fan-out eines Turns pro Face: `M-1` zusätzliche `dialog_shots`-Rows mit
  - `is_silent_stabilizer = true`
  - `silent_for_turn_of = <active_pass_idx>`
  - eigene `preclip_crop` (bbox der Listener-Face)
- Silent-Passes teilen sich das gleiche `silence_<duration>.wav` (deterministisch, on-demand via `generate-silence-track`).
- Payload-Builder für Silent-Passes = identisch zum aktiven Pass, **inkl. `bounding_boxes_url`**. Nur die Audio-URL zeigt auf silence-track statt VO.
- Feature-Flag: `composer.silent_speaker_pass_v194 = true` gate.

### 2. `render-sync-segments-audio-mux`
- Pro Sprecher-Fenster jetzt `M` Overlays (1 aktiv + `M-1` silent-stabilized).
- Existing `silent_faces_v183` und `listener_mouth_matte_v193` Codepfade deaktiviert wenn v194 an.
- Log-Marker: `v194_silent_speaker_pass_composited passes=M shot=i`.
- Per-Face Fallback-Marker: `v194_fallback_v193_face=<idx> reason=<sync_so_error>` — nur für die betroffene Face-Region.

### 3. `DialogStitchVideo.tsx`
- Wenn `silent_speaker_pass_v194 = true`:
  - Rendert `M` Sync.so-Overlays parallel pro `Sequence` (identische Overlay-Logik wie aktiver Pass: `faceMask` / `crop`).
  - Keine `SilentFaceFreeze` / `FullPlateFreezeWithHole` mehr → Hintergrund + Listener-Körperbewegung kommen komplett aus dem lebenden Master-Plate.
- Fallback-Pfad: einzelne Face fällt auf v193-Matte zurück (nur diese eine Face).

### 4. Neue Edge-Function `generate-silence-track`
- Input: `duration_sec`.
- Output: signed URL zu `silence_<dur>.wav` (Bucket `composer-silence-tracks`, 24h Cache).
- ffmpeg: `-f lavfi -i "anoisesrc=color=brown:amplitude=0.0005" -t <dur> -ar 24000 -ac 1` (~−55 dBFS).
- Deterministisch — gleiche Dauer → gleiche Datei.

### 5. Silent-Audio-Gate Bypass für Stabilizer-Passes
- `mem/architecture/lipsync/v53-doc-compliance-fixes.md` erzwingt `peak_dbfs > -50` sonst pre-dispatch-fail. Das ist korrekt für User-Audio, würde aber unsere Silent-Passes killen.
- Neuer Payload-Flag `stabilizer_pass: true` in `dialog_shots` → Gate übersprungen **nur** für diese Rows, die zwingend `is_silent_stabilizer = true` sein müssen.
- Alle anderen v53-Compliance-Regeln bleiben aktiv (kein `segments_secs`, `cut_off`, korrekte per-turn WAVs).

### 6. `system_config`-Migration
- `composer.silent_speaker_pass_v194 = true`
- `composer.silent_speaker_pass_charge_user = false`
- `composer.silent_speaker_pass_require_bbox = true` (harter Gate — kein Pass ohne bbox)
- `composer.listener_mouth_matte_v193 = false`
- `composer.silent_faces_v183 = false`

### 7. `dialog_shots`-Schema-Migration
- `is_silent_stabilizer boolean NOT NULL DEFAULT false`
- `silent_for_turn_of uuid NULL` (FK auf aktiven Pass, ON DELETE CASCADE)
- `stabilizer_pass boolean NOT NULL DEFAULT false`
- Index auf `(scene_id, silent_for_turn_of)` für Batch-Preclip-Sammlung.

### 8. Refund-Semantik
- Silent-Stabilizer-Passes: **kein User-Refund** bei Sync.so-Fail (User hat nie bezahlt).
- Bei Fail: Fallback auf v193-Matte für diese eine Face-Region, Warnung in `qa_live_runs`.
- Bei fehlender bbox für einen Listener: **kein Silent-Pass dispatched**, direkt v193-Matte für diese Face (nie `auto_detect` als Rescue).

### 9. Kosten & Business-Modell
- +M-1 Sync.so-Calls pro Turn (bei 4 Sprechern: +3 Calls × ceil(vo_dur) × 9 Credits).
- User-Wallet: unverändert (`silent_speaker_pass_charge_user = false`).
- Kosten laufen gegen Composer-Marge — marketing-tauglicher Move ("saubere Multi-Speaker-Szenen ohne Aufpreis").
- Admin kann per Flag umschalten wenn Marge zu dünn wird.

### 10. Remotion-Bundle-Deploy
- `scripts/deploy-remotion-bundle.sh` nach DialogStitchVideo-Änderung.

## Verworfene Alternativen (und warum)

| Option | Warum verworfen |
|---|---|
| Face-Tracking (MediaPipe) + motion-kompensiertes Freeze-Overlay | Neuer Preprocessing-Server-Step, Landmark-Extraktion pro Frame, Warp-Compositing. Fragil bei schnellen Kopfdrehungen, kein deterministischer Fallback. |
| i2v-Prompt "Nur Speaker A spricht, andere schweigen" | AI-Modelle ignorieren das inkonsistent. Kein Fallback. |
| Multi-Pass i2v (jede Person isoliert generieren + compositen) | 4× i2v-Kosten, Green-Screen-Compositing, Character-Consistency-Hell. |
| `sync-3` Multi-Speaker-Single-Call mit per-Speaker-Audio | v106-Doc-Strict verbietet mehrere Audio-Tracks pro Call. |
| `active_speaker_detection: "auto"` oder `auto_detect: true` | **Explizit verboten** — reproducibly `provider_unknown_error` in v106, und nicht deterministisch. |

## Akzeptanzkriterien

- 4-Sprecher-Szene: Alle 4 Köpfe bewegen sich natürlich (Blick, Nicken, leichtes Schwanken), Hintergrund läuft, nur der jeweils aktive Sprecher öffnet den Mund.
- Keine sichtbaren Ränder, Patches, oder Ghost-Portraits.
- 1-Sprecher-Szene: unverändert schnell (~2–3 min), M-1 = 0 Silent-Passes.
- 4-Sprecher-Szene: ~9–10 min (Silent-Passes laufen parallel zum aktiven Pass unter `sync_so_concurrency_cap = 4`).
- Log-Marker `v194_silent_speaker_pass_composited passes=4 shot=i` erscheint.
- **In sämtlichen `syncso_dispatch_log`-Zeilen: `bounding_boxes_url IS NOT NULL` und kein `auto_detect` / `active_speaker_detection: "auto"`.** Assertion in Watchdog.
- User-Wallet nur für aktive Passes belastet.
- Bei Sync.so-Fail auf Silent-Pass: v193-Matte-Fallback für genau diese Face, Rest der Szene läuft durch.

## Out of Scope

- Keine Änderung an i2v-Generation, Anchor-Pipeline, Preclip-Extraktion.
- Keine Änderung an Audio-Mux-Logik außer dem Overlay-Loop.
- Keine neuen DB-Tabellen (nur 3 Spalten + 1 Index in `dialog_shots`).

## Warum das der professionellste Ansatz ist

- **Same-engine consistency**: Listener werden von derselben Lipsync-AI stabilisiert wie der aktive Sprecher — kein Stilbruch, keine Freeze-Ränder, keine Portrait-Match-Fehler.
- **Head-tracked**: Sync.so folgt der Kopfbewegung nativ. Keine externe Face-Tracking-Pipeline.
- **Deterministisch**: bbox-only, kein `auto_detect`, reproduzierbar über Re-Runs.
- **Graceful degradation**: einzelne Face fällt auf v193 zurück, nicht die ganze Szene.
- **Kein User-Cost-Impact**: Composer-Marge trägt Silent-Passes.
- **Skaliert**: 5, 6, 7 Sprecher — identische Codepfade.
