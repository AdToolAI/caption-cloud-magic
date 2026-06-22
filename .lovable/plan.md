
# Motion Studio Relaunch – "Sound Stage"

Ein dreiphasiger Umbau, der das Motion Studio von einer Werkbank in ein **Filmset** verwandelt – ohne eine einzige Funktion zu verlieren. Lipsync-Pipeline, Edge Functions, Render-Engine und Datenmodell bleiben **vollständig unangetastet**. Alle Änderungen sind UI/UX, plus eine schlanke Audio-Atmosphäre-Schicht.

## Leitidee

**"Wenn der Creator das Motion Studio öffnet, soll sich das anfühlen, als würde im Briefing-Raum von MI6 das Licht ausgehen – aber alle Werkzeuge sind so klar erreichbar wie auf einem Apple-Gerät."**

- **Visuell:** Deep Black, Gold, präzise Glasflächen, Spotlights – Bond-DNA verstärkt, aber ruhiger und edler.
- **Funktional:** Ein klarer Hauptpfad mit allen Tiefen einklappbar – für Solo-Creator und KMU, die nicht jeden Tag drehen.
- **Audio:** Ambient + Cinematic Events (Klappe, Action, Cut) als Standard, mit globalem Mute-Toggle.

---

## Phase 1 – Sound Stage Shell (Atmosphäre & Identität)

Die globale Hülle des Studios. Wenn der User eine Szene öffnet, kippt die UI in den "Set-Modus".

### 1.1 Studio Shell Layout
- Neuer Wrapper `MotionStudioStage` ersetzt den aktuellen Page-Container von `/video-composer`.
- Sidebar collapsed-by-default sobald eine Szene aktiv ist, mit Floating-Reveal-Pill links.
- Topbar wird zu einer **Director's Bar**: Projektname links, Stage-Status (Take-Counter, gerenderte Sekunden, Budget), Studio-Mode-Toggle, Mute-Toggle, Vollbild rechts.
- Hintergrund: Tiefes `#050816` mit subtilem radialem Gold-Glow von oben links, dezenter Film-Korn-Layer (1–2 % opacity, GPU-billig via SVG-Filter).

### 1.2 Cinematic Welcome Moment
- Beim ersten Öffnen pro Session: 700ms Klappen-Animation (SVG Filmklappe schließt, "Take 01" Caption), dann Fade in den Studio Floor.
- Nur einmal pro Tab-Session – nicht aufdringlich.

### 1.3 Storyboard Strip (Hauptnavigation)
- Horizontaler Filmstreifen direkt unter der Director's Bar.
- Jede Szene = Polaroid-Karte mit Frame-First-Thumbnail (nutzt bestehende `scene_still_frames`), Take-Nummer, Dauer-Pill, Status-Glow (idle/generating/ready/failed).
- Drag-to-reorder, "+ Add Scene" als geprägte Klappen-Karte am Ende.
- Klick = lädt Scene in den Editor darunter.
- Ersetzt visuell die heutige Scene-Tab-Bar; bestehende `SceneCard`-Logik bleibt, wird nur in den neuen Container gehängt.

### 1.4 Three-Mode Editor (Komplexitäts-Schalter)
Innerhalb jeder Szene drei klar getrennte Modi, oben rechts in der Scene Card:

| Modus | Sichtbar | Default für |
|---|---|---|
| **Quick** | 1 NL-Prompt + Generate. Scene Director übernimmt Rest. | Neue / KMU |
| **Direct** | Prompt + Cast + Style Preset + Duration | Wiederkehrende Creator |
| **Studio** | Vollständige Tab-Leiste (Shot Director, Performance, Continuity, etc.) | Profis |

- Default bei neuen Projekten: **Quick**.
- Modus pro Projekt persistiert (localStorage + Spalte in `composer_projects.preferred_editor_mode`).
- Kein Funktionsverlust – alle Tabs bleiben im Studio-Modus exakt wie heute.

### 1.5 Ready-for-Take Indikator
- Ersetzt die heutige Sammlung an grünen/gelben Badges durch **einen** zentralen Status-Chip pro Szene: *"Bereit für Take"* / *"Fehlt: Charakter"* / *"Fehlt: Voiceover"*.
- Klick öffnet eine schlanke Checkliste (Sheet), aus der Detail-Badges weiterhin erreichbar bleiben.

---

## Phase 2 – Director's Workflow (Flow & Sprache)

Den Weg von Idee zu fertiger Szene um die Hälfte verkürzen.

### 2.1 Inline AI-Co-Pilot
- Goldenes Mikrofon-Icon in jeder Scene Card.
- Eingabe in natürlicher Sprache: *"Mach diese Szene dramatischer"*, *"Setze die Szene bei Sonnenuntergang"*, *"Wechsle Outfit zu Römerrüstung"*.
- Lovable AI Tool-Call mappt auf bestehende Felder (Shot Director, Style Preset, Performance, Cast, Wardrobe-Lock).
- Diff-Vorschau vor Anwendung – User akzeptiert oder verwirft.
- Nutzt bestehende `scene-director` Edge Function – nur erweitert um neue Tools (`updateStyle`, `updatePerformance`, `swapOutfit`).

### 2.2 Render-Moment als Cinematic Event
- "Generate" Button heißt jetzt **"Action"** mit Klappen-Icon.
- Klick: Klappen-Snap-Animation auf der Scene Card (300ms), Card pulsiert in Gold während Polling, Border wandert wie ein Scheinwerfer-Sweep.
- Bei Fertigstellung: Reveal-Animation (Card kippt kurz, neuer Thumbnail erscheint), dezenter "Cut"-Soundcue.
- Bei Fehler: roter Blitz statt rotem Toast, plus Refund-Hinweis bleibt sichtbar.

### 2.3 Director's Voice (Sprach-Layer)
- Quality Coach formuliert in Regisseur-Sprache statt Prozenten:
  - *"Die Kamera atmet, aber das Licht erzählt noch nichts."*
  - *"Charakter ist gesetzt – fehlt ein Ankerblick zur Linse."*
- Lokalisiert (DE/EN/ES) über bestehenden i18n-Layer.
- Score (0–100) bleibt intern, wird nur als kleiner Ring rechts visualisiert.
- Begriffs-Refactor in der UI: *Generate → Take*, *Project → Production*, *Output → Final Cut*, *Asset Library → Cast & Set*. (Nur Labels, keine Routen/IDs.)

### 2.4 Cinemascope Preview
- Player erhält neuen "Cinema"-Toggle (Letterbox 2.39:1, schwarze Balken, goldener Glow-Rand, Tastatur-F).
- Funktioniert in der Scene Card *und* in der "Render All & Stitch"-Vorschau.

---

## Phase 3 – Atmosphäre (Audio & Mikro-Inszenierung)

Optional aktivierbar, Default **an** mit sofort sichtbarem Mute-Toggle in der Director's Bar.

### 3.1 Set Ambient
- Beim Öffnen einer Production: leiser Soundstage-Ambient-Loop (~25 s, -32 dB), generiert einmalig via ElevenLabs SFX und auf CDN gecached.
- Beim Schließen / Mute / Tab-Hidden: sanftes Fade-out.

### 3.2 Cinematic Event Cues
- **Action** (Klick auf Take): kurzer Klappen-Snap (~400ms, -20dB).
- **Cut** (Render-Done): weicher Filmrollen-Stop.
- **Take Failed**: gedämpfter, tiefer Thud.
- Alle Cues lokal als kleine MP3s in `src/assets/sounds/` über Lovable Assets, ein einziger `useStageAudio()` Hook mit Web Audio Gain Node und respektiert `prefers-reduced-motion` + globalen Mute.

### 3.3 Scene-Mood Underscore (opt-in pro Szene)
- Erweiterte Stufe: Wenn eine Szene Stil "Action" / "Dialog" / "Atmosphere" hat, läuft beim aktiven Editieren ein dezentes Score-Snippet aus der Music Library im Hintergrund.
- Standardmäßig **aus**, aktivierbar über ein zweites Pill im Mute-Toggle (3-Stufen: Off / Ambient / Full Score).

### 3.4 Mute Persistenz & Accessibility
- Globaler Audio-State in `useStudioPreferences` (localStorage).
- WCAG: Sound nie als einziger Feedback-Kanal (visuelle Cues immer parallel).
- Komplettes Auto-Mute wenn `prefers-reduced-motion: reduce`.

---

## Was sich **nicht** ändert (Sicherheits-Zone)

- Lipsync-Pipeline (Sync.so v3, Dialog-Shot, ASD-Strategy, Webhook).
- Alle Edge Functions außer evtl. Erweiterung von `scene-director` um neue Tool-Definitionen.
- Datenbank-Schema außer **einer** neuen optionalen Spalte `preferred_editor_mode text` auf `composer_projects`.
- Render-Engine, Continuity Guardian, Frame-First, Multi-Character Composition, Wardrobe Lock, alle Provider-Integrationen.
- Bestehende `SceneCard`, `ScenePromptDetailsSheet`, `ScenePerformancePanel`, `DirectorConsolePreview` – werden nur in neuen Wrapper gehängt und visuell justiert.

## Technischer Anhang

**Neue Komponenten**
- `src/components/video-composer/stage/MotionStudioStage.tsx` (Shell)
- `src/components/video-composer/stage/DirectorBar.tsx`
- `src/components/video-composer/stage/StoryboardStrip.tsx`
- `src/components/video-composer/stage/EditorModeToggle.tsx`
- `src/components/video-composer/stage/ReadyForTakeChip.tsx`
- `src/components/video-composer/stage/AiCopilotButton.tsx`
- `src/components/video-composer/stage/CinemascopeOverlay.tsx`
- `src/components/video-composer/stage/StageWelcomeMoment.tsx`

**Neue Hooks**
- `src/hooks/useStageAudio.ts` (Web Audio + ElevenLabs SFX cache)
- `src/hooks/useStudioPreferences.ts` (Mode + Mute + Cinema persistiert)

**Assets**
- `src/assets/sounds/clapper-action.mp3.asset.json` (via lovable-assets)
- `src/assets/sounds/cut-soft.mp3.asset.json`
- `src/assets/sounds/take-failed.mp3.asset.json`
- `src/assets/sounds/stage-ambient.mp3.asset.json` (einmalig ElevenLabs-generiert, dann auf CDN)

**Edge Function (Erweiterung, nicht Neubau)**
- `scene-director` bekommt zusätzliche Tools: `updateStylePreset`, `updatePerformance`, `swapWardrobe`, `restage` – wirken auf den bestehenden Scene-State.

**Migration**
- `composer_projects.preferred_editor_mode text default 'quick'`

**Tokens (in `src/index.css`)**
- `--stage-floor`, `--stage-spotlight`, `--clapper-snap`, `--cinemascope-bar`, `--mode-quick`, `--mode-direct`, `--mode-studio` – alle als HSL, integriert in Tailwind.

**Geschätzter Umfang**
- Phase 1: ~2 Tage (Shell, Strip, Mode-Toggle, Ready-Chip)
- Phase 2: ~2 Tage (Co-Pilot, Action-Moment, Director's Voice, Cinemascope)
- Phase 3: ~1 Tag (Audio-Layer, Assets, Mute-Persistenz)

Ergebnis: Ein Solo-Creator öffnet das Studio, hört leise das Set, sieht seinen Filmstreifen, tippt *"Sonnenuntergang am Strand, ruhige Stimmung"*, drückt **Action**, hört die Klappe, sieht den Spotlight-Sweep – und 90 Sekunden später schaltet das Cinemascope-Reveal seinen ersten Take frei. **Das ist die andere Welt.**

