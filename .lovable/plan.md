
# Shot Director UI für das AI Video Toolkit

## Was der User bekommt

Statt alles in den Prompt zu tippen, klickt der User die Shot-Direktive zusammen — wie in Artlist Studio. Die UI generiert daraus automatisch eine cinematic-optimierte Prompt-Erweiterung, die an **alle 9 Modelle** (Sora, Kling, Veo, Hailuo, Luma, Wan, Seedance, Grok, LTX) angehängt wird.

```text
┌──────────────────────────────────────────────┐
│  PROMPT: "Woman walks through neon alley"    │
├──────────────────────────────────────────────┤
│  🎬 Shot Director                            │
│  ┌─────────┬─────────┬─────────┬─────────┐  │
│  │ Camera  │ Light   │ Move    │ Frame   │  │
│  │ Angle   │ Mood    │ -ment   │ -ing    │  │
│  └─────────┴─────────┴─────────┴─────────┘  │
│  Selected: Low Angle · Golden Hour ·         │
│            Slow Push-In · Medium Close-Up    │
│  ┌──────────────────────────────────────┐   │
│  │ Final Prompt Preview (auto-built)    │   │
│  │ "Woman walks through neon alley.     │   │
│  │  Shot from a low angle, golden hour  │   │
│  │  warm lighting, slow camera push-in, │   │
│  │  medium close-up framing..."         │   │
│  └──────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

## Vier Shot-Kategorien

Jede Kategorie ist ein **Popover mit visuellen Icons + kurzer Beschreibung**. User klickt → Chip wird gesetzt. Klickt nochmal → entfernt.

### 1. Camera Angle (8 Optionen)
Eye-Level · Low Angle · High Angle · Dutch Tilt · Bird's Eye · Worm's Eye · Over-the-Shoulder · POV

### 2. Lighting / Mood (10 Optionen)
Golden Hour · Blue Hour · Hard Noir · Soft Studio · Neon Cyberpunk · Candlelight · Overcast Natural · Backlit Silhouette · Volumetric God-Rays · Moonlit

### 3. Camera Movement (10 Optionen)
Static Lockdown · Slow Push-In · Pull-Out Reveal · Dolly Left · Dolly Right · Crane Up · Crane Down · Orbit Left · Orbit Right · Handheld Shake

### 4. Framing / Shot Type (8 Optionen)
Extreme Wide · Wide Shot · Medium Shot · Medium Close-Up · Close-Up · Extreme Close-Up · Two-Shot · Establishing

## Technische Umsetzung

### Neue Dateien
- `src/config/shotDirector.ts` — Konstanten: alle 36 Optionen mit `id`, `label` (DE/EN/ES via i18n), `promptFragment` (immer EN), `icon`, `description`
- `src/components/ai-video/ShotDirectorPanel.tsx` — Tab-UI mit 4 Popover-Buttons + ausgewählten Chips + Reset-Button
- `src/lib/shotDirector/buildShotPromptSuffix.ts` — Reine Funktion: nimmt Selektion → liefert englisches Prompt-Suffix nach festem Schema (`Shot from {angle}, {lighting}, {movement}, {framing}.`)

### Änderungen
- `src/components/ai-video/ToolkitGenerator.tsx`:
  - State `shotSelection: { angle?, lighting?, movement?, framing? }`
  - Panel zwischen Prompt-Textarea und Cast/Brand-Character einfügen
  - In der Submit-Logik vor dem Aufruf: `finalPrompt = userPrompt + buildShotPromptSuffix(shotSelection) + buildCastPromptSuffix(...) + buildCharacterPromptInjection(...)`
  - Live-Preview-Box unterhalb des Panels (collapsible) zeigt zusammengebauten Endprompt
  - Persistenz: letzte Selektion in `sessionStorage` merken (wie Workspace Persistence Pattern)

### Localization
- UI-Labels (Kategorienamen, Tooltips, Beschreibungen) via `useTranslation` in EN/DE/ES
- `promptFragment` bleibt **immer Englisch** (Core-Regel: visual prompts EN für Output-Qualität)

### Provider-Kompatibilität
Funktioniert mit **allen 9 Modellen**, weil es reine Prompt-Anreicherung ist. Kein Modell-spezifischer Code. Models, die explizit Camera-Movement-Parameter haben (z.B. Luma Ray 2 mit orbital/pan), bekommen den Text-Hint zusätzlich — schadet nicht, verstärkt das Signal.

### Design (James Bond 2028)
- Glassmorphism-Card mit goldener Akzent-Linie
- Icons aus `lucide-react` (Camera, Sun, Move, Crop)
- Selected-Chips in Gold (`#F5C76A`) auf deep black
- Smooth `animate-fade-in` beim Öffnen der Popover

## Was NICHT in diesem Plan enthalten ist
- Eigenes Bildmodell (Artlist Original 1.0 Equivalent) — das ist eine $10M+ Trainings-Investition und nicht sinnvoll
- Continue-from-Frame als neuer Workflow — das macht der **Video Composer** bereits über Scene-by-Scene mit `referenceImage`
- Stock-Music-Library — separates Thema

## Aufwand
**~3–4 Stunden Implementierung** — eine UI-Komponente, eine Config-Datei, eine reine Helper-Funktion, eine Integration in `ToolkitGenerator.tsx`. Kein Backend, keine Migration, keine Edge Function.

## Memory-Update nach Implementierung
Neue Memory-Datei `mem://features/ai-video-studio/shot-director-ui.md` mit den 36 Optionen + Prompt-Schema, damit zukünftige Erweiterungen (z.B. neue Modelle, neue Kategorien) konsistent bleiben.
