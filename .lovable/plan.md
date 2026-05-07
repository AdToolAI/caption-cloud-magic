## Problem

Im Talking-Head-Dialog (Motion Studio → Button „Talking-Head"):
1. **Keine Avatar-Auswahl** — du musst jedes Mal manuell ein Foto hochladen, obwohl du in `/avatars` bereits Avatare wie „Matthew Dusatko" mit Portrait + Default-Voice gespeichert hast. „Sarah" ist im Dialog nur die **Stimme**, kein Charakter.
2. **Ergebnis verschwindet** — beim Aufruf aus dem Storyboard wird keine Szene mitgegeben, das fertige Video landet nur in der Media Library, nicht im Storyboard. Deshalb siehst du außer Matthew (Cast Consistency Map = AI-Reference, anderes Feature) keinen neuen Charakter im Projekt.

## Lösung

### 1. Avatar-Picker im Dialog (Tab „Charakter")

Tab „Charakter" um ein **Grid mit deinen Avataren** erweitern, gleichwertig neben dem manuellen Upload:

```text
┌─ Tab: Charakter ──────────────────────────────────┐
│ Deine Avatare                                     │
│ ┌────┐ ┌────┐ ┌────┐ ┌─────────┐                  │
│ │ MD │ │ AB │ │ CD │ │ + Foto  │                  │
│ │Matt│ │Anna│ │Carl│ │ hoch-   │                  │
│ │hew │ │    │ │    │ │ laden   │                  │
│ └────┘ └────┘ └────┘ └─────────┘                  │
│ Ausgewählt: Matthew Dusatko ✓ (Voice: George)     │
└───────────────────────────────────────────────────┘
```

- Lädt via `useAccessibleCharacters()` (Single-Source-of-Truth, owned + purchased).
- Karte = Portrait (`portrait_url` falls vorhanden, sonst `reference_image_url`) + Name.
- Klick → setzt `imageUrl`, `voiceId` (aus `default_voice_id` falls gesetzt), und zeigt unten welcher Avatar aktiv ist + „Wechseln"-Button.
- Manuelle Upload-Card bleibt als gleichwertige letzte Kachel im Grid.
- Wenn der Avatar `portrait_url` hat (Hedra-optimiert), bevorzugen wir das gegenüber `reference_image_url`.

### 2. Optionale Szenen-Zuweisung (Tab „Skript & Stimme")

Neuer Block unter „Qualität":

```text
Ziel (optional)
┌────────────────────────────────────────────┐
│ ▾  Nur in Media Library                    │
│    Szene 1 — Hook                          │
│    Szene 2 — Body                          │
│    …                                       │
└────────────────────────────────────────────┘
```

- Default: „Nur in Media Library" (heutiges Verhalten).
- Wenn Szene gewählt → `sceneId` an `generate(...)` übergeben → Edge-Function hängt das fertige Video automatisch als Clip an die Szene (passiert bereits via `videoUrl`-Field auf der scene row, sobald `sceneId` mitkommt).

### 3. Storyboard-Integration

`StoryboardTab.tsx` reicht die Szenen-Liste in den Dialog:
- Neue Prop `availableScenes: { id; index; sceneType }[]` für das Dropdown.
- `onSuccess` zeigt zusätzlich Toast „Talking-Head zu Szene {index} hinzugefügt — Anschauen" mit Auto-Scroll zur Szene, wenn eine ID gewählt wurde.

## Technical Details

**Geänderte Dateien (Frontend only, keine DB-/Edge-Änderungen):**
- `src/components/video-composer/TalkingHeadDialog.tsx`
  - Import `useAccessibleCharacters`
  - Neuer State `selectedAvatarId`, `targetSceneId`
  - Avatar-Grid in Tab „Charakter" (Cards mit `aspect-square`, gold-Ring bei selected, James-Bond-Design-Tokens)
  - Beim Avatar-Klick: `setImageUrl(c.portrait_url ?? c.reference_image_url)`, `setVoiceId(c.default_voice_id ?? voiceId)`
  - Neue Prop `availableScenes?: Array<{ id: string; label: string }>`
  - Szenen-Select in Tab „Skript & Stimme"
  - `handleGenerate` übergibt `sceneId: targetSceneId || undefined`
- `src/components/video-composer/StoryboardTab.tsx`
  - `<TalkingHeadDialog availableScenes={scenes.map((s,i)=>({ id: s.id, label: \`S${i+1} — ${s.sceneType}\` }))} />`
  - `onSuccess({sceneId})`: bei vorhandenem `sceneId` smooth-scroll zum Card-Element + Erfolgs-Toast.

**Out of Scope:**
- Keine Änderungen an `generate-talking-head` Edge Function (akzeptiert bereits `imageUrl`, `voiceId`, `sceneId`).
- Keine DB-Migration.
- Kein neuer Hook; `useAccessibleCharacters` existiert bereits.
- Kein Eingriff in Cast Consistency Map (das ist Reference-Image für AI-Video-Modelle, nicht für Talking-Head).

## Verifikation

1. Talking-Head-Dialog öffnen → Tab „Charakter" zeigt Grid mit „Matthew Dusatko" + Upload-Card.
2. Matthew anklicken → Foto + Voice (George) automatisch gesetzt, Tab „Skript & Stimme" wird klickbar.
3. Szene 2 im neuen Dropdown wählen, Skript schreiben, „Generieren".
4. Erwartung: Toast „Talking-Head zu S2 hinzugefügt", nach 1–3 Min taucht das Video als Clip in Szene 2 auf, Storyboard scrollt dorthin.
5. Zweiter Test ohne Szene-Auswahl → Video erscheint nur in der Video-History (Dashboard).
