# AI Video Studio — Spoken-Language-Fix (Provider-Audio)

## Problem
Modelle wie **Kling 3.0 Pro**, **Veo** und **Sora** liefern bei aktivem `generateAudio` selbst Lip-Sync + Voiceover — der Provider-TTS defaultet aber auf **Englisch**, weil unser Prompt keine Zielsprache spezifiziert. Der User will bei deutschen Briefings deutsches Audio.

## Ursache
In `src/components/ai-video/ToolkitGenerator.tsx` (Zeile ~272–290) wird der finale Prompt aus `mentionResolved.prompt + shotSuffix + brandSuffix + castSuffix + noTextSuffix` gebaut. Es fehlt eine **Spoken-Language-Direktive**. Kling/Veo/Sora inferieren die Sprache aus dem Prompt-Text — steht dort "Create a cinematic ad…" (auch bei DE-UI), spricht der Character Englisch.

## Fix-Plan

### 1. Spoken-Language-Suffix im Prompt-Builder
`ToolkitGenerator.tsx`: neuen Suffix nur anhängen, wenn `generateAudio === true` **und** `model.capabilities.audio`:

```text
All spoken dialogue, narration and voiceover MUST be performed in German (Deutsch).
Do not use English or any other language for speech. Lip movement must match German phonemes.
```

Sprache aus `useTranslation().language` ableiten:
- `de` → German (Deutsch)
- `es` → Spanish (Español)
- `en` → English (Fallback)

Der Suffix wird **vor** `noTextSuffix` eingefügt und ist explizit genug, dass Kling/Veo/Sora-TTS ihn respektieren.

### 2. Optionaler UI-Override (Sprache manuell wählen)
Klein-Dropdown im Audio-Bereich neben dem `generateAudio`-Toggle: `Deutsch / English / Español / Auto (UI-Sprache)`. Default = Auto = UI-Sprache. State: `spokenLanguage`, persistiert im gleichen `localStorage`-Namespace wie der Prompt-Draft.

Nur sichtbar wenn `model.capabilities.audio && generateAudio`.

### 3. Backend passthrough (defensiv, für zukünftige native-Params)
`spokenLanguage` als optionales Feld ins `body` der Edge-Function-Aufrufe (`generate-kling-video`, `generate-veo-video`, `generate-sora-video`) mitgeben. Server nutzt es aktuell nur zum Logging — sobald ein Provider einen nativen Language-Param exponiert (Kling roadmap), lässt es sich dort andocken, ohne den Client anzufassen.

**Kein Refactor der Edge Functions** in diesem Turn — nur `spokenLanguage` durchreichen + loggen.

### 4. Kein Effekt auf Motion Studio / Composer
Lip-Sync im Composer läuft über ElevenLabs/Hume mit expliziter `language` — nicht betroffen. Änderung bleibt strikt in `ToolkitGenerator.tsx` + optionaler passthrough-Param in den drei betroffenen Edge Functions.

## Technische Details

**Files:**
- `src/components/ai-video/ToolkitGenerator.tsx` — neuer `spokenLanguageSuffix`, State + Selector, Body-Feld.
- `supabase/functions/generate-kling-video/index.ts` — `spokenLanguage` optional aus Body lesen + loggen.
- `supabase/functions/generate-veo-video/index.ts` — dito.
- `supabase/functions/generate-sora-video/index.ts` — dito (falls existent, sonst skip).

**Kein DB-Migrationsbedarf, keine Credits-Änderung, keine Auswirkung auf Composer/Motion-Pipeline.**

## Erwartetes Ergebnis
Bei DE-UI + `generateAudio=on` liefert Kling 3.0 Pro das 15s-Werbevideo mit **deutschem Voiceover + korrektem deutschen Lip-Sync**. User kann Sprache im UI überschreiben, falls z. B. spanisches Audio bei DE-Prompt gewünscht.
