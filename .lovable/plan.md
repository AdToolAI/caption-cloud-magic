## Problem
Stage 2 (Resolver/Anchor) und Stage 3 (Talking-Head Dialog) sind fertig — aber **Stage 1 (UI) wurde nie umgesetzt**. Im Composer gibt es nach wie vor nur den `CharacterShotPicker` mit einem einzigen `<Select>` für **einen** Charakter pro Szene. Der Resolver kann zwar mehrere Charaktere via `@-Mention`/Namensmatch im Prompt einsammeln, aber es gibt keinen sichtbaren Cast-Slot für mehrere expliziten Charaktere.

## Lösung — Multi-Character Cast Picker (UI-only)

### 1. Neue Komponente `CharacterCastPicker`
Ersetzt den `CharacterShotPicker` in `SceneCard.tsx`. Verhalten:

- **Cast-Slots** (max 4) horizontal als Avatar-Chips: `[Sarah · Voll] [Matthew · Profil] [+]`.
- Jeder Chip:
  - Avatar-Thumbnail + Name
  - Inline-Dropdown für `shotType` (Voll/Profil/Rücken/Detail/POV/Silhouette)
  - `×` zum Entfernen
- `[+]`-Button → Popover-Dropdown mit allen verfügbaren Charakteren (gefiltert: schon im Cast = ausgegraut).
- Bei 0 Charakteren im Cast → unverändertes „— keiner —" Verhalten.
- Erster Slot bleibt der „primary" für Backwards-Compat (wird in `scene.characterShot` gespeichert wie heute).

### 2. Datenmodell-Erweiterung (kein DB-Change)
- Neues optionales Feld in `ComposerScene`: `characterShots?: CharacterShot[]` (Array, max 4).
- `characterShot` (singular) bleibt als **derived** Feld = `characterShots?.[0]` für Backwards-Compat in Resolver, Badge, Lip-Sync-Toggle, Render-Pipeline.
- Migration in-memory beim Laden alter Szenen: wenn `characterShot` gesetzt aber `characterShots` leer → `characterShots = [characterShot]`.

### 3. Resolver-Anpassung
`resolveSceneCharacterAnchorsAll()` erweitern um Quelle `'cast-slot'`:
- Iteriert ZUERST über `scene.characterShots[]` (alle expliziten Slots → `first-frame-composed` bei multi).
- Danach unverändert: `cast-name-match` und `brand-name-match`.
- Strategie: bei ≥2 Anchors → `first-frame-composed` (multi-flag bleibt wie implementiert).

### 4. Badge-Reihe in `SceneCard`
Statt einem `CharacterShotBadge` jetzt eine `flex gap-1`-Reihe aller Cast-Mitglieder mit ihren Shot-Badges.

### 5. UI-Hinweis
Kleiner Helper-Text unter dem Cast-Picker:
> „Bis zu 4 Charaktere pro Szene. Nano Banana 2 komponiert sie automatisch ins erste Frame. Bei ≥2 Charakteren wird Vidu Q2 (Multi-Reference) als Provider empfohlen."

## Geänderte Dateien
- `src/components/video-composer/CharacterShotBadge.tsx` — neu: `CharacterCastPicker` Komponente (oder eigene Datei `CharacterCastPicker.tsx`).
- `src/components/video-composer/SceneCard.tsx` — Picker tauschen, Badge-Reihe rendern, `characterShots` State handhaben.
- `src/types/video-composer.ts` — Feld `characterShots?: CharacterShot[]` ergänzen.
- `src/lib/motion-studio/resolveSceneCharacterAnchor.ts` — Cast-Slots als erste Quelle einlesen.
- `mem://features/video-composer/multi-character-composition.md` — Update mit Cast-UI Beschreibung.

## Out of Scope
- DB-Migration (nicht nötig — Array wird in `composer_scenes.character_shot` als JSON-Array serialisiert ODER neu in `character_shots` JSONB; entscheide ich beim Implementieren — ohne neue Spalte).
- Talking-Head Dialog-Mode (bereits fertig).
- Toolkit-Generator Multi-Cast (kommt in einer Folge-Iteration).

Soll ich loslegen?
