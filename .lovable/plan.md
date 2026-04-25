## Vision

**Motion Studio Pro** = Artlist Studio Feature-Parität + drei klare Wettbewerbsvorteile:
1. **Preistransparenz** (Echtzeit-Credit-Anzeige pro Aktion, nicht-verfallende Credits)
2. **Direkte Modell-Wahl** (User wählt Kling/Hailuo/Wan/Luma/Sora pro Szene)
3. **Tiefere Storytelling-Pipeline** (Storyboard-AI + Voiceover + Subtitles bereits vorhanden — Artlist hat das nicht so integriert)

Du hast bereits **80%** der Infrastruktur. Dieser Plan baut die fehlenden 20% in 6 klar abgegrenzten Phasen — jede einzeln deploybar und nutzbar.

---

## Phase 1 — Globale Character Library (Woche 1)

### Ziel
Charaktere einmal definieren → in **allen** Motion-Studio-Projekten wiederverwenden, mit Reference-Image für visuelle Konsistenz (Nano-Banana-Pattern).

### Technische Umsetzung

**Neue DB-Tabelle:** `motion_studio_characters`
```sql
CREATE TABLE motion_studio_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,           -- "tall man, late 30s, auburn hair..."
  signature_items text,                 -- "crimson tunic, golden lion crest..."
  reference_image_url text,             -- hochgeladenes Bild im Storage
  reference_image_seed text,            -- für Gemini Nano Banana
  voice_id text,                        -- ElevenLabs Voice-ID (optional)
  tags text[] DEFAULT '{}',             -- "hero", "villain", "narrator"
  usage_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: nur Owner
ALTER TABLE motion_studio_characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own characters" ON motion_studio_characters
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Neuer Storage-Bucket:** `motion-studio-library` (private, RLS: `user_id` als erste Pfad-Komponente)

**Neue Komponenten:**
- `src/pages/MotionStudio/CharacterLibrary.tsx` — Bento-Grid aller Charaktere im James-Bond-2028-Stil
- `src/components/motion-studio/CharacterEditor.tsx` — Erstellen/Bearbeiten mit Image-Upload + Nano-Banana-Vorschau-Generierung
- `src/components/motion-studio/CharacterPicker.tsx` — Modal zum Einfügen in Projekt (ersetzt das aktuelle inline `CharacterManager`)

**Migration des bestehenden Codes:** Die aktuelle projekt-lokale `briefing.characters` bleibt für Backward-Compatibility, neue UI nutzt globale Library + speichert eine Snapshot-Kopie ins Projekt.

---

## Phase 2 — Location Library (Woche 1, parallel zu Phase 1)

### Ziel
Schauplätze (z. B. „Mein Wohnzimmer", „Tokyo Skyline bei Nacht") einmal definieren mit Reference-Frames → in jeder Szene per @-Tag einsetzen.

### Technische Umsetzung

**Neue DB-Tabelle:** `motion_studio_locations`
```sql
CREATE TABLE motion_studio_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,                   -- "Mein Wohnzimmer"
  description text NOT NULL,            -- "modern living room, large window, Scandinavian furniture, warm afternoon light"
  reference_image_url text,             -- Foto/AI-generiertes Reference-Bild
  lighting_notes text,                  -- "golden hour, side-lit"
  tags text[] DEFAULT '{}',             -- "interior", "outdoor", "studio"
  usage_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE motion_studio_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own locations" ON motion_studio_locations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Neue Komponenten:**
- `src/pages/MotionStudio/LocationLibrary.tsx` — Bento-Grid aller Locations
- `src/components/motion-studio/LocationEditor.tsx` — Foto-Upload **oder** AI-Generierung via Gemini 3 Pro Image
- `src/components/motion-studio/LocationPicker.tsx` — analog zu CharacterPicker

---

## Phase 3 — Frame-to-Shot Continuity Engine (Woche 2)

### Ziel
Visuelle Kontinuität zwischen Szenen: Letzter Frame von Szene N wird automatisch als `input_reference` für Szene N+1 vorgeschlagen — exakt das, was Artlist als Killer-Feature verkauft.

### Technische Umsetzung

**Neue Edge Function:** `supabase/functions/extract-video-last-frame/index.ts`
- Input: `{ video_url, scene_id }`
- Nutzt FFmpeg (Replicate `lucataco/ffmpeg-utility` oder eigenes Lambda):
  ```
  ffmpeg -sseof -0.1 -i video.mp4 -vframes 1 -q:v 2 last.jpg
  ```
- Speichert Frame in `motion-studio-library/{user_id}/last-frames/{scene_id}.jpg`
- Updated `composer_scenes.last_frame_url`

**Neue DB-Spalte:**
```sql
ALTER TABLE composer_scenes 
  ADD COLUMN last_frame_url text,
  ADD COLUMN continuity_source_scene_id uuid REFERENCES composer_scenes(id);
```

**UI-Erweiterung in `SceneCard.tsx`:**
- Nach erfolgreicher Generierung: Auto-Extract des letzten Frames
- Neuer Button auf Folge-Szene: **„🔗 Beginne wo letzter Shot endete"**
- Setzt `reference_image_url` der nächsten Szene auf `last_frame_url` der vorherigen

**Pipeline-Integration:** Bei `compose-video-clips` wird `input_reference` (Hailuo/Kling/Wan i2v) priorisiert auf `continuity_source` gesetzt.

---

## Phase 4 — Director Presets (Camera, Lens, Lighting, Mood) (Woche 2, parallel zu Phase 3)

### Ziel
Curated Prompt-Modifier-Library — User klickt „RED Komodo + Cooke S4 50mm + Golden Hour" und der Prompt wird automatisch erweitert. Kein Modell-Training, reines Prompt-Engineering on top deines bestehenden `optimize-video-prompt`.

### Technische Umsetzung

**Neue Datei:** `src/lib/motion-studio/directorPresets.ts`
```ts
export const CAMERA_PRESETS = {
  'red-komodo':     { label: 'RED Komodo 6K',        modifier: 'shot on RED Komodo 6K, cinematic color science' },
  'arri-alexa':     { label: 'ARRI Alexa Mini LF',   modifier: 'shot on ARRI Alexa Mini LF, organic film texture' },
  'sony-venice':    { label: 'Sony Venice 2',        modifier: 'shot on Sony Venice 2, deep blacks, film-like skin tones' },
  'iphone-15-pro':  { label: 'iPhone 15 Pro (vlog)', modifier: 'shot on iPhone 15 Pro, handheld vlog style, natural color' },
  'super-8':        { label: 'Super 8 Film',         modifier: '8mm film grain, vintage aesthetic, warm color cast' },
};

export const LENS_PRESETS = {
  'cooke-s4-50':    { label: 'Cooke S4 50mm',        modifier: 'Cooke S4 50mm, classic look, soft bokeh' },
  'leica-summilux': { label: 'Leica Summilux 35mm',  modifier: 'Leica Summilux 35mm f/1.4, dreamy fall-off' },
  'anamorphic-2x':  { label: 'Anamorphic 2x',        modifier: 'anamorphic lens flares, 2.39:1 aspect ratio framing' },
  'wide-14mm':      { label: 'Ultra-Wide 14mm',      modifier: 'ultra-wide 14mm, dynamic perspective distortion' },
  'macro-100mm':    { label: 'Macro 100mm',          modifier: 'macro 100mm, extreme shallow depth of field' },
};

export const LIGHTING_PRESETS = {
  'golden-hour':    { label: 'Golden Hour',          modifier: 'golden hour lighting, warm rim light, long shadows' },
  'blue-hour':      { label: 'Blue Hour',            modifier: 'blue hour, cool ambient light, neon accents' },
  'rembrandt':      { label: 'Rembrandt Studio',     modifier: 'Rembrandt lighting, single key light, dramatic shadow triangle' },
  'noir':           { label: 'Film Noir',            modifier: 'high contrast film noir, hard side light, deep shadows' },
  'overcast-soft':  { label: 'Overcast Soft',        modifier: 'soft overcast diffused light, even skin tones' },
};

export const SHOT_TYPE_PRESETS = {
  'extreme-cu':     { label: 'Extreme Close-Up',     modifier: 'extreme close-up, eyes filling frame' },
  'medium-shot':    { label: 'Medium Shot',          modifier: 'medium shot, waist-up framing' },
  'wide-establishing': { label: 'Wide Establishing', modifier: 'wide establishing shot, full environment visible' },
  'dutch-angle':    { label: 'Dutch Angle',          modifier: 'dutch angle, tilted horizon, unease' },
  'tracking-shot':  { label: 'Tracking Shot',        modifier: 'smooth tracking shot, dolly movement' },
  'crane-down':     { label: 'Crane Down',           modifier: 'crane shot descending, revealing scale' },
};
```

**Neue Komponente:** `src/components/motion-studio/DirectorControlsPanel.tsx`
- 4 Dropdown-Reihen (Camera / Lens / Lighting / Shot Type) im SceneCard-Editor
- Auto-Append der Modifier ans Ende des Szenen-Prompts (vor `optimize-video-prompt`-Aufruf)
- Visueller Preset-Stack-Indicator („3 Director Tags aktiv")

**Erweiterung von `optimize-video-prompt`:** Wenn `director_modifiers: string[]` mitgegeben → werden ungekürzt durchgereicht (nicht von der KI „optimiert"/entfernt).

---

## Phase 5 — @-Tag Mention Editor (Woche 3)

### Ziel
Notion-/Slack-Style Prompt-Editor — User tippt `@`, sieht Picker mit allen Charakteren + Locations, und beim Submit werden die Tags automatisch aufgelöst zu vollständigen Beschreibungen + Reference-Image-URLs.

### Technische Umsetzung

**Library:** `react-mentions` (5kb gzip, perfekt für unseren Use-Case) — alternativ TipTap mit Mention-Extension wenn wir später Rich-Text wollen.

**Neue Komponente:** `src/components/motion-studio/PromptMentionInput.tsx`
```tsx
import { MentionsInput, Mention } from 'react-mentions';

<MentionsInput value={prompt} onChange={...}>
  <Mention 
    trigger="@"
    data={[
      ...characters.map(c => ({ id: `char:${c.id}`, display: c.name })),
      ...locations.map(l => ({ id: `loc:${l.id}`, display: l.name })),
    ]}
    markup="@[__display__](__id__)"
  />
</MentionsInput>
```

**Neue Utility:** `src/lib/motion-studio/resolveMentions.ts`
```ts
export function resolveMentions(prompt: string, characters: Character[], locations: Location[]): {
  resolvedPrompt: string;
  referenceImageUrls: string[];
} {
  // Ersetzt @[Name](char:abc-123) → "{character.description}, wearing {character.signatureItems}"
  // Sammelt alle reference_image_urls für input_reference
}
```

**Backend-Integration:** `compose-video-clips` ruft `resolveMentions` vor Modell-Call auf, sendet aufgelösten Prompt + ggf. erstes Reference-Image (Modell-spezifisch, da nicht alle multi-image i2v unterstützen).

---

## Phase 6 — Motion Studio Hub UI (Woche 3-4)

### Ziel
Zentrales Dashboard `/motion-studio` im James-Bond-2028-Stil als „Eingangshalle" — von dort zu Library, Projekten, Templates.

### Technische Umsetzung

**Neue Route:** `/motion-studio` (alt `/video-composer` bleibt als Editor erhalten, wird zu `/motion-studio/project/:id`)

**Neue Komponenten:**
- `src/pages/MotionStudio/Hub.tsx` — Bento-Grid:
  - **Recent Projects** (max 6, mit Thumbnails)
  - **Character Library** Card („12 Charaktere → verwalten")
  - **Location Library** Card („8 Locations → verwalten")
  - **Templates** Card („Product Ad, Storytelling, Corporate")
  - **Cost Dashboard** Card (transparente Anzeige: „Du hast diesen Monat €4.20 für AI-Clips ausgegeben — Artlist Pro hätte €89")
- `src/components/motion-studio/ProjectCard.tsx` — Glassmorphism mit Gold-Akzenten, Hover-Reveal der Stats
- `src/components/motion-studio/CostComparisonWidget.tsx` — Transparenz-Selling-Point

**Sidebar-Update:** „Motion Studio" wird primärer Hub, „Video Composer" als Sub-Item entfernt.

---

## Datenbank-Migrationen (Übersicht)

1. `motion_studio_characters` Tabelle + RLS
2. `motion_studio_locations` Tabelle + RLS
3. `motion_studio_templates` Tabelle + RLS (für Phase 6 Templates)
4. `composer_scenes` ergänzen: `last_frame_url`, `continuity_source_scene_id`, `director_modifiers jsonb`, `mentioned_character_ids uuid[]`, `mentioned_location_ids uuid[]`
5. Neuer Storage-Bucket `motion-studio-library` mit RLS-Policy (`user_id` first segment)

---

## Neue/erweiterte Edge Functions

| Function | Zweck | Komplexität |
|---|---|---|
| `extract-video-last-frame` | FFmpeg-Frame-Extraktion via Replicate | Neu, einfach |
| `generate-location-reference` | Gemini 3 Pro Image für Location-Reference | Neu, einfach |
| `optimize-video-prompt` | Director-Modifier-Passthrough | Erweiterung |
| `compose-video-clips` | Mention-Resolver + Reference-Image-Injection | Erweiterung |
| `compose-video-storyboard` | Awareness für Library-Charaktere/Locations | Erweiterung |

---

## Rechtliche Absicherung (eingebaut)

1. **AGB-Erweiterung:** „Bei Upload eigener Personen-Fotos für Character Library bestätigt User Bildrechte." — Toast bei erstem Upload + Checkbox.
2. **Watermark-Option:** AI-generierte Charakter-Reference-Images werden als „AI-generated" tagged in Metadaten (C2PA-kompatibel falls Lambda das Plugin unterstützt).
3. **Keine Marken-Imitation:** Wir nennen es **„Motion Studio Pro"**, nicht „Studio". Eigenes Branding, eigene Icons.
4. **Kein 1:1-Copy von Artlist-Marketing-Texten** — alle Strings werden eigenständig in DE/EN/ES verfasst.

---

## Wettbewerbs-Differenzierung (in der UI sichtbar)

In der Cost Dashboard Card des Motion Studio Hub:

| Aspekt | Artlist Studio | Motion Studio Pro |
|---|---|---|
| Preis pro 5s Kling-Clip | ~3.500 Credits (~€10) | **30 Credits (~€0.30)** |
| Credit-Verfall | Monatlich | **Nie verfällt** |
| Modell-Auswahl | Versteckt | **6 Modelle direkt wählbar** |
| Plan-Pflicht | $89.99/mo Pro | **Pay-as-you-go möglich** |

→ Wird **prominent** im Hub angezeigt als Live-Vergleichs-Widget mit den letzten Renders des Users.

---

## Realistischer Zeitplan

| Phase | Dauer | Liefert |
|---|---|---|
| 1 | 4 Tage | Character Library mit Reference-Image-Upload + Picker im Editor |
| 2 | 3 Tage | Location Library mit AI-Generierung |
| 3 | 5 Tage | Frame-to-Shot Continuity (Edge Function + UI) |
| 4 | 3 Tage | Director Presets Panel mit Auto-Prompt-Injection |
| 5 | 4 Tage | @-Tag Mention Editor mit Backend-Resolver |
| 6 | 5 Tage | Motion Studio Hub im James-Bond-2028-Stil |

**Total: ~24 Arbeitstage = 5 Wochen** für eine vollwertige Artlist-Studio-Konkurrenz.

---

## Verifikation pro Phase

Jede Phase wird einzeln getestet:
- **Phase 1:** Charakter erstellen → in 2 verschiedenen Projekten verwenden → Reference-Image landet bei Replicate als `input_reference`
- **Phase 2:** Location erstellen mit AI-Generierung → in Storyboard verwenden
- **Phase 3:** 3 Szenen rendern → 2./3. Szene startet visuell wo vorherige endete
- **Phase 4:** „RED Komodo + Cooke 50mm + Golden Hour" stacken → Prompt enthält alle 3 Modifier
- **Phase 5:** `Ein Mann namens @[Richard](char:richard-1) steht in @[Tokyo](loc:tokyo-1)` → wird zu vollem Prompt mit beiden Reference-Images
- **Phase 6:** Hub-Seite zeigt Cost-Vergleich und alle Library-Counts korrekt an

---

## Empfehlung: Schrittweise Umsetzung

Damit du nach **jeder** Phase echten User-Value siehst und ggf. Feedback einbauen kannst, würde ich vorschlagen, dass ich nach Genehmigung dieses Master-Plans **mit Phase 1 (Character Library)** anfange — das ist der größte sofortige Differentiator und Voraussetzung für Phase 5. Dann gehen wir Phase für Phase weiter, jeweils mit kurzem Status-Update.

**Bei Genehmigung:** Ich starte direkt mit DB-Migration + Storage-Bucket + Character Library UI für Phase 1.