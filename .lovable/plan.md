# Voice Studio – "1 Sample reicht"-Fix

## Problem
Beim Klonen einer eigenen Stimme (1 zusammenhängende Aufnahme, 53.8s) bricht die Edge Function mit HTTP 400 ab:

> `Error in clone-voice: At least 3 voice samples required`

Die alte 3-Sample-Regel stammt aus der ursprünglichen Multi-Upload-Version (WhatsApp-Snippets). Der neue Voice-Studio-Flow nimmt aber **eine einzige, zusammenhängende Aufnahme** (Mic oder WhatsApp-Voice-Note) mit dem Trainingsskript auf — ElevenLabs Instant Voice Cloning akzeptiert das ab ~30s.

## Fix (klein & fokussiert)

### 1. `supabase/functions/clone-voice/index.ts`
- Mindestanzahl Samples von `3` auf `1` senken.
- Klarere Fehlermeldung: `"Mindestens 1 Audio-Sample erforderlich"`.
- Rest (Storage-Download, ElevenLabs Upload, `remove_background_noise`, DB-Insert) bleibt unverändert.

### 2. `src/components/voice/studio/VoiceStudioDialog.tsx`
- Client-Validierung in Step 2 (`canProceedToClone`) von "≥3 Samples" auf "≥1 Sample **UND** Gesamt-Dauer ≥ 30s" umstellen (verhindert zu kurze Aufnahmen und passt zu ElevenLabs Empfehlung).
- Zusammenfassungs-Hinweis anpassen: bei <30s Warnung "Mind. 30 Sekunden empfohlen", sonst grünes "Bereit".

### 3. `src/components/voice/VoiceCloneDialog.tsx` (Legacy-Multi-Upload)
- Ebenfalls von `>= 3` auf `>= 1` senken, damit Legacy-Pfad konsistent bleibt (nur falls noch irgendwo eingebunden). UI-Text "min. 3" → "min. 1".

## Nicht Teil des Fixes
- Kein Change an Storage, RLS, ElevenLabs-Params oder Voice-Library-UI.
- Kein Change am Trainingsskript oder Namens-Personalisierung.

## Verifikation
- Erneut mit 1 Aufnahme (~50s) klonen → Edge Function liefert `voice_id`, Toast "Voice Clone erstellt".
- Edge Function Logs prüfen: kein `At least 3 voice samples required` mehr.
