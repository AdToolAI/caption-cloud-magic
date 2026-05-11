## Diagnose

Die Voice-Zuordnung in der DB ist korrekt:
- `matthew-dusatko` → Hume "Dungeon Master" (männlich)
- `sarah-dusatko` → Hume "Female Meditation Guide" (weiblich)

`compose-twoshot-audio` mappt die Sprecher auch sauber – im fertigen MP3 spricht erst Matthew (männlich), dann Sarah (weiblich), in dieser Reihenfolge.

Der Tausch entsteht eine Stufe später: `compose-twoshot-lipsync` schickt das gemerged-MP3 + Video an `sync/lipsync-2` und überlässt der Auto-Active-Speaker-Erkennung die Auswahl, **welches Gesicht** zu welchem Audiosegment den Mund bewegt. Das Modell hat nur einen Boolean `active_speaker` und keine per-Segment Face-Map. Bei sehr ähnlichen Mundbewegungen / engem Two-Shot rät es falsch und animiert konsequent das jeweils andere Gesicht – dadurch wirkt es so, als wären die Stimmen vertauscht.

## Lösung: Per-Speaker Doppel-Pass Lip-Sync

Statt eines einzigen Lipsync-Calls mit auto-detect machen wir **zwei sequentielle Passes**, jeweils mit nur EINER aktiven Stimme – die andere als Stille auf Track-Länge gepaddet. Dann hat sync.so genau ein sprechendes Audio-Signal und animiert deterministisch das Gesicht, das am besten dazu passt. In der **richtigen** Pass-Reihenfolge basierend auf der Anchor-Komposition (`character_shots[0]` zuerst).

```text
Pass 1: video + [Matthew-VO | Stille-Sarah]  → liefert Video mit nur Matthews Mund animiert
Pass 2: result_pass1 + [Stille-Matthew | Sarah-VO] → final: beide Münder animiert
```

## Umsetzung

1. **`compose-twoshot-audio` erweitern**
   - Zusätzlich zum gemergten MP3 pro Sprecher ein eigenes `speaker_track_url` erzeugen: das eigene MP3 plus Stille (gleiche Länge wie der/die anderen Segmente an deren ursprünglichen Zeitpositionen).
   - In `metadata.speakers[i]` neben `startSec/endSec` jetzt `track_url`, `speaker_slug` und `character_id` ablegen.
   - Idempotenz: alle Tracks landen unter `…/twoshot-vo/<scene>/` und werden nur regeneriert wenn `force_regenerate`.

2. **`compose-twoshot-lipsync` umbauen**
   - Wenn `metadata.speakers` mit `track_url` vorhanden ist: für jede Speaker-Spur einen sequentiellen Lipsync-Pass starten, jeweils `active_speaker: true`, `sync_mode: "loop"`.
   - Pass-Reihenfolge nach `character_shots`-Position (Position 0 zuerst), damit das erste animierte Gesicht zur visuellen Layout-Erwartung passt.
   - Als Eingabe-Video für Pass N+1 das Output-Video von Pass N nehmen.
   - Fallback (kein speakers-Array): bisheriges Single-Pass-Verhalten beibehalten.
   - Refund-Logik weiter idempotent halten; Kosten = N × $0.05/sec der Szenenlänge – dem User über `cost_credits` korrekt zurechnen.

3. **Self-Heal der betroffenen Szene**
   - Für `b4237058-…` `scene_audio_clips` löschen, `character_audio_url`, `audio_plan` leeren, `lip_sync_status='pending'`, `twoshot_stage=NULL`, damit beim nächsten "In echte Szene einbauen" der neue Doppel-Pass greift.

4. **Validierung**
   - Edge-Logs: `compose-twoshot-audio` muss 2 `speaker_track_url` ausliefern, `compose-twoshot-lipsync` muss "pass 1/2" und "pass 2/2" loggen.
   - Visuell: Matthew (links/erster Shot) bewegt zur männlichen Stimme den Mund, Sarah zur weiblichen.

## Geänderte Dateien

- `supabase/functions/compose-twoshot-audio/index.ts`
- `supabase/functions/compose-twoshot-lipsync/index.ts`
- DB-Reset für die aktuelle Szene (Migration nicht nötig, einfaches Update via service role)

## Was NICHT geändert wird

- Voice-Mapping (ist korrekt)
- Anchor-Komposition / Identity-Lock (bleibt v3)
- `compose-video-clips` (Hailuo-Render unverändert)
