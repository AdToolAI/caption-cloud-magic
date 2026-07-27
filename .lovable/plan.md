## Plan v272 — Multi-Sprecher-Anchor: Anti-Grid/Collage-Härtung

### Diagnose (aus Screenshot bestätigt)
- Szene rendert 4 Portraits als **2×2-Grid** statt als eine gemeinsame Bürszene.
- Ursache liegt im Prompt, nicht im Modell: `compose-scene-anchor/index.ts` verbietet Panel-Grid / Split-Screen / Collage / Contact-Sheet **nur im N=1-Zweig** von `EXACT_COUNT_SUFFIX` (Zeile 353) und `TWO_SHOT_NEGATIVE` (Zeile 370). Der N≥2-Zweig verbietet nur duplizierte Identitäten und versteckte Gesichter — Gemini 3 Pro Image nimmt die 4 Portraits daher wörtlich als 4 Panels.
- Zusätzlich fehlt im Multi-Zweig ein explizites "ONE continuous frame / single shot"-Statement.

### Änderungen (nur Prompt, kein Modellwechsel)

**Datei:** `supabase/functions/compose-scene-anchor/index.ts`

1. **`EXACT_COUNT_SUFFIX` (Multi-Zweig, ab Z. 348)** — Ergänzen:
   - `"All ${N} cast people appear together in ONE single continuous photographic frame — one shared physical space, one camera, one exposure."`
   - `"FORBIDDEN LAYOUTS: 2×2 grid, 2×1 or 1×2 split-screen, panel grid, multi-panel composition, photo collage, contact sheet, tiled portraits, framed headshot arrangement, video-conference/Zoom/Teams grid, before/after grid, magazine-style portrait grid, side-by-side headshot strip."`

2. **`TWO_SHOT_NEGATIVE` (Multi-Zweig, beide Varianten asymmetric + symmetric, Z. 366–369)** — Ergänzen an bestehende Liste:
   - `"panel grid, split-screen, 2×2 grid, 2×1 grid, collage, contact sheet, tiled portraits, Zoom-style video call grid, individual headshots stitched together"`

3. **Neues `SINGLE_FRAME_SUFFIX` (Multi)** — Am Ende der Multi-Instruction (nach `identityClause`) einfügen:
   - `" SINGLE CONTINUOUS PHOTOGRAPH — the output is ONE unbroken photorealistic photograph taken with ONE camera in ONE moment. It is NOT a composite, NOT a grid, NOT a collage, NOT a stitched image, NOT a video-conference screenshot. All ${N} people share the SAME floor, SAME walls, SAME lighting, SAME perspective."`

4. **`ANCHOR_AUDIT_VERSION` bumpen** in `compose-video-clips/index.ts` (aktuell 10 → 11), damit bestehende Grid-Anchors aus dem Cache invalidiert und neu komponiert werden.

### Nicht Teil dieses Plans
- Kein Modellwechsel (Gemini 3 Pro bleibt Default — es hat Identität + Environment korrekt getroffen, nur das Layout war falsch).
- Keine Änderung an `compose-video-clips`, Sync.so-Pfad, oder Refund-Logik.
- Keine Änderung an N=1-Prompts.
- Feature-Flag-Fallback (`ANCHOR_MODEL_MULTI=nano_banana_2` / `seedream4`) bleibt erhalten.

### Rollback
- Prompt-Änderung ist textuell — Revert des Commits reicht.
- `ANCHOR_AUDIT_VERSION` kann auf 10 zurückgesetzt werden, falls die alten Cache-Einträge wieder gebraucht werden.

### Erfolgskriterium
- Nächster 4-Sprecher-Render zeigt alle 4 Personen in **einem** gemeinsamen Büroraum, mit gemeinsamer Perspektive und Beleuchtung (kein Grid, keine getrennten Panels), Identität + Lip-Sync bleiben wie zuletzt intakt.
