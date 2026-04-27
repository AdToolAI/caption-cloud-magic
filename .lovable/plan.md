## Hebel 3: Stock-Library-Moat

Ziel: Eine kuratierte Bibliothek aus **Pexels + Pixabay Stock** und **vorgefertigten Scene-Snippets** (Artlist-Style „Ready-to-use Scenes") direkt in Motion Studio + Studio Mode integrieren — als Wettbewerbsvorteil gegenüber Artlist's Asset-Library.

### Was bereits existiert
- `search-stock-videos` & `search-stock-images` Edge Functions (Pexels + Pixabay, parallel) ✅
- `StockMediaBrowser` Komponente (im Video-Composer Clips-Tab) ✅
- `motion_studio_scene_snippets` Tabelle + `SceneSnippetPicker` (eigene User-Snippets) ✅

### Was fehlt
- **Kuratierte System-Snippets** (von uns vorbefüllt, für alle Nutzer sichtbar) — Artlist's "Scene Library"-Äquivalent
- **Stock-Browser** im Studio Mode + im Snippet-Picker (zum schnellen Erstellen aus Stock)
- **One-Click „Stock → Snippet"** Workflow

---

### Schritt 1 — DB-Erweiterung: System-Snippets + Kategorien
- Migration auf `motion_studio_scene_snippets`:
  - `is_system boolean default false` (kuratierte System-Templates)
  - `category text` (z.B. `product_hero`, `lifestyle`, `talking_head`, `b_roll`, `transition`)
  - `preview_video_url text` (Stock-Preview-Clip)
  - `thumbnail_url text`
  - `sort_order int default 0`
- RLS: System-Snippets (`is_system = true`) sind für **alle authenticated users** lesbar
- Seed: 24 kuratierte Snippets (6 Kategorien × 4 Stück) mit Pexels-Stock-URLs + fertigen Prompts

### Schritt 2 — Hook erweitern: `useMotionStudioLibrary`
- `listSceneSnippets()` → optional `{ includeSystem: true, category?: string }`
- Query um System-Snippets erweitern, parallel laden, in UI klar markieren

### Schritt 3 — Neue Komponente: `CuratedSnippetGallery`
- Bento-Grid mit System-Snippets, gefiltert nach Kategorie-Chips
- Hover: Preview-Video autoplay (muted)
- „Use this Scene" → fügt Snippet als Storyboard-Szene ein (übernimmt prompt + reference_image_url)

### Schritt 4 — Stock-Browser im Studio Mode
- In Studio Mode Step 3 (Storyboard) zwei neue Buttons pro Szene:
  - **„Stock-Footage"** → öffnet `StockMediaBrowser`, ausgewähltes Asset wird als `referenceImageUrl` (oder `clipUrl` für Direkt-Use) der Szene gesetzt
  - **„Curated Scenes"** → öffnet `CuratedSnippetGallery`
- Wiederverwendung der existierenden `StockMediaBrowser`-Komponente (kein Duplikat)

### Schritt 5 — `SceneSnippetPicker` upgraden
- Neuer Tab oben: **„Meine Snippets" | „Kuratiert" | „Stock"**
  - **Kuratiert**: nutzt `CuratedSnippetGallery`
  - **Stock**: embedded Stock-Search → „Save as Snippet" Button erstellt aus Stock-Asset einen User-Snippet
- Sortierung nach `usage_count` (Trending)

### Schritt 6 — Seed-Daten erstellen
SQL-Migration mit 24 vorgefertigten System-Snippets, z.B.:
- *Product Hero*: „Cinematic 360° rotation around product on minimal background"
- *Lifestyle*: „Hand picks up coffee cup, golden hour kitchen"
- *Talking Head*: „Centered medium shot, soft window light"
- *B-Roll Tech*: „Macro shot of typing on laptop keyboard"
- *Transition*: „Whip-pan blur from left to right"
- *Establishing*: „Drone shot pulling up from city street"

Jedes mit:
- Pexels Stock-Video-URL (frei lizenziert)
- Auto-extrahiertes `last_frame_url` (für Continuity-Chaining mit Hebel 2!)
- Pre-filled `prompt`, `duration_seconds`, `tags`

### Schritt 7 — Hub & Studio-Mode CTA
- Motion Studio Hub: neue Karte „Curated Scenes Library" (24+ ready-to-use scenes)
- Studio Mode Step 3: prominenter „Browse Curated Scenes"-Button als Empty-State CTA

---

### Technische Details
- **Edge Functions**: keine neuen — Wiederverwendung von `search-stock-videos` / `search-stock-images`
- **Continuity-Sync**: Beim Insert eines Stock/Curated-Snippets → automatisches Triggern von `detect-scene-drift` (aus Hebel 2) gegen Vorgänger-Szene
- **Lizenz-Hinweis**: Pexels/Pixabay-Attribution wird in `metadata.author` gespeichert + im UI als kleiner Link angezeigt
- **Performance**: System-Snippets via `staleTime: 10min` cachen (statisch)

### Files
**Neu**:
- `src/components/motion-studio/CuratedSnippetGallery.tsx`
- `supabase/migrations/<ts>_curated_scene_snippets.sql` (Schema + 24 Seeds)

**Geändert**:
- `src/hooks/useMotionStudioLibrary.ts` (System-Snippet-Support)
- `src/components/motion-studio/SceneSnippetPicker.tsx` (3-Tab-Struktur)
- `src/pages/MotionStudio/StudioMode.tsx` (Stock + Curated Buttons in Step 3)
- `src/pages/MotionStudio/Hub.tsx` (Curated-Library-Karte)
- `src/types/motion-studio.ts` (`is_system`, `category`, `preview_video_url`)

### Geschätzter Aufwand
~1 Tag (großteils Glue-Code, da Edge Functions + Stock-Browser bereits existieren). Hauptarbeit: kuratierte Seed-Daten + UI-Polish.

### Wow-Effekt
- Nutzer kann in **<10 Sekunden** ein komplettes Storyboard aus 4 kuratierten Stock-Szenen zusammenklicken
- „Looks like Artlist" — aber mit unserem AI-Workflow drumherum (Continuity Guardian, AI-Render, etc.)