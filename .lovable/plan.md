
**Kurzdiagnose aus den neuen Logs**

- Der Fehler ist jetzt klarer: `Cannot read properties of undefined (reading '0')`.
- Stacktrace zeigt den Einstiegspunkt: `getRealFrameRange` in der Remotion-Lambda-Runtime.
- In den Diagnose-Logs ist bei allen Payloads `hasFrameRange: false` (inkl. Profile N/O).
- Damit ist der wahrscheinlichste Root Cause: **`frameRange` wird nicht als gültiges Tuple gesetzt** und die Runtime greift intern auf Index `[0]` zu.

---

**Umsetzungsplan (r13, zielgerichtet auf Root Cause)**

1. **FrameRange deterministisch setzen (zentral)**
   - Datei: `supabase/functions/_shared/remotion-payload.ts`
   - In `normalizeStartPayload()`:
     - Wenn `durationInFrames` vorhanden und `frameRange` fehlt/`null`: setze `frameRange: [0, durationInFrames - 1]`.
   - In `buildStrictMinimalPayload()`:
     - Ebenfalls explizit `frameRange` setzen.
   - Ziel: Keine Lambda-Initialisierung mehr mit undefiniertem Frame-Range.

2. **Invoke-Guard vor AWS-Call ergänzen**
   - Datei: `supabase/functions/invoke-remotion-render/index.ts`
   - Preflight-Validation direkt vor `aws.fetch(...)`:
     - `frameRange` muss `[number, number]` sein und `start <= end`.
     - Falls fehlend und `durationInFrames` bekannt: auto-patch auf `[0, durationInFrames - 1]` + log marker `frameRange_auto_patched`.
   - Ziel: Fehler früh und klar im Backend statt minifiziert in Lambda.

3. **Auto-Diagnosekette wiederherstellen**
   - Datei: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
   - Auto-Retry aktuell nur bei `.length`; erweitern auf:
     - `reading '0'`
     - `getRealFrameRange`
   - Ziel: Profile laufen weiter automatisch (A→O), statt bei Profil N hängen zu bleiben.

4. **Forensik verbessern (FrameRange sichtbar machen)**
   - Dateien:
     - `supabase/functions/_shared/remotion-payload.ts`
     - `supabase/functions/invoke-remotion-render/index.ts`
   - `payloadDiagnostics` um konkrete Felder erweitern:
     - `hasFrameRangeKey`
     - `frameRangeValue`
     - `frameRangeType`
   - Bundle/Canary auf `r13` anheben.
   - Ziel: Bei neuen Runs sofort sichtbar, ob Payload wirklich korrekt ist.

---

**Technische Details (warum diese Lösung)**

- Der Wechsel von `.length` auf `reading '0'` nach Strict-Minimal ist ein starker Hinweis auf **Indexzugriff auf nicht gesetzten Range** statt Komponentencode.
- Fehler tritt auch bei `SmokeTest` auf → nicht in Scenes/Lottie/Subtitles, sondern vor dem eigentlichen Renderpfad.
- `getRealFrameRange` im Stack passt exakt zu fehlendem/ungültigem `frameRange`.
- Daher priorisiert r13 das **Payload-Contract-Fixing** vor weiteren Feature-Isolationen.

---

**Abnahmekriterien**

- Profil N läuft ohne `reading '0'` Fehler.
- In Logs steht `hasFrameRangeKey: true` und `frameRangeValue: [0,59]` (bei 60 Frames).
- Auto-Retry springt bei Bedarf weiter auf O statt abzubrechen.
- Wenn N erfolgreich und O fehlschlägt: dann nächste Analyse auf Schema/InputProps von `UniversalCreatorVideo`.
