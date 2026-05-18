## Two-Shot Fix: Echo + 7s/10s Duplikat-Szene

### Was tatsächlich passiert

Es ist **eine** Szene, aber sie wird an zwei Stellen unterschiedlich angezeigt, weil **zwei verschiedene Video-URLs** existieren:

1. **`scene.clip_url`** = lipsynced Output von Sync.so (= **7s**, weil Sync.so die Output-Länge auf die Audio-Länge clamped, sobald `sync_mode = "cut_off"` greift bzw. die Per-Speaker-Tracks zu kurz sind)
2. **`scene.lip_sync_source_clip_url`** = original silent Hailuo-Clip (**10s**)

Beide URLs werden parallel geladen → in der App tauchen quasi „zwei Versionen" derselben Szene auf. Die 7s-Version hat das Echo (eingebettetes Video-Audio + externer Merged-VO-Track gleichzeitig). Die 10s-Version ist der stumme Original-Clip.

### Root Causes — drei zusammenhängende Bugs

**Bug 1 — Per-Speaker-Tracks sind zu kurz**
`compose-twoshot-audio` berechnet `totalSec = max(spokenSec, sceneDur)`. Wenn `scene.duration_seconds` zum Zeitpunkt des Aufrufs `null/0` ist (häufig — Hailuo-Render setzt es erst nach Webhook), wird `totalSec = 7s` statt `10s`. Die Per-Speaker-Padded-Tracks sind dann nur 7s lang → Sync.so produziert 7s Output. Die volle 10s-Szene fehlt.

**Bug 2 — Sync.so muxt Audio in den Output → Echo**
Beim Multi-Pass werden die einzelnen Per-Speaker-Tracks in den Output gemuxt. Der finale Clip enthält im embedded Audio die Stimme des letzten Passes. Im Preview-Player wird `el.muted` aus `mutedRef.current` abgeleitet, sobald `audioPlan.twoshot.useExternalAudio === true`. Sobald der User auf „Unmute" klickt, läuft Video-Audio + externer Merged-VO **gleichzeitig** → Echo + scheinbares „beide reden zur selben Zeit".

**Bug 3 — Source-Clip leakt in die Anzeige**
Sobald `lip_sync_source_clip_url` gesetzt ist, taucht der 10s-Original an einer zweiten Stelle auf (vermutlich Media-Library / Scene-Card-Preview). Die Logik prüft nicht, ob es ein nicht-finaler Lipsync-Source ist.

### Fix-Plan (3 Edits, 1 Edge-Function-Tweak)

**1. `supabase/functions/compose-twoshot-audio/index.ts`** — Scene-Duration robust auflösen

Vor `const sceneDur = …`: Wenn `scene.duration_seconds` ≤ 0, aus dem Source-Clip die tatsächliche Dauer ableiten — entweder über `lip_sync_source_clip_url || clip_url` per HEAD-Request auf Range-Probe-Bytes, oder vereinfachter Fallback: `Math.max(spokenSec, 10)` als Default für Two-Shot (Hailuo-Standard). Sauberer: `metadata.requested_duration` mitlesen, falls vorhanden, sonst auf `10` defaulten und Console-Warn loggen.

Damit sind alle Per-Speaker-Padded-Tracks garantiert ≥ Szenenlänge → Sync.so Output bleibt 10s.

**2. `src/components/video-composer/ComposerSequencePreview.tsx`** — Video bei `useExternalAudio` hart muten

An den 5 Stellen, die aktuell `el.muted = hasEmbeddedAudio ? false : mutedRef.current` setzen (Zeilen ~237, 295, 309, 347, 380), die Regel erweitern:

```ts
const twoshotExternal = target.audioPlan?.twoshot?.useExternalAudio === true;
el.muted = twoshotExternal
  ? true                                   // immer stumm — Audio kommt aus externem Merged-Track
  : (hasEmbeddedAudio ? false : mutedRef.current);
```

Helper `sceneShouldForceMute(s)` einführen, der dasselbe für die `play()`-Loops nutzt. Beseitigt das Echo unabhängig vom Mute-Toggle des Users.

**3. `src/components/video-composer/SceneCard.tsx` (oder wo die Mini-Preview den 10s-Source zeigt)** — Source-Clip nur fallback-rendern

Wenn `lip_sync_applied_at` gesetzt UND `clip_url` vorhanden → nur `clip_url` rendern, niemals `lip_sync_source_clip_url`. Letzteres ist ein interner Audit-Anker, kein User-facing Asset. Konkret: in der Mini-Player-Quelle nur `clip_url` verwenden, `lip_sync_source_clip_url` nur in einem optionalen „Rohaufnahme anzeigen"-Debug-Toggle.

**4. (Optional) `compose-twoshot-lipsync/index.ts`** — Defensive Validierung

Vor dem ersten Pass prüfen, ob `mergedVo.duration < sceneDuration - 0.5`. Falls ja, einmal `compose-twoshot-audio` mit `force_regenerate=true` neu aufrufen, damit garantiert die volle Szenenlänge gepaddet wird. Verhindert das Symptom auch bei Altdaten/Race-Conditions.

### Verifikation

1. Bestehende Two-Shot-Szene erneut lipsyncen.
2. DB: `composer_scenes.duration_seconds = 10` UND `scene_audio_clips.duration = 10` UND `clip_url`-Video ist 10s.
3. Preview: Nur ein Video sichtbar, 10s lang, beide Sprecher sequenziell synchron, **keine doppelte Stimme** auch nach „Unmute".
4. `lip_sync_source_clip_url` bleibt in der DB als Audit-Anker, taucht aber nirgends mehr im UI auf.

### Out-of-Scope

- `face_index`-Logik bleibt wie vorher (war Teil des vorherigen Fixes).
- Keine Änderung am finalen Render/Stitch-Pfad (`compose-clip-webhook`); dort wird die Merged-VO bereits korrekt gemuxt.
- Kein DB-Schema-Change.

OK so umsetzen?
