## Ziel

Export-Qualität auf **visuell verlustfrei** anheben für ALLE finalen Renders (UCC, Director's Cut, Motion Studio, AI Video Studio, Lip-Sync Mux, Composer). Preview bleibt schnell/leicht.

## Ursachenanalyse (bestätigt)

`supabase/functions/render-with-remotion/index.ts` (globaler Entry-Point aller Export-Renders) nutzt aktuell:
- `jpegQuality: 80` (Zeile 739) — Remotion-Default, sichtbar weich bei Foto-/Kamera-Material
- kein explizites `crf` → Fallback CRF 18
- kein `x264Preset` → Fallback `medium`
- kein `videoBitrate`-Floor

`rawMediaMode: true` in `src/lib/universalCreatorRenderPayload.ts` ist bereits korrekt und schaltet Farb-/Kontrastfilter im UCC ab — Kontrastdrift kommt **nicht** vom Filter, sondern vom Encode-Loss.

## Änderungen

### 1. `supabase/functions/render-with-remotion/index.ts`
Neue konstante `HIGH_QUALITY_ENCODE`:
```
jpegQuality: 95
crf: 16                 // visuell verlustfrei, Standard „prosumer"
x264Preset: 'slow'      // ~20% bessere Kompression bei gleicher Qualität
videoBitrate: '10M'     // Floor für 1080p, verhindert Bitrate-Sparen bei ruhigen Szenen
audioBitrate: '256k'    // AAC, up von Default 128k
```
Anwendung: unabhängig von Composition / Payload-Typ auf ALLE Export-Renders.

Ausnahme: Wenn `inputProps.previewMode === true` → alte Werte behalten (nur Studio-Preview-Renders, keine Kundenausgabe).

### 2. `supabase/functions/render-sync-segments-audio-mux/index.ts`
Gleiches Preset, aber `x264Preset: 'medium'` statt `slow` — der Mux-Pfad liegt am engsten am 600 s Lambda-Limit (v205-Mux, 4 Sprecher). `crf: 16` und `jpegQuality: 95` übernehmen wir hier trotzdem.

### 3. `remotion.config.ts`
```
Config.setJpegQuality(95)
Config.setCrf(16)
Config.setAudioBitrate('256k')
```
Damit lokale/CI-Renders (Tests, Debug) identisch zur Lambda aussehen.

### 4. Preview-Bypass sicherstellen
`src/components/universal-creator/RemotionPreviewPlayer.tsx` und Motion-Studio-Preview: expliziter Check, dass keine dieser Preview-Pfade `render-with-remotion` mit den High-Quality-Werten aufruft — sie nutzen ohnehin Remotion Player im Browser (kein Lambda-Encode), also kein Handlungsbedarf. Nur verifizieren.

### 5. Memory
Neue Memory `mem://architecture/render/global-export-quality-floor.md` mit:
- exakten Werten (JPEG 95 / CRF 16 / preset slow / 10M / 256k)
- Ausnahme für Mux-Pfad (preset medium)
- Ausnahme für Preview
- Kostenimpact (+0,2–0,8 ¢/Video, im Rauschen bei 3× Marge)
- Verbot, diese Werte ohne Load-Test wieder zu senken.

Referenz in `mem://index.md#Core`: „Export = CRF 16 / JPEG 95 / preset slow. Mux = preset medium. Preview unverändert."

## Was NICHT geändert wird

- Keine Änderung an `rawMediaMode`, `objectFit`, Scene-Composition, Cinematic-Filter-Kette, Voice-/Musik-Pipeline, Lip-Sync-Logik, Tier-Scheduling, framesPerLambda.
- Keine Änderung an Preview-Playern (Browser-Rendering, kein Lambda-Encode).
- Keine Anhebung von Lambda-RAM oder Timeout — die aktuellen 3008 MB / 600 s reichen laut Tier-Config auch für preset `slow` bei ≤ 90 s Videos.

## Verifikation nach Deploy

1. Test-Render deines 4-Sprecher-Videos aus dem UCC.
2. `ffmpeg -i upload.mp4 -i export.mp4 -filter_complex ssim -f null -` → Ziel SSIM > 0,97 (aktuell schätzungsweise ~0,92).
3. Lambda-Duration im Log prüfen — muss unter Tier-Limit bleiben.
4. Ein Lip-Sync-Mux-Render mit 4 Sprechern → muss weiterhin < 480 s bleiben (Safety-Margin zum 600 s Timeout).

## Technische Details Kosten

- Lambda GB-Sekunden bei 3008 MB, 15 s Video @ 1080p30: ~90 s → ~110 s Rendertime (+22%). Kosten pro Render: 0,00001667 $/GB-s × 3 GB × 20 s Delta = **~0,1 ¢ extra**.
- S3-Egress: +12 MB × 0,09 $/GB = **~0,1 ¢ extra**.
- Gesamt pro 15 s Kunden-Video: **~0,2 ¢ zusätzlich**. Bei 10 000 Videos/Monat = 20 €.
- Bei aktueller Video-Credit-Marge (3×) neutralisiert der erste verkaufte Videoloop diese Mehrkosten für ~500 folgende Renders.

Sag Bescheid, dann setze ich es um.
