# Motion Studio Übergänge — Abschluss-Runde

Fortsetzung des bereits genehmigten Plans. Teil A (Thumbnail-Bug) und B.1 (Handle + Popover + State-Persistence) sind live. Diese Runde schließt die restlichen fünf Punkte in einer Iteration ab.

---

## 1. B.2 — Live-Preview der Übergänge (`ComposerSequencePreview`)

**Ziel:** Der bestehende Sequenz-Player zeigt zwischen zwei Szenen das im Popover gewählte Motiv — nicht nur harten Cut.

**Vorgehen:**
- Nur DOM/CSS-basiert — keine Remotion-Player-Änderung, kein neuer Bundle.
- Beim Szenenwechsel wird die letzte Szene für `transitionDuration` Sekunden als abgehende Layer über der neuen Szene gehalten und per CSS-Animation ausgeblendet (Crossfade / Fade), verschoben (Slide/Push), skaliert (Zoom), maskiert (Wipe) oder unscharf gemacht (Blur).
- Timing: aktuelle Szene startet `duration/2` früher, vorherige läuft `duration/2` länger — CapCut-Standard, spiegelt Export.
- `type === 'none'`: Null-Overhead, harter Schnitt wie heute.
- Easing über bestehendes `easeTransition` aus `src/lib/directors-cut/transitionEasing.ts`.
- Reine Preview-Wrapper-Komponente `SceneTransitionPreviewLayer` (~60 Zeilen) — kapselt die 6 CSS-Varianten hinter einem Prop-basierten Interface.

**Verifizierung:**
- Preview mit 3 Szenen + Crossfade 0.6s zwischen 1↔2 zeigt weiches Blend, zwischen 2↔3 harter Schnitt.
- Cut bleibt Cut, kein visueller Overhead.

---

## 2. B.3 — Export-Payload (snake_case) an Remotion-Composition

**Ziel:** Der finale MP4-Render zeigt exakt dieselben Übergänge wie die Preview.

**Vorgehen:**
- Client-seitig: Beim Zusammensetzen des Composer-Render-Payloads (dort wo `scenes[]` an die render/compose-Edge-Function geht) pro Szene ein zusätzliches Feld `transition_out = { type, duration_ms, easing: 'smooth' }` mitschicken. Bestehende `transitionType` / `transitionDuration` bleiben unangetastet für Legacy-Konsistenz.
- Composer-Composition-Loader (Remotion `Composition` in `src/remotion/compositions/*`): pro Szene den passenden Renderer aus `src/remotion/components/transitions/*` (Crossfade/Fade/Slide/Zoom/Wipe/Blur/Push) auswählen — identisch zur Director's-Cut-Auflösung. `type === 'none'` überspringt den Wrapper.
- Edge-Function `compose-video-clips` (oder das aktive Render-Entrypoint): Falls sie das Payload strikt validiert, `transition_out` als optionales Feld in der Zod-Schema aufnehmen und in die `inputProps` durchreichen. Keine anderen Felder ändern.
- Kein Remotion-Rebuild nötig — alle Transition-Komponenten sind bereits im aktuellen Bundle.

**Verifizierung:**
- Test-Export mit gemischten Übergängen → fertiges MP4 zeigt Crossfade an markierter Stelle, harten Cut an anderer (Frame-genau).
- Bestehende Composer-Projekte ohne `transition_out` verhalten sich wie heute (Fallback = 'none').

---

## 3. StudioPane-Sektion „Übergang zur nächsten Szene"

**Ziel:** Detail-Editor + Tastatur/A11y-Zugang zum Übergang der aktuell selektierten Szene.

**Vorgehen:**
- Neue Card-Sektion in `StudioPane.tsx` unterhalb des Timing-/Dauer-Bereichs.
- Nutzt exakt dieselbe `TransitionPopover`-Logik: `TransitionSelector` + Slider inline (kein Popover, weil hier flächig).
- Wird nur angezeigt, wenn die selektierte Szene nicht die letzte ist.
- Schreibt via denselben `updateScene(id, { transitionType, transitionDuration })`-Pfad wie das Storyboard-Handle — eine Quelle der Wahrheit.

---

## 4. i18n DE/EN/ES

Neue Keys in `src/i18n/locales/{de,en,es}.json` (oder aktueller Locale-Struktur):
- `motionStudio.transitions.title` — „Übergang zur nächsten Szene" / „Transition to next scene" / „Transición a la siguiente escena"
- `motionStudio.transitions.duration` — „Dauer" / „Duration" / „Duración"
- `motionStudio.transitions.cut` — „Kein Übergang" / „No transition" / „Sin transición"
- `motionStudio.transitions.more` — „Mehr Übergänge" / „More transitions" / „Más transiciones"
- `motionStudio.transitions.less` — „Weniger Übergänge" / „Fewer transitions" / „Menos transiciones"
- `motionStudio.transitions.notRendered` — „Noch nicht gerendert" / „Not rendered yet" / „Aún no renderizado" (Teil A)

`TransitionHandle`, `TransitionPopover`, StudioPane-Sektion und die neuen Placeholder-Labels aus Teil A verwenden `useTranslation()`. Hardcoded Strings raus.

**Merke:** Visual-Prompts an KI-Modelle bleiben Englisch (Core-Rule) — hier geht es nur um UI-Text.

---

## 5. Memory-Doku

Neue Datei `mem/features/video-composer/motion-studio-transitions.md`:
- Datenfluss: `TransitionHandle` → `updateScene` → `scene.transitionType/Duration` → Preview-Wrapper + `transition_out` snake_case im Render-Payload → Remotion-Composition wählt `src/remotion/components/transitions/*`.
- Wiederverwendung der Director's-Cut-Bausteine (kein Fork).
- Lipsync-Orthogonalität: v190–v209 unangetastet; Übergänge liegen außerhalb des Sync-Fensters.
- v209-Consent bleibt unabhängig aktiv.

Index-Update in `mem/index.md` mit einer Zeile unter „Architecture & Infrastructure".

---

## Reihenfolge

1. B.2 Live-Preview (`SceneTransitionPreviewLayer` + Integration in `ComposerSequencePreview`).
2. StudioPane-Sektion (nutzt dieselben Bausteine — natürliche Erweiterung).
3. B.3 Render-Payload + Composition-Loader-Selektion.
4. i18n-Keys in allen drei Locales.
5. Memory-Doku + Index-Update.
6. Typecheck über alle geänderten Dateien.

## Scope-Guard (unverändert)

- Kein Eingriff in Lipsync (v190–v209).
- Kein Refactor des Director's-Cut-Editors.
- Keine neuen Effekte über die 8 bestehenden hinaus.
- Kein Audio-Ducking / Musik-Crossfade in dieser Runde.
- Kein Storyboard-Layout-Umbau.
