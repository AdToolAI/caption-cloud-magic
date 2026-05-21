## Symptom

- **Char 1:** Lipsync „okay, aber nicht produktionsreif" — leichter, konstanter Drift.
- **Char 2:** Mund öffnet sich **später** als seine Stimme im fertigen Video zu hören ist.

Final-Audio im Preview/Export ist immer `audio_plan.twoshot.url` (merged WAV). Visuell wird zweistufig per Sync.so passe gerendert.

## Ursache

Wir senden Sync.so pro Pass den **per-character-padded WAV** (`speakers[i].track_url`) — also einen eigenen Track in voller Szenenlänge mit Stille drumherum. Dieser Track ist **sample-identisch** mit dem merged track an der jeweiligen Sprecher-Position, aber:

1. **Re-Encode-Drift:** Jeder per-character WAV wird separat hochgeladen, Sync.so dekodiert + re-encodet pro Pass. Bei `sync_mode=cut_off` + `temperature=0.5/0.65` reicht ein kleiner Onset-Versatz der internen VAD von Sync.so (typisch 80–250 ms), damit Pass 2 sichtbar gegenüber dem späteren merged-Audio-Onset hinterherläuft. Pass 1 hat denselben Drift, fällt aber weniger auf weil dort der Onset bei t≈0 liegt.
2. **Doppelte Zeitachse:** Sync.so animiert basierend auf dem Onset im **per-character-Track**, aber gehört wird der **merged-Track**. Ein paar Frames Drift summieren sich, weil zwischen Track-Onset und merged-Audio-Onset zwei unterschiedliche WAV-Quellen liegen, die unabhängig durch ffmpeg/Sync.so laufen.
3. **`segments_secs` mit `temperature=0.65`** erhöht die VAD-Toleranz für Pass 2 zusätzlich → Char-2-Mund öffnet später.

## Lösung: Single-Source-of-Truth Audio (merged WAV in BEIDEN Passes)

Statt zwei verschiedener per-character WAVs schicken wir auf **beiden** Sync.so-Passes **denselben merged WAV** (`audio_plan.twoshot.url`) und scoping erfolgt ausschließlich über `segments_secs` auf den voiced-Bereich des jeweiligen Sprechers. Damit:

- Sync.so sieht in beiden Passes **dasselbe Audio-Sample-Array**, das auch der User hört.
- `segments_secs[i] = [speaker_i.startSec, speaker_i.endSec]` (ohne 0.25 s Padding — Padding verschiebt den VAD-Onset und ist der Hauptverdächtige für das Char-2-Late-Symptom).
- Pass 2 läuft auf dem bereits-pass-1-gerenderten Video; Char 1 bleibt korrekt animiert (außerhalb von Pass-2-Window), Char 2 bekommt den Mund exakt im Audio-Fenster.
- Re-Encode-Drift entfällt, weil das Audio bit-identisch zum Preview/Export ist.

### Konkrete Code-Änderungen

**`compose-twoshot-lipsync/index.ts`** (`twoshot_pass_1` Branch, ~Zeile 1200):

```ts
const sourceAudioUrl = mergedVo.url; // statt firstSpeaker.track_url
const pass1Segment: [number, number] | null = vr1
  ? [Math.max(0, vr1.startSec), Math.min(sceneDurSec, vr1.endSec)]
  : null;
jobId = await startSyncSoDirectGeneration(SYNC_API_KEY!, {
  videoUrl: sourceClipUrl,
  audioUrl: sourceAudioUrl,
  syncMode: "cut_off",
  temperature: 0.5,           // einheitlich, kein Bonus-Temp mehr für windowed
  targetCoords: firstTarget.coords,
  frameNumber: 0,
  segmentSecs: pass1Segment,
}, "twoshot_pass_1");
```

**`poll-twoshot-lipsync/index.ts`** (Pass-2-Spawn, ~Zeile 476):

```ts
const sourceAudioUrl = (plan as any)?.twoshot?.url ?? nextSpeaker.track_url;
const nextSegment: [number, number] | null = vrNext
  ? [Math.max(0, vrNext.startSec), Math.min(sceneDurSec, vrNext.endSec)]
  : null;
const nextJobId = await startSyncJob(syncApiKey, {
  videoUrl: polled.outputUrl,
  audioUrl: sourceAudioUrl,
  targetCoords: target.coords,
  segmentSecs: nextSegment,
  temperature: 0.5,
});
```

**Padding entfernt** (0.25 s pre-/post-pad rausnehmen). Der voiced-Range aus `compose-twoshot-audio` ist bereits sample-genau am tatsächlichen TTS-Onset → kein zusätzliches Padding mehr nötig. Das eliminiert die ~250 ms Visual-Vorlauf, die der Mund vor Char-2-Voice „wartet".

**Fallback unverändert:** Wenn Sync.so `segments_secs` ablehnt, retry ohne window (bestehende Logik in `startSyncJob`).

**Per-character `track_url` bleibt** in `audio_plan.twoshot.speakers[].track_url` als Debug-/Recovery-Asset, wird aber von Sync.so nicht mehr konsumiert.

### Szene reparieren

Szene `e3df41ad-…`:
- `clip_url` → ursprünglicher Quellclip (`lip_sync_source_clip_url`)
- `lip_sync_status = pending`, `twoshot_stage = null`, `replicate_prediction_id = null`
- 144 Credits refund für den falsch synchronisierten Render
- Identity-Match-Cache (`audio_plan.twoshot.faceMap`) **behalten** — der ist nach dem letzten Fix korrekt; nur das Audio-Routing war daneben.

## Memory-Update

`mem://architecture/lipsync/sync-so-pro-model-policy`:
- Two-Pass nutzt jetzt **merged WAV in beiden Passes** + `segments_secs` per Sprecher.
- Per-speaker padded tracks sind nur noch Debug-Artefakt, nicht Sync.so-Input.
- Kein Pre-/Post-Pad mehr auf `segments_secs` — sample-exakter voiced-Range.

## Erwartetes Ergebnis

- Char-1-Lipsync bleibt mind. gleich gut, vermutlich besser (kein Re-Encode-Drift mehr).
- Char-2-Mund öffnet exakt mit der hörbaren Stimme, weil Audio = Preview-Audio.
- Falls danach noch Mikro-Drift sichtbar ist, wäre der nächste Hebel `sync_mode: "loop"` statt `cut_off`, das aber erst nach Validierung dieses Fixes.

## Dateien

- `supabase/functions/compose-twoshot-lipsync/index.ts`
- `supabase/functions/poll-twoshot-lipsync/index.ts`
- DB-Migration: Szene-Reset + Credit-Refund
- `mem://architecture/lipsync/sync-so-pro-model-policy`
