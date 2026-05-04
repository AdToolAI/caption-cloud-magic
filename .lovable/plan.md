## Problem

Im Storyboard von **Motion Studio / Video Composer** verschwindet eine neu hinzugefügte Szene sofort nach dem Klick auf **„+ Szene"**.

**Ursache** (verifiziert in `VideoComposerDashboard.tsx`):

- `addScene` in `StoryboardTab.tsx` erzeugt die Szene mit einer lokalen ID `scene_<timestamp>` und ruft `onUpdateScenes` (= `setScenes` im Dashboard) auf.
- `setScenes` startet einen debounced DB-Sync (`persistScenesToDb`), aber dieser **filtert alles raus, was keine UUID ist** (`scenes.filter(s => isUuid(s.id))`) → die neue Szene wird **nicht** in `composer_scenes` eingefügt.
- Sobald `refetchScenesFromDb` läuft (Realtime-Subscription via `useComposerScenesRealtime`, Tab-Wechsel oder ein anderer Persist eines Mitarbeiters), wird `prev.scenes` komplett durch die DB-Antwort ersetzt → die noch nicht persistierte neue Szene wird überschrieben und verschwindet.

Zusätzlich: Die neu erzeugte Szene übernimmt keine der Presets der anderen Szenen (Cinematic Preset, Style, Shot Director, Director Modifiers, Clip-Source/Quality, Dauer, Transition…), nur harte Defaults.

## Lösung

### 1. Neue Szene direkt in der DB anlegen (kein „lokales Phantom" mehr)

Neue Funktion `insertSceneToDb(projectId, scene)` im Dashboard:

- INSERT in `composer_scenes` mit allen relevanten Feldern, lässt Postgres die UUID generieren.
- Liefert die neue UUID zurück, dann wird die Szene mit echter ID lokal gesetzt.

`StoryboardTab` ruft beim Klick auf **+ Szene** und beim Einfügen aus der **Scene Library** diese Funktion über eine neue Prop `onAddScene(partial)` auf statt nur über `onUpdateScenes`.

Fallback: Wenn `project.id` noch nicht existiert (brandneues, ungespeichertes Projekt), bleibt das alte Verhalten — Szene mit lokaler ID. Sobald `ensureProjectPersisted` läuft, werden die lokalen Szenen mit-persistiert (passiert bereits).

### 2. `refetchScenesFromDb` schützt nicht-persistierte lokale Szenen

In dem `setProject`-Callback in `refetchScenesFromDb` zusätzlich alle bisherigen Szenen mit nicht-UUID-ID **anhängen** (oder nach `orderIndex` einsortieren), damit sie nicht durch einen Realtime-Tick verloren gehen. Schutz für Edge-Cases.

### 3. Defaults der neuen Szene aus existierenden Szenen übernehmen

In `addScene` (StoryboardTab):

- Wenn `scenes.length > 0`: nimm die **letzte** Szene als Vorlage und kopiere:
  - `clipSource`, `clipQuality`, `durationSeconds`, `withAudio`
  - `transitionType`, `transitionDuration`
  - `shotDirector`, `directorModifiers`
  - `cinematicPresetSlug`, `appliedStylePresetId`
  - `textOverlay` (geleert auf `text: ''`)
- Felder, die explizit **leer** sein müssen:
  - `aiPrompt: ''`
  - `promptSlots: undefined`
  - `promptMode: undefined`
  - `uploadUrl`, `uploadType`, `referenceImageUrl`: undefined
  - `clipUrl`: undefined, `clipStatus: 'pending'`

So wirkt die neue Szene wie eine Geschwister-Szene, nur mit leerem Prompt-Bereich.

### 4. Prompt-Generator funktioniert automatisch

Der Prompt-Generator wird in `SceneCard` über die bestehenden Hooks (z. B. „Würfeln", Shot Director, Style Preset, Auto-Prompt) geöffnet. Da die neue Szene jetzt eine echte UUID besitzt und in der DB liegt, funktioniert er **out-of-the-box** — keine Änderung in `SceneCard` nötig. Wir verifizieren nur am Ende, dass:

- der „🎲 Neue Szenenidee"-Button greift,
- die KI-Prompt-Optimierung speichert,
- Shot Director / Cinematic Preset wirken.

## Betroffene Dateien

- `src/components/video-composer/VideoComposerDashboard.tsx` — neue `insertSceneToDb` + Prop nach unten reichen + Schutz in `refetchScenesFromDb`.
- `src/components/video-composer/StoryboardTab.tsx` — `addScene` und `insertSnippet` nutzen die neue Insert-Funktion und übernehmen Presets der letzten Szene.

## Akzeptanzkriterien

1. Klick auf **+ Szene** → Szene erscheint **dauerhaft**, auch nach Tab-Wechsel und Reload.
2. Neue Szene hat denselben Look (Style/Shot/Transition/Clip-Source) wie die übrigen Szenen.
3. Prompt-Bereich ist leer; Prompt-Generator und „🎲 Neue Idee" funktionieren wie in bestehenden Szenen.
4. „Scene Library"-Einfügen verschwindet ebenfalls nicht mehr.
