## Ziel
Die Two-Shot-Szene soll wie eine saubere Artlist-/Cinematic-Sync-Pipeline laufen:
- Das Video spielt die volle Szenenlänge weiter, auch wenn das Voiceover früher endet.
- Charaktere sprechen strikt nacheinander, nicht gleichzeitig.
- Keine doppelte Audio-Wiedergabe in der Vorschau.
- Die Lipsync-Pipeline bekommt deterministische Sprecher-Spuren statt fehleranfälliger Auto-Erkennung.

## Gefundene Ursache
1. `compose-twoshot-audio` erzeugt aktuell zwar ein gemischtes MP3 und zusätzlich Sprecher-Tracks, aber die Sprecher-Tracks enthalten durch das aktuelle MP3-Silence-Padding potentiell nicht zuverlässig dekodierbare Stille. Dadurch kann Sync.so bzw. der Browser die Spuren falsch interpretieren, was Overlap oder falsche Dauer erzeugen kann.
2. Die Composer-Vorschau kann parallel Audio aus mehreren Quellen spielen:
   - eingebettetes Audio im lip-synced MP4
   - `scene_audio_clips` Voiceover
   - `audioPlan`-Fallback/virtuelle Clips
   Dadurch entsteht „gleichzeitig reden“, obwohl die Script-Reihenfolge eigentlich stimmt.
3. Wenn der Lipsync-Ausgabeclip kürzer als `duration_seconds` ist, stoppt der HTML-Video-Player über `onEnded` sofort, obwohl die Szene laut Timeline 10s hat. Die Vorschau braucht für lip-synced/embedded Clips eine Hold-Last-Frame-Logik bis zur Szenenlänge.

## Umsetzung

### 1. Two-Shot Audio robust machen
Datei: `supabase/functions/compose-twoshot-audio/index.ts`
- Entferne die synthetischen MP3-Silence-Frames als primäre Timing-Strategie.
- Erzeuge stattdessen ein explizites, sequenzielles Audio-Manifest:
  - `segments[]` mit `speaker_slug`, `character_id`, `startSec`, `endSec`, `audio_url`
  - `totalSec`
  - `sceneTailSec = max(0, scene.duration_seconds - totalSec)`
- Speichere weiterhin genau einen gemergten Voiceover-Clip in `scene_audio_clips`, aber markiere ihn in `metadata` klar als `twoshot_merged`.
- Für Lipsync-Pässe sollen einzelne Sprecher-Tracks nur dann genutzt werden, wenn sie browser-/provider-sicher sind; sonst fällt die Pipeline auf segmentweise/manifestbasierte Verarbeitung zurück.

### 2. Lipsync nicht mehr mit fehleranfälligen überlappenden Tracks fahren
Datei: `supabase/functions/compose-twoshot-lipsync/index.ts`
- Multi-Pass bleibt, aber die Pass-Inputs werden hart validiert:
  - Wenn Sprecher-Tracks fehlen/unsicher sind: kein „scheinbar erfolgreicher“ Multi-Pass, sondern klarer Fallback oder Fehler.
  - Pass-Reihenfolge bleibt Script-Reihenfolge plus `character_shots`-Mapping.
- `sync_mode` wird so gesetzt, dass das Ergebnis nicht auf die kurze VO-Länge gekürzt wird, wenn die Szene länger ist.
- Nach erfolgreichem Lipsync wird die Szene mit einer eindeutigen Audio-Ownership-Markierung aktualisiert, z. B. `audio_plan.twoshot.embeddedAudio = true`, damit die UI keine separaten VO-Spuren zusätzlich abspielt.

### 3. Vorschau: keine doppelte Stimme mehr
Datei: `src/components/video-composer/ComposerSequencePreview.tsx`
- Für Szenen mit `lipSyncAppliedAt` oder `audio_plan.twoshot.embeddedAudio`:
  - separate `scene_audio_clips` Voiceover und `audioPlan`-Voiceover werden nicht zusätzlich abgespielt.
  - nur das eingebettete MP4-Audio ist aktiv.
- Für nicht-lipgesyncte Szenen bleibt die bestehende SFX/VO-Preview unverändert.

### 4. Vorschau: volle Szenenlänge halten
Datei: `src/components/video-composer/ComposerSequencePreview.tsx`
- Wenn ein Videoelement endet, bevor `scene.durationSeconds` erreicht ist:
  - nicht sofort zur nächsten Szene springen,
  - letzten Frame halten,
  - globalen Playhead bis zur geplanten Szenenlänge weiterlaufen lassen,
  - erst dann weitergehen.
- Das gilt besonders für lip-synced Clips, deren Render eventuell nur Voiceover-Länge hat.

### 5. Betroffene Szene zurücksetzen
Datenbank-Aktion nach Code-Fix:
- Szene `b4237058-710d-4a9b-b011-a0ae01f19ebc` auf erneute Two-Shot-Verarbeitung setzen:
  - alte Two-Shot-Voiceover-Clips entfernen
  - `character_audio_url`, `audio_plan`, `lip_sync_status`, `twoshot_stage` bereinigen
  - ursprünglichen Silent-Clip als `clip_url`/`lip_sync_source_clip_url` erhalten

## Validierung
- Prüfen, dass `compose-twoshot-audio` ein Manifest mit zwei Segmenten in korrekter Reihenfolge erzeugt.
- Prüfen, dass `compose-twoshot-lipsync` keine unsicheren parallelen Sprechertracks mehr akzeptiert.
- In der Vorschau: Zeit läuft bis `0:10`, auch wenn Sprache früher endet.
- In der Vorschau: nur eine Stimme zur Zeit; kein globales/per-scene Doppel-Audio zusätzlich zum eingebetteten MP4.

## Nicht Teil dieses Fixes
- Keine Änderung am Character-Identity-Lock/Anchor-Rendering selbst.
- Kein Wechsel des Video-Providers.
- Keine UI-Neugestaltung.