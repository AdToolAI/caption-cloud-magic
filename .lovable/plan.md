## Stage 18 — "One-Page Composer" + 3-Modus-Leiste links (Editor · Stil · Avatar Studio)

### Ziel
Komplettes Composer-Redesign in einer Stage:
1. **Workflow-Stepper oben** als horizontale Leiste (statt linker Sidebar).
2. **Linke Spalte = 3-Modus-Leiste** mit segmentiertem Switcher:
   - **① Editor** – Prompt/Cast/Audio/Look/Erweitert (heutige `SceneCard` embedded)
   - **② Stil** – kompletter Looks/Feintuning/Modifier-Bereich (heutiger SceneStyleSheet-Inhalt, jetzt als feste Spalte statt Modal)
   - **③ Avatar** – neues "Character-Workshop" mit 3D-Vorschau, Wardrobe, Features (Game-Engine-Look)
3. **Rechte Spalte = Szenen-Mini-Player** mit Inline-"Generieren"-Button → Clips-Tab entfällt aus User-Sicht.
4. Render-Pipeline (Frame-Chain, Splits, Lipsync) komplett unsichtbar — am Ende läuft im Mini-Player nur das fertige Video mit VO + Lip-Sync.

### Layout

```text
┌────────────────────────────────────────────────────────────────────┐
│ [① Briefing] [② Storyboard ●] [③ Voice] [④ Musik] [⑤ Export]      │ ← Top-Stepper
├────────────────────────────────────────────────────────┬───────────┤
│  [ ✎ Editor ] [ 🎨 Stil ] [ 👤 Avatar ]   ← Modus-Switch│ SZENEN · 5│
│ ───────────────────────────────────────────────────────│┌─────────┐│
│                                                        ││▶ S1     ││
│   { dynamischer Inhalt je nach Modus }                 ││[Gener.] ││ ← aktiv
│                                                        │└─────────┘│
│   Editor:  Prompt · Cast · Audio · Look · Erweitert    │┌─────────┐│
│   Stil:    Looks-Grid · Feintuning · Modifier · Live-  ││▶ S2     ││
│            Preview (alles inline, kein Modal)          ││[Gener.] ││
│   Avatar:  3D-Bühne · Outfit · Hair · Accessories ·    │└─────────┘│
│            Pose · Voice · Save-to-Cast                 │ …         │
│                                                        │ [+ Szene] │
└────────────────────────────────────────────────────────┴───────────┘
```

Viewport 1060px: links `col-span-8`, rechts `col-span-4`. <1024px: Szenen werden zur horizontalen Schiene unter der Hauptspalte; Modus-Switch bleibt sticky oben.

### Umsetzung

**1. `VideoComposerDashboard.tsx` — Top-Stepper**
- `MotionStudioStepSidebar` ersetzen durch neue `MotionStudioTopStepper` (sticky horizontale Leiste, 5 Pills: Briefing/Storyboard/Voice/Musik/Export). Clips-Tab fliegt aus dem Stepper, Datei + `?tab=clips` bleiben als Power-User-Fallback erhalten.
- Hauptcontent nutzt volle Breite.

**2. Neue Komponente `MotionStudioTopStepper.tsx`**
- Glass-Pills im Bond-2028-Stil, gold-Glow für aktiv, Check-Icon für done, Progress-Bar darunter.

**3. `StoryboardTab.tsx` — neues 2-Spalten-Layout**
- Links: neuer `<StoryboardLeftPane mode={editor|style|avatar} />` (`col-span-8`).
- Rechts: `<StoryboardScenePlayerList />` (`col-span-4`, scrollt).
- `CastConsistencyMap` wandert in eine kleine "Cast-Map anzeigen"-Disclosure über dem Modus-Switch.

**4. Neue Komponente `StoryboardLeftPane.tsx`**
- 3-Tab-Switcher (segmented control, Bond-Glass-Stil) mit Persistenz pro Szene in Local State.
- Body switcht zwischen:
  - `<SceneEditorMode />` → bisherige `<SceneCard embedded />` Logik
  - `<SceneStyleMode />` → Inhalt aus `SceneStyleSheet` (Looks-Grid, Feintuning, Modifier, Live-Preview-Footer) als Inline-View, kein Modal
  - `<SceneAvatarMode />` → neuer Character-Workshop (siehe Punkt 5)
- "Stil ändern"-Button im Editor-Modus springt automatisch in Stil-Tab statt Sheet zu öffnen. "Cast bearbeiten" springt in Avatar-Tab.

**5. Neue Komponente `SceneAvatarMode.tsx` — Game-Engine-Look Character Workshop**
- **Bühnen-Header**: 16:9 "3D-Stage" mit dem aktiven Cast-Member.
  - Datenquelle: vorhandene `brand_characters.portrait_url` (Hedra-optimiert, 2D Hi-Res).
  - 3D-Effekt via CSS: parallax + tilt-on-mouse (`framer-motion`), Bond-Spotlight-Glow, gold Rim-Light, Drehpunkt-Indikator. Optional 360°-Karussell aus den `avatar_pose_variants` (4 Posen) + `avatar_wardrobe_variants` (4 Outfits) — die existieren bereits laut Memory.
  - Toggle Pose ↔ Outfit ↔ Vibe wie ein Charakter-Selektor (PS5-Style, große Tiles unten).
- **Linke Spalte (innerhalb Avatar-Modus)**: Cast-Member-Liste der Szene, "+ Avatar hinzufügen" → öffnet `useAccessibleCharacters` (own + purchased + Marketplace-Teaser).
- **Rechte Spalte**: Anpass-Stack (Tabs):
  - **Look**: Outfit-Grid (`avatar_wardrobe_variants`), Pose-Grid (`avatar_pose_variants`).
  - **Voice**: Voice-Picker aus `default_voice_id` + Custom-Voices.
  - **Lip-Sync**: Toggle "Diese Szene = Talking-Head" → schaltet im Render-Pfad automatisch HeyGen/Cinematic-Sync ein (heute manueller Step).
  - **Identity**: Quick-Link zum vollen `BrandCharacters` für Re-Upload / neuen Charakter.
- **Footer**: "In dieser Szene verwenden" speichert Auswahl in `scene.cast` + `scene.shotDirector` (z. B. Pose) — keine Backend-Änderung, nur das bestehende `scene_cast`-Field bekommt zusätzliche `selectedPose` / `selectedWardrobe` IDs.
- **Marketing-Versprechen "wir übertreffen Artlist"**: Workshop-Frame mit subtilem Grid-Bokeh, animiertem Cyan-Scanline-Sweep, gold Studio-Spots, sound-design-tauglicher Idle-Animation (CSS-Loop). Kein echtes 3D-Engine-WebGL — wir simulieren den Look mit den vorhandenen 2D-Varianten + CSS/Framer.

**6. Neue Komponente `StoryboardScenePlayerList.tsx`**
- Jede Szene = 16:9 Mini-Player-Karte (`SceneInlinePlayer`) mit:
  - Thumbnail oder fertiges Video (autoplay-on-hover, muted).
  - Großer **"Generieren"** / **"Neu generieren"** Center-Button wenn kein Clip.
  - Status-Pill: `Wartet`, `Generiert…`, `✓ Fertig`. Während Render: animierter Schimmer + dezenter Text "Szene wird gebaut…" — **keine** Pipeline-Details.
  - Footer: Type · Dauer · Kosten · Drag-Handle. Aktive Szene = goldener Border-Glow.
- DnD bleibt (`@dnd-kit`).

**7. Neue Hook `useSceneGenerate.ts`**
- Extrahiert die heutige `handleGenerateScene`-Logik aus `ClipsTab` so, dass sie aus dem InlinePlayer aufrufbar ist.
- Triggert nach erfolgreichem Clip automatisch HeyGen / Cinematic-Sync, wenn die Szene als Talking-Head/Lipsync markiert ist → Endresultat = ein einziger fertig synchronisierter Clip im Player.
- Wallet, Refund, Realtime-Subscription bleiben wie bisher.

**8. Hidden Pipeline**
- `RenderPipelinePanel`, `ContinuityGuardianStrip`, `SceneClipProgress` aus dem Storyboard entfernen. Nur unter `?debug=pipeline` für interne Diagnose.

### Files

**Neu**
- `src/components/video-composer/MotionStudioTopStepper.tsx`
- `src/components/video-composer/StoryboardLeftPane.tsx`
- `src/components/video-composer/SceneStyleMode.tsx` (extrahiert aus `SceneStyleSheet`-Body, ohne Modal-Wrapper)
- `src/components/video-composer/SceneAvatarMode.tsx` (Character-Workshop)
- `src/components/video-composer/AvatarStage3D.tsx` (CSS/Framer-Tilt-Stage + Pose-Karussell)
- `src/components/video-composer/SceneInlinePlayer.tsx`
- `src/components/video-composer/StoryboardScenePlayerList.tsx`
- `src/hooks/useSceneGenerate.ts`

**Geändert**
- `src/components/video-composer/VideoComposerDashboard.tsx` (Sidebar→TopStepper, Tab-Liste)
- `src/components/video-composer/StoryboardTab.tsx` (Editor links via `StoryboardLeftPane`, Player-Liste rechts)
- `src/components/video-composer/StudioPane.tsx` (Padding/Width-Tune)
- `src/components/video-composer/SceneStyleSheet.tsx` (Body in eigene Komponente extrahiert, Sheet bleibt als Mobile-Fallback)

### Out of Scope
- Keine echte 3D-Engine (Three.js/WebGL). 3D-Look wird mit Tilt + Pose-Varianten + CSS-Lighting simuliert. Echte WebGL-Avatare = separate spätere Stage.
- Keine neuen Edge-Functions, Wallet-Logik, Tabellen.
- Keine i18n-Erweiterung — neue Strings als Fallback EN inline.
- Mobile-Specific-Rebuild: nur Stack-Fallback <1024px.

### Akzeptanz
1. `/video-composer` zeigt **horizontale Stepper-Leiste** oben, keine linke Step-Sidebar mehr.
2. Storyboard-Tab: links **3-Modus-Leiste** (Editor/Stil/Avatar) mit segmentiertem Switch oben, rechts **Mini-Player-Liste**.
3. Avatar-Modus zeigt aktiven Cast-Member auf einer Game-Engine-artigen Bühne mit Tilt-Effekt, Pose- und Outfit-Karussell.
4. Klick auf "Generieren" in einem Mini-Player → Status-Animation → fertiger Clip mit VO + Lip-Sync läuft direkt im Player. Kein Tab-Wechsel, keine Pipeline-Details sichtbar.
5. Stepper zeigt nur 5 Schritte (Briefing → Storyboard → Voice → Musik → Export). Clips fehlt aus User-Sicht.
6. Bestehende Wallet-, Refund-, Realtime-, Marketplace-Logik unverändert.

Soll ich so umsetzen?
