# Keine Seite in den Verknüpfungen — echte Ursache ermitteln

Du hast recht: beide Häkchen waren gesetzt, das Konto ist ein Profi-Konto. Ich habe die gespeicherte Diagnose deiner Verbindung ausgelesen, und sie widerlegt meine erste Vermutung.

## Was die Daten sagen (Verbindung von 21:05 Uhr)

- Erteilte Berechtigungen: `pages_show_list`, `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, `public_profile` — **nichts abgelehnt**, keine fehlenden Pflicht-Scopes.
- Ergebnis der Seitensuche: `meta_pages_found_count: 0`, `meta_list_error: null`.

Das heißt: Meta hat auf die Abfrage `/me/accounts` **eine leere Liste ohne Fehlermeldung** zurückgegeben — obwohl du die Seite „AdTool AI" im Dialog freigegeben hast. Genau deshalb bleibt die Auswahl in der App leer. Es liegt also nicht an deiner Klickreihenfolge und nicht am Kontotyp.

Warum die Liste leer ist, lässt sich aus den gespeicherten Feldern **nicht** eindeutig ableiten. Zwei bekannte Kandidaten, die zu genau diesem Bild passen:

1. Der Zugriffstoken ist **asset-gescoped** (neuer Business-Login-Dialog). Dann liefert `/me/accounts` je nach Konfiguration nichts, und die Seite muss über den Token-Debug (`granular_scopes` mit `target_ids`) bzw. über die Business-Portfolio-Endpunkte gelesen werden.
2. Die Seite gehört zu einem **Business-Portfolio**; dafür fehlt die Berechtigung `business_management`, ohne die die Seite in `/me/accounts` unsichtbar bleiben kann.

Beides ist messbar — deshalb messe ich es, statt weiter zu raten.

## Schritt 1: Beweis erheben (Roh-Abfrage)

Neue Diagnose-Funktion `meta-page-probe`, die mit deinem gespeicherten Token nacheinander abfragt und die **unveränderten** Antworten zurückgibt:

- `GET /debug_token` → insbesondere `granular_scopes` samt `target_ids` (zeigt, welche Seiten-/IG-IDs Meta dem Token tatsächlich zugeordnet hat)
- `GET /me/accounts` (roh, inkl. leerer `data` und `paging`)
- `GET /me/businesses` und, falls vorhanden, `/{business_id}/owned_pages` + `/{business_id}/client_pages`
- `GET /{page_id}?fields=name,instagram_business_account` für die Seiten-ID `1151763674688570` aus deinem Screenshot
- `GET /me/permissions`

Ausgabe im Diagnose-Panel unter Verbindungen, lesbar aufbereitet und mit Kopier-Button für den Rohtext.

## Schritt 2: Fix nach Befund

Je nachdem, was Schritt 1 zeigt, greift genau eine Korrektur:

- **`granular_scopes` enthält die Seiten-ID**, `/me/accounts` bleibt leer → Seitenerkennung liest die IDs künftig aus dem Token-Debug und holt jede Seite direkt per `/{page_id}`; `/me/accounts` wird nur noch als Zusatzquelle genutzt.
- **Seite liegt in einem Business-Portfolio** → `business_management` in die angeforderten Scopes von `facebook-oauth-start` und `instagram-oauth-start` aufnehmen, plus Portfolio-Endpunkte als zweite Quelle.
- **Meta liefert einen Fehlercode** → dieser wird im Panel im Klartext angezeigt statt still verschluckt.

## Schritt 3: Nie wieder stille Leere

Der Auswahl-Dialog zeigt bei null Seiten künftig den konkreten Befund („Meta hat keine Seite zurückgegeben, obwohl Berechtigung X erteilt ist") statt einer leeren Liste, inklusive Button „Erneut verbinden".

## Technische Details

- Neu: `supabase/functions/meta-page-probe/index.ts` — nur lesend, Auth über Nutzer-Session, Token via `decryptToken`, gibt Status + gekürzten Rohtext je Endpunkt zurück. Keine Tokens in der Antwort.
- `supabase/functions/_shared/meta-page-discovery.ts` — zusätzliche Quelle `granular_scopes.target_ids` und optional Business-Portfolio-Seiten; Vereinigung der Quellen, Dedupe per Seiten-ID.
- `supabase/functions/facebook-oauth-start/index.ts`, `instagram-oauth-start/index.ts` — Scope-Liste erweitern, sofern der Befund es verlangt (nur genehmigte Scopes).
- `src/components/performance/ConnectionDiagnostics.tsx` — neuer Abschnitt „Meta Seiten-Probe" mit Button „Jetzt prüfen".
- `src/components/performance/FacebookPageSelectDialog.tsx` — aussagekräftiger Leer-Zustand.
- `src/lib/translations.ts` — DE/EN/ES.
