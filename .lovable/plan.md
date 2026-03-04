
Stand aus den neuen Logs:
- Alle Profile A–O schlagen weiter mit `TypeError: Cannot read properties of undefined (reading 'length')` fehl.
- Fehler kommt weiterhin aus der Lambda-Runtime (`GDe -> jDe -> M1e`), also **vor** eigentlichem Render-Content.
- In den geloggten Payload-Keys fehlt aktuell `envVariables`.

Do I know what the issue is?
- **Ja.**
- Der konkrete Root Cause ist ein Payload-Contract-Mismatch:  
  In der Remotion-Launch-Pipeline wird intern `JSON.stringify(params.envVariables).length` berechnet.  
  Wenn `envVariables` im Start-Payload fehlt (`undefined`), führt das exakt zu `reading 'length'`.
- Das passt 1:1 zu eurem Fehlerbild und erklärt, warum selbst SmokeTest (N) crasht.

Geplanter Fix (r15 – envVariables Contract Fix):

1) Payload-Contract zentral korrigieren
- Datei: `supabase/functions/_shared/remotion-payload.ts`
- `normalizeStartPayload()`:
  - `envVariables` explizit und immer setzen: `{}` als Default.
- `buildStrictMinimalPayload()`:
  - ebenfalls `envVariables: {}` hinzufügen.
- Typen aktualisieren (`NormalizedStartPayload`), damit `envVariables` nicht mehr implizit fehlt.

2) Invocation-Guard ergänzen (defensiv)
- Datei: `supabase/functions/invoke-remotion-render/index.ts`
- Preflight direkt vor AWS-Call:
  - Wenn `envVariables` fehlt oder kein Objekt ist → auto-patch auf `{}`.
  - Logging-Marker z. B. `envVariables_auto_patched`.

3) Forensik erweitern
- Datei: `supabase/functions/_shared/remotion-payload.ts`
- `payloadDiagnostics` ergänzen um:
  - `hasEnvVariablesKey`
  - `envVariablesType`
  - `envVariablesSerializedLength`
- Canary auf `r15-envVariables-fix` erhöhen.

4) Persistenz-Transparenz verbessern
- Datei: `supabase/functions/invoke-remotion-render/index.ts`
- Sicherstellen, dass `payload_diagnostics` auch bei frühen Fehlerpfaden konsistent im `video_renders.content_config` landet (nicht nur im Erfolgszweig).

Technische Details (kurz):
- Der Fehler sitzt nicht in `UniversalCreatorVideo`, `SmokeTest`, Untertiteln oder Lottie.
- Er entsteht im Start→Launch Übergang der Lambda-Orchestrierung durch fehlendes `envVariables`.
- Deshalb ist dieser Fix ein reiner Edge-Function/Payload-Fix; kein neues Remotion-Bundle nötig.

Abnahmekriterien:
- In neuen Invoke-Logs ist `hasEnvVariablesKey: true` sichtbar.
- `envVariablesType` ist `object`, `envVariablesSerializedLength` ist `2` (`{}`).
- Profil N läuft mindestens über den bisherigen Crash-Punkt hinaus (kein sofortiges `.length` mehr).
- Wenn danach ein neuer Fehler erscheint, ist die nächste Blockade eindeutig isoliert und nicht mehr derselbe Payload-Contract-Fehler.
