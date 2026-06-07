## Diagnose

Die Felder sind leer, weil die Director-Antwort zwar korrekt befüllt im `onApply` ankommt und in den React-State geschrieben wird, aber zwei Persistence-Layer dahinter brechen sie sofort wieder:

1. **DB-Schema fehlt.** In `composer_scenes` existieren die Spalten `scene_action_user` / `scene_action_en` **nicht** (verifiziert via `\d composer_scenes`). `useComposerPersistence` schreibt sie aber in jeden `upsert` (Z. 227–228 / 286–287). PostgREST lehnt den Upsert dann ab → Folge-Refetch / nächste Save-Runde überschreibt die Szene mit der DB-Version.

2. **Load-Mapping fehlt.** `VideoComposerDashboard.tsx` (Z. 371 + 514) baut beim Laden aus der Row ein `ComposerScene`, mappt aber `scene_action_user` / `scene_action_en` nirgends → selbst wenn die Spalten existierten, käme nach einem Reload nichts in `sceneActionUser` / `sceneActionEn` zurück.

3. **Per-Character-Action-Felder** (`actionUser` / `actionEn` pro Slot) reisen automatisch im `character_shots` JSONB mit — das Mapping `characterShots: row.character_shots as any` reicht aus, sobald (1)+(2) repariert sind und der Save nicht mehr verworfen wird.

Cache (`v4`), `scene-director` Normalisierung und SceneCard-`onApply` sind in Ordnung — die Daten sterben rein an der Persistenz.

## Änderungen

### 1. Migration — Spalten ergänzen

Neue Migration:

```sql
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS scene_action_user TEXT,
  ADD COLUMN IF NOT EXISTS scene_action_en   TEXT;
```

(Keine GRANT-Änderungen nötig — Tabelle ist bestehend, RLS/Grants greifen weiter.)

### 2. `src/components/video-composer/VideoComposerDashboard.tsx`

An den beiden Stellen, an denen `composer_scenes`-Rows in `ComposerScene` gemappt werden (Z. ~371 und ~514), zusätzlich:

```ts
sceneActionUser: (row as any).scene_action_user ?? '',
sceneActionEn:   (row as any).scene_action_en   ?? '',
```

Das stellt sicher, dass sowohl frische Director-Outputs als auch manuelle Edits einen Reload überleben.

### 3. `src/hooks/useComposerPersistence.ts` — Defensive Logs

Beim `upsert`-Fehler-Branch (rund um die `composer_scenes`-Upserts) ein `console.warn('[persistence] composer_scenes upsert failed', error)` setzen, falls noch nicht vorhanden. So sehen wir in der Konsole sofort, wenn ein zukünftiger Schema-Drift wieder zuschlägt — kein stiller Datenverlust mehr.

### 4. Keine Änderungen an

- `scene-director/index.ts` — Output ist bereits vollständig normalisiert (sceneActionEn / Localized / perCharacterActions(+Localized) immer gefüllt).
- `SceneDirectorBox.tsx` / `SceneCard.tsx` — `onApply`-Wiring überschreibt die Felder bereits korrekt, sobald Persistence sie nicht mehr wegwirft.
- `applyActionsToPrompt.ts`, `useAutoTranslateEn`, Lipsync, Render-Pipeline.

## Akzeptanzkriterien

- Neues Briefing → Director Run → "Was passiert in der Szene?" zeigt die deutsche/spanische/englische Aktion direkt unterhalb mit Auto-EN-Preview.
- Pro gemappten Charakter im `CharacterCastPicker` erscheint im Action-Feld der jeweilige Satz aus `perCharacterActionsLocalized`.
- Nach Browser-Reload sind beide Feld-Typen weiterhin gefüllt.
- Manuelle Edits werden weiterhin respektiert (Lock-Verhalten bleibt; nur ein expliziter Re-Run des Directors überschreibt sie).
