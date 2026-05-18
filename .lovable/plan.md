## Problem

Im Dialog-Studio zeigt der Stimmen-Dropdown zwei zusammengeklebte Namen an, z. B. **„DiegoMarkus"** und **„GeorgeMateo"**.

## Ursache

In `supabase/functions/_shared/premium-voices.ts` ist dieselbe ElevenLabs-Voice-ID mehrfach als verschiedene Persona pro Sprache eingetragen:

| ElevenLabs Voice ID | Aliase |
|---|---|
| `onwK4e9ZLuTAKqWW03F9` (Daniel) | **Markus** (de) + **Diego** (es) |
| `JBFqnCBsd6RMkjVDRZzb` (George) | **George** (en) + **Mateo** (es) |
| (weitere mehrsprachige Stimmen analog) |

`list-voices` gibt beide Einträge zurück. Im Frontend (`SceneDialogStudio.tsx`, Voice-`<Select>`) wird `v.id` als Item-Value benutzt. Radix Select rendert im Trigger die `children` **aller** `SelectItem` mit passendem Value — also beide Namen hintereinander → „DiegoMarkus".

## Fix

Stimmen serverseitig in `supabase/functions/list-voices/index.ts` per `id` deduplizieren, bevor die Liste ausgeliefert wird. Das hält ID = ElevenLabs-Voice-ID (wichtig für TTS), zeigt aber pro Stimme nur noch einen Eintrag.

Strategie pro doppeltem ID:
- **Name**: Name der Variante nehmen, die zur aktuellen UI-Sprache passt (`language === requestedLanguage`), sonst den ersten Eintrag.
- **supportedLanguages**: Union aller Aliase (z. B. Daniel → `['de','es']`).
- **accent / description**: vom gewählten Eintrag.
- **tier/recommended_model/settings**: vom gewählten Eintrag (bevorzugt premium).

Implementierung in `list-voices/index.ts` direkt nach Schritt 1 (`premiumMapped`):

```ts
// Dedupe premium voices that share the same ElevenLabs ID across languages
const byId = new Map<string, any>();
for (const v of premiumMapped) {
  const existing = byId.get(v.id);
  if (!existing) {
    byId.set(v.id, { ...v, supportedLanguages: [...v.supportedLanguages] });
    continue;
  }
  // merge languages
  for (const lang of v.supportedLanguages) {
    if (!existing.supportedLanguages.includes(lang)) existing.supportedLanguages.push(lang);
  }
  // prefer the variant that matches the requested UI language
  if (language && language !== 'all' && v.language === language && existing.language !== language) {
    existing.name = v.name;
    existing.language = v.language;
    existing.accent = v.accent;
    existing.description = v.description;
    existing.recommended_settings = v.recommended_settings;
  }
}
const premiumDeduped = Array.from(byId.values());
```

Danach `premiumDeduped` statt `premiumMapped` in den Schritten 3 + Logging benutzen.

## Touched files

- `supabase/functions/list-voices/index.ts` — Dedupe-Schritt einfügen.

Keine Frontend-Änderung nötig. Kein DB-Migrationsbedarf. Bestehende gespeicherte `dialogVoices` bleiben gültig, weil die Voice-ID stabil bleibt.

## Validation

1. Picker im Dialog-Studio öffnen → jede Stimme erscheint genau einmal, Trigger zeigt nur **einen** Namen (z. B. „Markus" bei DE-UI, „Diego" bei ES-UI).
2. Preview-Button → spielt die korrekte Stimme.
3. Voiceover-Generierung → unverändert, da Voice-ID dieselbe ist.
