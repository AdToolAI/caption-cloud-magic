## Hebel 8: Multi-Scene Render-Pipeline mit Auto-Stitch & Director's Cut Hand-Off

Ziel: Aus dem Video Composer wird ein echtes Production-Tool. Ein einziger Klick auf **"Render All & Stitch"** generiert alle Szenen parallel mit sichtbarem Live-Progress pro Szene, stitched sie automatisch zu einem fertigen Video und übergibt es nahtlos an den Director's Cut zur Feinbearbeitung.

### Was der User bekommt

1. **Neuer "Render Pipeline"-Modus im Clips-Tab**
   - Großer CTA-Button "Render All & Stitch" (zusätzlich zum bestehenden "Generate All")
   - Zeigt Gesamt-Fortschritt: `3 / 7 Szenen fertig · ETA 2:14`
   - Pro Szene eine kompakte Live-Karte mit:
     - Status-Badge (Queued / Generating / Ready / Failed)
     - Progress-Bar (0–100 %)
     - Engine-Hinweis (Kling / Veo / Stock / Upload)
     - Retry-Button bei Fehler ohne Abbruch der gesamten Pipeline

2. **Parallel-Queue mit kontrolliertem Concurrency**
   - Max. 3 Szenen gleichzeitig in Generierung (verhindert Provider-Throttling)
   - Failed Scenes blockieren den Rest **nicht** mehr → Pipeline läuft weiter, User kann am Ende einzeln retryen
   - Realtime-Updates über bestehenden Postgres Realtime-Channel auf `motion_studio_projects`

3. **Auto-Stitch nach Render**
   - Sobald alle erfolgreichen Scenes `ready` sind, startet automatisch der Stitch-Schritt (oder optional per Bestätigungs-Toast: "7 Clips bereit — jetzt stitchen?")
   - Stitching nutzt die bestehende Assembly-Pipeline (`render-with-remotion` / Composer-Sequence)
   - Bei teilweisen Fehlern: User wählt "Mit fertigen Clips stitchen" oder "Erst fehlende neu generieren"

4. **Direkt-Übergabe an Director's Cut**
   - Nach erfolgreichem Stitch: Modal "🎬 Video bereit — wo weiter?"
     - **"In Director's Cut öffnen"** (primär) → navigiert zu `/video-editor?source=composer&projectId=…` mit vorab geladener Video-URL
     - "In Mediathek speichern"
     - "Direkt herunterladen"
   - Im Director's Cut wird das Video als neues Workspace-Projekt initialisiert, Original-Szenen-Marker bleiben optional als Cut-Hints erhalten

### Technische Umsetzung

**Frontend**
- Neue Komponente `src/components/video-composer/RenderPipelinePanel.tsx`
  - State-Machine: `idle → queueing → generating → stitching → ready | partial_failed`
  - Nutzt `useRenderQueue` und neuen Hook `useScenePipelineProgress(projectId)` mit Supabase Realtime
- Erweiterung `ClipsTab.tsx`: Pipeline-Panel oberhalb der Szenenliste, der bestehende "Generate All"-Button bleibt als Power-User-Option
- Neuer Hook `src/hooks/useMultiSceneRender.ts`: orchestriert Concurrency (p-limit Pattern, max 3), Retry-Logik, Stitch-Trigger
- `AssemblyTab.tsx`: bekommt `autoTriggered`-Flag, damit Auto-Stitch ohne erneutes Klicken läuft

**Backend / Edge Functions**
- Neue Edge Function `compose-stitch-and-handoff`:
  - Input: `projectId`, `targetDestination: 'directors_cut' | 'library' | 'download'`
  - Wartet bis alle Scenes `ready` sind (oder akzeptiert `allowPartial`)
  - Ruft intern `render-with-remotion` mit der Composer-Sequence auf
  - Schreibt fertige Render-URL in neue Tabelle `composer_pipeline_runs` und triggert Director's-Cut-Initialisierung
- `compose-video-clips`: leichte Erweiterung — schreibt pro Scene `progress_percent` (0/25/50/100) während Generierung in `motion_studio_scenes`, damit Realtime-Updates präzise sind

**Datenbank-Migration** (1 neue Tabelle, 1 neue Spalte)
```sql
-- Track end-to-end pipeline runs for resumability + analytics
CREATE TABLE public.composer_pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES motion_studio_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued|generating|stitching|ready|failed|partial
  total_scenes int NOT NULL,
  completed_scenes int NOT NULL DEFAULT 0,
  failed_scenes int NOT NULL DEFAULT 0,
  stitched_video_url text,
  director_cut_project_id uuid,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.composer_pipeline_runs ENABLE ROW LEVEL SECURITY;
-- RLS: user can only see/manage their own runs
ALTER PUBLICATION supabase_realtime ADD TABLE public.composer_pipeline_runs;

-- Add per-scene progress for live UI
ALTER TABLE public.motion_studio_scenes
  ADD COLUMN IF NOT EXISTS progress_percent int DEFAULT 0;
```

**Director's Cut Hand-Off**
- Nutzt bestehende Studio-State-Sync-Architektur (siehe Memory `studio-state-and-export-synchronization`)
- Beim Öffnen mit `?source=composer&projectId=…` lädt der Director's Cut die `stitched_video_url` aus `composer_pipeline_runs` und legt ein neues Studio-Projekt an mit:
  - `source_video_url` = stitched URL
  - Optional: Szenen-Splits als Cut-Marker auf der Timeline (basierend auf Composer-Scene-Durations)

### Out-of-Scope (bewusst nicht in dieser Iteration)
- Kein vollständiger Pause/Resume kompletter Pipeline-Runs (nur Retry pro Scene)
- Keine Multi-User-Realtime-Collab innerhalb einer Pipeline
- Kein Export in mehrere Formate parallel (nutzt bestehenden `render-multi-format` separat)

### Aufwand & Reihenfolge
1. Migration + neue Tabelle (~30 min)
2. `useMultiSceneRender` Hook + `RenderPipelinePanel` UI (~6 h)
3. Edge Function `compose-stitch-and-handoff` (~4 h)
4. Director's Cut Auto-Init mit `?source=composer` (~3 h)
5. Live-Progress Realtime-Wiring + Polish (~2 h)
6. Memory-Update unter `mem://features/video-composer/multi-scene-render-pipeline.md`

Geschätzt **~1.5–2 Tage** wie vom User skizziert.