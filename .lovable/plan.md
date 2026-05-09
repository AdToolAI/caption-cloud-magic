
# Motion Studio: Director's Console — Königsstück-Plan

## Vision

Aus dem Motion Studio wird ein **echtes virtuelles Filmset**: Der User füllt klar getrennte Karten ("Departments") wie an einem Filmset — Casting, Kamera, Licht, Dialog, SFX, Look — und sieht in Echtzeit den **finalen Prompt** und einen **deterministischen Audio-Plan**, der 1:1 an Video-, VO- und Lip-Sync-Engine geht. Kein Slot überschreibt mehr einen anderen, keine Race-Condition, kein "warum ist mein Audio-Plan weg?".

Inspiriert von Artlist (Timestamp Prompting), Veo 3 / Sora 2 (8-Layer Audio Structure) — aber mit unserem Vorteil: **Wir orchestrieren alle 11 Provider gleichzeitig** und können den Prompt pro Provider optimieren.

---

## Das Problem heute (kompakt)

1. **Ein einziger `aiPrompt`-String** trägt Cast + Cinematography + Dialog + Negative + Audio-Plan gemischt → jeder useEffect kann den anderen überschreiben (Audio-Plan-Race).
2. **`SceneDialogStudio` schreibt timed Audio-Plan in `subject`-Slot** → der Stitcher kann ihn beim nächsten Re-Render sortieren/kürzen.
3. **Negative-Rules stehen IM Dialog-Block** ("Do NOT render text…") statt im sauberen `negative_prompt`-Kanal → Provider mit Negative-Support bekommen das nicht als Negative.
4. **Voiceover-Sound weg** weil `lipSyncAppliedAt`-Filter und Audio-Plan-Re-Inject nicht synchron mit `sceneAudioClips`-Generierung laufen.
5. **User-Verwirrung**: "Wo schreibe ich was?" — Briefing, Storyboard, SceneCard, SceneDialogStudio, ShotDirectorPanel, BrandKit alle berühren denselben Prompt.

---

## Die Strategie: 8-Layer Director's Console

### 8 Layer = 8 sichtbare Karten pro Szene (immer in dieser Reihenfolge)

```text
┌─────────────────────────────────────────────────────────┐
│ SZENE 03 · 8s · 16:9 · Kling 3 Pro                      │
├─────────────────────────────────────────────────────────┤
│ 1. 🎭 CAST          Matthew, Sarah   [@mention]         │
│ 2. 🎬 ACTION        Was passiert? (1 Outcome pro Zeile) │
│ 3. 📷 SHOT          Framing/Angle/Movement/Lens         │
│ 4. 💡 LIGHT & MOOD  Golden Hour, soft, warm             │
│ 5. 🗣  DIALOG        Audio-Plan mit Sekunden (gelockt)   │
│ 6. 🔊 SFX & AMBIENT Footsteps@2s, café murmur ambient   │
│ 7. 🎨 STYLE         Wes Anderson, 35mm, Kodachrome      │
│ 8. 🚫 NEGATIVE      no text, no logos (eigener Kanal)   │
├─────────────────────────────────────────────────────────┤
│ ▼ LIVE PROMPT PREVIEW (read-only, was der Provider sieht)│
│ ▼ AUDIO PLAN (locked, deterministisch)                  │
└─────────────────────────────────────────────────────────┘
```

Jede Karte ist **eigenständig**, hat **eigenen State**, schreibt nur in **ihren Slot**. Der finale Prompt wird **read-only assembliert** (wie heute schon `composePromptLayers`), aber jetzt aus **8 statt 6 Slots** + **separatem `audioPlan`-Object**.

---

## Architektur-Änderungen

### A) Datenmodell pro Szene (neu)

```ts
interface SceneV2 {
  // Bestehend
  id, durationSec, aspect, provider, ...
  
  // NEU: 8-Layer Slots (jeder Slot = eigene String/Object-Property)
  slots: {
    cast?:       string;          // resolved from cast[] + @mentions
    action?:     string;          // multiline, "1 outcome per line"
    shot?:       ShotSelection;   // bereits typed
    lightMood?:  string;
    style?:      string;
    sfxAmbient?: string;
    negative?:   string;
  };
  
  // NEU: Dialog wird ausgekoppelt aus dem Prompt
  dialog?: {
    blocks: DialogBlock[];        // mit echten durationSec/startSec
    locked: boolean;              // true nach "Voiceover generieren"
    generatedAt: string;
  };
  
  // NEU: Audio Plan = first-class citizen
  audioPlan?: {
    version: 1;
    speakers: Array<{ id, name, startSec, endSec, text, voiceId, audioUrl? }>;
    sfx?:     Array<{ atSec, label, url? }>;
    ambient?: { label, durationSec };
    totalSec: number;
  };
  
  // Compatibility: aiPrompt wird abgeleitet, NIE mehr direkt editiert
  aiPrompt: string;  // = composeFinalPrompt(slots, audioPlan)
}
```

### B) Neuer zentraler Composer

`src/lib/motion-studio/composeFinalPrompt.ts` (Erweiterung von `composePromptLayers`):

- Input: `slots` + `audioPlan` + `provider` + `language`
- Output: `{ finalPrompt, negativePrompt, audioPlanText, layers[] }`
- Produziert **Veo/Sora-konformes 8-Layer-Format**:

```text
[1 SUBJECT]   Matthew (35, salt-and-pepper beard, navy coat) and Sarah (32, red curls).
[2 ACTION]    Matthew turns to Sarah and begins speaking.
              At 3.5s Sarah answers, leaning slightly forward.
[3 SHOT]      Medium two-shot, eye-level, slow dolly-in (15mm equivalent on FF).
[4 LIGHT]     Soft golden-hour key from camera-right, warm bounce, 3200K.
[5 DIALOG]    Audio plan (exact, do not deviate):
              0.00s–3.42s  Matthew: "Welcome to our store."
              3.57s–7.18s  Sarah:   "Tired of generic ads?"
              Total: 7.18s. Lip-sync to these exact timings. English.
[6 SFX]       0.5s door-bell chime; café ambience throughout (low).
[7 STYLE]     Wes Anderson symmetry, pastel palette, 35mm film grain, shot on Kodak Portra.
[8 NEGATIVE]  no on-screen text, no captions, no logos, no watermarks, no extra people.
```

- **Pro Provider** wird das Format leicht angepasst (Veo will `[Layer]`-Tags, Hailuo will Fließtext, Kling will Komma-getrennt). Mapping-Tabelle in `providerPromptFormats.ts`.

### C) Audio-Plan-Lock (kein Race mehr)

- `dialog.locked = true` setzt nach erfolgreicher TTS einen **Hash der Blocks** ein.
- `composeFinalPrompt` liest **immer** aus `audioPlan` (nicht aus `slots.action`).
- Kein `useEffect` mehr darf `aiPrompt` schreiben — `aiPrompt` wird nur noch via `useMemo(() => composeFinalPrompt(scene), [scene.slots, scene.audioPlan])` abgeleitet.
- Damit ist die Race-Condition **strukturell unmöglich**.

### D) Voiceover-Audio-Persistenz (Sound zurück)

- `audioPlan.speakers[].audioUrl` wird beim TTS direkt gespeichert.
- `useSceneAudioClips` lädt **direkt aus `audioPlan`** statt aus separater Tabelle als Source-of-Truth (Tabelle bleibt Cache).
- `lipSyncAppliedAt`-Filter wird ersetzt durch `audioPlan.speakers[].lipSyncedClipUrl` — wenn vorhanden, Original-VO wird stumm geschaltet, sonst spielt VO normal.

---

## UX-Strategie: "Studio Set Feel"

### 1. **Director's Console Layout** (statt heutiger SceneCard-Wall-of-Text)

Pro Szene: **2-spaltig auf Desktop**, links die 8 Slot-Karten als Akkordeon (default: Slot 1, 2, 5 offen), rechts ein **sticky Live-Preview-Panel**:

- 📝 **Final Prompt** (read-only, syntax-highlighted nach Layer-Farbe)
- 🎵 **Audio-Timeline** (visuell: Matthew-Bar 0–3.4s, Sarah-Bar 3.6–7.2s)
- 📊 **Provider-Score** (Kling: 9/10 ✓, Hailuo: 7/10 ⚠ "ignoriert Negative")
- 🎬 **Frame-Preview** (das gewählte still-frame als Thumb)

### 2. **Smart Defaults & Auto-Fill**

- Cast aus Briefing → Slot 1 vorausgefüllt
- Style aus Briefing → Slot 7 vorausgefüllt
- Shot Director aus Cinematic-Preset → Slot 3 vorausgefüllt
- User füllt nur **Action + Dialog** aktiv aus → das ist das Minimum für eine Szene

### 3. **Mode Toggle "Pro vs. Simple"**

- **Simple Mode** (default für Neulinge): nur Slots 2 + 5 sichtbar (Action + Dialog), Rest auto-generiert aus Briefing/Style
- **Pro Mode**: alle 8 Slots editierbar (für Ads/Filmer)
- **Director Mode**: zusätzlich JSON-Export, Provider-Format-Vorschau, Audio-Plan-Editor

### 4. **Quality Score & Coach**

Real-time Coach-Hinweise pro Slot (wie Grammarly):
- "💡 Action zu lang — teile in 2 Outcomes (5s/3s)"
- "⚠ Dialog 12s, Szene nur 8s — verlängern oder kürzen?"
- "✓ Negative-Layer aktiv — Provider Kling unterstützt das"

### 5. **One-Click Operationen**

- **"🎬 Lock Audio Plan"** → TTS rendern + Hash speichern + Slots-Karte greift gold
- **"🔄 Re-Stitch Prompt"** → Composer neu laufen lassen, Diff anzeigen
- **"📤 Export to Provider"** → fertiger Payload als JSON/Curl

---

## Logik-Vereinfachungen im Motion Studio

Diese **bestehenden Komponenten werden konsolidiert**:

| Heute | Wird zu |
|---|---|
| `SceneCard.tsx` (1587 Zeilen, 8 useEffects) | `SceneDirectorConsole.tsx` (~600 Zeilen, 0 sync-effects) |
| `SceneDialogStudio.tsx` schreibt in `aiPrompt.subject` | schreibt in `scene.dialog` + `scene.audioPlan` (eigene Felder) |
| `applyDialogToPrompt.ts` mutiert Prompt | wird Teil von `composeFinalPrompt`, mutiert nichts |
| `SceneShotDirectorPanel`, `BrandKitApplyPanel` | werden Slot-Karten innerhalb der Console |
| Race-Condition-Guard `hasTimedAudioPlan` | gestrichen — strukturell überflüssig |
| `aiPrompt` als Editable-Textarea | ersetzt durch read-only Live-Preview + "Edit raw" Power-User-Button |

---

## Multi-Provider-Strategie (unser USP gg. Artlist)

Pro Provider eine **Format-Adapter-Funktion** in `providerPromptFormats.ts`:

```ts
formatFor.veo3(slots, audioPlan)    → 8-tag bracketed
formatFor.sora2(slots, audioPlan)   → numbered scenes with timestamps
formatFor.kling(slots, audioPlan)   → comma-joined + separate negative
formatFor.hailuo(slots, audioPlan)  → narrative prose with timing inline
formatFor.runway(slots, audioPlan)  → motion-first, then subject
formatFor.vidu(slots, audioPlan)    → reference-anchored (image-led)
formatFor.pika(slots, audioPlan)    → frame-based with pikaframe markers
formatFor.seedance(slots, audioPlan)→ short cinematic
formatFor.wan(slots, audioPlan)     → resolution-aware
formatFor.luma(slots, audioPlan)    → camera-language-first
formatFor.happyhorse(slots, audioPlan) → standard cinematic
```

Damit erzielen wir mit **demselben User-Input** für jeden Provider den optimalen Prompt — das kann Artlist nicht (die targeten nur ihre eigene Engine).

---

## Migration & Backwards-Kompat

1. **Phase 1 (1 Tag)**: Datenmodell `slots` + `audioPlan` parallel zum alten `aiPrompt` einführen, `composeFinalPrompt` aus altem Prompt bootstrappen.
2. **Phase 2 (1 Tag)**: `SceneDirectorConsole`-UI bauen, in SceneCard einklappen hinter Feature-Flag `motion_studio_v2`.
3. **Phase 3 (1 Tag)**: Audio-Plan-Lock + Provider-Format-Adapter (mind. Kling, Hailuo, Veo3 zum Start).
4. **Phase 4 (0.5 Tag)**: Sound-zurück-Fix in `useSceneAudioClips` + `ComposerSequencePreview`.
5. **Phase 5 (0.5 Tag)**: Coach + Quality Score + Provider-Score-UI.
6. **Phase 6**: Feature-Flag default-on, alte SceneCard hinter `?legacy=1` aufbewahren, dann nach 1 Woche entfernen.

---

## Technische Details (für Entwicklung)

**Neue Files:**
- `src/types/scene-v2.ts` — `SceneV2`, `AudioPlan`, `SceneSlots` Interfaces
- `src/lib/motion-studio/composeFinalPrompt.ts` — zentraler Composer (erweitert composePromptLayers)
- `src/lib/motion-studio/providerPromptFormats.ts` — 11 Adapter
- `src/lib/motion-studio/qualityScore.ts` — Coach-Logik
- `src/components/video-composer/director-console/` — neue Komponente, aufgeteilt in:
  - `SceneDirectorConsole.tsx` (Container)
  - `slots/CastSlot.tsx`, `ActionSlot.tsx`, `ShotSlot.tsx`, `LightMoodSlot.tsx`, `DialogSlot.tsx`, `SfxSlot.tsx`, `StyleSlot.tsx`, `NegativeSlot.tsx`
  - `LivePromptPanel.tsx`, `AudioTimelinePanel.tsx`, `ProviderScorePanel.tsx`, `CoachHints.tsx`

**Refactor:**
- `SceneCard.tsx` — entfernt 8 sync-`useEffect`s, ersetzt aiPrompt-State durch `useMemo`
- `SceneDialogStudio.tsx` — schreibt in `scene.dialog`/`scene.audioPlan` statt `slots.subject`
- `applyDialogToPrompt.ts` — wird zu reiner `formatAudioPlan(audioPlan)`-Funktion ohne Mutation
- `useSceneAudioClips.ts` — liest aus `audioPlan` als Source-of-Truth

**DB-Migration:** keine zwingend nötig — `slots`/`audioPlan` werden in bestehendes `scene` JSON-Feld serialisiert.

**Edge Functions:** `compose-video-clips` bekommt zusätzlich `formattedPrompt` pro Provider (Adapter läuft client-side, Server validiert nur).

---

## Was der User danach sagen wird

> "Endlich verstehe ich wo ich was schreibe. Der Audio-Plan bleibt einfach drin. Und der Prompt rechts sieht aus wie ein echtes Drehbuch — ich fühle mich wie am Set."

Bereit zur Umsetzung. Sag **"go"** und ich starte mit Phase 1 (Datenmodell + Composer-Erweiterung).
