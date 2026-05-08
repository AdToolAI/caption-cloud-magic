## Problem

In der "Cast Consistency Map" wird Matthew korrekt für S1, S2 und S5 als Anker angezeigt — aber sein Name taucht in **keinem** der zugehörigen Szenen-Prompts auf. Damit hat das KI-Video-Modell keinen sprachlichen Anker für die Person, was visuelle Konsistenz untergräbt (selbst wenn ein Reference-Image existiert, hilft es enorm, den Namen + die Erscheinung im Prompt zu nennen).

## Ursache

Es gibt zwei kooperierende, aber inkonsistente Matcher:

1. **`CastConsistencyMap.getAnchor`** (UI) ist **tolerant**: matched per exakter ID **oder** wenn `shot.characterId` den Vornamen enthält (`lib:matthew-…`) **oder** wenn der Name im Prompt steht. Deshalb leuchtet das Icon.
2. **`applyCastToPrompt`** (Prompt-Injection) ist **strikt**: `characters.find(c => c.id === slot.characterId)`. Wenn der Storyboard-Generator (`compose-video-storyboard`) eine `characterId` zurückgibt, die nicht 1:1 die UUID des Brand-Characters ist (z. B. `"matthew"`, `"lib:matthew-…"`, ein altes Slug-Format), schlägt der `find` fehl, kein Token wird erzeugt, kein `[Cast: …]` Marker landet im Prompt.

Zusätzlich: der Backfill-Effect in `SceneCard.tsx` (Z. 225–244) ist nützlich, läuft aber nur einmal pro `scene.id` und nutzt dieselbe strikte Lookup-Logik — also korrigiert er den ID-Drift ebenfalls nicht.

## Fix

### 1. `src/lib/motion-studio/applyCastToPrompt.ts` — tolerantes Character-Lookup
Hilfsfunktion, die genauso matched wie `CastConsistencyMap.getAnchor`:

```ts
function findCharacter(slot: CharacterShot, chars: ComposerCharacter[] | undefined) {
  if (!chars?.length || !slot.characterId) return undefined;
  // 1) exact id
  const exact = chars.find(c => c.id === slot.characterId);
  if (exact) return exact;
  // 2) characterId contains first name (handles "lib:matthew-…", "matthew_dusatko")
  const slotIdLower = slot.characterId.toLowerCase();
  const byNameInId = chars.find(c => {
    const first = c.name?.trim().toLowerCase().split(/\s+/)[0];
    return !!first && first.length >= 3 && slotIdLower.includes(first);
  });
  if (byNameInId) return byNameInId;
  // 3) characterId equals the full name lowercased (LLM drift)
  return chars.find(c => c.name?.trim().toLowerCase() === slotIdLower);
}
```

Im Loop ersetzen: `const char = findCharacter(slot, characters);`. Verhalten ist sonst identisch (`nameAlreadyInProse`, Marker, Lang-Labels bleiben).

### 2. `src/components/video-composer/SceneCard.tsx` — Backfill robuster machen
- Den Backfill-Effect (Z. 225–244) nicht nur an `[scene.id, characters?.length]` koppeln, sondern auch an `scene.characterShots?.length` / `scene.characterShot?.characterId`. So läuft er erneut, wenn der Auto-Director nachträglich Cast hinzufügt oder der Storyboard-Refresh die Shots neu schreibt.
- `didBackfillCast` Ref entfernen — die Funktion `applyCastToPrompt` ist bereits idempotent (sie strippt zuerst den existierenden Marker), zusätzliche Re-Runs sind unschädlich.

Damit greift bei jedem neuen Storyboard die Auto-Injection — auch wenn die LLM `characterId`s drifteten.

### 3. (Defensive Server-Side) `supabase/functions/compose-video-storyboard/index.ts`
Nach Erhalt der Storyboard-Scenes vom Modell und nach dem bestehenden Cast-Repair-Block (Z. 482–530) einen kleinen Post-Processing-Schritt einfügen: wenn `briefing.characters` vorhanden ist und eine Scene einen `characterShot` mit gültigem `shotType` hat, vorne im `aiPrompt` einen englischen Hard-Anchor einfügen, falls der Name noch fehlt — z. B.:

```
"Featuring <Name> (<shotType>): " + aiPrompt
```

Das ist die Backend-Variante des Markers (englisch, weil Prompts englisch an die Provider gehen) und stellt sicher, dass der Name auch dann im Prompt steht, wenn der Client-Backfill (z. B. wegen Race-Conditions) noch nicht gelaufen ist. Idempotent: vorher prüfen, ob der Name (oder Vorname) bereits im Prompt vorkommt.

## Out of Scope
- Keine Änderungen an HeyGen / Lip-Sync / Audio-Logik (separate, bereits gefixte Themen).
- Keine Änderungen am Cast-Picker UI oder der Map.
- Keine Änderungen am Render-/Provider-Engine-Mapping.

## Verifikation
1. Bestehendes Projekt mit Matthew laden → Backfill läuft, `[Besetzung: Matthew Dusatko (Voll)]` (bzw. localisiert) erscheint im Prompt von S1, S2, S5.
2. Neues Storyboard via Auto-Director generieren → Prompts enthalten "Featuring Matthew Dusatko (full): …" direkt aus dem Server-Response.
3. Cast-Map zeigt unverändert dieselben Anker-Icons; keine Regression bei Szenen ohne Cast.