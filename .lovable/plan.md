

## Analyse der aktuellen Logs

### Drei kritische Bugs gefunden

**Bug 1: `disablePrecisionSubtitles` ist HARDCODED auf `false`**
In `supabase/functions/auto-generate-universal-video/index.ts`, Zeile 518:
```javascript
const disablePrecisionSubtitles = false; // ← HARDCODED! Ignoriert profileFlags
```
Dadurch hat Profil H seine Subtitles-Deaktivierung **nie** tatsächlich ausgeführt.

**Bug 2: `disableSceneFx` und `disableAnimatedText` fehlen im `diag`-Objekt**
In denselben Datei, Zeilen 558–567 — das `diag`-Objekt, das an die Lambda gesendet wird, enthält diese beiden Felder gar nicht. Profile I und J haben daher **identisch wie G** gerendert — ohne die beabsichtigte Isolation.

**Bug 3: Bundle-Probe zeigt immer noch r8**
In `supabase/functions/invoke-remotion-render/index.ts`, Zeile 391 steht weiterhin `r8-profileG-disableAllLottie-forensics`. Der r9-Canary wurde nie geschrieben.

### Tiefere Erkenntnis: Das Profiling war nie wirksam für H/I/J

Die DB bestätigt dies: Profil J zeigt `disablePrecisionSubtitles: false` und enthält weder `disableSceneFx` noch `disableAnimatedText` in `diag_flags_effective`. Alle drei Profile waren funktional identisch mit G.

### Stack-Trace-Analyse

Der Fehler liegt konsistent an `GDe (/var/task/index.js:155:44884)` — gleiche Position für **alle** Profile (A bis J). Das deutet stark darauf hin, dass der Crash **vor** dem React-Rendering passiert — wahrscheinlich während der Zod-Schema-Validierung oder `calculateMetadata` im minifizierten Remotion-Lambda-Bundle. Komponentenbasierte Flags ändern daran nichts.

### Umsetzungsplan

**1. Die drei konkreten Bugs fixen**
- `auto-generate-universal-video/index.ts`:
  - Zeile 518: `disablePrecisionSubtitles` aus `profileFlags` lesen statt hardcoded `false`
  - Im `diag`-Objekt (Zeilen 558–567): `disableSceneFx` und `disableAnimatedText` aus `profileFlags` durchreichen
- `invoke-remotion-render/index.ts`:
  - Bundle-Probe auf `r10` aktualisieren

**2. Smoke-Test-Profil K einführen**
- Neues Profil K: **Bare-Minimum-Render** — sendet `scenes: [{ ein einzelnes 2s-Farbscene }]`, keine Subtitles, keinen Voiceover, keine Musik, kein Character, alle Diag-Flags auf true
- Ziel: Wenn K crasht, liegt die Ursache definitiv NICHT in unseren Komponenten, sondern in Remotion Lambda, Zod-Schema-Parsing oder Payload-Struktur
- Wenn K funktioniert, liegt die Ursache in den progressiv deaktivierbaren Features (H/I/J laufen dann erstmals korrekt)

**3. Lambda-Logbevel auf `verbose` setzen**
- Im `normalizeStartPayload`: `logLevel` für Diagnose-Profile auf `'verbose'` statt `'warn'`
- Dadurch schreibt Remotion Lambda detailliertere Logs nach CloudWatch, die den exakten Crash-Punkt zeigen

**4. InputProps-Schema-Validierung VOR Lambda-Aufruf**
- Neuer Pre-Flight-Check in `auto-generate-universal-video`: die `inputProps` einmal gegen `UniversalCreatorVideoSchema` parsen (Zod `.safeParse()`), bevor sie an Lambda gehen
- Falls das Parsing fehlschlägt, wird die **exakte Zod-Fehlermeldung** in `universal_video_progress` geschrieben statt der kryptischen `.length`-Meldung
- Dies bestätigt oder widerlegt die Hypothese, dass der Crash ein Zod-Validierungsfehler ist

**Dateien:**
- `supabase/functions/auto-generate-universal-video/index.ts` (Bug 1+2, Profil K, Pre-Flight-Check)
- `supabase/functions/invoke-remotion-render/index.ts` (Bug 3, logLevel)
- `src/components/universal-video-creator/UniversalVideoWizard.tsx` (Profil K hinzufügen)

**Erwartetes Ergebnis:**
- Profiles H/I/J isolieren erstmals korrekt ihre Zielsysteme
- Profil K beweist deterministisch, ob das Problem in unseren Komponenten oder in Remotion/Schema liegt
- Pre-Flight Zod-Check liefert exakte Fehlermeldung statt minifiziertem `.length`-Crash

