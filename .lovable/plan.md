
## Fix: Content Creator Render-Fehler ist aktuell ein Edge-Function Boot-Error

### Ursache
Ich habe die Runtime-Logs geprüft. Der Fehler ist derzeit **nicht** die Video-Dauer-Logik im Frontend, sondern ein **Syntax-/Compile-Fehler** in der Backend-Funktion `render-with-remotion`:

```text
worker boot error: Uncaught SyntaxError:
Identifier 'voiceoverDuration' has already been declared
```

Dadurch startet die Funktion gar nicht. Im Browser erscheint das dann als:
- CORS / preflight failed
- `Failed to send a request to the Edge Function`

Der CORS-Fehler ist hier also nur das Symptom, weil die Funktion wegen des Syntaxfehlers nicht sauber antworten kann.

### Aenderungen

#### 1. `supabase/functions/render-with-remotion/index.ts`
- Die doppelte Deklaration von `voiceoverDuration` entfernen
- Die fruehe Variable fuer Limit-/Credit-Logik und die spaetere Variable fuer finale Frame-Berechnung klar trennen, z. B.:
  - `requestedVoiceoverDuration`
  - `sanitizedVoiceoverDuration`
- Die bestehende Dauer-Logik beibehalten: finale Render-Dauer bleibt das Maximum aus Szenen und Voice-over

#### 2. CORS in derselben Funktion absichern
- Die CORS-Header auf die vollstaendige Header-Liste erweitern, damit der Browser-Call auch nach dem Syntaxfix robust bleibt:
  - `authorization`
  - `x-client-info`
  - `apikey`
  - `content-type`
  - `x-supabase-client-platform`
  - `x-supabase-client-platform-version`
  - `x-supabase-client-runtime`
  - `x-supabase-client-runtime-version`
- OPTIONS-Response explizit mit erfolgreichem Response-Body/Status zurueckgeben

### Technische Umsetzung
```text
Aktuell:
const voiceoverDuration = customizations?.voiceoverDuration || 30;
...
const voiceoverDuration = Number(sanitizedCustomizations.voiceoverDuration) || 0;

Fix:
const requestedVoiceoverDuration = Number(customizations?.voiceoverDuration) || 30;
...
const sanitizedVoiceoverDuration = Number(sanitizedCustomizations.voiceoverDuration) || 0;
const totalDurationSeconds = Math.max(sceneDurationSum, sanitizedVoiceoverDuration, 5);
```

### Ergebnis nach dem Fix
- `render-with-remotion` bootet wieder korrekt
- Preflight/CORS-Fehler verschwindet
- Der Content Creator kann wieder Render-Jobs starten
- Die zuletzt eingebaute Dauer-Logik fuer lange Voice-overs bleibt erhalten

### Datei
- `supabase/functions/render-with-remotion/index.ts`
