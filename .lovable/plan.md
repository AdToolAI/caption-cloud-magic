
# Option A — Solides Fundament zuerst

Drei aufeinanderfolgende Mini-Blöcke, jeweils klein und verifizierbar.

---

## 1️⃣ Smart-Reframe E2E-Test & Hardening

**Ziel:** Block R (Smart Reframe) verifizieren und gegen Edge-Cases absichern.

**Vorgehen:**
- **Edge-Function Test (`analyze-scene-subject`)**: Echtes Test-Projekt aus `composer_projects` ziehen, Funktion via `curl_edge_functions` aufrufen, geliefertes `subject_track` JSONB validieren (normalisierte x/y in [0,1], min. 3 Keypoints/Szene).
- **Logs-Audit**: `edge_function_logs` für `analyze-scene-subject` und `compose-video-assemble` checken — Token-Verbrauch (Gemini 2.5 Flash Vision), Fehlerraten, Fallback-Häufigkeit.
- **Hardening**: 
  - In `analyze-scene-subject`: Timeout pro Frame (10s), Retry-Limit (2), bei Total-Fail explizit `subject_track = null` setzen statt Funktion zu sprengen.
  - In `ComposedAdVideo.tsx`: Defensive Clamping `objectPosition` auf [0%, 100%] (vermeidet Crashes bei korrupten Tracking-Daten).
- **UI-Feedback**: In `ExportPresetPanel.tsx` Tooltip ergänzen: „Tracking-Daten älter als 7 Tage werden neu berechnet" + Re-Analyze-Button.

**Files:**
- `supabase/functions/analyze-scene-subject/index.ts` (Hardening)
- `src/remotion/templates/ComposedAdVideo.tsx` (Clamp)
- `src/components/video-composer/ExportPresetPanel.tsx` (Re-Analyze UI)

---

## 2️⃣ Voice-Cloning im Voiceover-Tab sichtbar machen

**Status quo:** Custom Voices werden bereits via `list-voices` geladen (siehe `accountVoices` in der Edge-Function), aber im Director's Cut `AIVoiceOver.tsx` gibt es **keinen UI-Eintrag für Voice-Cloning** — der User muss raten, wo er Voices klont. Der `VoiceCloneDialog` existiert nur isoliert.

**Vorgehen:**
- **Header-Button im `AIVoiceOver.tsx`**: Neben Sprach-Tabs ein „+ Eigene Stimme klonen"-Button, der `VoiceCloneDialog` öffnet.
- **Custom-Voices-Sektion**: Im Voice-Picker eine separate Tab/Gruppe „🎤 Meine Stimmen" zwischen Premium und Standard-Voices. Filter via `tier === 'cloned'` oder Marker aus `useCustomVoices`.
- **Tier-Badge**: Custom Voices bekommen ein gold-cyan „Cloned"-Badge (James-Bond-2028 Style), damit der User sie sofort erkennt.
- **Auto-Refresh**: Nach erfolgreichem `cloneVoice()` `list-voices` re-fetchen, damit die neue Stimme ohne Reload erscheint.
- **Motion Studio Konsistenz**: Im `VoicePicker.tsx` (Motion Studio) ebenfalls einen „+ Klonen"-Shortcut anbieten, falls keine aktiven Custom Voices.

**Files:**
- `src/components/directors-cut/features/AIVoiceOver.tsx` (Klon-Button + Custom-Sektion)
- `src/components/motion-studio/VoicePicker.tsx` (Klon-Shortcut)
- `supabase/functions/list-voices/index.ts` (Tier-Marker `cloned` für DB-eigene Voices via `custom_voices`-Lookup)

---

## 3️⃣ Block T — Trending Templates (Performance Loop)

**Ziel:** Top-performende Projekt-Strukturen analytisch erfassen und als „Click-to-Clone"-Templates anbieten.

**Datenmodell (Migration):**
```sql
CREATE TABLE composer_template_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id UUID REFERENCES composer_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,                 -- z. B. 'product-ad', 'tutorial', 'story'
  scene_count INT,
  total_duration_sec NUMERIC,
  performance_score NUMERIC,     -- weighted: views + completion + shares
  thumbnail_url TEXT,
  preview_video_url TEXT,
  structure_json JSONB,          -- abstrahierter Storyboard-Bauplan (ohne PII)
  is_public BOOLEAN DEFAULT true,
  use_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- RLS: SELECT für authenticated bei is_public=true; INSERT/UPDATE nur via service_role.
```

**Edge Function `aggregate-trending-templates` (cron, weekly):**
- Liest aus `ab_test_variants`, `template_performance_metrics`, `video_creations` die Top-25 Projekte der letzten 14 Tage.
- Anonymisiert das Storyboard (entfernt User-spezifische Texte/Logos/Brand-Kit-Refs).
- Berechnet `performance_score` (z. B. `views*0.3 + completion_rate*0.5 + shares*0.2`).
- Upsertet in `composer_template_suggestions`.

**UI-Integration:**
- Neuer Tab „🔥 Trending" in `MotionStudioTemplatePicker.tsx`.
- Karten zeigen Score, Kategorie, Vorschau-Video; Klick → ruft `auto-director-compose` mit der vorgegebenen Struktur auf und überspringt das Briefing.
- Inkrementiert `use_count` per RPC.

**Files:**
- `supabase/migrations/<timestamp>_composer_template_suggestions.sql`
- `supabase/functions/aggregate-trending-templates/index.ts` (neu)
- `src/components/video-composer/MotionStudioTemplatePicker.tsx` (Trending-Tab)
- `src/hooks/useTrendingTemplates.ts` (neu)
- `supabase/config.toml` (cron-Eintrag, falls über pg_cron statt extern)

**Cron:** Empfehlung — wöchentlich Sonntag 03:00 UTC via Supabase pg_cron oder manuell triggerbar via Admin-Button.

---

## Reihenfolge & Abnahme

1. **Smart-Reframe E2E** zuerst (kleinster Scope, baut Vertrauen in bestehenden Code).
2. **Voice-Cloning UI** (rein frontend, sofort sichtbarer User-Wert).
3. **Trending Templates** (größter Block, neue Tabelle + Cron + UI).

Pro Block: Migration → Edge Function → Frontend → Test mit `curl_edge_functions` und (für Reframe) Log-Check.

**Nicht enthalten:** Block U (Realtime Collab) — folgt nach Option A in einem separaten Schritt.
