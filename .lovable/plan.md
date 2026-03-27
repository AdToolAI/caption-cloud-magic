

## Auto-Save: Videos automatisch in Mediathek speichern

### Idee
Statt dass der User manuell "In Mediathek" klicken muss, wird das Video direkt im Webhook beim Fertigwerden heruntergeladen, in den Storage hochgeladen und als `video_creations`-Eintrag gespeichert — genau wie es der `director-cut-sora-webhook` bereits macht.

### Änderungen

**1. `supabase/functions/replicate-webhook/index.ts`**
- Bei `status === 'succeeded'`: Video sofort von Replicate herunterladen
- In `ai-videos` Storage-Bucket hochladen
- Permanente Storage-URL in `ai_video_generations.video_url` speichern
- Automatisch `video_creations`-Eintrag erstellen (wie beim Director's Cut Webhook)
- Metadata: model, prompt, aspect_ratio, duration, source: `"sora-2-ai"`

**2. `src/components/ai-video/VideoGenerationHistory.tsx`**
- "In Mediathek"-Button entfernen
- Stattdessen bei completed-Videos einen kleinen Hinweis "✓ In Mediathek gespeichert" anzeigen
- `handleSaveToLibrary`-Funktion und zugehörigen State (`savingVideo`) entfernen

**3. `supabase/functions/save-ai-video-to-library/index.ts`**
- Kann perspektivisch entfernt werden, wird aber vorerst als Fallback belassen (falls alte Videos noch die temporäre URL haben)

### Erwartetes Ergebnis
- Video wird beim Fertigwerden automatisch permanent gespeichert + in Mediathek eingetragen
- Kein manueller Klick mehr nötig
- Keine abgelaufenen Replicate-URLs mehr
- Verhalten identisch zum Universal Content Creator und Director's Cut

### Dateien
- `supabase/functions/replicate-webhook/index.ts` — Download + Storage + video_creations
- `src/components/ai-video/VideoGenerationHistory.tsx` — Button entfernen, Hinweis anzeigen

