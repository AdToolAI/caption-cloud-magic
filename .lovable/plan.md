# Track B — v128 Stitch Forensics (read-only, parallel zu Soak)

**Report-Datei:** `docs/lipsync/v128-stitch-forensics.md`
**Titel (neutral, bis bewiesen):** *"v128 Stitch Forensics — Are Sync.so pass outputs used in final mux?"*

Track A (v128 Soak) läuft unverändert weiter. Diese Szene gilt **nicht** als Soak-Fail, solange keine Terminal-Recycle / Doppel-Dispatches / Lock-Bypässe / Watchdog-Redispatches / Plan-D-Dispatches passieren.

## Hard No-Go (während des Soaks)

- Kein Edit an Edge-Functions, Lambda, Webhook, Watchdog, State-Maschine, Pass-Transition, Retry-Logik, Engine-Auswahl.
- Keine DB-Mutation, kein Re-Render, kein User-Retry, kein Engine-Wechsel.
- Track B ist rein read-only: Code lesen, DB lesen, fertige Videos herunterladen und mit ffmpeg/Python analysieren.

## Untersuchungs-Scope

Zwei Szenen vergleichen:
- **Scene N (neu):** `225ea521-7e18-4a02-b279-6f172db4ffd0` — `lip_sync_status=done`, User-Symptom: keine sichtbare Lippensynchronisation.
- **Scene O (alt):** `a68624ff-66ab-4171-9190-eb5805d042cb` — `lip_sync_status=done`, Status zum Lipsync-Verhalten unbekannt, dient als Gegenprobe.

## 4 Beweis-Ebenen

### 1. Code-Beweis
Im Report werden diese acht Fragen explizit beantwortet, jeweils mit Datei-Pfad + Zeilennummer:

1. Wer erzeugt `final_url` (`dialog-stitch-muxed-*.mp4`)?
2. Welches Manifest bekommt der Stitch-Renderer?
3. Enthält das Manifest `passes[].output_url`?
4. Enthält es `preclip_crop { x, y, size, outputSize }`?
5. Wird `output_url` im Renderer wirklich geladen?
6. Wird der Crop zurück in die Wide Plate composited?
7. Gibt es einen "plate-only mux" Fallback-Pfad?
8. Wann wird dieser Fallback aktiviert?

Gezielt suchen nach Branches wie:
```
if (multipass_fallback_attempted) ...
if (engine === 'sync-segments') ...
if (!pass.output_url) ...
if (force_multipass) ...
if (stitchMode === 'audio_only') ...
if (skipComposite | renderFallback) ...
```

### 2. Manifest-Beweis
Anonymisiertes/gekürztes Stitch-Input-Manifest für Scene N im Report einbetten:
```
{
  "scene_id": "225ea521-...",
  "final_url": "dialog-stitch-muxed-...",
  "engine": "sync-segments",
  "multi_pass": true,
  "force_multipass": true,
  "plate_url": "...",
  "audio_url": "...",
  "passes": [
    { "pass_idx": 0, "speaker": "...", "status": "done",
      "output_url": "...-lipsync-pass-0.mp4",
      "preclip_crop": { "x": 184, "y": 0, "size": 234, "outputSize": 720 } },
    ...
  ]
}
```
Sofort sichtbar, ob der Stitch überhaupt die richtigen Inputs sieht.

### 3. Pixel / ROI-Beweis (Kernstück)
Für jeden der 4 Pässe (Sprecher) der Scene N drei Frames vergleichen, jeweils an `turn_start + Δ` für den richtigen Sprecher-Turn:

- **A** = original wide plate crop an `preclip_crop {x, y, size}`
- **B** = Sync.so `pass.output_url`, zurückskaliert von `outputSize=720` auf `size × size`
- **C** = `final_url` crop an derselben `{x, y, size}` Position, gleicher Zeitstempel

Differenzen `diff(C, A)` und `diff(C, B)` numerisch (SSIM oder MSE) + visuelle Side-by-Side-Strips in den Report.

**Interpretation:**
- `C ≈ A` und `C ≠ B` → final nutzt Original-Plate, ignoriert Sync.so-Output.
- `C ≈ B` → synced Crop wird tatsächlich composited.
- `B` selbst zeigt keine Mundbewegung → Problem ist upstream (Targeting/Preclip/Sync.so), nicht Stitch.
- `C ≠ A` und `C ≠ B` → Geometrie/Timing/Scaling mismatch.

**Wichtig:** nur Frames innerhalb des jeweiligen Sprecher-Turns vergleichen (Δ relativ zum `turn_start`), nicht globaler t=0, sonst verfälscht Timing-Offset alles.

### 4. Audio / Mux-Beweis
`ffprobe` und ffmpeg-Logs (falls verfügbar) für `final_url` prüfen:
- Video-Stream: copy oder re-encode?
- Wenn `-c:v copy` plus nur Audio neu gemuxt → starker Hinweis auf plate-only mux.
- Audio-Track entspricht Voiceover-Mix, nicht den Pass-Audios?

Verdächtiges Pattern:
```
ffmpeg -i plate.mp4 -i dialog_audio.wav -c:v copy -c:a aac dialog-stitch-muxed.mp4
```

## Vergleichs-Tabelle Scene N vs Scene O

| | Scene N (225ea521) | Scene O (a68624ff) |
|---|---|---|
| Pass-Outputs existieren? | | |
| Manifest referenziert output_url? | | |
| final_url nutzt Pass-Output (ROI-Diff)? | | |
| Visuelles Symptom (Münder bewegen sich)? | | |
| force_multipass / multipass_fallback_attempted | | |

- Beide gleich → dauerhafter Stitch-Bug der `sync-segments`/multipass Engine.
- Nur N betroffen → Regression durch `force_multipass` oder spezifischen Fallback-Branch; Diff der Manifeste ist der Schlüssel.
- Nur O funktioniert → Diff zwischen N und O liefert die Root-Cause-Flag.

## Pflicht-Schluss: explizite Klassifizierung

Der Report **muss** mit genau einer dieser Diagnosen enden:

- **A** — Manifest referenziert `pass.output_url` gar nicht. *(Bug in Manifest-Erzeugung)*
- **B** — Manifest hat `output_url`, aber Renderer ignoriert es. *(Bug in Lambda/Remotion Composition)*
- **C** — `output_url` wird geladen, aber `preclip_crop` fehlt/falsch. *(Re-Composite-Geometrie)*
- **D** — Crop wird composited, aber falsche Position/Skalierung. *(Coordinate-space / scaling)*
- **E** — Composite korrekt, aber Pass-Output selbst nicht synced. *(Problem upstream: Targeting/Preclip/Sync.so)*
- **F** — Final ist bewusst Plate-only Fallback. *(Fallback-Condition falsch oder zu breit)*

Keine Spekulation, keine Vorschläge zur Implementierung im Report — nur Befund + Klassifizierung. Ein Hotfix-Plan kommt **separat nach Soak-Exit (48h grün)**.

## Deliverables

1. `docs/lipsync/v128-stitch-forensics.md` mit allen 4 Beweis-Ebenen, Vergleichstabelle und A–F Klassifizierung.
2. Optional `/mnt/documents/v128-stitch-rois/` — Side-by-Side PNG-Strips pro Pass (A | B | C) für die im Report referenzierten Frames.
