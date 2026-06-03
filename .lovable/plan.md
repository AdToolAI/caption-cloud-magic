## Was wirklich passiert (aus Logs + DB)

Szene `1b877978-…` (engine=`cinematic-sync`, 3 Sprecher) loopt seit Minuten, weil `compose-dialog-scene` immer wieder gestartet wird, aber **nie bis `render-dialog-turn` kommt**. Belege:

- `composer_scenes`: `clip_url = null`, `clip_status = 'pending'`, `clip_source = 'ai-hailuo'`, `lip_sync_status = null`, `dialog_shots = null`, `updated_at = 00:14:52` (immer noch frisch).
- `compose-dialog-scene` Logs zeigen 2 parallele Invocations innerhalb von 1 s ("faceMap rebuilt … identities=samuel-dusatko,kailee,kailee" — also nur 2 distinkte IDs für 3 Sprecher). Der "positional-fallback recovered **1** missing face coords"-Warn erscheint zweimal — heißt: identity-mapping ist ambiguous (zwei "kailee" für zwei verschiedene Sprecher).
- `render-dialog-turn`: **0 Logs jemals** — der Per-Turn-Render läuft also nie an.
- `extract-video-last-frame`: schlägt mit **`REPLICATE_API_TOKEN missing`** fehl (separate Sekundärursache; nicht der Loop-Trigger, aber Continuity-Frame ist tot).

### Drei zusammenwirkende Bugs

**Bug 1 — Duplicate auto-trigger:** `compose-clip-webhook` wird bei jedem Replicate-Webhook-Retry erneut zugestellt und feuert `compose-dialog-scene` jedes Mal neu via `EdgeRuntime.waitUntil` (zwei Invocations < 1 s belegen das). Die Idempotency-Guard in `compose-dialog-scene` greift nicht, weil `dialog_shots` nach jedem Fehlschlag wieder `null` ist → kein "existing"-Resume möglich → Vollneubau bei jedem Trigger.

**Bug 2 — Identity-Map kollabiert auf 3 Sprecher:** Gemini-Vision-Anchor liefert für 3 Personen `identities=samuel-dusatko, kailee, kailee` (zwei "kailee" — dieselbe Identity auf zwei Gesichter). Die positional-fallback rettet nur 1 von 3 fehlenden coords, weil der Map-Key per `character_id.toLowerCase()` deduppt → 2. Auftritt von kailee überschreibt 1. → fehlende coord bleibt. Folge: missing_face_coords 422, keine Shots persistiert.

**Bug 3 — Loop verschleiert weil State nicht persistiert wird:** Wenn compose-dialog-scene 422 returnt, wird `dialog_shots` NICHT auf `{status: 'failed'}` gesetzt (nur `no_turns`-Pfad tut das). Damit sieht der nächste Webhook-Retry "nichts da" und feuert wieder. → Endlosschleife.

**Bug 4 (Nebenbefund):** `REPLICATE_API_TOKEN` Secret fehlt für `extract-video-last-frame`. Frame-Continuity zur nächsten Szene fällt komplett aus. Kein Loop-Trigger, aber sollte gesetzt werden.

---

## Plan

### Step 1 — `compose-dialog-scene`: positional fallback nach `speaker_idx` (nicht character_id)

In `supabase/functions/compose-dialog-scene/index.ts` im positional-fallback-Block (~Zeile 870):

- `appearanceOrder` per `speaker_idx` aufbauen (unique, in script-Reihenfolge), nicht per `character_id`. So überleben zwei Sprecher mit derselben Identity nebeneinander.
- `positional` Map als `Map<number /*speaker_idx*/, [x,y]>` führen.
- Im Recovery-Loop per `s.speaker_idx` nachschlagen.
- Dasselbe für `target_bbox` (paralleler Block analog).

Dadurch werden bei "3 Gesichter im Anchor, 3 distinkte `speaker_idx`" immer alle 3 coords gemappt — auch wenn 2 davon dieselbe `character_id` haben.

### Step 2 — `compose-dialog-scene`: bei jedem 4xx **persistieren**, damit Idempotency greift

Vor jedem `return json({error: ...}, 4xx)` in der Setup-Phase einen Eintrag schreiben:

```ts
await supabase.from('composer_scenes').update({
  dialog_shots: { version: 5, status: 'failed', error: '<code>', shots: [], updated_at: ... },
  lip_sync_status: 'failed',
  twoshot_stage: 'failed',
  clip_error: '<code>',
}).eq('id', sceneId);
```

Anschließend greift die existierende Idempotency-Guard (`existing.status === 'failed'` → keine Resume, aber auch kein Replay aus dem Webhook, weil `compose-clip-webhook` bei `lip_sync_status='failed'` nicht erneut auto-triggern darf — siehe Step 3).

### Step 3 — `compose-clip-webhook`: auto-lipsync-Replay verhindern

Im Block, der `compose-dialog-scene` auto-triggert (~Zeile 318), zusätzlich prüfen:

```ts
const alreadyFailed = String(preUpdateScene?.lip_sync_status ?? '') === 'failed';
const alreadyDone = !!preUpdateScene?.lip_sync_applied_at;
if (alreadyFailed || alreadyDone) {
  console.log('[compose-clip-webhook] skip auto-lipsync — already', { alreadyFailed, alreadyDone });
} else {
  // existing dispatch
}
```

Damit stoppt ein Replicate-Webhook-Retry den Loop.

### Step 4 — Dedup-Lock in `compose-dialog-scene` gegen parallele Invocations

Am Start, direkt nach Scene-Load und vor faceMap-Rebuild:

```ts
// Atomic claim: only one invocation per scene at a time
const claim = await supabase.from('composer_scenes')
  .update({ twoshot_stage: 'composing_dialog', updated_at: new Date().toISOString() })
  .eq('id', sceneId)
  .neq('twoshot_stage', 'composing_dialog')
  .select('id').maybeSingle();
if (!claim.data) {
  return json({ ok: true, status: 'already_composing', scene_id: sceneId }, 202);
}
```

Bei jedem Erfolgs/Fehler-Exit `twoshot_stage` wieder auf den finalen Wert setzen (`'shots_ready'` / `'failed'` etc.).

### Step 5 — Secret setzen: `REPLICATE_API_TOKEN`

`extract-video-last-frame` wirft `REPLICATE_API_TOKEN missing`. Es gibt im Projekt bereits `REPLICATE_API_KEY` (von Picture/Video Studios). Zwei Varianten:

- (a) `REPLICATE_API_TOKEN` zusätzlich als Secret setzen (Wert = `REPLICATE_API_KEY`), oder
- (b) Code-Patch: `Deno.env.get('REPLICATE_API_TOKEN') ?? Deno.env.get('REPLICATE_API_KEY')`.

Ich gehe mit **(b)**, weil das ohne Secret-UI-Interaktion sofort wirkt und dem Pattern anderer Functions im Projekt entspricht.

### Step 6 — Akut-Cleanup der hängenden Szene

Einmaliges SQL (Migration), das die festsitzende Szene zurücksetzt, damit der User sie neu starten kann:

```sql
UPDATE composer_scenes
SET clip_status = 'pending', clip_url = NULL, lip_sync_status = NULL,
    twoshot_stage = NULL, dialog_shots = NULL, clip_error = NULL,
    updated_at = now()
WHERE id = '1b877978-29da-4a20-9fb4-813042a60f9c';
```

### Step 7 — Memory aktualisieren

`mem/features/video-composer/dialog-shot-pipeline` um Abschnitt "v22 — speaker_idx positional fallback + failure persistence + claim lock" ergänzen.

---

## Geänderte Dateien

- `supabase/functions/compose-dialog-scene/index.ts` (Steps 1, 2, 4)
- `supabase/functions/compose-clip-webhook/index.ts` (Step 3)
- `supabase/functions/extract-video-last-frame/index.ts` (Step 5b)
- Migration: SQL aus Step 6
- `mem/features/video-composer/dialog-shot-pipeline` (Step 7)

Keine Schema-Änderung, keine UI-Änderung.

## Out of scope

- Verbesserung der Gemini-Vision Identity-Disambiguation (das ist die Wurzel-Ursache für "kailee, kailee"). Workaround per `speaker_idx` reicht für den Loop-Stop.
- Sync.so-spezifische Änderungen (v21 face-crop bleibt unangetastet).
