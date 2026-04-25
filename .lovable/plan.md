
# Block J — Persistent Characters & Locations
## Lücken-Analyse statt Neubau

Bei der Codeprüfung ist ein wichtiger Befund herausgekommen:

**Was bereits existiert** (aus früheren Blöcken):
- ✅ DB-Tabellen `motion_studio_characters` & `motion_studio_locations` mit RLS
- ✅ Storage-Bucket `motion-studio-library` (privat, signed URLs)
- ✅ `useMotionStudioLibrary` Hook (CRUD + Upload + Usage-Tracking)
- ✅ `CharacterEditor`, `LocationEditor`, `LibraryPicker` Komponenten
- ✅ Library-Page unter `/motion-studio/library` (420 Zeilen)
- ✅ `LibraryUploadConsentDialog` (DSGVO/KUG-Hardgate)
- ✅ `@-Mention`-Parser (`mentionParser.ts`) mit `resolveMentions()` und `getActiveMentionTrigger()`
- ✅ `PromptMentionEditor` mit Autocomplete-Dropdown
- ✅ Composer-Integration in `SceneCard.tsx` und `ClipsTab.tsx` (Mentions werden bereits in den Prompt aufgelöst)

**Was noch fehlt für echte Artlist-Parität:**

1. ❌ **Reference-Image gelangt nicht zur AI-Pipeline** — `resolveMentions()` liefert zwar `referenceImageUrl`, aber `ClipsTab.tsx` übergibt sie **nicht** an die generate-Edge-Functions (Hailuo/Kling/Sora/Wan). Genau das ist die Kernfunktion für visuelle Konsistenz.
2. ❌ **Kein Frame-Capture aus existierenden Videos** — Artlist's "Cast" lässt User Charaktere aus generierten Frames extrahieren.
3. ❌ **Library nur über separate `/motion-studio/library`-Seite erreichbar** — im Composer fehlt ein Quick-Sidepanel zum Erstellen während des Scriptens.
4. ❌ **Multi-Engine-Konsistenz nicht modellspezifisch übersetzt** — Sora/Kling/Hailuo/Wan haben unterschiedliche Reference-Image-Parameter (`image`, `first_frame`, `subject_reference`); aktuell nicht gemappt.
5. ❌ **Lokalisierung** — Library-Komponenten sind teils nur DE.
6. ❌ **Library-Übersicht im Composer-Storyboard** fehlt (welche Szenen referenzieren welchen Charakter).

## Ziel
Aus „technisch vorhanden, aber nicht orchestriert" wird „echte Cast-&-Scout-Konsistenz auf Artlist-Niveau, multi-model".

---

## J-1 — Reference-Image-Pipeline an AI-Models hängen (P0, KERN)

**Problem:** `resolveMentions()` gibt bereits `referenceImageUrl` zurück, wenn genau ein Charakter ODER eine Location erwähnt wird. Diese URL wird in `ClipsTab.tsx` Zeile 274/381 zwar berechnet, aber bei den Generate-Calls **verworfen**. Damit erfüllt das System die @-Mention-Funktion zwar textlich, aber **nicht visuell**.

**Edge-Functions, die angepasst werden müssen** (Reference-Image-Mapping per Modell):
- `generate-hailuo-video` → Param `first_frame_image` (Hailuo unterstützt i2v)
- `generate-kling-video` → Param `start_image` (Kling 3 Omni nimmt Reference)
- `generate-sora-video` → Sora 2 nimmt **kein** Reference-Image → wir injizieren stattdessen einen erweiterten Beschreibungsblock in den Prompt (Fallback)
- `generate-wan-video` → Param `image` (Wan 2.5 i2v-Variante)
- `generate-seedance-video` → Param `image`
- `generate-luma-video` → Param `keyframes.frame0`

**Neuer Helper:** `src/lib/motion-studio/modelReferenceMapping.ts`
```ts
export function mapReferenceToModelPayload(
  model: ClipSource,
  baseParams: Record<string, unknown>,
  referenceImageUrl?: string
): Record<string, unknown>
```
Zentrale Logik, welcher Param-Key pro Engine verwendet wird, plus Sora-Fallback.

**`ClipsTab.tsx`-Änderung** (Zeile ~274 + ~381):
```diff
const resolved = resolveMentions(s.aiPrompt || '', libCharacters, libLocations);
- await supabase.functions.invoke('generate-hailuo-video', { body: { prompt: resolved.prompt, ... }});
+ const enrichedBody = mapReferenceToModelPayload('ai-hailuo', { prompt: resolved.prompt, ... }, resolved.referenceImageUrl);
+ await supabase.functions.invoke('generate-hailuo-video', { body: enrichedBody });
```

**DB-Tracking:** Neue Spalte `composer_scenes.reference_image_url` (snapshot zum Zeitpunkt des Renders), damit Re-Renders deterministisch sind.

**Akzeptanzkriterium:** Wenn User „@Sarah" in 3 Szenen schreibt und Sarah ein Reference-Bild hat, sehen alle 3 generierten Clips dieselbe Person (Hailuo/Kling/Wan) bzw. den ausführlichen Beschreibungsblock (Sora).

---

## J-2 — Frame-to-Character / Frame-to-Location Capture (P0, USP gegenüber Artlist)

**Idee:** User kann nach einem erfolgreichen Render in der Vorschau auf einen beliebigen Frame klicken → „Als Charakter speichern" oder „Als Location speichern" → Frame wird zum Reference-Image.

**Komponenten:**
- Neuer Button in `ComposerSequencePreview.tsx`: `📸 Frame als Charakter speichern`
- Neue Komponente `FrameCaptureDialog.tsx` mit:
  - Canvas-Capture des aktuellen `<video>`-Frames (`canvas.drawImage(video, ...)`)
  - Crop-Werkzeug (react-image-crop, bereits in deps)
  - Felder „Name" + „Signature Items" + Tags
  - Direkt-Save in Library via `createCharacter()` + `uploadLibraryImage()`

**Edge Function:** `extract-video-frame` (neu)
- Input: video-URL + timestamp
- Output: PNG-Blob → Storage (`motion-studio-library/{user}/captures/...`)
- Nutzt ffmpeg.wasm (bereits über @ffmpeg/ffmpeg in deps) **clientseitig** → kein Server-Roundtrip nötig, keine neue Edge Function!

**Vorteil gegenüber Artlist:** Artlist erfordert externen Upload, wir extrahieren direkt aus eigenem Output → 1-Klick-Workflow.

---

## J-3 — Library Quick-Sidepanel im Composer (P1)

**Problem:** Aktuell muss User für „neuen Charakter anlegen" zur separaten Library-Page wechseln → Kontextverlust.

**Lösung:** Neuer Slide-Over in `StoryboardTab.tsx`:
- Button „🎭 Cast & Scout" rechts oben in der Storyboard-Toolbar
- `<Sheet side="right">` mit Tabs: Charaktere | Locations
- Inline-Erstellung mit `<CharacterEditor>` (existiert bereits — wiederverwenden)
- Drag-to-Scene: User zieht Charakter-Karte auf eine Szene → @-Mention wird automatisch in `aiPrompt` injiziert
- Live-Counter pro Szene: „@Sarah erscheint in 3/8 Szenen"

**Datei-neu:** `src/components/video-composer/CastScoutSidepanel.tsx`

---

## J-4 — Composer-Storyboard-Overview: Cast-Mapping (P1)

In `StoryboardTab.tsx` neue Mini-Visualisierung oberhalb der Szenen:

```
Cast-Konsistenz:
┌─────────────────────────────────────────────┐
│ @Sarah    [■][■][■][ ][■][ ][■][ ]  5/8 ✓  │
│ @Office   [■][■][ ][ ][ ][ ][ ][ ]  2/8 ⚠  │
│ @Coffee   [ ][ ][■][■][■][ ][ ][ ]  3/8 ✓  │
└─────────────────────────────────────────────┘
```
- Hilft dem User sofort zu erkennen, wo sein Hauptcharakter „verschwindet"
- Klick auf einen Block → springt zur jeweiligen Szene
- Warn-Icon, wenn ein Charakter erwähnt wird, aber kein Reference-Image hinterlegt ist

**Datei-neu:** `src/components/video-composer/CastConsistencyMap.tsx`

---

## J-5 — Multi-Model-Konsistenz-Übersetzungstabelle (P1)

In `MotionStudioTemplatePicker.tsx` (existiert) ein neuer Hinweis-Strip:

> ℹ️ **Modell-Eignung für Cast-Konsistenz**
> - Kling 3 Omni: ⭐⭐⭐⭐⭐ (echtes i2v)
> - Hailuo 2.3: ⭐⭐⭐⭐ (first_frame)
> - Wan 2.5: ⭐⭐⭐⭐ (i2v)
> - Luma Ray 2: ⭐⭐⭐ (keyframe-based)
> - Sora 2: ⭐⭐ (nur über Prompt-Beschreibung)

Neuer Helper: `src/lib/motion-studio/modelConsistencyRanking.ts` (single source).

---

## J-6 — Lokalisierung der Library-Komponenten (P2)

Folgende Dateien sind aktuell nur teilweise lokalisiert (DE-fokussiert):
- `LibraryUploadConsentDialog.tsx` (nur DE)
- `CharacterEditor.tsx` / `LocationEditor.tsx` (Mischung)
- `LibraryPicker.tsx`

→ Auf bestehendes inline-`tt()`-Pattern (wie in `MotionStudioTemplatePicker`) umstellen, EN+ES Strings ergänzen.

---

## Datenmodell-Änderungen (Migration)

```sql
-- J-1: Reference snapshot pro Szene für deterministische Re-Renders
ALTER TABLE composer_scenes
  ADD COLUMN reference_image_url TEXT,
  ADD COLUMN reference_image_source TEXT; -- 'character' | 'location' | 'frame_capture'

-- J-1: Tracking welche Library-Entities pro Szene aktiv sind (für J-4 Map)
CREATE TABLE composer_scene_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES composer_scenes(id) ON DELETE CASCADE,
  mention_kind TEXT NOT NULL CHECK (mention_kind IN ('character','location')),
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scene_id, mention_kind, entity_id)
);
ALTER TABLE composer_scene_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see their scene mentions" ON composer_scene_mentions
  FOR ALL USING (EXISTS (
    SELECT 1 FROM composer_scenes s
    JOIN composer_projects p ON p.id = s.project_id
    WHERE s.id = scene_id AND p.user_id = auth.uid()
  ));
```

Trigger oder client-seitiger Sync nach jedem `aiPrompt`-Update populiert `composer_scene_mentions` aus `findMentions()`.

---

## Edge Functions

**Modifizieren** (Reference-Image-Param hinzufügen):
- `supabase/functions/generate-hailuo-video/index.ts`
- `supabase/functions/generate-kling-video/index.ts`
- `supabase/functions/generate-wan-video/index.ts`
- `supabase/functions/generate-seedance-video/index.ts`
- `supabase/functions/generate-luma-video/index.ts`
- `supabase/functions/generate-sora-video/index.ts` (Sora: nur Prompt-Enrichment, kein Bild)

Jeweils: Optional-Field `referenceImageUrl` aus Body lesen, in passenden Replicate/OpenAI-Param mappen.

---

## Was wir Artlist voraushaben werden

| Feature | Artlist neu | Motion Studio nach Block J |
|---|---|---|
| Persistent Cast | ✅ | ✅ |
| Persistent Locations | ✅ | ✅ |
| Frame → Character extrahieren | ❌ | ✅ (J-2) |
| Multi-Engine-Reference (6 Modelle) | ❌ (1 Modell) | ✅ (J-1+J-5) |
| Cast-Coverage-Visualisierung | ❌ | ✅ (J-4) |
| @-Mention im Free-Text | ✅ | ✅ (existiert) |
| DSGVO/KUG-Hardgate-Consent | ❌ | ✅ (existiert) |
| Drag-to-Scene Cast | ❌ | ✅ (J-3) |

---

## Reihenfolge der Umsetzung

1. **J-1** (Reference-Pipeline) — größter Hebel, schaltet die Kernfunktion aktiv
2. **J-4** (Cast-Map) — sofortiger UX-Win, nutzt nur existierende Daten
3. **J-3** (Sidepanel) — Workflow-Beschleunigung
4. **J-2** (Frame-Capture) — USP gegenüber Artlist
5. **J-5** (Modell-Ranking) — kleines UI-Add
6. **J-6** (Lokalisierung) — Polish

---

## Dateien (Zusammenfassung)

**Neu:**
- `src/lib/motion-studio/modelReferenceMapping.ts`
- `src/lib/motion-studio/modelConsistencyRanking.ts`
- `src/components/video-composer/CastScoutSidepanel.tsx`
- `src/components/video-composer/CastConsistencyMap.tsx`
- `src/components/video-composer/FrameCaptureDialog.tsx`
- Migration: `composer_scenes.reference_image_url` + `composer_scene_mentions`

**Modifiziert:**
- `src/components/video-composer/ClipsTab.tsx` (Reference-URL an Edge-Functions weiterreichen)
- `src/components/video-composer/StoryboardTab.tsx` (Cast-Map + Sidepanel-Trigger)
- `src/components/video-composer/ComposerSequencePreview.tsx` (Frame-Capture-Button)
- 6 Edge-Functions (Reference-Image-Param-Mapping)
- `LibraryUploadConsentDialog.tsx`, `CharacterEditor.tsx`, `LocationEditor.tsx`, `LibraryPicker.tsx` (Lokalisierung)

---

**Frage vor dem Start:**
Soll ich **alle 6 Sub-Blöcke** in einem Rutsch umsetzen, oder lieber **J-1 + J-2 + J-4** (die 3 mit dem größten Hebel) zuerst und J-3/J-5/J-6 in einem zweiten Schritt?
