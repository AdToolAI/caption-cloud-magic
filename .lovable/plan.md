
# Audio-Toggle pro Szene im Motion Studio Composer

## Problem

Bei der Anbieter-Auswahl im Composer (SceneCard → KI-Modell) gibt es derzeit **keine Möglichkeit**, für audio-fähige Modelle (**Sora 2 Standard**, **Sora 2 Pro**, **Veo 3.1 Fast**, **Veo 3.1 Premium**, **Kling 3 Standard**, **Kling 3 Pro**) zu wählen, ob das generierte Video mit oder ohne nativen Sound erstellt werden soll. Im Standalone-Toolkit existiert dieser Switch bereits — im Composer pro Szene fehlt er komplett.

Außerdem ist Sora 2 in der Modell-Registry fälschlich als `audio: false` markiert, obwohl Sora 2 nativ Audio liefert.

## Ziel

Pro Szene im Storyboard / Clips-Tab einen kompakten **„Mit Sound / Ohne Sound"-Toggle** anbieten — sichtbar nur, wenn das gewählte Modell Audio kann. Default = Mit Sound.

## Änderungen

### 1. Modell-Registry korrigieren
`src/config/aiVideoModelRegistry.ts`: Sora 2 Standard und Sora 2 Pro auf `capabilities.audio: true` setzen (Sora 2 liefert nativ Audio).

### 2. Datenmodell erweitern

**Migration** auf `composer_scenes`:
- Neue Spalte `with_audio boolean NOT NULL DEFAULT true`.

**Type** in `src/types/video-composer.ts` (`ComposerScene`): Feld `withAudio?: boolean` ergänzen.

**Mapping** in `VideoComposerDashboard.tsx` (3 Stellen, in denen `clip_quality` aus Rows gelesen / geschrieben wird) + `ClipsTab.tsx` / `StoryboardTab.tsx`: `withAudio` lesen/schreiben (Default `true`).

### 3. UI: Audio-Toggle in SceneCard
In `src/components/video-composer/SceneCard.tsx`, direkt unter dem `<ModelSelector>` (Zeilen 527–544):

- Wenn das aktuell gewählte Toolkit-Modell `capabilities.audio === true`, einen kleinen Pill-Switch rendern:
  - 🔊 „Mit Sound" / 🔇 „Ohne Sound" (lokalisiert DE/EN/ES).
  - Schreibt `withAudio` über `onUpdate`.
- Für Modelle ohne Audio-Fähigkeit (Hailuo, Wan, Luma, Seedance, Image) unsichtbar — keine optische Unruhe.

### 4. Edge-Function `compose-video-clips` respektiert das Flag

In `supabase/functions/compose-video-clips/index.ts`:

| Anbieter | Umsetzung |
|---|---|
| **Veo 3.1** (Z. 635–640) | `veoInput.generate_audio = scene.withAudio !== false` (Replicate-Veo unterstützt das Flag direkt). |
| **Kling 3 Omni** (Z. 409–414) | `klingInput.generate_audio = scene.withAudio !== false` (gleicher Mechanismus wie `generate-kling-video`). |
| **Sora 2 / Sora 2 Pro** (Z. 680–685) | Sora 2 hat keinen API-Toggle für Audio — daher Flag in DB persistieren (`composer_scenes.strip_audio`) und beim **Stitch / Director's Cut**-Schritt per ffmpeg den Audio-Track entfernen, falls `withAudio = false`. Für die Erst-Generation bleibt der Replicate-Call unverändert. |

Scene-Row beim Update um `with_audio: scene.withAudio` ergänzen.

### 5. Stitch-Pipeline (Sora 2 Mute-Fall)

Im Render-/Stitch-Service (`compose-video-storyboard` bzw. das Lambda-Stitch) bei `withAudio = false` für `ai-sora`-Clips den Audio-Track stummschalten / entfernen (`-an` ffmpeg-Flag oder Volume 0). Damit funktioniert „Ohne Sound" auch bei Sora konsistent.

### 6. Lokalisierung

Neue Keys in `src/lib/translations.ts`:
- `composerSceneWithAudio` → „Mit Sound" / „With sound" / „Con sonido"
- `composerSceneWithoutAudio` → „Ohne Sound" / „No sound" / „Sin sonido"
- Tooltip „Natives KI-Audio aus dem Modell verwenden — sonst stumm."

## Visuelles Design

Kompakter Pill-Toggle direkt unter dem Modell-Dropdown — gleicher James-Bond-Stil (Glass / Goldakzent für aktiven Zustand), nicht aufdringlich.

```text
┌─ AI-Modell ──────────────────────────────┐
│  [Sora 2 Pro · 1080p · €0.53/s     ▼]   │
└──────────────────────────────────────────┘
   🔊 Mit Sound   ◯ Ohne Sound        (nur sichtbar wenn audio-fähig)
```

## Dateien (geschätzt)

- `src/config/aiVideoModelRegistry.ts` — Sora-Audio-Flag
- `src/types/video-composer.ts` — `withAudio` Feld
- `src/components/video-composer/SceneCard.tsx` — UI-Toggle
- `src/components/video-composer/VideoComposerDashboard.tsx` — DB-Mapping (3 Stellen)
- `src/components/video-composer/ClipsTab.tsx`, `StoryboardTab.tsx` — Default-Initialisierung
- `src/lib/translations.ts` — neue Keys
- `supabase/functions/compose-video-clips/index.ts` — Veo/Kling Flag durchreichen, Sora Flag persistieren
- `supabase/functions/compose-video-storyboard/index.ts` — Stitch-Mute für Sora bei `withAudio = false`
- DB-Migration: `with_audio` Spalte auf `composer_scenes`

## Out of Scope

- Eigener Audio-Mix pro Szene (kommt aus dem späteren Voiceover/Music-Tab, der ohnehin schon existiert)
- Toggle für Modelle ohne Audio (Hailuo, Wan, Luma, Seedance) — bewusst unsichtbar.
