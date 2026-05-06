## Root cause

Deine Mediathek (`video_creations`) bekommt seit dem 02.05. keine neuen Einträge mehr — **nicht weil Auto-Cleanup falsch löscht**, sondern weil deine neueren Renders gar nicht erst gespeichert werden.

Was die DB zeigt:
- Letzter `ai_video_generations`-Eintrag: 02.05.2026 (Solo-Generator HappyHorse)
- Seit 03.05. nur noch **Composer-Projekte** (`composer_projects` / `composer_scenes`): 5 Projekte, alle mit ready Clips
- Wallet wurde brav belastet (24 Transaktionen seit 03.05.), aber `generation_id` zeigt auf `composer_projects`-IDs, nicht auf `ai_video_generations`
- Auto-Save-Trigger `auto_save_ai_video_to_library_trg` hängt aber **ausschließlich an `ai_video_generations`** — Composer-Clips lösen ihn nie aus

→ Ergebnis: Du nutzt seit 4 Tagen primär den Motion Studio / Composer, dessen fertige Clips & Stitches **nie in die Mediathek wandern**. Auto-Cleanup ist unschuldig.

## Plan

### 1. Composer-Clips automatisch in die Mediathek speichern
In `supabase/functions/compose-video-clips/index.ts` an der Stelle, wo eine Szene nach Webhook/Polling auf `clip_status='ready'` gesetzt wird (auch in `replicate-webhook` und in `compose-video-assemble`), zusätzlich einen `video_creations`-Insert ausführen:

```ts
await supabaseAdmin.from('video_creations').insert({
  user_id, output_url: clip_url, status: 'completed', credits_used: 0,
  metadata: { source: 'motion-studio-clip', composer_scene_id, composer_project_id, model: clipSource }
});
```
Idempotent über `metadata @> {composer_scene_id}` Check (analog zum bestehenden `ai_generation_id`-Pattern).

### 2. Composer-Stitch (final montiertes Video) speichern
In `compose-video-assemble` nach erfolgreichem Render des finalen Stitches denselben Insert mit `source: 'motion-studio-stitch'` und `composer_project_id` ausführen.

### 3. Backfill der letzten 4 Tage
SQL-Migration, die für alle `composer_scenes` mit `clip_status='ready'` und `clip_url IS NOT NULL` der letzten 14 Tage einen `video_creations`-Eintrag nachzieht — sofern nicht bereits vorhanden. Damit sind deine fehlenden Videos vom 03.–06.05. sofort wieder da.

### 4. Trigger erweitern (Verteidigung in Tiefe)
`auto_save_ai_video_to_library_trg` triggert nur auf `ai_video_generations`. Zusätzlich einen Trigger auf `composer_scenes AFTER UPDATE OF clip_status` legen, der bei Übergang `→ ready` ebenfalls in `video_creations` inserted. Damit ist auch jeder zukünftige neue Composer-Pfad automatisch abgedeckt.

### 5. Sanity-Check Cleanup-Limits
`enforce_user_video_library_limits(_user_id, 500, 10240)` lassen wie es ist — der greift erst ab 500 Videos / 10 GB und du bist mit ~25 Items weit drunter. Keine Änderung nötig.

### 6. Verifikation
Nach Migration:
- `SELECT count(*) FROM video_creations WHERE user_id='8948…' AND created_at > '2026-05-03'` → sollte den Backfill-Count zeigen
- Dashboard-Carousel neu laden, deine Renders der letzten Tage müssen erscheinen

## Was NICHT geändert wird
- Auto-Cleanup-Funktion bleibt unangetastet
- Bestehende `ai_video_generations` → `video_creations` Trigger bleibt
- Solo-Generatoren (HappyHorse, Hailuo, Kling…) brauchen keine Änderung — die schreiben bereits korrekt
