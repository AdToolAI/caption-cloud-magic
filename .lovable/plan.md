## Problem

Der `CharacterCastPicker` schreibt zwar `characterShots: [a, b]` in den lokalen State, aber das Composer-Persistence- und Reload-System kennt **nur die Spalte `character_shot` (Singular)** in `composer_scenes`. Das Feld `characterShots` (Plural) ist also rein in-memory.

Sobald der `VideoComposerDashboard` die Szenen frisch aus der DB nachzieht (passiert beim Mount, nach Realtime-Updates, nach Render-Webhook etc.), wird das Scene-Objekt komplett neu aus den DB-Spalten gebaut — **`characterShots` ist dann `undefined`**, und der Picker fällt zurück auf `legacyValue = characterShot` (= nur 1 Slot).

Im Screenshot sichtbar: Cast-Field zeigt „Kein Charakter im Cast", obwohl der Prompt bereits `[Besetzung: Matthew Dusatko (Voll)]` enthält — und das Add-Popover bietet Matthew **erneut** an, weil `inCast` leer ist. Klick auf einen zweiten Charakter ersetzt deshalb effektiv den ersten.

## Lösung

Eine echte zweite Quelle für die Multi-Cast-Daten in der DB persistieren — getrennt vom Legacy-Singular.

### 1. DB-Migration (`composer_scenes`)
Neue Spalte:
```sql
alter table public.composer_scenes
  add column if not exists character_shots jsonb not null default '[]'::jsonb;
```
- Kein Constraint, kein Default-Cast — leeres Array = legacy/keine Multi-Auswahl.
- Bestehende Zeilen bleiben unangetastet (Default `[]`), Legacy-Pfad über `character_shot` läuft weiter.

### 2. Persistence (3 Schreibstellen)
In **`src/components/video-composer/VideoComposerDashboard.tsx`** (`persistScenesToDb`, ~Zeile 702) und **`src/hooks/useComposerPersistence.ts`** (Insert ~232 + Update ~188):
```ts
character_shot: (scene.characterShot ?? null) as any,
character_shots: (scene.characterShots ?? []) as any,
```

### 3. Loader (DB → ComposerScene)
In **`src/components/video-composer/VideoComposerDashboard.tsx`** (`loadProject` Mapping ~Zeile 285 und `refetchScenesFromDb` analog):
```ts
characterShot: row.character_shot ?? local?.characterShot,
characterShots: (row.character_shots as CharacterShot[] | null)?.length
  ? (row.character_shots as CharacterShot[])
  : (row.character_shot ? [row.character_shot] : (local?.characterShots ?? [])),
```
- Fallback `[character_shot]` deckt alte Projekte ohne `character_shots`-Eintrag ab → der zweite Charakter geht beim ersten Speichern in die neue Spalte.

### 4. Type-Stelle
**`src/types/video-composer.ts`** — `characterShots?: CharacterShot[]` ist bereits im Type, kein Schema-Change nötig.

### 5. Optional: Singular-Sync robuster
In **`SceneCard.tsx`** (Zeile 686–688) bleibt der Sync `characterShot: next[0]` für Lip-Sync/ContinuityGuardian/CastConsistencyMap erhalten — nur jetzt nicht mehr die einzige Wahrheit.

## Out of Scope
- Migration der bestehenden anderen Komponenten (`ContinuityGuardian`, `CastConsistencyMap`, `ClipsTab.targetScene.characterShot`) auf den Plural — die nutzen weiter den Singular `characterShot` (= primärer Slot), das passt für die aktuelle UX.
- Edge-Function `compose-scene-anchor` — bekommt Multi-Portraits bereits korrekt aus dem Resolver, unabhängig von der DB-Spalte.

## Geänderte Dateien
- **Migration**: neue Spalte `composer_scenes.character_shots jsonb`
- `src/components/video-composer/VideoComposerDashboard.tsx` (Loader + Persist)
- `src/hooks/useComposerPersistence.ts` (Insert + Update)

Soll ich loslegen?
