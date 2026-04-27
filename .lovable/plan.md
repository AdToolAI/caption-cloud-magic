## Hebel 7 — Snippet-Builder + Community-Library (~1 Tag)

### Ist-Stand
- DB-Tabelle `motion_studio_scene_snippets` existiert, CRUD-Hooks (`createSceneSnippet`, `listSceneSnippets`, `deleteSceneSnippet`) sind live.
- "Meine"-Tab im `SceneSnippetPicker` erlaubt rudimentäres Sichern der aktiven Szene (nur Name).
- Es fehlt: dedizierte Builder-UI (Tags, Kategorie, Thumbnail, Edit), Public-Sharing-Mechanik und Community-Browser.

### Was wir bauen

**1. Snippet-Builder Dialog (eigene UI, kein Picker-Inline mehr)**
- Neue Komponente `SnippetBuilderDialog.tsx`:
  - Felder: Name, Beschreibung, Kategorie (Dropdown aus `SCENE_SNIPPET_CATEGORIES`), Tags (Chip-Editor), Dauer, Prompt (mehrzeilig editierbar).
  - Auto-Vorschlag aus aktuellem Storyboard-Scene (Prompt + last_frame_url).
  - Thumbnail-Upload oder Auto-Capture aus `last_frame_url` (Storage: `motion-studio-library/{user_id}/snippets/`).
  - Toggle "Öffentlich teilen" (`is_public`) mit Hinweis auf Community-Library.
- Bearbeiten existierender Snippets über denselben Dialog (Edit-Mode via `snippet?: SceneSnippet`).
- Auslöser: "Neues Snippet"-Button im "Meine"-Tab + Edit-Icon pro Snippet-Karte.

**2. Community-Library (4. Tab im Picker)**
- Neuer Tab `community` neben Kuratiert / Meine / Stock.
- Zeigt alle `is_public = true` Snippets fremder User, sortiert nach `like_count` desc + `usage_count` desc.
- Aktionen pro Karte: "In Storyboard einfügen", "❤️ Liken", "Klonen" (kopiert Snippet in eigene Library, setzt `user_id = auth.uid()`, `is_public = false`, `cloned_from = original.id`).
- Filter: Kategorie, Suchtext, Sort (Top / Neu).

**3. Datenbank-Migration**
- Spalten zu `motion_studio_scene_snippets`:
  - `is_public boolean DEFAULT false NOT NULL`
  - `like_count integer DEFAULT 0 NOT NULL`
  - `cloned_from uuid REFERENCES motion_studio_scene_snippets(id) ON DELETE SET NULL`
  - `published_at timestamptz`
- Neue Tabelle `motion_studio_snippet_likes (user_id, snippet_id, created_at, PK(user_id, snippet_id))` mit RLS (User darf eigene Likes CRUD).
- RLS-Policy ergänzen: `is_public = true` Snippets sind für alle authentifizierten User SELECT-bar.
- Trigger: Like-Insert/Delete erhöht/dekrementiert `like_count` atomar.
- Index auf `(is_public, like_count DESC)` für Community-Sortierung.

**4. Hook-Erweiterungen (`useMotionStudioLibrary.ts`)**
- `updateSceneSnippet(id, patch)` (fehlt aktuell komplett).
- `listCommunitySnippets({ category?, sort: 'top'|'new', search? })`.
- `toggleSnippetLike(snippetId): Promise<boolean>` (idempotent).
- `cloneCommunitySnippet(snippetId): Promise<SceneSnippet | null>`.
- `publishSnippet(id, isPublic)` als dünner Wrapper auf `updateSceneSnippet`.

**5. Thumbnail-Pipeline**
- Wenn kein `thumbnail_url` gesetzt: bei Save automatisch aus `last_frame_url` oder erster Clip-Frame eine 512px-Vorschau generieren (Reuse `extractVideoFrame.ts` falls Clip-URL vorhanden, sonst direkter Image-Upload).

**6. Picker-Integration**
- "Meine"-Tab: ersetzte Inline-Save-Box durch "Neues Snippet"-CTA, der `SnippetBuilderDialog` öffnet. Karten zeigen Edit-Icon, Like-Count, Public-Badge.
- "Community"-Tab als 4. Tab im `Tabs`-Layout.

### Technische Details
- Like-Trigger als `SECURITY DEFINER` Function mit `search_path = public`.
- `cloneCommunitySnippet` setzt `usage_count=0`, `like_count=0`, kopiert NICHT `cast_character_ids`/`location_id` (gehören dem Originalbesitzer) — stattdessen Hinweis-Toast "Cast/Location zurücksetzen oder neu zuordnen".
- Public-Toggle prüft Mindest-Qualität (Prompt ≥ 20 Zeichen, Name ≥ 3 Zeichen, Thumbnail vorhanden) bevor `is_public=true` erlaubt wird.
- Keine Moderation in V1 — User können eigene Public-Snippets jederzeit auf privat zurückstellen oder löschen.

### Dateien
**Neu:**
- `src/components/motion-studio/SnippetBuilderDialog.tsx`
- `src/components/motion-studio/CommunitySnippetGallery.tsx`
- `supabase/migrations/<ts>_snippet_sharing.sql`

**Geändert:**
- `src/hooks/useMotionStudioLibrary.ts` (neue CRUD + Like + Clone Methoden)
- `src/components/motion-studio/SceneSnippetPicker.tsx` (4. Tab, Builder-Trigger)
- `src/types/motion-studio.ts` (`is_public`, `like_count`, `cloned_from`)
- `src/integrations/supabase/types.ts` (auto-regen)

### Out of Scope (bewusst)
- Moderationsqueue / Reporting (kommt erst bei nennenswertem Public-Volumen).
- Kommentare / Reviews auf Snippets.
- Snippet-Versionierung.
