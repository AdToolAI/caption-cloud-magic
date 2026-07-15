
# Provider-Style Covers + Animated Showcase Clips fürs AI Arsenal

## Ziel
Statt 37× goldene Clapper zeigen wir pro Modell **eine echte visuelle Signatur** — teils als Still, teils als kurzer Loop-Clip — damit Nutzer aufs erste Anschauen begreifen, was jedes Modell *kann und wie es aussieht*.

## Mischung (bewusster Mix, nicht alles animiert)
Wir teilen den Katalog in zwei Klassen ein, damit die Reel-Seite performant bleibt (Video ist teuer im Bandwidth) und trotzdem "lebendig" wirkt:

| Klasse | Anteil | Format | Wofür |
|---|---|---|---|
| **A — Hero-Clips (animiert)** | ~10 Flaggschiffe (Sora 2, Veo 3.1 Pro, Kling 2.5 Pro/Omni, Wan 2.6 Pro, Hailuo 2.3 Pro, Luma Ray 2, Runway Gen-4, Seedance 2 Pro, Pika 2.2) | 3–4 s MP4-Loop, 720p, ~1–2 MB, `muted autoplay loop playsinline` | Bewegung, Kamerafahrt, Lip-Sync-Feel |
| **B — Style-Stills (statisch)** | Rest (Lite/Fast/Mini + alle Bild-/Audio-/Avatar-Modelle) | JPG 16:9, ~150–250 KB | Farbraum, Grain, Ästhetik-DNA |

Jede Karte im Reel bekommt zusätzlich ein leichtes **Ken-Burns / Parallax-Overlay per CSS** (auch die Stills), damit das ganze Reel „atmet".

## Prompts pro Provider (Auszug — Ästhetik ohne Markennennung)
- **Sora 2** — 35mm anamorphic, shallow DOF, golden-hour rooftop, subtle lens flare
- **Kling 2.5 Pro** — cinematic portrait, warm rim-light, silk-smooth camera dolly
- **Veo 3.1 Pro** — hyperreal texture, saturated color science, product macro
- **Wan 2.6 Pro** — Asian blockbuster grade, teal-orange, mist, epic scale
- **Hailuo 2.3** — surreal poetic dreamscape, painterly, floating objects
- **Luma Ray 2** — hazy dreamy volumetric light, pastel
- **Runway Gen-4** — moody teal-orange, urban night, rain reflections
- **Seedance 2 Pro** — sports slow-motion, dust, dynamic action
- **Pika 2.2** — playful stylized, punchy colors, keyframe morph
- **Vidu / Kling Omni** — locked close-up portrait, natural talking motion
- **Bildmodelle (Nano Banana / Gemini 3 Pro Image / GPT-Image-2)** — jeweils charakteristisches Test-Motiv
- **Audiomodelle** — abstrakter Waveform/Studio-Vibe (Neonröhren, Mixer-Fader)
- **Avatare** — Portrait-Style, aber ohne Lip-Sync-Bewegung

**Legal-Safety**: Prompts enthalten **nie** "in the style of Sora / Veo / Kling…", **kein Text**, **kein Wasserzeichen**, **keine echten Personen**. Wir imitieren *visuelle DNA*, nicht Marken.

## Umsetzung

1. **`src/config/arsenalStyleProfiles.ts`** — pro `modelId`: `kind: 'still' | 'clip'`, `prompt`, `negative`, `aspect`, für Clips zusätzlich `duration`, `motion` (Kamerafahrt-Direktive).

2. **Batch-Skripte** (einmalig, lokal via Edge Function):
   - `scripts/generate-arsenal-stills.ts` → ruft `/v1/images/generations` mit `google/gemini-3.1-flash-image`, Ergebnis nach `src/assets/arsenal/{modelId}.jpg` via **Lovable-Assets-CLI** (Pointer-JSON committen, Binary nicht).
   - `scripts/generate-arsenal-clips.ts` → nutzt unser bestehendes `generate-luma-video` bzw. `generate-hailuo-video` (günstigste Provider für Loops, keine externen Kosten pro Endnutzer-Request), 4 s @ 720p. Danach mit `ffmpeg` auf ~1.5 MB komprimiert, Poster-Frame als JPG. Ausgabe → `.asset.json`-Pointer.

3. **`AIArsenalShowcase.tsx`** — Cover-Layer:
   ```tsx
   {entry.kind === 'clip' ? (
     <video src={entry.clipUrl} poster={entry.posterUrl}
            muted autoPlay loop playsInline
            className="absolute inset-0 h-full w-full object-cover" />
   ) : (
     <img src={entry.stillUrl} alt=""
          className="absolute inset-0 h-full w-full object-cover ken-burns" />
   )}
   ```
   - Beibehalten: goldener Grain-Layer, Vignette, Genre-Badge, Modellname.
   - **Bandwidth-Guard**: `IntersectionObserver` lädt Clips erst wenn im Viewport; Mobile (< 768 px) fällt auf Poster-Still zurück.
   - **Prefers-reduced-motion**: alle Clips → Poster-Still.

4. **Kosten (einmalig)**
   - 27 Stills × ~$0.005 ≈ 0.15 €
   - 10 Clips × ~$0.25 (Luma/Hailuo, 4 s) ≈ 2.50 €
   - **Gesamt < 3 €**, danach 0 € Runtime (Assets liegen auf CDN).

5. **QA-Loop**
   - Zuerst 3 Test-Renderings (1 Clip: Sora-Feel via Luma Ray 2; 1 Still: Veo-Feel; 1 Still: Nano-Banana) — Abnahme durch dich.
   - Dann Full-Batch, Reel-Seite live.

## Ergebnis
Ein **echtes Cinema-Reel**: 10 Karten bewegen sich subtil, 27 zeigen statisch-atmosphärische Frames, alle mit unverwechselbarer Provider-DNA. Perfekt für Landing/Login-Vor-Bereich, rechtlich sauber, performant.

---
**Freigabe für 3 Test-Renderings?** Ich schicke dir die drei Vorschauen zurück, bevor der Full-Batch läuft.
