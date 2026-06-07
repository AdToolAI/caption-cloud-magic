## Ziel

Pro Szene zwei neue, manuell editierbare Eingabeebenen — **immer in der Sprache der UI** schreibbar, automatisch nach Englisch übersetzt und an exakt der richtigen Stelle in den Provider-Prompt injiziert:

1. **Scene Action** (1 Feld pro Szene) — „Was passiert in der Szene insgesamt?"
2. **Character Action** (1 Feld pro Cast-Slot, neben Voiceover/Dialog) — „Was tut **diese** Person konkret?"

Beim Storyboarding (Scene Director / Auto-Director) werden beide Felder automatisch vorbefüllt. Der User kann sie jederzeit überschreiben — und die Überschreibung gewinnt deterministisch über den AI-Prompt-Body, ohne dass ein Re-Roll nötig ist.

## UX

### Cast-Slot (in `SceneDirectorBox` / Cast-Liste)

Pro Slot bisher: Charakter-Picker + `shotType` + Voiceover/Dialog-Textarea.

Neu darunter:

```
[Action — was tut Sarah?]                          🌐 Auto-EN
┌─────────────────────────────────────────────┐
│ tippt konzentriert auf ihrem Laptop, hebt   │
│ kurz den Blick und nickt Samuel zu          │
└─────────────────────────────────────────────┘
   → "types focused on her laptop, briefly
      looks up and nods at Samuel"   (Vorschau)
```

- Sprache = UI-Sprache (de/en/es).
- Kleine „🌐 Auto-EN"-Pille zeigt den übersetzten Text live unter dem Feld (read-only, Debounce 400 ms).
- Leer = Feld bleibt unsichtbar im finalen Prompt; AI-generierte Action wird benutzt.
- Befüllt = **lockt** die Action für diesen Charakter (kleines 🔒-Icon + Tooltip „Manuell — überstimmt Director").

### Scene-Level (in `SceneCard`, neue Zeile direkt über dem Prompt-Editor)

```
[Was passiert in der Szene?]                       🌐 Auto-EN  🔒
┌─────────────────────────────────────────────┐
│ Vier Social-Media-Manager arbeiten parallel │
│ in einem hellen Open-Space-Büro             │
└─────────────────────────────────────────────┘
```

- Gleicher Auto-EN-Mechanismus.
- Wenn leer: der Director-Output regiert (heutiger Zustand).
- Wenn befüllt: ersetzt den `[2 ACTION]`-Layer im finalen Prompt komplett.

## Pipeline

```text
SceneCard / SceneDirectorBox
        │
        ├─ scene.sceneActionUser    (UI-lang, optional)
        ├─ scene.sceneActionEn      (auto, cache)
        ├─ shot.actionUser          (UI-lang, optional, per cast slot)
        └─ shot.actionEn            (auto, cache)
                 │
                 ▼
   useAutoTranslateEn() Hook  →  translate-to-english edge fn
                 │
                 ▼
   composeFinalPrompt() / composePromptLayers()
        ├─ [1 SUBJECT]  …
        ├─ [2 ACTION]   ← scene.sceneActionEn ?? aiPromptAction
        ├─ [2a SUBJECT-ACTIONS]
        │     - Sarah: types focused on her laptop, nods at Samuel
        │     - Samuel: leans back, gestures with his pen
        │     - …
        ├─ [3 SHOT]    …
        ├─ [5 DIALOG]  …
        └─ [8 NEGATIVE] …
```

Damit löst sich auch der jüngst diskutierte „Ghost-Cast"-Bug **strukturell**: sobald der User pro Slot eine konkrete Aktion einträgt, wird sie zwangsläufig in den `[2a SUBJECT-ACTIONS]`-Block geschrieben → jeder gelistete Charakter hat eine sichtbare Handlung im Prompt-Body → `compose-dialog-scene` / Face-Map findet die richtige Anzahl Köpfe.

## Übersetzung — eine zentrale Edge-Function

Neu: `supabase/functions/translate-to-english/index.ts`

- Input: `{ text: string, sourceLang: 'de' | 'es' | 'en' }`
- `sourceLang === 'en'` → 1:1 zurück, kein API-Call.
- Sonst: Lovable AI Gateway (`google/gemini-2.5-flash`) mit kurzem System-Prompt: „Translate to natural cinematic English. Keep proper nouns. Output only the translation."
- 24 h `translation_cache` Tabelle (Hash über `text+sourceLang`) → kein doppelter Gateway-Call beim Tippen + bei Render.
- Rate-Limit: pro User max 60 Übersetzungen/Minute (Standard `rate_limit_check` Helper).
- Kein Credit-Abzug (Mikro-Cost via Gemini Flash, identisch zu bestehenden Auto-Translate-Pfaden wie Video Prompt Optimizer).

Client-Hook: `src/hooks/useAutoTranslateEn.ts` — `useDebouncedValue(text, 400)` → invoke → cache in React-Query (`['translate-en', hash]`) → returnt `{ english, isLoading, error }`.

## Daten-Modell (frontend-only, keine DB-Migration)

`src/types/video-composer.ts`:

```ts
interface SceneShot {
  // … bestehend
  actionUser?: string;   // UI-Sprache, vom User
  actionEn?: string;     // auto-übersetzt, Cache
  actionLocked?: boolean; // true sobald actionUser non-empty
}

interface ComposerScene {
  // … bestehend
  sceneActionUser?: string;
  sceneActionEn?: string;
  sceneActionLocked?: boolean;
}
```

Persistiert im bestehenden `useComposerPersistence`-Snapshot (sessionStorage + draft-row).

## Prompt-Komposition

`src/lib/motion-studio/composeFinalPrompt.ts` (bzw. `composePromptLayers.ts`):

1. **Scene Action override** — falls `scene.sceneActionEn` non-empty → ersetzt `[2 ACTION]` body, statt aus `aiPrompt` zu parsen.
2. **Subject-Actions block** — falls **min. 1** Cast-Slot `actionEn` hat:
   ```
   [2a SUBJECT-ACTIONS]
   - Sarah: <Sarah.actionEn>
   - Samuel: <Samuel.actionEn>
   ```
   Cast-Slots ohne `actionEn` fallen auf eine generische „is present in the scene"-Zeile zurück, damit Cast-Coverage-Validator weiter grün bleibt.
3. **Director-Re-Roll respektiert Locks** — `scene-director/index.ts` bekommt `lockedSceneAction` und `lockedShotActions[]` als Inputs; System-Prompt-Block: „You MUST keep these locked actions verbatim and build the rest of the scene around them." Post-Call-Validator prüft, dass jeder Locked-String im Output enthalten ist; sonst Repair-Pass.

## Geänderte / neue Dateien

**Neu**
- `supabase/functions/translate-to-english/index.ts` — Gateway-Wrapper + Cache-Lookup
- `supabase/migrations/<ts>_translation_cache.sql` — `translation_cache(hash text pk, source_lang text, target_lang text, source text, target text, created_at timestamptz default now())` mit `service_role`-only GRANT (read/write nur via Edge-Function)
- `src/hooks/useAutoTranslateEn.ts` — Debounced React-Query Hook
- `src/components/video-composer/SceneActionField.tsx` — Re-usable Textarea + Auto-EN-Vorschau + Lock-Toggle

**Editiert**
- `src/types/video-composer.ts` — neue Felder
- `src/components/video-composer/SceneCard.tsx` — Scene-Action-Field über dem Prompt-Editor
- `src/components/video-composer/SceneDirectorBox.tsx` — Character-Action-Field pro Cast-Slot (neben/unter Voiceover)
- `src/lib/motion-studio/composeFinalPrompt.ts` + `composePromptLayers.ts` — `[2 ACTION]` override + `[2a SUBJECT-ACTIONS]` layer
- `src/hooks/useComposerPersistence.ts` — Snapshot um neue Felder erweitert
- `supabase/functions/scene-director/index.ts` — `lockedSceneAction`, `lockedShotActions` Inputs + System-Prompt-Block + Post-Call-Validator

**Nicht angefasst**
- `compose-dialog-scene`, `poll-dialog-shots`, Sync.so-Webhook, Face-Map, Lipsync-Pro-Policy
- Render-Engine-Routing, Realism-Presets, Credit-Refund
- Keine Änderung an `_shared/twoshot-face-map.ts`

## Edge-Cases

- **EN-User, der EN tippt** → `sourceLang='en'` short-circuit, kein Gateway-Call, `actionEn === actionUser`.
- **Übersetzung schlägt fehl** (Gateway down) → UI zeigt gelben „Übersetzung fehlgeschlagen — Original wird verwendet"-Hinweis; `actionEn = actionUser` als Fallback, Render läuft trotzdem.
- **User leert das Feld** → `actionUser=''`, `actionEn=''`, `actionLocked=false` → Director-Output regiert wieder.
- **Cast-Slot ohne Charakter** (leerer Slot) → Action-Field disabled.
- **Re-Roll bei aktivem Lock** → Director-Prompt enthält die locked actions verbatim; Validator stellt sicher dass sie im Output stehen.

## Was der User dadurch gewinnt

- **Deterministische Kontrolle** über jede einzelne Handlung pro Szene und pro Charakter.
- **Schreiben in seiner Muttersprache**, aber der Provider sieht sauberes cinematic English (was nachweislich höhere Qualität bei Hailuo/Kling/Vidu/Veo liefert — siehe `multilingual-content-strategy` Memory).
- **Lip-Sync wird automatisch ehrlicher**, weil das „Ghost-Cast"-Problem strukturell verschwindet sobald der User pro Slot eine Aktion vergibt.
- Kein zusätzlicher Credit-Verbrauch; Übersetzung ist gecached & mikro-billig.
