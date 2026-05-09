## Ziel

Den Video Composer auf das Qualitäts- und Flow-Niveau von **Artlist Studio** heben. Kernidee von Artlist: **„Frame-First, Shot-by-Shot"** — jedes Standbild ist ein Baustein, jeder Shot kann vom End-Frame des vorigen Shots fortgesetzt werden. So entstehen nahtlose Übergänge ohne Stitching-Magie.

Wir haben bereits 80 % der Bausteine (`generate-scene-still`, `useFrameContinuity`, `composer-frames` Bucket, Brand Characters, Mention Library, Multi-Scene Render). Was fehlt, ist der **integrierte Workflow** und die **automatische Verkettung**.

---

## Phase 1 — „Continue from this frame" (Artlist-Kernfeature)

Das wichtigste fehlende Puzzleteil. Macht aus zwei Lip-Sync-Clips einen visuell nahtlosen Cut.

1. **Frame-Picker im Video-Preview** (jede Szene)
   - Kleiner „📷 Pick frame"-Button unter jedem Clip-Player im Storyboard / Clips-Tab.
   - Pause-Position des Videos = gewählter Frame.
   - Optional: Slider-Scrubber mit Frame-Vorschau (Thumbnail-Strip).

2. **„Continue from this frame → Scene N+1"-Aktion**
   - Button neben Frame-Picker.
   - Extrahiert den gewählten Frame via bestehendem `useFrameContinuity` (kein neuer API-Call).
   - Setzt automatisch das `referenceImageUrl` der nachfolgenden Szene.
   - Kennzeichnet die Folge-Szene mit `continuityLocked = true` + Badge „🔗 Continued from Scene N".

3. **Auto-Chaining für Lip-Sync-Splits** (löst dein aktuelles Problem)
   - Sobald `replace_composer_scene_with_children` zwei Sprecher-Subscenes erzeugt, läuft im Anschluss automatisch ein `chainScenesByLastFrame()`-Hook:
     - Nimmt das Reference-Image der Eltern-Szene als `referenceImageUrl` für **beide** Subscenes (gleicher visueller Anker).
     - Markiert beide Szenen als `continuityLocked`.
   - Ergebnis: identische Location/Charakter-Optik in beiden Lip-Sync-Clips, weicher Schnitt.

4. **Default-Crossfade 0.3s zwischen Continuity-Lock-Paaren**
   - Wenn Szene N und N+1 beide `continuityLocked = true` sind, setzt der Composer im Render-Payload automatisch `transition: { type: 'crossfade', durationSeconds: 0.3 }`.
   - User kann es im Director's Cut weiter feintunen.

---

## Phase 2 — Frame-First Pflicht-Workflow im Composer

Artlist zwingt den User: erst Still, dann Motion. Wir machen es zur **Default-Einstellung** (überspringbar für Power-User).

1. **Storyboard-Tab Reorganisation**
   - Pro Szene drei Sub-Steps mit klarem Status:
     1. **Frame** (Nano Banana 2 Still — bestehend)
     2. **Direct** (Shot-Director: Camera Move, Lens, Lighting)
     3. **Generate** (i2v mit gewähltem Frame als first_frame)
   - „Generate"-Button bleibt **disabled**, bis ein Frame ausgewählt ist (Override-Toggle in Settings: „Skip frame-first").

2. **Live Anchor-Strategy-Badge**
   - Unter jedem Frame-Slot zeigen wir die Strategie an, die `compose-scene-anchor` gewählt hat („Multi-Portrait", „Single Anchor", „Pure i2v").
   - Macht transparent, was im Hintergrund passiert (= Artlist's „behind the scenes mixes models").

3. **Reference Image Library im Frame-Picker**
   - Beim Anlegen einer Szene: Dropdown „Use frame from…"
     - Last frame of Scene N-1
     - Any other generated still
     - Brand Character / Location portrait
     - Upload eigenes Bild
   - Macht Frame-Wiederverwendung zum Standard, nicht zur Ausnahme.

---

## Phase 3 — Visuelle Konsistenz erzwingen (Artlist's „Maintain consistency")

1. **Auto-Inject Brand Character + Location bei jedem Still**
   - Wenn die Szene eine `@character`- oder `@location`-Mention enthält, wird das entsprechende Portrait/Background automatisch als Reference an `generate-scene-still` übergeben (auch wenn der User nichts auswählt).
   - Vorhanden in Toolkit, fehlt im Composer-Frame-Generation-Pfad.

2. **Drift-Score sichtbar an JEDEM Cut**
   - Bisher zeigt `ContinuityGuardianStrip` nur „relevante" Cuts. Ändern auf: zeige eine Mini-Ampel (grün/gelb/rot) zwischen ALLEN benachbarten Szenen.
   - Klick → Detail-Vergleich + 1-Klick „Re-anchor next scene to previous last-frame".

3. **„Regenerate Shot, keep frame"-Action**
   - Aktuell: bei Re-Generate wird der Frame oft neu gewählt.
   - Neu: Button „🔄 New variation" hält `referenceImageUrl` + Charakter/Location konstant, würfelt nur Camera Move / Action-Prompt neu.

---

## Phase 4 — Polish & Pacing

1. **Default-Transition-Set festlegen**
   - Wir reduzieren die Composer-Default-Transitions auf **2** (Hard-Cut + 0.3s Crossfade).
   - Fancy Transitions (Wipe, Flip etc.) bleiben verfügbar, sind aber nicht Default — Artlist macht es genauso, weil seamless > flashy.

2. **Async Render Toast statt Modal-Lock**
   - Beim „Generate Scene" verschwindet das Modal sofort, der User sieht den Fortschritt nur als Skeleton in der Szenenkarte (wie Artlist: „You can also continue working on other shots while generations render").
   - Nutzt bestehende parallele Generation, entfernt nur den blockierenden UI-State.

3. **Smarter Render-All-Button**
   - „Render All & Stitch" zeigt vor dem Klick eine Pre-Flight-Card:
     - Wie viele Szenen haben kein Reference Image? (Warnung)
     - Welche Cuts haben Drift-Score > 60? (Warnung + Quick-Fix)
   - Verhindert mittelmäßige Endergebnisse.

---

## Technische Details

### DB
- Neue Spalte `composer_scenes.continued_from_scene_id uuid` (nullable, FK self) — für „Continue from frame"-Verknüpfung und spätere Visualisierung im Storyboard.
- Neue Spalte `composer_scenes.frame_pick_seconds numeric` — Position im Video, an dem der User den Frame gepickt hat (für Re-Generation).
- Index: `(project_id, order_index)` — nötig für effizientes Auto-Chaining-Lookup.

### Frontend
- **Neu:**
  - `src/components/video-composer/FramePickerOverlay.tsx` — Scrubber + Pick-Button als Overlay auf jedem Clip-Player.
  - `src/components/video-composer/ContinueFromFrameButton.tsx` — Single-Action-Button, wraps `useFrameContinuity`.
  - `src/hooks/useChainScenesByLastFrame.ts` — Helper, der nach Lip-Sync-Split & manuellen Aktionen Szenen verkettet.
- **Geändert:**
  - `VideoComposerDashboard.tsx` — nach `replace_composer_scene_with_children` `chainScenesByLastFrame()` aufrufen.
  - `ContinuityGuardianStrip.tsx` — Mini-Ampel pro Cut (statt Filter auf „relevant").
  - `SceneCard.tsx` / `ClipsTab.tsx` — Frame-Picker Overlay einblenden, „Continue from this frame"-Button anzeigen.
  - `StoryboardTab.tsx` — 3-Step UI (Frame → Direct → Generate).
  - `compose-video-clips/index.ts` — Auto-Crossfade 0.3s in Render-Payload bei `continuityLocked`-Paaren.
  - `compose-scene-anchor/index.ts` — bei Mention von `@character` / `@location` Portrait/Background automatisch in `portraitUrls[]` aufnehmen.

### Edge Functions
- Keine neuen Functions nötig — alle Pipelines existieren bereits (`generate-scene-still`, `compose-scene-anchor`, `compose-video-clips`, `useFrameContinuity` läuft client-side).
- Nur Payload-Erweiterungen.

### Telemetry / QA
- `posthog`-Events: `composer.frame_picked`, `composer.continue_from_frame`, `composer.auto_chained_split`.
- Bond-QA Smoke-Test: 2-Sprecher-Split → automatische Verkettung → beide Szenen haben gleiches Reference-Image. Mock via `x-qa-mock`.

---

## Sichtbares Ergebnis für dich

Nach Umsetzung kannst du:

1. Lip-Sync-Split machen → beide Sprecher-Szenen sind automatisch visuell verkettet (gleicher Look, weicher 0.3s-Übergang).
2. Auf jedem Clip auf „📷 Pick frame" klicken → „Continue from this frame" → nächste Szene startet pixelgenau dort.
3. Durch das Storyboard scrollen → jeder Cut hat eine Ampel (grün = perfekt, gelb = leichter Drift, rot = visueller Bruch + Quick-Fix).
4. „Render All & Stitch" produziert Material, das sich anfühlt wie ein Artlist-Cut — keine sichtbaren Sprünge, ein konsistenter Look.

---

## Reihenfolge der Umsetzung

Phase 1 → sofortiger spürbarer Effekt (löst aktuelles Problem).
Phase 2 → macht Frame-First zum Default und erzieht den User.
Phase 3 → erzwingt Charakter-/Location-Konsistenz wie Artlist.
Phase 4 → finishing touches.

Empfohlen: **alles in einem Build-Schritt** umsetzen (du hast „egal wie aufwendig" gesagt), QA-Smoke-Test danach.
