

# Fix: 85%-Abbruch endgueltig beheben + Interview-Fortschritt bei Fehlern bewahren

## Problem 1: 504 Gateway Timeout bei 85%

Die Logs zeigen klar:

```text
auto-generate-universal-video (EdgeRuntime.waitUntil)
  --fetch()--> render-universal-video   <-- Gateway-Timeout ~120s!
    --> AWS Lambda (direkt, 60-120s)
```

Obwohl `render-universal-video` jetzt Lambda direkt aufruft, wird der **Aufruf von `auto-generate-universal-video` zu `render-universal-video`** nach ~120s vom API-Gateway getoetet. Die Loesung: Die Lambda-Invocation muss direkt in `auto-generate-universal-video` stattfinden -- der Hop zu `render-universal-video` muss komplett entfallen.

**Zusaetzlich**: Die Logs zeigen, dass **Replicate (Flux 1.1 Pro)** Fehler 402/429 wirft ("Insufficient credit"). Alle 5 Szenen-Visuals schlagen fehl. Das fuehrt zu Videos ohne Bilder, was den Render ebenfalls zum Scheitern bringen kann.

## Problem 2: Interview-Neustart bei Fehler

Wenn die Generierung fehlschlaegt, hat der User nur "Erneut versuchen" (startet Generierung neu) oder muss komplett zurueck zum Start. Es gibt keine Moeglichkeit, zur letzten Interview-Frage zurueckzukehren oder die Generierung direkt mit dem gespeicherten Briefing neu zu starten.

---

## Loesung

### Aenderung 1: auto-generate-universal-video -- Lambda direkt aufrufen

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Die gesamte Render-Logik aus `render-universal-video` (AWS-Client, Lambda-Aufruf, DB-Updates, Credit-Handling) wird direkt in die `runGenerationPipeline`-Funktion integriert. Der `fetch()`-Aufruf zu `render-universal-video` (Zeile 341-358) entfaellt.

Konkret:
- `aws4fetch` importieren und AWS-Client initialisieren
- Szenen-Transformation (Remotion-Format) direkt ausfuehren
- Lambda synchron aufrufen (`RequestResponse`)
- `video_renders`, `video_creations`, `media_assets` DB-Updates direkt machen
- Credit-Deduction und Refund-Logik direkt einbauen
- Kein `fetch()` zu einer anderen Edge Function mehr

Die neue Aufrufkette:

```text
auto-generate-universal-video (EdgeRuntime.waitUntil, 300s)
  --> AWS Lambda (direkt, 60-120s)  [KEIN Gateway-Hop!]
```

### Aenderung 2: Fehler-Recovery im Wizard verbessern

**Datei:** `src/components/universal-video-creator/UniversalVideoWizard.tsx`

Bei Fehlschlag der Generierung bekommt der User zwei Optionen:

1. **"Erneut versuchen"** -- startet die Generierung mit dem gespeicherten Briefing neu (wie jetzt, aber zuverlaessiger)
2. **"Zurueck zum Interview"** -- geht zurueck zum Beratungsschritt (Step 2), wo der Chat-Verlauf dank localStorage noch vorhanden ist

Aenderungen:
- `handleRetry` bleibt wie bisher (Generierung neu starten)
- Neuer `handleBackToConsultation` -- setzt `currentStep` auf 2 (consultation), `isAutoGenerating` auf false, `error` auf null
- Error-Banner erhaelt zweiten Button "Zurueck zum Interview"
- Wenn `currentStepId === 'generating'` und `!isAutoGenerating` (= Fehler-Zustand), zeige Recovery-UI mit beiden Optionen

### Aenderung 3: Replicate-Fehler abfangen

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Die Szenen-Visual-Generierung schlaegt wegen Replicate 402/429 fehl. Die SVG-Fallbacks existieren bereits, aber der Render schlaegt trotzdem fehl. Sicherstellen:
- Bei 402 (Payment Required) eine klare Fehlermeldung loggen
- SVG-Fallbacks muessen korrekt als `imageUrl` in die Szenen eingefuegt werden
- Die Pipeline soll trotz fehlender Visuals weiterlaufen (Fallback-Bilder statt Abbruch)

---

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `auto-generate-universal-video/index.ts` | Lambda direkt aufrufen statt fetch zu render-universal-video; Replicate-Fehler robuster behandeln |
| `UniversalVideoWizard.tsx` | "Zurueck zum Interview" Button bei Fehler; Recovery-UI wenn Generierung fehlschlaegt |

## Technische Details

### Lambda-Integration in auto-generate

```text
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

// In runGenerationPipeline, statt fetch(render-universal-video):
const aws = new AwsClient({
  accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
  secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
  region: 'eu-central-1',
});

const lambdaUrl = `https://lambda.eu-central-1.amazonaws.com/2015-03-31/functions/remotion-render-4-0-392-mem3008mb-disk10240mb-600sec/invocations`;
const lambdaResponse = await aws.fetch(lambdaUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: toAsciiSafeJson(JSON.stringify(lambdaPayload)),
});
```

### Recovery-UI Logik

```text
// Neuer Handler:
const handleBackToConsultation = () => {
  setCurrentStep(2); // consultation step
  setIsAutoGenerating(false);
  setError(null);
};

// Im Error-Banner: zweiter Button
<Button onClick={handleBackToConsultation}>
  Zurueck zum Interview
</Button>
```

