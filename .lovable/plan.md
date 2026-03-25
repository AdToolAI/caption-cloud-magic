

## Fix: Edge Function CORS/Deploy-Fehler im KI Picture Studio

### Ursache
Die Console zeigt: "Response to preflight request doesn't pass access control check: It does not have HTTP ok status." und "net::ERR_FAILED". Das bedeutet, die Edge Function `generate-studio-image` antwortet nicht korrekt auf OPTIONS-Requests — wahrscheinlich weil sie nicht korrekt deployed ist oder einen Runtime-Fehler beim Start hat.

### Aenderungen

#### 1. Edge Function redeployen
Die Funktion `generate-studio-image` muss neu deployed werden. Der Code selbst hat korrekte CORS-Headers, aber die Funktion scheint nicht erreichbar zu sein.

#### 2. Sicherheitshalber: `supabase/config.toml` pruefen
Falls die Funktion `verify_jwt = true` hat (Standard), wird der OPTIONS-Request ohne JWT abgelehnt. In dem Fall muss `verify_jwt = false` gesetzt werden, da die JWT-Validierung im Code selbst stattfindet.

### Dateien
1. `supabase/config.toml` — ggf. Function-Config Block hinzufuegen
2. Edge Function redeployen

