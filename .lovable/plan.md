
## Ursache ist jetzt klar (und reproduzierbar)

Der Fehler ist **nicht mehr** der alte Timeout-Fall.  
Die Logs zeigen jetzt eindeutig:

- `tracking_mode = request_response` (also der 300s/Abort-Fix greift)
- Lambda antwortet sofort mit:
  - `function = remotion-render-4-0-424-mem2048mb-disk2048mb-120sec`
  - Payload enthält `serveUrl = .../sites/adtool-v392-clean-1222/index.html`
- Ergebnis: `Version mismatch ... incompatible payload`

Das heißt: **Die Lambda-Funktion wurde auf 4.0.424 aktualisiert, aber der Remotion-Site-Build (serveUrl) ist noch auf v392.**  
Genau deshalb bleibt der Fehler trotz Lambda-Update bestehen.

## Warum das passieren konnte

Du hast korrekt die Function-Secret-Seite aktualisiert (`REMOTION_LAMBDA_FUNCTION_ARN`).  
Aber die Render-Pipeline braucht **beides** synchron:

1. Lambda-Function-Version  
2. Serve-URL-Version (Site-Bundle)

Wenn nur (1) aktualisiert wird, knallt es weiterhin mit Version-Mismatch.

## Konkreter Fix-Plan

### 1) Blocker beheben: neues Site-Bundle deployen und Serve-URL aktualisieren
Bitte lokal ein neues Remotion-Site-Bundle erzeugen (mit 4.0.424) und danach die neue URL als Secret setzen.

```text
npx remotion lambda sites create --site-name adtool-remotion-bundle
```

Danach:
- neue `serveUrl` aus der Ausgabe kopieren
- in Lovable Cloud Secret `REMOTION_SERVE_URL` auf diese neue URL setzen

### 2) Danach sofortiger Verifikationstest
Neuen Universal-Render starten und prüfen:
- kein `Version mismatch`
- `video_renders.status` geht auf `rendering/completed` statt `failed`
- `content_config.real_remotion_render_id` ist gesetzt

### 3) Härtung im Code (damit das nie wieder “still” passiert)
Nach Freigabe implementiere ich anschließend:
- einheitliche Lambda-Name-Auflösung über Secret in allen Remotion-Funktionen
- Entfernung alter Hardcodings (`4.0.392` / `4.0.377`) in Legacy-Pfaden
- expliziten Version-Guard mit klarer Fehlermeldung:
  - “Lambda-Version X, Serve-URL-Version Y – bitte REMOTION_SERVE_URL aktualisieren”

## Technische Hinweise

- Aktuell zeigt die Fehl-Payload explizit auf `adtool-v392-clean-1222` (altes Site-Bundle).
- Die neue Lambda `...4-0-424...` ist korrekt, aber ohne neue `REMOTION_SERVE_URL` nicht lauffähig.
- Optional für Stabilität/Performance kann später wieder eine 3008MB/10240MB/600s Lambda genutzt werden; für den Version-Fix ist primär die **Serve-URL-Synchronisierung** entscheidend.
