# Per-Szene "KI-Modell"-Dropdown im Video Composer

## Problem

Im Storyboard hat jede Szene aktuell eine Reihe von 7 Buttons (`Stock Video`, `Stock Bild`, `KI (Hailuo)`, `KI (Kling)`, `KI (Veo 3.1)`, `KI Bild (Gemini)`, `Eigenes Video`). Das ist:
- **Visuell überladen** und drückt andere Controls (Quality, Prompt) nach unten.
- **Unvollständig**: Wan, Luma, Seedance werden im Backend (`compose-video-clips`) bereits unterstützt, sind aber per Szene nicht wählbar — der User kann sie nur global im AI Video Toolkit nutzen.

## Lösung — 3 kompakte Source-Tabs + 1 Modell-Dropdown

```text
┌─ Quelle ────────────────────────────────────────┐
│  [🎁 Stock]   [🤖 KI-Generiert]   [⬆ Eigenes]   │
└─────────────────────────────────────────────────┘
   │
   ├─ Stock         → Untertabs: [Video] [Bild]   (öffnet Stock Browser)
   │
   ├─ KI-Generiert  → ┌────────────────────────────────────┐
   │                  │ Modell:  [▼ Hailuo 2.3 Standard]   │  ← ein einziger Dropdown
   │                  │   ⭐ Empfohlen                       │
   │                  │     • Hailuo Standard / Pro         │
   │                  │     • Kling 3 Standard / Pro        │
   │                  │     • Luma Ray 2 Standard / Pro     │
   │                  │     • Seedance Standard / Pro       │
   │                  │   🎵 Mit Native Audio                │
   │                  │     • Veo 3.1 Lite / Fast / Pro     │
   │                  │   ⚡ Schnell & Günstig               │
   │                  │     • Wan 2.6 Standard / Pro        │
   │                  │   🖼 Bild (statisch + Ken-Burns)    │
   │                  │     • Gemini Image                  │
   │                  │ Kosten: €0.15/s · 768p              │
   │                  └────────────────────────────────────┘
   │
   └─ Eigenes       → Upload-Komponente
```

Die existierende `ModelSelector`-Komponente (`src/components/ai-video/ModelSelector.tsx`) wird wiederverwendet — sie kann bereits gruppiert anzeigen, Preise pro Sekunde rendern und Sora-2-Locks behandeln. Sora und Grok bleiben **ausgeblendet**, da `compose-video-clips` sie nicht unterstützt (würde sonst silent zu Hailuo gefallback).

## Verhalten

1. **Source-Tabs** ersetzen die 7 Buttons. Active-State + Free-Badge bleiben für Stock erhalten.
2. **Mode-Presets**: Beim Wechsel des Composer-Mode (product-ad, storytelling…) wird ein sinnvolles Default-Modell pro Szene gesetzt — z. B. `kling-3-standard` für storytelling, `hailuo-standard` für product-ad, `veo-3.1-fast` wenn Mode "with-audio".
3. **Quality-Tier wird obsolet**: Standard/Pro sind jetzt eigene Modell-Einträge im Dropdown (z. B. `hailuo-standard` vs. `hailuo-pro`). Damit verschwindet die separate "Qualität: Standard / Pro"-Reihe.
4. **Migration alter Szenen**: Vorhandene `clipSource` (z. B. `ai-hailuo`) + `clipQuality` werden beim Mounten zu einer `aiModelId` gemappt (`ai-hailuo` + `pro` → `hailuo-pro`). Persist auf der DB erfolgt über die bereits vorhandene Debounced-Save-Logik.
5. **Backend-Mapping**: `compose-video-clips` erwartet weiter `clipSource` + `clipQuality`. Vor dem Save wird das gewählte `aiModelId` zurück in das Pärchen gemappt (`hailuo-pro` → `clipSource='ai-hailuo'`, `clipQuality='pro'`). Damit bleibt der Render-Pfad unverändert.

## Technische Änderungen

### Frontend
- **`src/types/video-composer.ts`**: Optionales Feld `aiModelId?: string` auf `ComposerScene` (für UI-State; nicht zwingend persistiert).
- **`src/components/video-composer/SceneCard.tsx`** (Zeilen 442–541):
  - Ersetze 7-Button-Row + Quality-Row durch:
    - Tab-Group (Stock / KI / Upload).
    - Bei KI: `<ModelSelector>` aus `@/components/ai-video/ModelSelector.tsx` (gefiltert auf composer-fähige Familien: hailuo, kling, wan, seedance, luma, veo + image).
    - Bei Stock: kleiner Toggle Video/Bild.
  - `onChange(modelId)` ruft Helper `modelIdToClipSourceAndQuality(modelId)` und schreibt `{ clipSource, clipQuality }` via `onUpdate`.
- **Neue Helper-Datei `src/lib/video-composer/modelMapping.ts`**:
  - `modelIdToClipSourceAndQuality(id)`  → `{ clipSource, clipQuality }`
  - `clipSourceQualityToModelId(src, q)` → `id`
  - `COMPOSER_AVAILABLE_MODELS` — gefilterte Liste aus `AI_VIDEO_TOOLKIT_MODELS` (ohne Sora/Grok/LTX) + ein synthetischer Eintrag für `ai-image`.
- **`src/components/ai-video/ModelSelector.tsx`**: Akzeptiere optionalen `models?: ToolkitModel[]`-Prop, um die composer-Subliste zu übergeben (Default = volle Liste). Keine Logik-Änderung sonst.
- **Mode-Presets**: In `VideoComposerDashboard` beim Erzeugen neuer Szenen / Wechsel des Modes Default-`clipSource`/`clipQuality` setzen — nutzt denselben Helper.

### Backend
- **Keine Änderungen.** `compose-video-clips` versteht bereits alle 7 Quellen. Wan/Luma/Seedance werden nun durch UI freigegeben.

### Tests
- Manuell: pro Mode (product-ad, storytelling, custom) eine Szene anlegen → Default-Modell stimmt.
- Storyboard → Modell-Wechsel auf jede Familie → Clips Tab generiert ohne Fallback-Warning im Edge-Function-Log.

## Geänderte Dateien

- `src/components/video-composer/SceneCard.tsx` (Source-Buttons → Tabs + Dropdown)
- `src/components/ai-video/ModelSelector.tsx` (optionaler `models`-Prop)
- `src/types/video-composer.ts` (optionales UI-Feld)
- `src/lib/video-composer/modelMapping.ts` (neu)
- `src/components/video-composer/VideoComposerDashboard.tsx` (Mode-basiertes Default-Modell beim Anlegen neuer Szenen)
