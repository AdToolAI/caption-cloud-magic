## Diagnose: 7 Fehler, 0 € verbrannt — alles Payload-Bugs

Der erste Run hat **bewiesen, dass die Safety funktioniert** (kein Cent ausgegeben), aber alle 7 Flows scheiterten an falschen Request-Schemas. Hier die echten Root Causes:

| # | Flow | Fehler | Root Cause |
|---|------|--------|------------|
| 1 | Composer Stitch | `Missing clip URLs: false,false,false` | Hailuo/Seedance/Kling sind **async via Webhook** — Response enthält `generationId`, nicht `video_url`. Wir warten nicht aufs Webhook. |
| 2 | DC Lambda Render | `Missing source_video_url` | Wir senden `clips: [...]`, die Function erwartet aber `source_video_url` (snake_case, single URL). |
| 3 | Auto-Director | `idea must be at least 5 characters` | Wir senden `brief`/`category`/`target_duration`, Schema will `idea`, `mood`, `targetDurationSec`, `stage`. |
| 4 | Talking Head | `Invalid version or not permitted` | Hedra braucht ein Replicate-**Model-Version-Hash**, nicht den Slug `hedra/character-3`. Bug im Provider-Code. |
| 5 | Universal Video | `userId is required` | Wir senden `category`/`topic`, Schema will `briefing` + explizit `userId` im Body. |
| 6 | Long-Form Render | `Project not found` | Function erwartet `projectId` einer existierenden DB-Row, nicht `script` direkt. Braucht Vorab-Setup. |
| 7 | Magic Edit | `400 Bad Request` von Replicate FLUX Fill | Wir senden ein JPG als Mask — FLUX Fill Pro will eine echte Schwarz/Weiß-Maske als PNG. |

## Fix-Plan

### A. Orchestrator-Payloads korrigieren (`qa-weekly-deep-sweep/index.ts`)

**Flow 1 — Composer Stitch:**
- Nach `generate-hailuo/seedance/kling` die `generationId` aus Response lesen
- Polling-Helper `pollAiVideoGeneration(generationId, 180s)` → wartet auf `ai_video_generations.status='completed'` und liest `result_url`/`output_url`
- Erst danach `compose-stitch-and-handoff` aufrufen mit den 3 fertigen URLs

**Flow 2 — DC Lambda Render:**
Payload umbauen auf das echte Schema:
```text
{
  source_video_url: stitchedVideoUrl,
  duration_seconds: 16,
  effects: { filter: 'cinematic' },
  subtitle_track: { visible: true, clips: [{ start_time:0, end_time:5, text:'QA test' }] },
  export_settings: { quality:'hd', format:'mp4' }
}
```

**Flow 3 — Auto-Director:**
```text
{
  stage: 'plan',
  idea: 'A 15-second cinematic spot for a coffee subscription with morning vibes',
  mood: 'warm',
  targetDurationSec: 15,
  language: 'en'
}
```
(Nur `stage:'plan'` testen — `execute` würde 3 weitere Renders triggern, sprengt Budget. Plan-Stage validiert die ganze AI-Tool-Calling-Pipeline.)

**Flow 4 — Talking Head:**
- Bug-Fix in `generate-talking-head/index.ts`: `version: HEDRA_MODEL` → korrekt gemäß Replicate-API entweder `model: 'hedra/character-3'` (für `models.predictions.create`) oder ein echter Version-Hash. Wir nutzen `replicate.models.predictions.create({ model: 'hedra/character-3', ... })` statt `predictions.create({ version: ... })`.

**Flow 5 — Universal Video:**
```text
{
  briefing: { category:'product-ad', topic:'Bond QA validation', visualStyle:'cinematic', durationSeconds:15 },
  userId: <triggered_by user.id>,
  language: 'en'
}
```

**Flow 6 — Long-Form Render:**
Vor dem Render-Call eine **Test-Project-Row** in `sora_long_form_projects` + 1 fertige Scene in `sora_long_form_scenes` anlegen (mit `status='completed'` und `generated_video_url = ctx.assets.video`). Dann `projectId` an Render-Function senden. Cleanup nach dem Run.

**Flow 7 — Magic Edit:**
- Eine echte 1024x1024 PNG-Maske ins `qa-test-assets`-Bucket bootstrappen (zentrales weißes Quadrat auf schwarz)
- `qa-live-sweep-bootstrap` erweitern: zusätzlich `sample-mask-1024.png` hochladen (clientseitig via Canvas → Base64 generieren, kein externer Download nötig)
- Im Sweep: `maskUrl` zeigt auf diese echte Maske

### B. Hedra Provider Bug (`generate-talking-head/index.ts`)
Echter Bug der **alle Talking-Head-Calls in Production** betrifft, nicht nur QA. Replicate-API:
```text
- predictions.create({ version: '<hash>' })  ← braucht explizite Version
- models.predictions.create({ model: 'hedra/character-3' })  ← lockt auf "latest"
```
Aktueller Code nutzt `version: HEDRA_MODEL` mit Slug → Replicate lehnt ab. Fix: auf `models.predictions.create` umstellen.

### C. Bootstrap-Function erweitern (`qa-live-sweep-bootstrap/index.ts`)
- Neuer Asset: `sample-mask-1024.png` — programmatisch via Canvas API in Deno generieren (zentrales weißes 512x512-Quadrat auf 1024x1024 schwarz)
- Idempotent wie die anderen Assets

### D. Test ohne Re-Deploy-Risiko
Nach den Fixes:
1. Bootstrap erneut aufrufen (lädt nur den neuen Mask-Asset hoch, Rest no-op)
2. Deep Sweep manuell triggern
3. Erwartung: 6/7 grün, ~12 € Verbrauch. Flow 6 (Long-Form) eventuell flaky wegen Lambda-Cold-Start — Timeout dann auf 360s erhöhen falls nötig.

## Was sich NICHT ändert
- Cap (50 €), Lock (6h), Mock-Bypass-Header, UI, DB-Schema bleiben wie sie sind.
- Live Sweep (täglich, mocked) wird nicht angefasst.

## Lieferung
1. `supabase/functions/qa-weekly-deep-sweep/index.ts` — alle 7 Payloads + Polling-Helper
2. `supabase/functions/generate-talking-head/index.ts` — Hedra-Aufruf-Fix
3. `supabase/functions/qa-live-sweep-bootstrap/index.ts` — Mask-Asset
4. Memory-Update in `mem://features/qa-agent/deep-sweep`

Bestätige mit "mach", dann baue ich's. Bei "Hedra-Fix erstmal weg" lasse ich Flow 4 als known-failure und liefere die anderen 6.
