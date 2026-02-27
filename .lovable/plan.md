

## Fix: Remotion Lambda Payload-Format + Credit-Refund (erledigt)

### Problem
1. `auto-generate-universal-video` sendete `inputProps` als rohes Objekt — Remotion Lambda 4.0.424 erwartet `{ type: 'payload', payload: JSON.stringify(...) }`
2. Alte `serveUrl` (`v392`) wurde in `lambdaPayload` gespeichert (Config-Problem)
3. Bei sofortigem Lambda-Fehler wurden Credits nicht rückerstattet

### Umgesetzte Änderungen

**1. `invoke-remotion-render/index.ts`** (Kompatibilitäts-Guard)
- Vor AWS-Invocation: automatische Normalisierung von `inputProps` (raw → serialized)
- Fehlende `bucketName` wird ergänzt
- Bei sofortigem Lambda-Fehler: idempotente Credit-Rückerstattung mit `credit_refund_done` Marker

**2. `auto-generate-universal-video/index.ts`** (Payload-Format)
- `inputProps` werden als `{ type: 'payload', payload: JSON.stringify(inputProps) }` serialisiert
- `bucketName` explizit im Payload

**3. `render-directors-cut/index.ts`** (Payload-Format)
- Gleiches serialisiertes `inputProps`-Format
- `bucketName` explizit im Payload

### Noch offen
- `REMOTION_SERVE_URL` Secret muss auf aktive 4.0.424 Bundle-URL gesetzt werden (manuelle Aktion)
