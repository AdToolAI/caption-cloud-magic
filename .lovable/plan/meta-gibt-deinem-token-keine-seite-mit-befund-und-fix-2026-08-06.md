# Meta gibt deinem Token keine Seite mit — Befund und Fix

## Was die Rohantworten beweisen

- Das Token ist gültig, frisch (heute ausgestellt) und trägt alle angeforderten Berechtigungen: `pages_show_list`, `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`.
- Entscheidend: In `granular_scopes` steht **kein einziges `target_ids`**. Meta führt bei asset-gebundenen Berechtigungen dort die konkret freigegebenen Seiten-/Instagram-IDs auf. Die Liste ist leer — Meta hat dem Token also **null Assets** zugeordnet.
- Passend dazu: `/me/accounts` liefert eine leere Liste ohne Fehler.
- `/me/businesses` schlägt mit `(#100) Missing Permission` fehl — dafür fehlt die Berechtigung `business_management`. Ob die Seite in einem Business-Portfolio liegt, ist damit aktuell **nicht prüfbar**.

Fazit: Es ist kein Fehler in unserem Abruf. Meta hat beim Login keine Seite an das Token gebunden. Der wahrscheinlichste Grund ist, dass die Seite „AdTool AI" zu einem Business-Portfolio gehört und deshalb ohne `business_management` unsichtbar bleibt. Bestätigt ist das noch nicht — genau deshalb steht die Messung im Plan an erster Stelle.

## Schritt 1: `business_management` anfordern und Zustimmung erzwingen

- `business_management` in die Scope-Liste von `instagram-oauth-start` und `facebook-oauth-start` aufnehmen.
- Beim Start des Logins `auth_type=rerequest` setzen, damit Meta den Asset-Auswahldialog erneut zeigt, statt die alte (leere) Zustimmung stillschweigend wiederzuverwenden.
- Danach die Probe erneut laufen lassen: Liefert `/me/businesses` jetzt ein Portfolio und `owned_pages` die Seite, ist die Ursache bewiesen und die Verbindung funktioniert.

## Schritt 2: Seitenerkennung aus mehreren Quellen

Die Seitenerkennung nutzt künftig die Vereinigung aus:
1. `/me/accounts` (bisherige Quelle),
2. `granular_scopes[].target_ids` aus `debug_token` → direkte Abfrage `/{page_id}`,
3. Business-Portfolio: `/me/businesses` → `owned_pages` + `client_pages`.

Dedupliziert über die Seiten-ID. Damit reicht eine funktionierende Quelle aus.

## Schritt 3: Ehrlicher Leer-Zustand statt stiller Leere

Zeigt Meta weiterhin keine Seite, nennt der Auswahl-Dialog den konkreten Befund („Meta hat dem Zugriff keine Seite zugeordnet — Berechtigungen erteilt, aber keine Asset-Freigabe") plus Button „Neu verbinden mit erweiterten Rechten".

## Was du parallel bei Meta prüfen solltest

- Meta Business Suite → Einstellungen → Seiten: Ist „AdTool AI" dort im Portfolio gelistet und dein Profil als **Administrator** eingetragen (nicht nur Redakteur)?
- Ist die Seite veröffentlicht und nicht im Entwurfsstatus?
- Bist du im Login-Dialog mit demselben Facebook-Profil angemeldet, das die Seite administriert?

## Technische Details

- `supabase/functions/instagram-oauth-start/index.ts`, `supabase/functions/facebook-oauth-start/index.ts`: Scope `business_management` ergänzen, `auth_type=rerequest` an die Dialog-URL anhängen.
- `supabase/functions/_shared/meta-page-discovery.ts`: zusätzliche Quellen (Token-Ziel-IDs, Portfolio-Seiten), Union + Dedupe per Seiten-ID, Fehlergründe strukturiert zurückgeben.
- `src/components/performance/FacebookPageSelectDialog.tsx`: aussagekräftiger Leer-Zustand mit Reconnect-Aktion.
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Datenbank-Änderung; `meta-page-probe` bleibt unverändert als Nachweiswerkzeug.

Hinweis: `business_management` ist im Meta-Dashboard zustimmungspflichtig. Für dich als App-Admin funktioniert es sofort (Standardzugriff), für externe Kunden braucht es später erweiterten Zugriff.
