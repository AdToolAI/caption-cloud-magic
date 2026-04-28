# Reference-Image-Freeze am Szenenanfang fixen

## Problem

Wenn eine Composer-Szene mit einem Referenzbild generiert wird (Image-to-Video bei Hailuo, Kling, Wan, Seedance, Luma, Veo, Sora), zeigen die Provider in den ersten ~0.1–0.5s häufig das Referenzbild als Standbild, bevor sich Bewegung aufbaut. Beim Stitching im Director's Cut sieht man dann pro Szene kurz das Bild "aufploppen", dann erst startet die eigentliche Animation. Das wirkt unsauber.

Ursache liegt nicht im Frontend-Player, sondern im **gerenderten MP4** der Image-to-Video-Modelle.

## Lösung in 3 Ebenen

### 1) Prompt-Hardening (sofortige Wirkung, kostenlos)

In `supabase/functions/compose-video-clips/index.ts` → `enrichPrompt()` einen i2v-spezifischen Suffix einfügen, wenn `referenceImageUrl` gesetzt ist:

```
"start with motion already in progress, no static opening frame, immediate camera movement from frame 1, no freeze, no still hold"
```

Und in `NEGATIVE_PROMPT_PARAM`:
```
"static first frame, frozen opening, still image hold at start, motionless beginning"
```

Wirkt v.a. bei Kling 3 Omni, Wan 2.5, Seedance, Luma, Veo — Hailuo respektiert es teilweise.

### 2) Lead-In-Trim beim Compositing (Hauptfix)

In `supabase/functions/compose-clip-webhook/index.ts` (wo der fertige Clip gespeichert wird), pro i2v-Clip einen **Trim-Offset** in der DB ablegen — z.B. `clip_lead_in_trim_seconds` (default 0.25s für Hailuo, 0.15s für Kling/Wan/Seedance/Luma/Veo/Sora, 0s für ai-image und Stock).

Migration:
```sql
ALTER TABLE composer_scenes 
  ADD COLUMN clip_lead_in_trim_seconds NUMERIC DEFAULT 0;
```

Dieser Wert wird:
- **A)** im Composer-Preview-Player als `currentTime`-Startoffset gesetzt (`<video>` mit `onLoadedMetadata` → `el.currentTime = trim`)
- **B)** beim **"Render All & Stitch"**-Schritt, der den Director's Cut speist, als `start_offset` pro Clip in den Director's-Cut-State übergeben (siehe `multi-scene-render-pipeline` Memo). Director's Cut respektiert `start_offset` bereits (Timeline-Editing-Controls).

Vorteil: Keine Re-Encoding-Kosten, deterministisch, pro Modell konfigurierbar, vom User in der UI überschreibbar.

### 3) UI-Override (transparent für User)

In `SceneCard.tsx` neben dem Reference-Image-Slot ein kleines **"Lead-In-Trim"-Slider-Control** (0–0.5s in 0.05-Schritten) anzeigen, **nur** wenn `referenceImageUrl` gesetzt UND `clipSource` ein i2v-Provider ist. Default kommt aus dem provider-spezifischen Wert; User kann fein justieren.

Tooltip: *"Schneidet die ersten Millisekunden weg, in denen das Referenzbild noch eingefroren ist."*

## Files

**Backend**
- `supabase/functions/compose-video-clips/index.ts` — `enrichPrompt()` + `NEGATIVE_PROMPT_PARAM` für i2v
- `supabase/functions/compose-clip-webhook/index.ts` — beim Webhook-Complete `clip_lead_in_trim_seconds` setzen (provider-spezifischer Default, falls noch nicht vom User überschrieben)
- Neue Migration: Spalte `clip_lead_in_trim_seconds` auf `composer_scenes`

**Frontend**
- `src/types/video-composer.ts` — Feld `clipLeadInTrimSeconds?: number`
- `src/components/video-composer/VideoComposerDashboard.tsx` — Mapping snake_case ↔ camelCase
- `src/components/video-composer/SceneClipProgress.tsx` — `<video>` mit `onLoadedMetadata` → setzt `currentTime` auf `clipLeadInTrimSeconds`
- `src/components/video-composer/SceneCard.tsx` — Slider-Control für Lead-In-Trim (nur i2v + reference vorhanden)
- `src/lib/video-composer/multiSceneRender.ts` (oder dort wo der Director's-Cut-Handover passiert) — Übergibt `start_offset = clipLeadInTrimSeconds` pro Clip

## Provider-Defaults

| Provider | Default Trim |
|---|---|
| Hailuo | 0.25s |
| Kling 3 Omni | 0.15s |
| Wan 2.5 | 0.20s |
| Seedance | 0.15s |
| Luma Ray 2 | 0.10s |
| Veo | 0.10s |
| Sora 2 | 0.15s |
| ai-image (Ken Burns) | 0s |
| stock / upload | 0s |

Werte sind konservativ — schneiden nur den eingefrorenen Anteil weg, nicht echte Bewegung.

## Memo-Update

Memo `mem://architecture/video-composer/engine-normalization-policy` ergänzen um den Lead-In-Trim-Mechanismus, damit zukünftige Provider-Integrationen (neue Modelle) den Default direkt mitsetzen.
