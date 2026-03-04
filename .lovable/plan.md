
r12 implementiert – Profile N/O mit strict-minimal Payload:

## Was wurde geändert

1. **`remotion-payload.ts`**: Neue `buildStrictMinimalPayload()` Funktion — baut einen Payload mit NUR den offiziell dokumentierten Remotion Lambda Feldern (kein `fileName` in downloadBehavior, kein `rendererFunctionName`, kein `audioCodec`, etc.)

2. **`auto-generate-universal-video`**: Profile N + O hinzugefügt:
   - **N** = SmokeTest + strict-minimal Payload (komplett an `normalizeStartPayload` vorbei)
   - **O** = UniversalCreatorVideo + strict-minimal Payload

3. **`invoke-remotion-render`**: Erkennt `_payloadMode: 'strict-minimal'` und umgeht `normalizeStartPayload` komplett — der Payload geht 1:1 an Lambda.

4. **`remotion-webhook`**: Vollständige Error-Forensik: `lambda_error_full`, `error_fingerprint`, `webhook_error_type` werden in `content_config` persistiert.

5. **`UniversalVideoWizard`**: MAX_RETRIES auf 14 (Profile A–O), Fehlermeldung aktualisiert.

## Erwartete Ergebnisse

- **N erfolgreich → L fehlschlägt**: `normalizeStartPayload` fügt Felder hinzu die Lambda crashen
- **N fehlschlägt**: Problem liegt im Lambda-Handler/Bundle selbst, nicht im Payload-Format
- `lambda_error_full` ist jetzt bei JEDEM Webhook-Error gefüllt

## Nächster Schritt nach Logs
- Logs von N vs L vergleichen: unterschiedliche Payload-Keys = Payload-Format ist Root Cause
- `error_fingerprint` in DB prüfen für Pattern-Erkennung
