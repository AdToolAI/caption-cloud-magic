# A/B-Vergleich Alt vs. Neu — Ergebnis liegt bereits vor

Der von dir beschriebene Diagnoseblock läuft seit gestern automatisch bei jedem Callback (Tabelle `meta_oauth_diagnostics`). Beide Durchgänge sind erfasst — es braucht keinen neuen Test, nur die Auswertung.

## Vergleichstabelle (Rohdaten aus dem Callback, keine Tokens)

| Feld | Account A (alt, funktioniert) | Account B (neu, AdTool AI) |
|---|---|---|
| Zeitpunkt | 07.08. 20:18 | 07.08. 20:53 |
| Meta-User-ID | 122337042788329815 | 122116259151337304 |
| angeforderte Scopes (unsere URL) | pages_show_list, pages_read_engagement, pages_manage_posts, **business_management** | identisch |
| `uses_config_id` | false | false |
| gewährte Scopes (`/me/permissions`) | pages_show_list, **business_management**, pages_read_engagement, pages_manage_posts, public_profile | pages_show_list, pages_read_engagement, pages_manage_posts, public_profile |
| abgelehnt (declined) | keine | keine |
| `granular_scopes` | 4 Scopes, **kein** `target_ids` | 3 Scopes, **kein** `target_ids` |
| `/me/accounts` | 2 Seiten (Mystische…, Bestofproducts4u) | `data: []` (HTTP 200) |
| `/me/businesses` | 3 Portfolios inkl. `owned_pages` | HTTP 400 `(#100) Missing Permission` |
| Token gültig | ja | ja |

## Was das beweist

1. **Der Unterschied ist auf Token-Ebene bestätigt.** Identische Anfrage, unterschiedliches Ergebnis: bei B fehlt `business_management` in den gewährten Scopes — und zwar **nicht als „declined"**, sondern es taucht gar nicht erst auf. Meta hat die Berechtigung bei B nicht angeboten. Genau das entspricht dem verkürzten 3-Schalter-Dialog.
2. **`/me/businesses` scheitert bei B nur als Folge davon** (`Missing Permission` = fehlendes `business_management`). Das ist Symptom, nicht Ursache.
3. **`target_ids` fehlt in beiden Fällen** — auch beim funktionierenden Account A. Die Asset-Zuordnung läuft hier also nicht über granulare Scopes; A bekommt seine Seiten schlicht über `/me/accounts`. Diese Spur ist damit erledigt.
4. **Unsere Plattform ist entlastet:** angeforderte Scopes, Dialog-URL und Callback sind bei A und B byte-gleich. Der Unterschied entsteht ausschließlich bei Meta.

Zwei spätere Einträge (20:55 und 21:36) haben keine Callback-Daten — diese Verbindungsversuche wurden abgebrochen, bevor Meta zurückkam.

## Schritt 2: warum Meta `business_management` bei B nicht anbietet

Eine Sache ist bisher **nicht** gemessen und entscheidet alles Weitere: ob Meta die Berechtigung bei B aktiv verweigert oder sie beim Dialogaufbau gar nicht in Betracht zieht.

Dafür eine temporäre Diagnose-Route (ändert den normalen Verbindungsweg nicht):

- Neue Funktion `meta-scope-probe-start`: baut denselben Dialog, aber mit **nur** `business_management` als Scope und `auth_type=rerequest`.
- Ergebnis wird in dieselbe Diagnose-Tabelle geschrieben, markiert als `probe`.
- Auswertung:
  - Meta zeigt bei B den Dialog und erteilt die Berechtigung → dann blockiert die Kombination der Scopes im normalen Dialog; wir splitten den Consent.
  - Meta zeigt den Dialog und die Berechtigung bleibt trotz Zustimmung ungewährt → Asset-/Rollen-Ebene bei Meta; App-Review-relevant.
  - Meta bricht mit Fehlercode ab → der Fehlercode benennt die Ursache direkt.
- Die Probe-Route ist über das Diagnose-Panel erreichbar und wird nach der Klärung wieder entfernt.

**Erst nach diesem Befund** planen wir den eigentlichen Fix. Keine weitere Einstellung auf Verdacht.

## Technische Details

- Neu: `supabase/functions/meta-scope-probe-start/index.ts` (JWT-verifiziert, `oauth_states`-Eintrag mit `provider = 'facebook_probe'`, Scope-Liste ausschließlich `business_management`).
- `supabase/functions/oauth-callback/index.ts`: `facebook_probe` behandeln — Messblock ausführen, Ergebnis in `meta_oauth_diagnostics` schreiben, **keine** `social_connections`-Zeile anlegen.
- `src/components/performance/MetaOAuthDiff.tsx`: Button „Scope-Probe starten" plus Anzeige der Probe-Zeilen.
- `src/lib/translations.ts`: DE/EN/ES.
- Keine Änderung an den bestehenden Facebook-/Instagram-Scopes, an der Meta-App oder an der Datenbankstruktur (die Tabelle existiert bereits).
