

## Analyse

**Kritischer Befund:** Profil K (Bare-Minimum, 1 Szene, keine externen Assets) crasht ebenfalls an der identischen Stelle `GDe (/var/task/index.js:155:44884)`. Damit ist definitiv bewiesen: das Problem liegt **nicht in unseren React-Komponenten**, sondern in der **Remotion Lambda Handler-Ebene** oder der **Zod-Schema-Interaktion** vor dem Rendering.

**Warum?**
- `/var/task/index.js` ist der Remotion Lambda Handler-Code (nicht unser S3-Bundle)
- Der Crash passiert bei JEDEM Input an derselben Position
- Der Lambda **akzeptiert** den Job (gibt `renderId` zurück), crasht aber beim Rendering-Start

**Root-Cause-Hypothesen (priorisiert):**

1. **Zod-Schema-Interaktion:** Remotion v4 ruft intern `schema.parse(inputProps)` auf **bevor** `calculateMetadata` läuft. Unser try-catch in `calculateMetadata` fängt diesen Fehler nicht. Ein ungültiger Wert oder eine Schema-Inkompatibilität würde als `.length`-Crash erscheinen.

2. **Composition-Discovery:** Wenn der Lambda die Composition `UniversalCreatorVideo` im Bundle nicht korrekt findet oder die Registrierung fehlt, könnte ein interner Array-Zugriff fehlschlagen.

3. **Lambda-Version / Bundle-Inkompatibilität:** Mismatch zwischen Lambda-Handler v4.0.424 und dem gebauten Bundle.

## Plan

### 1. Neue `SmokeTest`-Composition OHNE Zod-Schema

Erstelle in `Root.tsx` eine neue Composition:
```
<Composition
  id="SmokeTest"
  component={SmokeTestVideo}    // Simple AbsoluteFill + Text
  durationInFrames={60}
  fps={30}
  width={1080}
  height={1920}
  // KEIN schema
  // KEIN calculateMetadata
/>
```

`SmokeTestVideo`: eine 15-Zeilen-Komponente — `AbsoluteFill` mit Gradient + Text "SMOKE TEST OK". Keine Imports von Lottie, Rive, oder irgendwelchen Subsystemen.

**Ziel:** Wenn SmokeTest erfolgreich rendert → Ursache ist in unserem Zod-Schema oder calculateMetadata.
Wenn SmokeTest auch crasht → Ursache ist im Lambda-Setup/Version selbst.

### 2. Profil L: SmokeTest-Composition statt UniversalCreatorVideo

Erweitere die Profil-Sequenz:
- Profil L = `{ composition: 'SmokeTest' }` — nutzt die neue Composition statt `UniversalCreatorVideo`
- `auto-generate-universal-video`: bei Profil L wird `composition: 'SmokeTest'` und ein minimaler Payload (kein `diag`, kein `scenes`, keine Schema-Pflichtfelder) gesendet

### 3. Schema-Isolationstest: Composition OHNE calculateMetadata aber MIT Schema

Falls Profil L funktioniert, brauchen wir den nächsten Schnitt:
- Profil M = `UniversalCreatorVideo`-Schema **ohne** `calculateMetadata` (feste `durationInFrames: 60` direkt auf der Composition)
- Dies isoliert ob das Problem im Schema-Parsing oder in calculateMetadata liegt

### 4. Full Lambda Error Logging

In `invoke-remotion-render`:
- Bei `lambdaResponse.ok` UND `parsed.type === 'error'`: das KOMPLETTE `parsed`-Objekt loggen (inkl. `stackTrace`, `type`, `name`), nicht nur `errorMessage`
- Bei `parsed.errorType`: zusätzlich in `content_config` als `lambda_error_full` persistieren
- Ziel: Die VOLLE Fehlermeldung aus der Lambda (inkl. Zod-Error-Details) sichtbar machen

### Dateien
- `src/remotion/Root.tsx` — SmokeTest-Composition hinzufügen
- `src/remotion/templates/SmokeTestVideo.tsx` — Neue Minimal-Komponente (15 Zeilen)
- `supabase/functions/auto-generate-universal-video/index.ts` — Profil L + M hinzufügen
- `supabase/functions/invoke-remotion-render/index.ts` — Vollständige Error-Extraktion
- `src/components/universal-video-creator/UniversalVideoWizard.tsx` — MAX_RETRIES auf 12, Profil L+M

### Erwartetes Ergebnis
- Profil L beweist deterministisch ob die Lambda-Umgebung überhaupt funktioniert
- Falls L funktioniert: Profil M isoliert Schema vs. calculateMetadata
- Vollständiges Error-Logging zeigt die exakte Zod/Remotion-Fehlermeldung

