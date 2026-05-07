## Problem

Bei der Szene "Matthew Dusatko, a middle-aged farmer..." wird kein Referenzbild an den AI-Provider geschickt. Sichtbare Symptome im Screenshot:
- `Charakter: — keiner —` (kein `characterShot` gesetzt)
- Kein Referenzbild-Thumbnail im rechten Slot
- Modell erfindet ein Gesicht statt das Avatar-Foto zu nutzen

## Root Cause (verifiziert in Code)

In `ClipsTab.tsx` gibt es zwei getrennte Pfade, die ein `referenceImageUrl` an den Edge-Function-Payload anhängen — und beide sind in dieser Konstellation tot:

1. **Cast-Pfad** (`castMember.usePortraitAsFirstFrame`)
   - Greift nur, wenn `scene.characterShot.shotType !== 'absent'`. Im Screenshot ist `Charakter: — keiner —` → `castMember = undefined` → kein Anker.
   - Selbst wenn ein Cast gesetzt wäre, ist `usePortraitAsFirstFrame` per Default `false` (siehe `CharacterManager.tsx:201`) → Anker bleibt aus.

2. **Brand-Char-Pfad** (`activeBrandChar` = Favorite aus `/brand-characters`)
   - Funktioniert nur für **eine einzige** Brand-Character-Karte (`brandChars.find(c => c.is_favorite) ?? brandChars[0]`).
   - Wenn der Nutzer Matthew über die Composer-Cast-Library hinzugefügt hat (er aber kein favorisierter Brand-Character ist), zieht dieser Pfad nicht — oder zieht für eine andere Person.
   - Außerdem hängt der Pfad zusätzlich an `usePortraitAsFirstFrame` — das wir in `SceneCard`/`ClipsTab` zwar auf `_brandApplies` mappen, aber nur für Brand-Chars, nicht für Cast-Mitglieder mit `brandCharacterId`.

Ergebnis: `referenceImageUrl` bleibt `undefined` → `compose-video-clips` baut T2V (`hailuoInput.first_frame_image` wird nie gesetzt) → Hailuo erfindet einen Mann.

## Lösung

Wir machen die Anker-Resolution **per-Szene cast-zentriert** und entkoppeln sie vom (verwirrenden) `usePortraitAsFirstFrame`-Toggle. Das matcht das Mental-Modell des Users: "Wenn ich einen Charakter in der Cast-Liste habe und er kommt in der Szene vor, nimm sein Bild als Referenz."

### 1. Neuer Helper `src/lib/motion-studio/resolveSceneCharacterAnchor.ts`

Reine Funktion. Gibt für eine Szene den besten Anker (`{ characterId, name, referenceImageUrl, source }`) zurück.

Reihenfolge:
1. Explizit gewählter Cast (`scene.characterShot.shotType !== 'absent'` und Cast hat `referenceImageUrl`).
2. Cast-Member, dessen Name (oder First-Name-Token, ≥3 Zeichen) im `aiPrompt` vorkommt — über alle `characters` der Szene, nicht nur die favorisierte Brand-Karte.
3. Favorisierte Brand-Character-Karte, falls Name dort matcht (Backup, wie bisher).
4. Sonst `undefined`.

Lebt in `lib/motion-studio/`, neben `sceneFeaturesCharacter.ts`. Keine DB-/Backend-Änderungen.

### 2. `src/components/video-composer/ClipsTab.tsx`

- `buildBrandInputForScene`: bleibt für Identity-Card-Text-Injection (das funktioniert ja).
- Neue Helper-Aufrufe in `handleGenerateAll` (Zeile ~338) **und** im Single-Clip-Pfad (Zeile ~467):
  - `const anchor = resolveSceneCharacterAnchor(scene, characters, activeBrandChar);`
  - `referenceImageUrl: scene.referenceImageUrl || anchor?.referenceImageUrl`
- Die alten `castAnchor` / `brandAnchor`-Blöcke (mit `usePortraitAsFirstFrame`-Gate) werden ersetzt — der Toggle bleibt im UI als "Force always" Option erhalten (legacy), ist aber für den Default-Flow nicht mehr nötig.

### 3. `src/components/video-composer/SceneCard.tsx`

- "i2v ref"-Badge in der Live-Preview liest jetzt aus dem gleichen Helper, damit das, was angezeigt wird, exakt dem entspricht, was das Edge-Function-Payload bekommt.
- Kleiner sichtbarer Anker-Hint unter dem Charakter-Dropdown: wenn ein Anker via Name-Match gefunden wurde, kleines Avatar-Thumb + Tooltip "Referenzbild: {Name}".

### 4. `src/components/video-composer/CastConsistencyMap.tsx`

- `getAnchor` greift den neuen Resolver, sodass die Map-Punkte (🟢 Reference) konsistent mit dem tatsächlichen Edge-Payload sind. Kein optisches Re-Design.

## Out-of-Scope

- Keine DB-Migration, kein neues Schema.
- Kein Eingriff in `compose-video-clips/index.ts` (das Backend wertet `scene.referenceImageUrl` bereits korrekt aus — siehe Hailuo Z. 408/428, Kling 471, Wan 564, Seedance 606, Luma 647, Veo 697, HappyHorse 872).
- Vidu/Runway-spezifische Multi-Reference-Slots werden hier **nicht** angefasst (separates Feature).

## Verifikation nach Implementierung

1. Szene mit `Charakter: — keiner —` aber Prompt enthält "Matthew Dusatko" → Live-Preview zeigt "i2v ref · Matthew", Generate sendet `referenceImageUrl` → Hailuo nutzt `first_frame_image` (Log: `uses reference image`).
2. Pure B-Roll Szene ohne Namen → kein Anker, kein Identity-Card → Modell rendert frei.
3. Szene mit explizitem `characterShot` → Anker wie bisher, kein Regress.
