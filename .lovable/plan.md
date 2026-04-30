## Was ist passiert

Run `a86223af…` läuft seit ~12 min und ist aus Sicht der DB noch "running", obwohl die Edge Function laut Logs schon **bei 21:19:41 und 21:23:02 mit `shutdown` beendet wurde**.

Konkret:

- Flows 1–5 sind fertig (Composer ✓, DC ✗, Auto-Director ✓, Hedra skip, Universal ✓)
- Flow 6 (Long-Form Render) hat um 21:17:13 begonnen und pollt **bis zu 36 × 10 s = 360 s** auf `sora_long_form_projects.status`
- Supabase Edge Functions haben ein Wall-Clock-Limit (~150–400 s). Der Background-Task (`EdgeRuntime.waitUntil`) wird mittendrin gekillt
- Weil der Killing zwischen zwei Flows passiert, wird **weder `qa_deep_sweep_runs.status` noch `finished_at` gesetzt** → UI zeigt ewig "Läuft…"

Zusatzbefund Flow 2 (Director's Cut): Lambda crasht mit `MEDIA_ELEMENT_ERROR Code 4` auf der von uns als "known good" gewählten Datei `commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4`. Chromium auf Lambda mag dieses spezifische MP4 nicht (vermutlich CORS/Range-Issue über die Google-Storage-URL).

## Fix-Plan (4 Punkte)

### 1. Polling-Budget hart begrenzen (Flow 2 + Flow 6)
In `supabase/functions/qa-weekly-deep-sweep/index.ts` die Long-Poll-Loops von 360 s auf **max. 90 s** kürzen (9 × 10 s). Renders, die länger brauchen, werden als `timeout` markiert (kein Geld verbrannt, weil Lambda asynchron weiterläuft und der Webhook das Projekt eh aktualisiert). Damit bleibt die Gesamt-Funktionsdauer sicher unter dem Edge-Function-Limit.

### 2. Stale-Run-Watchdog im Frontend
`DeepSweepTab.tsx` soll einen Run, der älter als **8 min** ist und noch auf `running` steht, automatisch mit einem "Run als gescheitert markieren"-Button anzeigen. Der Klick ruft eine kleine neue Edge Function `qa-deep-sweep-finalize-stale` auf, die:
- den Run auf `status='timeout'` setzt
- `finished_at = now()` schreibt
- `notes = 'Edge function wall-clock exceeded — finalized by watchdog'`

So bleibt die UI nie hängen.

### 3. Asset für Flow 2 austauschen
`qa-live-sweep-bootstrap` und der Flow-2-Code verwenden statt der Google-Storage-URL eine **bereits in unserem Supabase Storage bootstrappte 2-s-MP4** (`qa-test-assets/test-video-2s.mp4`) und übergeben sie als **signed URL** (Public Read funktioniert nicht zuverlässig auf Remotion Lambda Chromium). Falls die Datei dort noch korrupt ist, einmalig mit einem getesteten H.264/AAC-Encode überschreiben (z. B. `https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4`, der ist bekannt Lambda-stabil).

### 4. Aktuellen hängenden Run aufräumen
Sofortmigration: `update qa_deep_sweep_runs set status='timeout', finished_at=now(), notes='manual cleanup — edge function killed at flow 6' where id='a86223af-003c-4087-98dc-7e8e6d0519e0';` damit die UI sofort wieder frei wird.

## Technische Details

**Geänderte Dateien:**
- `supabase/functions/qa-weekly-deep-sweep/index.ts` — Poll-Loop von 36 auf 9 Iterationen kürzen (Flow 2 + Flow 6); Lambda läuft async weiter, Webhook macht den Rest
- `supabase/functions/qa-live-sweep-bootstrap/index.ts` — Asset-URL auf bekannten H.264/AAC-MP4 umstellen
- `supabase/functions/qa-deep-sweep-finalize-stale/index.ts` (NEU, ~30 LOC) — Admin-only RPC zum manuellen Finalisieren
- `src/pages/admin/DeepSweepTab.tsx` — Watchdog-UI: wenn `status='running' && now()-started_at > 8min`, "Run abbrechen"-Button anzeigen
- Migration: einmaliges UPDATE für den aktuell hängenden Run

**Warum das sicher ist:**
- Der Lambda-Render läuft unabhängig von der Edge Function weiter — verkürztes Polling kostet kein Geld, markiert lediglich "wir haben nicht lange genug gewartet"
- Webhook (`remotion-webhook`) aktualisiert die Projekt-Tabellen weiterhin korrekt
- Watchdog ist read-after-write idempotent

**Erwartetes Verhalten nach Fix:**
- Deep Sweep beendet immer in < 4 min (statt potenziell ewig)
- Flow 2 wird grün (echtes Lambda-kompatibles MP4)
- Flow 6 wird entweder grün oder als `timeout` markiert — Run wird in jedem Fall finalisiert
