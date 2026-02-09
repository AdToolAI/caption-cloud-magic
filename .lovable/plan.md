

# Fix: Gateway-Timeout durch Eliminierung des mittleren Hops

## Problem

Die Aufrufkette hat drei verschachtelte HTTP-Hops:

```text
auto-generate-universal-video (300s)
  --HTTP--> render-universal-video (300s)
    --HTTP--> render-with-remotion (300s)
      --HTTP--> AWS Lambda (~60-120s)
```

Obwohl alle Edge Functions auf 300s Timeout konfiguriert sind, hat der **Supabase API-Gateway** ein eigenes Timeout (~120s) fuer Edge-to-Edge HTTP-Aufrufe. Das ist nicht konfigurierbar. Deshalb bekommt `render-universal-video` nach ~120s einen 504 zurueck, obwohl `render-with-remotion` noch arbeitet.

## Loesung: render-universal-video direkt an Lambda anbinden

Statt dass `render-universal-video` ueber einen zweiten HTTP-Hop `render-with-remotion` aufruft, uebernimmt `render-universal-video` die Lambda-Invocation selbst. Die gesamte Render-Logik aus `render-with-remotion` (AWS-Client, Lambda-Aufruf, DB-Update) wird direkt in `render-universal-video` integriert.

### Aenderung: render-universal-video/index.ts

**Was sich aendert:**

1. AWS-Client (`aws4fetch`) wird direkt importiert und konfiguriert
2. Statt `fetch(render-with-remotion)` wird Lambda direkt per `aws.fetch()` aufgerufen (synchron, RequestResponse)
3. Nach Lambda-Antwort: DB-Update (`video_renders` auf completed), Media Library Eintraege erstellen
4. Der HTTP-Hop zu `render-with-remotion` entfaellt komplett

**Vorher (Zeile 237-251):**
```text
const renderResponse = await fetch(`${supabaseUrl}/functions/v1/render-with-remotion`, {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({ component_name, customizations, ... }),
});
```

**Nachher:**
```text
// AWS Client direkt initialisieren
const aws = new AwsClient({
  accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
  secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
  region: 'eu-central-1',
});

// Render-Record erstellen
const pendingRenderId = `pending-${crypto.randomUUID()}`;
await supabase.from('video_renders').insert({ render_id: pendingRenderId, status: 'rendering', ... });

// Lambda DIREKT aufrufen (synchron)
const lambdaUrl = `https://lambda.eu-central-1.amazonaws.com/2015-03-31/functions/FUNCTION_NAME/invocations`;
const lambdaResponse = await aws.fetch(lambdaUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(lambdaPayload),
});

// Lambda-Ergebnis parsen und DB aktualisieren
const lambdaResult = await lambdaResponse.json();
await supabase.from('video_renders').update({
  status: 'completed',
  video_url: outputUrl,
}).eq('render_id', pendingRenderId);
```

### Was gleich bleibt

- Die Szenen-Transformation und Feature-Mapping (Animationen, Sound-Effekte, Character-System etc.) bleiben identisch
- Die Response-Struktur bleibt gleich (renderId, status, features)
- `render-with-remotion` bleibt als eigenstaendige Funktion fuer andere Aufrufpfade (z.B. Directors Cut, Explainer Studio) erhalten
- Webhook-Konfiguration bleibt im Lambda-Payload als Fallback

### Technische Details

- Import: `import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";`
- Lambda Function Name: `remotion-render-4-0-392-mem3008mb-disk10240mb-600sec`
- Bucket: `remotionlambda-eucentral1-13gm4o6s90`
- ASCII-Safe JSON Encoding fuer Umlaute (gleiche `toAsciiSafeJson` Funktion)
- InputProps im Payload-Format: `{ type: "payload", payload: JSON.stringify(inputProps) }`
- Credit-Handling (Deduction + Refund bei Fehler) wird aus render-with-remotion uebernommen

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `render-universal-video/index.ts` | HTTP-Hop zu render-with-remotion entfernen, Lambda direkt aufrufen |

Die neue Aufrufkette:

```text
auto-generate-universal-video (300s)
  --HTTP--> render-universal-video (300s)
    --HTTP--> AWS Lambda (~60-120s)  [DIREKT, kein Zwischenhop]
```

Nur noch ein Gateway-Hop statt zwei. Da der Lambda-Call ~60-120s dauert und das Gateway-Timeout bei ~120s liegt, sollte das zuverlaessig funktionieren.

