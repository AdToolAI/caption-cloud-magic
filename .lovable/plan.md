## Was passiert

Die DB beweist: `reference_image_url` ist für alle 6 Matthew-Szenen **NULL** — der vorherige Portrait-Fix wirkt. Trotzdem zeigt jede Clip-Vorschau Matthew, sogar Szene 2 („farmer's hands struggling to pull spray pump"), in der er laut Storyboard gar nicht vorkommt.

## Root Cause

`src/lib/motion-studio/composePromptLayers.ts` ruft pro Szene `injectBrandCharacter` (Zeile 152–164, aufgerufen Zeile 196). Die Funktion hängt die **Identity Card** des Brand-Charakters („A young adult caucasian male with dark brown messy hair, light stubble, charcoal grey v-neck t-shirt, looking directly at the camera…") an **jeden** Prompt an, sobald die Jaccard-Überlappung < 0.6 ist.

Konsequenz: Auch reine B-Roll-Szenen (Hände, Drohne, Feld …) bekommen den vollen Personenbeschreib in den Prompt — Hailuo rendert prompt­getreu Matthews Gesicht in jeder Szene.

`brandCharacterInput` wird in `ClipsTab.tsx` (Zeile 75–81) und `SceneCard.tsx` (Zeile 132–138) für **jede** Szene blind aus dem Lieblings-Brand-Character gebaut, ohne zu prüfen, ob die Szene den Charakter überhaupt featured.

## Lösung — Brand-Charakter nur in Charakter-Szenen injizieren

### 1. `src/lib/motion-studio/composePromptLayers.ts`
- `ComposerInputs.brandCharacter` um ein Feld `appliesToScene?: boolean` (default `false`) erweitern.
- In `composePromptLayers`: `injectBrandCharacter` nur aufrufen, wenn `inputs.brandCharacter?.appliesToScene === true`. Andernfalls Brand-Layer als „skipped — scene not featuring character" loggen, damit der Live-Preview im SceneCard das transparent anzeigt.
- Jaccard-Logik bleibt zusätzlich erhalten (verhindert Doppelung, wenn die Identity Card schon im Prompt steht).

### 2. `src/components/video-composer/ClipsTab.tsx` & `SceneCard.tsx`
- Helper `isCharacterScene(scene, character)`:
  - `true`, wenn `scene.characterShot?.shotType` gesetzt **und** ≠ `'absent'` und auf den Charakter zeigt (id-match oder Name im prompt).
  - **oder** der Charaktername / Vorname im `scene.aiPrompt` vorkommt (case-insensitive).
- In den drei `composePromptLayers`-Aufrufstellen (Generate-All ~Z. 295–307, Generate-Single ~Z. 432–441, SceneCard-Live-Preview ~Z. 790–795) das `brandCharacter`-Argument so bauen:

```ts
const sceneFeaturesBrand = isCharacterScene(s, activeBrandChar);
const brandCharacterInput = activeBrandChar
  ? { name, identityCardPrompt, referenceImageUrl, appliesToScene: sceneFeaturesBrand }
  : undefined;
```

  → In B-Roll-Szenen (S2 „farmer's hands") wird die Identity Card jetzt **nicht** mehr injiziert; in S5 („Matthew Dusatko, CEO …") schon.

### 3. `src/components/video-composer/CastConsistencyMap.tsx`
- Tooltip für `'prompt'`-Zellen erklärt jetzt korrekt „Charakter im Prompt erwähnt — Brand-Identity-Card wird in dieser Szene injiziert".
- Bei `'absent'`-Zellen soll explizit stehen: „Charakter kommt hier nicht vor — Brand-Identity-Card wird übersprungen". Damit der User die neue Regel direkt nachvollziehen kann.

### 4. UI-Hinweis im SceneCard
- Im Live-Prompt-Preview (Zeile 808–826) das Badge `brand` ergänzen um eine Variante `brand · skipped` (gedämpfte Farbe), wenn die Szene den Charakter nicht featured. So sieht der User pro Szene, ob die Card injiziert wurde oder nicht.

## Verifikation

1. Composer mit Matthew-Projekt öffnen → Storyboard unverändert lassen → „Alle Clips neu generieren":
   - S1, S5: enthalten `Matthew Dusatko` im Prompt → Identity Card wird injiziert → Matthew wird gerendert.
   - S2 („spray pump"), S3 („Matthew's hands"), S4 („drone"): kein Name im Prompt → Identity Card **nicht** injiziert → Matthew taucht **nicht** auf.
2. Im Live-Preview pro Szene den `brand`-Badge prüfen: aktiv vs. `skipped`.
3. Cast-Consistency-Map: Reference/Prompt/Absent-Zellen passen jetzt zur tatsächlichen Pipeline.

## Out of Scope
- Keine Änderung an `compose-video-clips`, `compose-video-storyboard` oder DB-Schema.
- Kein Eingriff in den bestehenden Portrait-as-First-Frame-Toggle (bleibt Default OFF).
- Keine Änderung an Library-Character (`@-mention`)-Pfad — der bleibt explizit User-getrieben.
