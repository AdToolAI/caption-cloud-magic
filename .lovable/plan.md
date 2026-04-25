# Block K — Structured Prompt Composer

**Ziel:** Den freien Prompt-Textbereich um einen optionalen **strukturierten Slot-Builder** erweitern, der Artlists "Prompt Toolkit" überholt — ohne den Power-User zu nerven (Free-Text bleibt bestehen, Slots sind ein zusätzlicher Modus).

## Was schon da ist (NICHT neu bauen)
- `DirectorPresetPicker` → Camera, Lens, Lighting, Mood, Film-Stock ✅
- `PromptMentionEditor` + `resolveMentions` → Cast/Setting via @-Tags ✅
- `applyDirectorModifiers` → deterministisches Prompt-Merging ✅
- Final-Prompt-Vorschau in `SceneCard.tsx` Zeile 295–315 ✅

## Was fehlt (Block K liefert)

### K-1 — Structured Slot Builder
Neue Komponente `src/components/motion-studio/StructuredPromptBuilder.tsx`:
- 6 freie Text-Slots (jeweils mit Icon, Label, Beispiel-Placeholder):
  1. **Subject** ("Eine junge Barista mit roten Haaren")
  2. **Action** ("gießt langsam Milch in Latte-Art-Muster")
  3. **Setting** ("rustikales Café im Berliner Altbau")
  4. **Time / Weather** ("kurz vor Sonnenuntergang, weiches goldenes Licht")
  5. **Style / Aesthetic** ("Wes Anderson, symmetrisch, pastellfarben")
  6. **Negative** ("keine Menschen im Hintergrund, kein Text")
- Toggle "📝 Free Text ↔ 🧱 Structured" oben in der Prompt-Sektion
- Jeder Slot hat einen kleinen ✨-Button → KI-Vorschlag (1 Aufruf zu `lovable-ai-chat` mit dem Szenen-Kontext, gibt 3 Vorschläge zurück → Dropdown)
- Beim Toggle: Free→Struct = einmalige KI-Zerlegung des bestehenden Prompts (`extract-prompt-slots` Edge Function), Struct→Free = deterministisches Stitching ohne KI

### K-2 — Auto-Translate & Cinematic Enrichment
Neue Edge Function `supabase/functions/structured-prompt-compose/index.ts`:
- Input: `{ slots, language, targetModel }` (targetModel = ai-sora | ai-kling | ai-hailuo | ai-wan | ai-seedance | ai-luma)
- Verarbeitung: 
  - Slots werden auf **Englisch** übersetzt (Pflicht laut Memory `multilingual-content-strategy`)
  - Modell-spezifische Komposition (Sora liebt Kommas + Adjektivketten, Kling/Hailuo bevorzugen Sätze, Wan liebt Stichworte)
- Output: `{ prompt: string, tokenCount: number, warnings: string[] }`
- Nutzt **Lovable AI Gateway** mit `google/gemini-2.5-flash-lite` (schnell, billig — kein API-Key nötig)
- 60s Timeout in `supabase/config.toml`

### K-3 — Live Token Counter & Modell-Limits
Neue Utility `src/lib/motion-studio/promptTokenLimits.ts`:
```ts
export const MODEL_PROMPT_LIMITS = {
  'ai-sora':     { soft: 400,  hard: 800,  unit: 'words' },
  'ai-kling':    { soft: 500,  hard: 2000, unit: 'chars' },
  'ai-hailuo':   { soft: 800,  hard: 1500, unit: 'chars' },
  'ai-wan':      { soft: 300,  hard: 600,  unit: 'words' },
  'ai-seedance': { soft: 400,  hard: 800,  unit: 'words' },
  'ai-luma':     { soft: 500,  hard: 1200, unit: 'chars' },
};
```
- Live-Anzeige unter dem Prompt-Feld: grün ≤ soft, orange < hard, rot ≥ hard
- Smart-Truncation-Vorschlag: Button "Auto-kürzen" ruft `structured-prompt-compose` mit `mode: 'condense'` auf

### K-4 — Style Presets (Save & Reuse)
Neue Tabelle `motion_studio_style_presets`:
```sql
CREATE TABLE motion_studio_style_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  slots JSONB NOT NULL,          -- {subject?, action?, setting?, ...}
  director_modifiers JSONB,      -- DirectorModifiers shape
  preview_thumb_url TEXT,
  usage_count INT DEFAULT 0,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- RLS: user_id = auth.uid() OR is_public = true (read), only owner write
```
- Neue UI-Komponente `StylePresetPicker.tsx` mit Tabs: "Meine Presets" / "Community" / "Genres" (vordefiniert: Cinematic Drama, Vlog, Commercial, Horror, Anime, Documentary)
- Save-Button im StructuredPromptBuilder: "💾 Als Style speichern"
- Apply-Button: lädt Slots + DirectorModifiers in einer Aktion

### K-5 — Inspire Me / Random
Kleiner Würfel-Button im Header des Builders:
- Würfelt 1 Style-Preset + variiert Subject/Action via Lovable AI (1 Call)
- Pure UX-Booster, kein Backend-State

### K-6 — Multi-Engine Prompt Preview
Im Final-Prompt-Vorschau-Block (SceneCard.tsx Zeile 295+) einen Tab-Switch:
- "Sora 2" | "Kling 3" | "Hailuo 2.3" | "Wan 2.5" | "Seedance" | "Luma"
- Zeigt den **gleichen** Slot-Inhalt aber via `structured-prompt-compose` modell-spezifisch komponiert
- Hilft Power-Usern den Prompt vor dem Engine-Wechsel zu validieren

## Integration in bestehende Komponenten
- `SceneCard.tsx` (Zeile 270): `PromptMentionEditor` bleibt, daneben Toggle-Button "🧱 Structured Mode" → tauscht Editor gegen `StructuredPromptBuilder`
- Neue Felder in `ComposerScene` (`src/types/video-composer.ts`):
  ```ts
  promptSlots?: { subject?: string; action?: string; setting?: string; timeWeather?: string; style?: string; negative?: string };
  promptMode?: 'free' | 'structured';
  appliedStylePresetId?: string;
  ```
- DB: `composer_scenes` bekommt `prompt_slots JSONB`, `prompt_mode TEXT`, `applied_style_preset_id UUID`

## Lokalisierung (DE/EN/ES)
- Neue UI-Strings via inline `tt()` Pattern (konsistent mit Block I/J)
- Slot-Labels & Beispiele in allen 3 Sprachen
- KI-Output IMMER auf Englisch (Memory: visual prompts müssen EN bleiben)

## Wo wir Artlist schlagen
| Feature | Artlist Studio | Wir nach Block K |
|---|---|---|
| Slot-Builder | ✅ 4 Slots, fix | ✅ 6 Slots + Negative |
| Auto-EN-Translate | ❌ | ✅ |
| Multi-Engine Preview | ❌ (nur 1 Modell) | ✅ alle 6 Modelle |
| Style-Presets speichern | ❌ | ✅ + Community |
| Token-Counter pro Modell | ❌ | ✅ live |
| KI-Slot-Vorschläge | ❌ | ✅ pro Slot |

## Dateien (geschätzter Aufwand)
**Neu (6):**
- `src/components/motion-studio/StructuredPromptBuilder.tsx`
- `src/components/motion-studio/StylePresetPicker.tsx`
- `src/lib/motion-studio/promptTokenLimits.ts`
- `src/lib/motion-studio/structuredPromptStitcher.ts` (lokales Free↔Struct ohne KI)
- `supabase/functions/structured-prompt-compose/index.ts`
- `supabase/migrations/<timestamp>_motion_studio_style_presets.sql` (+ `composer_scenes` Spalten)

**Modifiziert (4):**
- `src/components/video-composer/SceneCard.tsx` (Toggle + Multi-Engine Preview)
- `src/types/video-composer.ts` (3 neue Felder)
- `supabase/config.toml` (neuer Function-Block, 60s Timeout)
- `src/components/motion-studio/PromptMentionEditor.tsx` (kleiner Hook für Slot-Auto-Fill)

## Reihenfolge der Umsetzung
1. **K-1 + K-3 + lokale Stitcher** (rein clientseitig, sofort sichtbar)
2. **K-2** Edge Function (Auto-Translate + Modell-Komposition)
3. **K-4** DB-Migration + StylePresetPicker
4. **K-5 + K-6** UX-Politur

Soll ich loslegen, oder vorher noch was am Plan schärfen (z.B. Slot-Anzahl reduzieren, Style-Presets weglassen)?
