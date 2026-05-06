## Problem

Sobald ein Charakter mit einem Avatar verknüpft wird, schreibt `CharacterManager.linkAvatar()` das Portrait in `character.referenceImageUrl`. Im Storyboard-Build wird daraus pro Szene `scene.referenceImageUrl`, was in `compose-video-clips` direkt in `first_frame_image` / `start_image` / `image` aller i2v-Provider (Hailuo, Kling, Wan, Seedance, Luma, Veo, HappyHorse) gepiped wird. Ergebnis: Jede Szene mit dem Charakter startet **exakt** mit dem Portrait-Bild — zu krass, statisch, „Standbild-zu-Video"-Look. Der User möchte nur, dass der Charakter **so aussieht wie** das Portrait, nicht damit beginnt.

## Lösung

Portrait-Anker entkoppeln: standardmäßig nur noch als **Look-Referenz** (Description-Anchor + Signature Items im Prompt) verwenden, nicht mehr als i2v-First-Frame. Optionaler Toggle pro Charakter für User, die den harten Anker bewusst wollen.

## Änderungen

### 1. `src/types/video-composer.ts`
Feld `usePortraitAsFirstFrame?: boolean` (Default `false`) am `Character`-Typ ergänzen.

### 2. `src/components/video-composer/CharacterManager.tsx`
- `linkAvatar`: `referenceImageUrl` weiter setzen (für UI-Thumbnail + Prompt-Anchor), aber neues Feld `usePortraitAsFirstFrame: false` initialisieren.
- Im verlinkten Charakter-Block (um Zeile 200–250) kompakten Toggle einblenden:
  - Label DE: „Portrait als ersten Frame erzwingen (i2v-Lock)"
  - Label EN/ES analog
  - Hinweis: „Aus = Charakter sieht aus wie das Portrait. An = Szene startet exakt mit dem Portrait-Bild (sehr starr)."
- Den bestehenden Erklärtext „Sein Portrait wird automatisch als erster Frame (i2v) genutzt" umformulieren zu: „Das Portrait dient als Look-Referenz für die KI. Optional kann es als erster Frame fixiert werden."
- Badge-Text „Portrait-Anker aktiv" bleibt, aber nur farbiger Akzent wenn Toggle an; sonst dezent „Look-Referenz".

### 3. `supabase/functions/compose-video-storyboard/index.ts`
Dort, wo pro Szene `referenceImageUrl` aus dem Charakter übernommen wird:
- Nur dann setzen, wenn `character.usePortraitAsFirstFrame === true`.
- Andernfalls `referenceImageUrl` weglassen und dafür die Charakter-Description + Signature Items wie heute schon in den Szenen-Prompt einweben (bereits vorhanden via Sherlock-Holmes-Anchor — dort prüfen, dass Portrait-URL-Prosabeschreibung greift).

### 4. Keine Änderungen an `compose-video-clips`
Die Engine-Logik (`isI2V = !!scene.referenceImageUrl`) bleibt unverändert — sie kippt automatisch in T2V-Modus zurück, sobald das Storyboard kein `referenceImageUrl` mehr setzt.

### 5. Lokalisierung
Neue Strings in DE/EN/ES für Toggle-Label, Hint und neuen Badge-Modus.

## Verifikation
- Avatar verlinken → Toggle aus → Storyboard generieren → in `compose_video_clips`-Logs erscheint pro Charakter-Szene **kein** `i2v reference`-Log, Engine läuft als T2V.
- Toggle einschalten → erneut generieren → wie bisher i2v mit Portrait als erstem Frame.
- Bestehende Charaktere ohne `usePortraitAsFirstFrame`-Feld defaulten zu `false` (rückwärtskompatibel).

## Out of Scope
Keine Änderung an Brand-Character-Library, an `extract-character-identity` oder am Avatar-Portrait-Generator.
