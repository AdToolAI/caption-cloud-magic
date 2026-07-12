# AI Video Studio — Spoken-Language Capability Guard

## Problem
Kling 3.0 Pro (und einige andere Provider) beherrschen zwar nativen Audio+Lip-Sync, aber ihre TTS unterstützt **nicht alle Sprachen**. Bei einer DE-Direktive versucht Kling das nachzuahmen und produziert eine **Fantasie-/Kauderwelsch-Sprache** statt sauberes Deutsch. Das wirkt schlimmer als gar kein Voiceover.

Wunsch: Wenn die Zielsprache vom Provider **nicht sicher unterstützt** wird, soll gar kein Voiceover/Lip-Sync gebaut werden — nur **Ambient/Musik/Hintergrundgeräusche**.

## Ursache
`ToolkitGenerator.tsx` schickt aktuell bei `generateAudio && capabilities.audio` immer eine Sprach-Direktive ("All spoken dialogue MUST be performed in German…") ohne zu prüfen, ob das Modell diese Sprache überhaupt kann. Kling z. B. ist im TTS praktisch auf EN/ZH beschränkt — bei DE/ES bekommt der Prompt zwar den Sprach-Hinweis, das Modell erfindet aber Phoneme.

## Fix-Plan (nur Frontend, minimal-invasiv)

### 1. Provider-TTS-Fähigkeitskarte
Neue kleine Konstante in `src/config/aiVideoModelRegistry.ts` (oder gleich in `ToolkitGenerator.tsx` privat, um Registry nicht aufzublähen):

```ts
// Sprachen, für die der native TTS/Lip-Sync des Providers verlässlich Klartext produziert.
// Alles außerhalb → ambient-only Fallback (kein Voiceover).
const PROVIDER_TTS_LANGS: Record<ToolkitModel['family'], ReadonlyArray<'en'|'de'|'es'>> = {
  veo:         ['en', 'de', 'es'], // Google multilingual TTS
  sora:        ['en', 'de', 'es'], // OpenAI multilingual
  kling:       ['en'],             // ZH/EN reliable; DE/ES → Gibberish
  grok:        ['en'],
  happyhorse:  ['en'],             // nativeDialogue-Flag, aber capabilities.audio=false → egal
  // Rest hat capabilities.audio=false und ist ohnehin nicht relevant:
  ltx: [], wan: [], hailuo: [], luma: [], seedance: [], runway: [], pika: [], vidu: [],
};
```

### 2. Effektive Entscheidung im Prompt-Builder
In `ToolkitGenerator.tsx` (~Z. 314):

- `const langSupported = generateAudio && model.capabilities.audio && PROVIDER_TTS_LANGS[model.family].includes(effectiveSpokenLang);`
- Neu: `const willHaveDialogue = langSupported;`
- Wenn `generateAudio && !langSupported`: statt `spokenLangSuffix` einen **`ambientOnlySuffix`** anhängen:

```text
IMPORTANT: Do NOT generate any spoken dialogue, narration, voiceover, or lip-synced speech.
Characters must remain silent — closed or naturally resting mouths, no lip movement matching speech.
The audio track should contain ONLY ambient environmental sound, room tone, or subtle background music
appropriate for the scene. No singing, no whispering, no non-verbal vocalizations that imply language.
```

- `spokenLangSuffix` (das bestehende „All spoken dialogue MUST be in <lang>") wird nur noch bei `langSupported` gehängt.

### 3. Body-Payload absichern
`body.spokenLanguage` nur bei `langSupported` senden. Zusätzlich `body.suppressDialogue = true` mitgeben, wenn Ambient-Fallback greift — Edge Functions loggen es und können später einen nativen "no-speech"-Parameter dort andocken, ohne den Client anzufassen.

`generateAudio` selbst bleibt `true` (der Provider soll ja Ambient/Umgebungssound liefern) — wir schalten nur die **Dialoge** ab.

### 4. UI-Hinweis unter dem Sprach-Dropdown
Wenn User eine Sprache wählt, die das aktuelle Modell nicht kann, kleiner gedämpfter Hinweis unter dem Select:

> „<Modelname> unterstützt <Sprache> nicht zuverlässig. Für diese Szene wird **kein Voiceover** generiert — nur Umgebungssound. Für deutsches/spanisches Voiceover z. B. **Veo 3.1** oder **Sora 2** wählen, oder das Voiceover nachträglich im Motion Studio ergänzen."

Textkeys 3-sprachig (DE/EN/ES) — konsistent mit dem restlichen Toolkit.

### 5. Edge-Functions (minimal)
`generate-kling-video/index.ts`, `generate-veo-video/index.ts`: zusätzlich `suppressDialogue` aus Body lesen und in `console.log` mitgeben. Kein Verhalten ändern (Kling/Veo API kennen keinen "no-speech"-Toggle — der Prompt-Suffix macht die Arbeit).

## Was nicht angefasst wird
- Motion Studio / Composer / ElevenLabs-Pfad — dort wird Sprache separat gesetzt, keine Fantasie-TTS möglich.
- Kein Auto-Modelwechsel — User bleibt Herr über die Modellauswahl.
- Keine Credit-Logik-Änderung — Ambient-Only kostet genauso viel wie mit Audio; das Modell rendert weiter.

## Erwartetes Ergebnis
- Kling 3.0 Pro + DE-Briefing → Video mit **stummen Charakteren + Ambient/Musik**, kein Kauderwelsch mehr.
- Veo 3.1 / Sora 2 + DE → weiterhin **echtes deutsches Voiceover mit Lip-Sync** (unverändert).
- Klarer UI-Hinweis, warum kein Sprech-Audio kam, mit Modell-Alternativen.
