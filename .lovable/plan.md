# Motion Studio Superuser — fokussierter Test-Bot

**Ziel:** Ein dedizierter Superuser, der **ausschließlich die Motion Studio / Video Composer Pipeline** end-to-end testet. Kein Generalist, keine Caption/Bio/Trend-Tests — nur das, was darüber entscheidet, ob Motion Studio Artlist/Runway-Niveau hält.

**Status quo (verifiziert):** Im aktuellen `ai-superuser-test-runner` sind **0 von 38 Szenarien** Motion-Studio-spezifisch. Composer, Auto-Director, Brand Kit, Smart Reframe, Talking Head, Trending Templates und alle Export-Pfade sind ungetestet.

---

## Architektur

**Eigene Edge Function** `motion-studio-superuser` — getrennt vom Generalisten, damit:
- Tests in einer einzigen Pipeline laufen (Briefing → Storyboard → Scenes → Render → Export)
- Cleanup deterministisch ist (jedes Test-Projekt bekommt Marker `is_test_run: true`)
- Wir gezielt scheduled (täglich) ohne den großen Superuser zu blocken

**Test-Account:** Wiederverwendung des existierenden `ai-superuser@adtool-internal.test` (über `get_ai_superuser_id()`).

---

## Die 18 Szenarien

### Phase 1 — Pipeline Setup (Smoke)
1. **Project Create** — `INSERT` in `composer_projects` mit Test-Briefing (16:9, "Product Ad" Kategorie)
2. **Briefing Validation** — Schema-Check: alle Pflichtfelder vorhanden, sinnvolle Defaults
3. **Auto-Director Compose** — `auto-director-compose` aufrufen, Storyboard mit ≥3 Szenen erwartet, Latenz <60s

### Phase 2 — Asset-Generation (kostenintensiv → "slow"-Kategorie)
4. **Scene Image Generation** — `generate-composer-image-scene` für 1 Test-Szene, Bild-URL + storage path validieren
5. **Stock Media Browser Reachability** — Storage-Bucket + API-Health
6. **Music Library Browser Reachability** — Audio-Bucket Read-Test
7. **Talking Head (Hedra)** — `generate-talking-head` mit kurzem Test-Skript (3s); validiert Hedra-Reachability ohne kompletten Render
8. **Trending Templates Fetch** — `composer_template_suggestions` SELECT, mind. 1 Eintrag wenn `is_active=true`

### Phase 3 — Brand & Reframe
9. **Brand Kit Apply** — `analyze-brand-consistency` auf Test-Szene; erwartet Score 0-100
10. **Brand Voice Analysis** — `analyze-brand-voice`; erwartet `tone_keywords[]`
11. **Smart Reframe (analyze-scene-subject)** — auf existierenden Test-Clip; validiert `subject_track` JSONB (x/y in [0,1], min 3 Keypoints)
12. **Reframe Fallback Hardening** — Mit korrupter Video-URL aufrufen, erwartet `subject_track: null` statt 500er

### Phase 4 — Render & Export
13. **Render Lambda Bundle Verification** — Bundle-Version-Check (verhindert "stale bundle" Renders)
14. **Render Composer (3s Test-Render)** — `render-with-remotion` mit minimalem 1-Szenen-Projekt, FramesPerLambda=270, max 1 Worker; validiert Output-URL erreichbar + Credit-Refund bei Failure
15. **Multi-Format Export Pipeline** — `composer-export-bundle` für 9:16 + 1:1 parallel; validiert beide Outputs
16. **NLE Export FCPXML** — `composer-export-fcpxml`, valides XML zurück
17. **NLE Export EDL** — `composer-export-edl`, valider EDL-String

### Phase 5 — Integrity & Cleanup
18. **Orphan Scene Cleanup Check** — Query nach `composer_scenes` ohne `composer_projects` Parent (sollte 0 sein); meldet Drift im Datenmodell

---

## Datenmodell (Migration)

```sql
-- Erweiterung von ai_superuser_runs für Motion-Studio-spezifische Metriken
ALTER TABLE public.ai_superuser_runs
  ADD COLUMN IF NOT EXISTS module text,           -- 'motion-studio' | 'general'
  ADD COLUMN IF NOT EXISTS render_url text,       -- bei E2E-Render
  ADD COLUMN IF NOT EXISTS frames_rendered int,
  ADD COLUMN IF NOT EXISTS credits_consumed numeric,
  ADD COLUMN IF NOT EXISTS credits_refunded numeric;

CREATE INDEX IF NOT EXISTS idx_ai_superuser_runs_module 
  ON public.ai_superuser_runs(module, created_at DESC);

-- Marker-Spalte auf composer_projects, damit Test-Projekte bei Cleanup erkennbar sind
ALTER TABLE public.composer_projects
  ADD COLUMN IF NOT EXISTS is_test_run boolean DEFAULT false;
```

**Cleanup-Strategie:** Am Ende jedes Runs: `DELETE FROM composer_projects WHERE is_test_run = true AND created_at < now() - interval '1 hour'`. Cascading Deletes räumen `composer_scenes`, Render-Outputs etc. mit auf.

---

## Edge Functions

### Neu: `supabase/functions/motion-studio-superuser/index.ts`
- Eigene Scenario-Liste (siehe oben)
- Wiederverwendet die Setup-Helper (`getOrCreateTestUser`, `seedTestData`) aus `ai-superuser-test-runner`
- Eigener Insert in `ai_superuser_runs` mit `module = 'motion-studio'`
- Kategorien: `fast` (1-3, 8-12, 16-18) und `slow` (4-7, 13-15) für selektive Runs

### Optional/Folge: Cron
- `pg_cron` täglich 04:30 UTC für `?mode=fast`
- `pg_cron` wöchentlich Sonntag 05:00 UTC für `?mode=slow` (E2E-Render kostet Lambda-Zeit)

---

## Frontend

### `src/pages/admin/AISuperuserAdmin.tsx` — neuer Tab "Motion Studio"
- **Coverage-Badge:** "18/18 Szenarien" + Pass-Rate als animierter Ring (James-Bond-Stil)
- **Pipeline-Visualisierung:** Horizontaler Flow `Briefing → Auto-Director → Scenes → Brand → Reframe → Render → Export` mit grünen/roten Punkten je nach letztem Run
- **Render-Output-Preview:** Bei erfolgreichem E2E-Render (Szenario 14) inline `<video>`-Player mit der Test-Output-URL
- **Trend-Sparkline:** Pass-Rate der letzten 14 Tage pro Szenario
- **Buttons:** "Run Fast (≈90s)" und "Run Full E2E (≈8min, kostet ~10 Credits)"

### Filterung im bestehenden Tab
- ACTIVE_SCENARIOS-Whitelist um Motion-Studio-Szenarien erweitern (für Detail-Ansicht historischer Runs)

---

## Was NICHT enthalten ist (bewusst out-of-scope)

- Realtime Collaboration (Block U) — separater Sprint
- Karaoke-Subtitles / B-Roll Auto-Match — UX-Features, kein Stabilitätsthema
- Voice Cloning Coverage — bereits durch ElevenLabs-Quota-Test im Generalisten gedeckt
- Director's Cut Studio (separates Modul, eigener Test-Bot wäre Folge-Sprint)

---

## Files Created/Modified

**Neu:**
- `supabase/functions/motion-studio-superuser/index.ts` (~600 LoC, basiert auf bestehendem Runner)
- `supabase/migrations/<ts>_motion_studio_superuser.sql` (3 ALTER TABLEs + 1 Index)
- `src/components/admin/MotionStudioSuperuserPanel.tsx` (Pipeline-Visualisierung)

**Modified:**
- `src/pages/admin/AISuperuserAdmin.tsx` (neuer Tab "Motion Studio", Whitelist erweitert)
- `supabase/config.toml` (Function-Block: `verify_jwt = false`, `import_map`, Timeout 300s für E2E-Render)

---

## Abnahmekriterien

1. ✅ `motion-studio-superuser?mode=fast` läuft <90s, alle 13 Fast-Szenarien grün
2. ✅ `motion-studio-superuser?mode=full` läuft <10min, produziert echtes 3s-Test-Video, Credits werden bei Erfolg verrechnet & bei Failure idempotent refunded
3. ✅ Admin-Tab zeigt Pipeline-Visualisierung mit Live-Status
4. ✅ Cleanup entfernt 100% der Test-Projekte (Query: `SELECT count(*) FROM composer_projects WHERE is_test_run = true` → 0 nach 1h)
5. ✅ Bei rotem Szenario zeigt das UI den exakten Edge-Function-Log-Auszug für schnelles Debugging

**Reihenfolge:** Migration → Edge Function (mit allen 18 Szenarien) → Test via `curl_edge_functions` → Admin-UI → Cron-Setup (optional, manuell triggerbar bleibt Standard).