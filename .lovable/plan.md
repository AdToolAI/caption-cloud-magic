

## Diagnose

**Durchbruch!** Der Fehler hat sich komplett geändert — von `Cannot read properties of undefined (reading '0')` zu:

> **"Audio codec undefined is not supported for codec h264"**

Das bedeutet: **Der `frameRange`-Fix aus r13 hat funktioniert!** Die Lambda kommt jetzt über die Frame-Initialisierung hinaus, scheitert aber an der Audio-Codec-Konfiguration.

**Root Cause:** In `remotion-payload.ts` Zeile 123 wird `audioCodec` auf `null` gesetzt, wenn nicht explizit angegeben. Remotion Lambda interpretiert `null` als `undefined`, was kein gültiger Audio-Codec für h264 ist. Der richtige Wert ist `'aac'`.

## Plan (r14 — Audio Codec Fix)

### 1. `audioCodec` auf `'aac'` defaulten
- **Datei:** `supabase/functions/_shared/remotion-payload.ts`
- Zeile 123: `audioCodec: (partial.audioCodec as string | null) ?? null` → `audioCodec: (partial.audioCodec as string) || 'aac'`
- In `buildStrictMinimalPayload()`: `audioCodec: 'aac'` explizit hinzufügen

### 2. Canary-Version auf `r14-audioCodec-fix` anheben
- **Datei:** `supabase/functions/_shared/remotion-payload.ts`
- `bundle_canary` aktualisieren

### 3. Diagnostics um audioCodec erweitern
- **Datei:** `supabase/functions/_shared/remotion-payload.ts`
- `payloadDiagnostics`: `audioCodec` Feld hinzufügen

Das ist ein Ein-Zeilen-Fix im Kern. Kein neues Bundle-Deployment nötig — nur Edge Function Redeployment.

