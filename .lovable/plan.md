## Stage 5 — Unified Picker & Sidebar-Konsolidierung

Ziel: Im Composer-Storyboard ist der bisherige Cast-Picker auf Charaktere beschränkt — Locations/Buildings/Props müssen umständlich per Hand getippt oder per @-Mention referenziert werden. Stage 5 vereint sie in einem einzigen Picker pro Szene und räumt die Sidebar auf.

### Was gebaut wird

**1) `<UnifiedAssetPicker />`** — neuer Picker pro Composer-Szene mit 4 Tabs:
- **Cast** (bestehende `CharacterCastPicker`-Logik, max 4 Slots, Shot-Type pro Slot — bleibt 1:1 erhalten)
- **Locations** (Quelle: `useBrandLocations`, max 1 Slot pro Szene)
- **Architecture** (Quelle: `useBrandBuildings`, max 1 Slot)
- **Props** (Quelle: `useBrandProps`, max 3 Slots)

Tabs zeigen einen Counter-Badge (z. B. "Cast 2 · Loc 1 · Bld 0 · Props 2") und nutzen die Thumbnails aus `reference_image_url`. Suchfeld + „Generate with AI"-Shortcut, der direkt `generate-world-asset` aufruft (gleicher Flow wie im `/library`-Hub).

**2) Persistenz ohne Schema-Änderung** — Locations/Buildings/Props werden als slugifizierte `@mentions` an den Anfang des Scene-Prompts injiziert (z. B. `@gothic-cathedral @vintage-camera`). Dadurch:
- Kein DB-Schema-Update nötig
- `resolveMentions` + `useUnifiedMentionLibrary` injizieren automatisch die Reference-Images für Vidu Q2 (Multi-Reference), Hailuo i2v und Nano-Banana-Anchor — die Pipeline existiert bereits
- @-Mentions im Prompt-Editor und der Picker bleiben in Sync (Add im Picker → Mention erscheint im Prompt; Tippen einer Mention → Picker zeigt sie als ausgewählt)

Die `applyCastToPrompt`-Marker-Logik (`[Cast: …]`) wird um zwei analoge Marker erweitert: `[Setting: …]` und `[Props: …]`. Beide sind idempotent (regex-basiert ersetzbar) und werden vom Mention-Resolver beim Hydraten ignoriert, sodass keine Doppel-Sektion entsteht.

**3) Sidebar / Hub-Konsolidierung** — in `src/config/hubConfig.ts`:
- Zeile 89 `/avatars` → entfernen
- Zeile 90 `/motion-studio/library` → entfernen
- Neu: ein einziger Eintrag **`/library`** mit Titel „Cast & World Library" und Beschreibung „Avatare, Locations, Buildings & Props — alles in einer Bibliothek"
- `/avatars` und `/motion-studio/library` als Routen erhalten und dort eine `<Navigate to="/library" replace />` Redirect-Komponente, damit alte Bookmarks nicht brechen

### Technische Details

- Neuer Komponentenpfad: `src/components/video-composer/UnifiedAssetPicker.tsx`
- Helper-Modul: `src/lib/motion-studio/applySceneAssetsToPrompt.ts` (analog zu `applyCastToPrompt.ts`, exportiert `applySettingMarker` + `applyPropsMarker`)
- `SceneCard.tsx` Zeile 912: `<CharacterCastPicker>` durch `<UnifiedAssetPicker>` ersetzen, Props-Mapping ergänzen (`locations`, `buildings`, `props` aus den drei Hooks)
- Scene-Datentyp bleibt unverändert — alle neuen Assets leben im `prompt`-String als Mentions
- `hubConfig.ts`: 2 Items entfernt, 1 Item `/library` mit Icon `Sparkles` (oder `Library` aus lucide-react) ergänzt
- `App.tsx`: Routen `/avatars` und `/motion-studio/library` zeigen weiter auf ihre Detail-Seiten **NUR** wenn Pfad-Suffix existiert (`/avatars/:id` bleibt für AvatarDetail); reine Listen-Routen redirecten auf `/library`

### Out of scope (explizit nicht in dieser Stage)

- Keine neue Tabelle, kein Migration-File
- Keine Änderung am Render-Pipeline-Code (Vidu/Hailuo/Compose-Anchor) — die Mention-Resolution-Schicht reicht bereits alle Reference-URLs durch
- Avatar-Detail-Seite (`/avatars/:id`) bleibt unverändert erreichbar

## ✅ Stage 5 — implementiert
- `UnifiedAssetPicker.tsx` ersetzt CharacterCastPicker im SceneCard und fügt Locations/Buildings/Props als Chip-Reihen hinzu.
- `applySceneAssetsToPrompt.ts` injiziert slugifizierte @-Mentions als Auto-Block am Prompt-Anfang (idempotent, reversibel).
- Sidebar: `/avatars` + `/motion-studio/library` zusammengeführt zu einem Eintrag `/library` ("Cast & World Library"); alte Routen redirecten auf `/library`, `/avatars/:id` bleibt erreichbar.
