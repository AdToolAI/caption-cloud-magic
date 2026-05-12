## Warum es noch genauso aussieht

Die Stage-18-Komponenten (`MotionStudioTopStepper`, `StoryboardLeftPane`, `StoryboardScenePlayerList`, `SceneInlinePlayer`, `SceneStyleMode`, `SceneAvatarMode`, `useSceneGenerate`) wurden zwar erstellt — aber **nirgends importiert**:

- `VideoComposerDashboard.tsx` rendert weiterhin `<MotionStudioStepSidebar />` (Zeile 1231) → linke vertikale Workflow-Leiste bleibt sichtbar.
- `StoryboardTab.tsx` rendert weiterhin `<StoryboardSceneStrip />` + `<StudioPane><SceneCard/></StudioPane>` (Zeilen 469–540) → kein 3-Mode-Switcher, keine Inline-Player rechts.

Der Screenshot bestätigt das exakt: alte vertikale Workflow-Liste, alter Editor unten.

## Was zu tun ist (rein visuelles Wiring, keine Logik-Änderungen)

### 1. Top-Stepper aktivieren (`VideoComposerDashboard.tsx`)

- Import `MotionStudioStepSidebar` → `MotionStudioTopStepper` (`StepItem` bleibt strukturgleich → Typ lokal beibehalten).
- "Clips"-Step aus `TABS` (Zeile 670) entfernen, damit der Stepper nur noch **Briefing → Storyboard → Voice → Musik → Export** zeigt. `'clips'` bleibt in `TabId` / `TAB_ORDER` / `TabsContent` erhalten als versteckter Fallback (`?tab=clips` Deep-Link, `persistAndGoToClips`).
- Layout (Zeile 1229–1239): von `flex gap-6` mit Sidebar links → vertikalem Stack. Stepper kommt **vor** dem `<div className="max-w-7xl ...">` als sticky Top-Bar; darunter bekommt der Tab-Content die volle Breite (`flex-1` Wrapper entfällt).
- Mobile `<TabsList>` bleibt unverändert.

### 2. Storyboard-Layout neu verdrahten (`StoryboardTab.tsx`)

- Imports: `StoryboardSceneStrip` + `StudioPane` raus → `StoryboardLeftPane` + `StoryboardScenePlayerList` + `useSceneGenerate` rein.
- `useSceneGenerate({ projectId, characters, onOptimisticPatch: (id, patch) => updateScene(id, patch), ensureProject: onEnsurePersisted })` → `generate` + `generating` map.
- Lokaler State `const [leftMode, setLeftMode] = useState<LeftPaneMode>('editor')`.
- Block ab Zeile 469 ersetzen:
  - **Links (`lg:col-span-8`)**: `<StoryboardLeftPane mode={leftMode} onModeChange={setLeftMode} sceneNumber=… editorSlot={<SceneCard …/>} styleSlot={<SceneStyleMode scene={selectedScene} onUpdate=… />} avatarSlot={<SceneAvatarMode scene={selectedScene} characters={characters} onUpdate=… />} />`
  - **Rechts (`lg:col-span-4`, sticky)**: `<StoryboardScenePlayerList scenes={scenes} selectedSceneId={selectedSceneId} generatingMap={generating} onSelect={setSelectedSceneId} onReorder={onUpdateScenes} onAddScene={addScene} onGenerate={generate} />`
- `previousSceneOfSelected` + `SceneCutDriftIndicator` bleiben oberhalb der `SceneCard` im `editorSlot` erhalten.
- Summary-Bar (Zeile 349–406) und Tipps + CastConsistencyMap bleiben unverändert oberhalb. Die "Clips generieren →" CTA bleibt für Power-User (führt jetzt nur noch in den versteckten Clips-Tab).

### 3. Sanity-Check der bereits gebauten Sub-Komponenten

- `SceneStyleMode` / `SceneAvatarMode` Props müssen mit dem `selectedScene`-Shape übereinstimmen (`scene`, `onUpdate(updates)`, `characters`). Falls Prop-Namen abweichen → minimaler Anpass-Patch in den jeweiligen Files (kein Logik-Change).
- `SceneInlinePlayer` muss `scene.clipUrl` + Status-Badge rendern; "Generieren"-Button disabled, wenn `isGenerating` oder kein `aiPrompt`.

### Nicht im Scope

- Keine neuen Edge Functions, kein neues Realtime, keine Wallet/i18n-Arbeit.
- `MotionStudioStepSidebar.tsx` und `StoryboardSceneStrip.tsx` bleiben im Repo (rückwärtskompatibel), werden nur nicht mehr importiert.
- Avatar-Mode bleibt CSS/Framer-Tilt-Stage (kein echtes Three.js).

### Akzeptanz

Nach dem Wiring zeigt `/video-composer`:
1. Horizontale Glass-Pill-Stepper-Leiste oben (5 Steps, kein "Clips" mehr).
2. Im Storyboard-Tab links 3-Mode-Switcher (Editor / Stil / Avatar), rechts Liste von Mini-Playern mit "Generieren"-Button pro Szene.
3. Klick auf "Generieren" startet `compose-video-clips` für genau diese Szene → Status-Animation im Mini-Player → fertiger Clip erscheint inline, **ohne Tab-Wechsel**.