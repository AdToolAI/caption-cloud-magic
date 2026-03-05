

## Diagnose

**Weiterer Fortschritt!** Der Fehler ist jetzt:
> "The Preset profile 'undefined' is not valid. Valid options are 'ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'"

Das ist der x264-Encoding-Preset — ein Pflichtfeld für den h264-Codec in Remotion Lambda. Aktuell fehlt `x264Preset` komplett in `NormalizedStartPayload` und in `buildStrictMinimalPayload`. Remotion bekommt `undefined` und crasht.

**Gleiches Muster wie `audioCodec`, `envVariables`, `frameRange`** — ein weiteres fehlendes Pflichtfeld im Payload-Contract.

## Plan (r17 — x264Preset Fix)

### 1. `x264Preset` in `normalizeStartPayload` hinzufügen
- **Datei:** `supabase/functions/_shared/remotion-payload.ts`
- Im `NormalizedStartPayload` Interface: `x264Preset: string | null;` hinzufügen
- In der Normalisierung: `x264Preset: (partial.x264Preset as string) || 'medium'`
- `'medium'` ist der Standard-Default von x264

### 2. `x264Preset` in `buildStrictMinimalPayload` hinzufügen
- `x264Preset: 'medium'` als expliziten Default setzen

### 3. Diagnostik erweitern
- `payloadDiagnostics`: `x264Preset` Feld hinzufügen
- `bundle_canary` auf `r17-x264Preset-fix` setzen

### Dateien
- `supabase/functions/_shared/remotion-payload.ts` (einzige Datei)

Ein-Feld-Fix, gleiche Kategorie wie r14/r15. Nur Edge Function Redeployment nötig.

