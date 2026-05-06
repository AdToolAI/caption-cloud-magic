## Problem

Im Video Composer wirken die Charaktere im generierten Clip völlig anders als die definierte Person. Ursache (im Code verifiziert):

1. Die "Charaktere" im Composer (`CharacterManager.tsx`) sind **reiner Freitext** (Name, Aussehen, Signature Items). Es gibt **kein Bild / keinen Anker**.
2. In `compose-video-clips/index.ts` wird dieser Text nur als Prompt-Prefix injiziert (`injectCharacter`). Bei reinem Text-zu-Video (z.B. Hailuo 2.3 Standard im Screenshot) ist das Gesicht damit faktisch **zufällig** — Modelle halten Kleidung/Props zuverlässig, Gesichter nicht (steht so auch im Pro-Tipp).
3. Die bereits existierende **Brand Character Library** (mit `reference_image_url` + Hedra-optimiertem `portrait_url`) wird im Composer aktuell **nur passiv** mitinjiziert (Favorit oder erster), aber **nicht** an die Cast-Slots gebunden, die der User in der "Cast Consistency Map" sieht. Reference-Image wird außerdem nicht automatisch als i2v-Startframe gesetzt — d.h. der einzige Hebel, der wirklich Gesichts-Konsistenz erzeugt, bleibt ungenutzt.

## Lösung — Cast = Brand Character + Auto-i2v

### 1. Cast aus der Brand Character Library wählen
`CharacterManager.tsx` bekommt oben einen Button **"Aus Avatar-Bibliothek wählen"** (nutzt `useAccessibleCharacters`). Beim Anlegen wird der Composer-Character mit Referenz auf den Brand Character verknüpft:
```
ComposerCharacter {
  id, name, appearance, signatureItems,
  brandCharacterId?: string,        // NEU
  referenceImageUrl?: string,       // NEU (portrait_url || reference_image_url)
  identityCardPrompt?: string,      // NEU (buildCharacterPromptInjection)
}
```
Freitext-Charaktere bleiben weiterhin möglich (Fallback wie heute).

### 2. Auto-i2v pro Szene wenn Charakter zugewiesen
In `SceneCard` / Storyboard: Sobald eine Szene einen `characterShot` mit `shotType !== 'absent'` für einen Charakter mit `referenceImageUrl` hat **und** noch keine eigene `referenceImageUrl` an der Szene gesetzt ist:
- Szene bekommt visuell ein Badge "Anker: Avatar-Portrait"
- `scene.referenceImageUrl` wird (nicht-destruktiv, nur als Fallback) auf das Portrait gesetzt
- Dieser Fallback wird in `compose-video-clips/index.ts` für i2v-fähige Modelle (`hailuo`, `kling`, `wan`, `seedance`, `luma`, `veo`, `happyhorse`, `pika`) übernommen — das funktioniert dort bereits, sobald `referenceImageUrl` gesetzt ist.

### 3. Identity-Card-Prompt statt nur Appearance
`injectCharacter` in `compose-video-clips/index.ts` wird erweitert: wenn der Cast-Eintrag `identityCardPrompt` mitliefert, wird dieser anstelle von `appearance + signatureItems` injiziert (höhere Qualität, Gemini-generiert). Fallback bleibt der bisherige Pfad.

### 4. UX-Hinweis in der Cast Consistency Map
`CastConsistencyMap.tsx` zeigt für jede Szene mit gebundenem Brand Character ein grünes Anchor-Badge (statt nur "reference"), damit klar ist: Diese Szene nutzt das echte Portrait als ersten Frame → höchste Gesichts-Konsistenz.

### 5. Warnung bei T2V-only Modellen
Wenn der User einen Brand Character zugewiesen hat, aber für die Szene ein Modell ohne i2v-Support (aktuell nur ältere/spezielle Pfade) gewählt ist: kleiner Inline-Hinweis "Wechsle zu Hailuo / Kling / Seedance für echte Gesichts-Konsistenz."

## Technische Änderungen

- `src/types/video-composer.ts` — `ComposerCharacter` um `brandCharacterId`, `referenceImageUrl`, `identityCardPrompt` erweitern
- `src/components/video-composer/CharacterManager.tsx` — "Aus Avatar-Bibliothek wählen"-Dialog (`useAccessibleCharacters`), Avatar-Vorschau pro Cast-Eintrag
- `src/components/video-composer/SceneCard.tsx` — Auto-Fill `scene.referenceImageUrl` aus Cast-Portrait + Anchor-Badge + T2V-Warnung
- `src/components/video-composer/CastConsistencyMap.tsx` — neuer Status `'portrait-anchor'` mit goldenem Indicator
- `supabase/functions/compose-video-clips/index.ts` — `injectCharacter` nutzt `identityCardPrompt` wenn vorhanden; neue Type-Felder im `ComposerCharacter`-Interface der Function spiegeln

## Out of Scope
- Kein neues Modell, kein neuer Provider-Key
- Kein Eingriff in den Wizard / Auto-Director-Flow
- Bestehende reine Freitext-Charaktere bleiben unverändert funktional