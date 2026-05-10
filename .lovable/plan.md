## Problem (genau verifiziert)

Du klickst auf **„In echte Szene einbauen"** → das Hailuo-Video wird gerendert (clip_status='ready') → dann triggert die UI automatisch `compose-lipsync-scene` → diese Edge Function bricht **silent** ab, weil:

1. Die Szene hat **kein character_audio_url** und **kein scene_audio_clip** → Fallback 3 (TTS-Resynthese) springt an.
2. Fallback 3 ruft `generate-voiceover` (ElevenLabs) auf, übergibt aber den **Hume-Voice-Namen** `"Groovy Guy"` direkt als ElevenLabs-VoiceID → ElevenLabs antwortet mit `400 invalid_uid: 'Groovy Guy'`.
3. Die Function setzt `lip_sync_status='no_voiceover'` und gibt 422 zurück.
4. Im UI fängt der Auto-Trigger-Handler den Fehler nur per `console.warn` ab — **kein Toast, kein sichtbares Feedback**. Der „Lip-Sync gestartet"-Toast wird sogar fälschlich gezeigt, weil er VOR der Antwort feuert.

Das ist exakt derselbe Hume↔ElevenLabs-Fehler, den wir letzte Runde in `compose-video-clips` gefixt haben — aber nur dort, nicht im Lip-Sync-Pfad.

## Plan

### 1. `supabase/functions/compose-lipsync-scene/index.ts` — Hume-Voice-Support in Fallback 3
Vor dem `generate-voiceover`-Call (Zeile ~163) das Voice-Objekt inspizieren:
- Wenn `firstVoice.provider === 'HUME_AI'` ODER `firstVoice.engine === 'hume'` → stattdessen `generate-voiceover-hume` aufrufen mit `text` + `voiceName` (analog zur Lösung in `compose-video-clips`).
- Bei Hume-Failure: aussagekräftigen `clip_error` schreiben („Hume-Stimme '…' konnte nicht synthetisiert werden").
- Sonst (ElevenLabs): wie gehabt.

### 2. `supabase/functions/compose-lipsync-scene/index.ts` — Klarere Fehlertypen
- Neuer Returncode `tts_failed` (400) mit der Original-Fehlermeldung der TTS-API, statt alles in `no_voiceover` zu stopfen. Dadurch sieht der User in der UI den echten Grund.
- `clip_error` immer mit konkretem Hinweis befüllen (nicht nur „benötigt ein Voiceover…").

### 3. `src/components/video-composer/ClipsTab.tsx` — Sichtbares Feedback
- **Auto-Trigger-Handler** (~Zeile 460-480 + ~Zeile 281-310): den `error`/422/400-Response-Body inspizieren und einen **destructive Toast** mit dem `clip_error` zeigen statt nur `console.warn`.
- **Optimistischen „Lip-Sync gestartet"-Toast entfernen** — erst zeigen, wenn die Function tatsächlich `running` zurückgibt.
- **Scene-Card-Badge:** wenn `lip_sync_status === 'no_voiceover'` ODER `'tts_failed'`, anstelle von „Fertig" einen gelben Badge **„Lip-Sync fehlgeschlagen — Voiceover prüfen"** mit dem `clip_error` als Tooltip.
- **Retry-Button:** in der Szenen-Aktionsleiste neben „In echte Szene einbauen" einen kleinen 🔄-Button, der `compose-lipsync-scene` erneut feuert (für den Fall, dass der User das Voiceover gefixt hat).

### 4. DB-Repair (einmalig)
Szene `c357d482…` (`lip_sync_status='no_voiceover'`) zurücksetzen auf `lip_sync_status=NULL` + `clip_error=NULL`, damit der User nach dem Fix sauber neu starten kann.

### Was NICHT geändert wird
- Kein Refactoring der Voice-Provider-Architektur.
- Kein Wechsel von Sync.so auf einen anderen Lip-Sync-Provider.
- HeyGen-Pfad in `compose-video-clips` bleibt wie er ist (war bereits letzte Runde gefixt).

## Technische Details

| Datei | Änderung |
|---|---|
| `supabase/functions/compose-lipsync-scene/index.ts` | Hume-Detection vor Fallback-3-TTS-Call; neuer `tts_failed`-Returncode; konkrete `clip_error`-Texte |
| `src/components/video-composer/ClipsTab.tsx` | Destructive Toast bei Lip-Sync-Failures; Badge „Lip-Sync fehlgeschlagen"; manueller Retry-Button; optimistischer Toast entfernt |
| DB | `UPDATE composer_scenes SET lip_sync_status=NULL, clip_error=NULL WHERE id='c357d482-ef05-4498-81d6-4e508c202ddc'` |

## Erwartetes Verhalten danach

1. Du klickst „In echte Szene einbauen" → Hailuo rendert (~30-60s, Status sichtbar).
2. Auto-Lip-Sync startet → Toast „Lip-Sync läuft (~30s)" erscheint **nur** wenn Sync.so wirklich gestartet ist.
3. Wenn die Hume-Stimme jetzt sauber via `generate-voiceover-hume` synthetisiert wird → Sync.so läuft durch → Szene zeigt Hailuo-Clip mit korrekt synchronen Lippen ✅
4. Wenn irgendwas schiefgeht → **roter Toast mit echtem Grund** + gelber Badge auf der Szene + Retry-Button.