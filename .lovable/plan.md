# Meta-Seiten sichtbar machen: Ursache belegt, Fix in drei Schritten

## Befund

`business_management` steht in deiner Meta-App auf **Standard Access**. Deine App läuft im **Live-Modus**. Meta erteilt Berechtigungen mit Standard Access im Live-Modus nicht wirksam — sie erscheinen im Dialog, landen aber nicht im Token.

Das deckt sich exakt mit den Rohdaten deiner Probe:

- erteilte Scopes: `pages_show_list`, `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, `public_profile` — **kein** `business_management`
- `granular_scopes` ohne jede `target_ids` → Meta hat dem Token null Assets zugeordnet
- `/me/accounts`: leere Liste ohne Fehler
- `/me/businesses`: `(#100) Missing Permission`

Deine Prüfungshistorie bestätigt es: genehmigt wurden `instagram_basic`, `instagram_content_publish`, `public_profile`, `pages_manage_posts`, `pages_show_list`, `pages_read_engagement`. `business_management` wurde nie eingereicht.

Was damit **noch nicht** bewiesen ist: ob die Seite „AdTool AI" tatsächlich in einem Business-Portfolio liegt. Deshalb steht dieser Nachweis an erster Stelle — er entscheidet, ob überhaupt ein Review nötig ist.

## Schritt 1: Beweis in 5 Minuten (ohne Code, ohne Review)

Im Meta-Dashboard oben den Schalter **App Mode** von *Live* auf *Development* stellen. Im Development-Modus wirkt Standard Access für Administratoren sofort.

Dann in der App Instagram neu verbinden und die **Meta Seiten-Probe** erneut laufen lassen:

- Erscheinen jetzt Portfolio und Seite → die Business-Portfolio-These ist bewiesen, Advanced Access für `business_management` ist der richtige Weg.
- Bleibt alles leer → die Ursache liegt nicht am Portfolio, sondern an der Seitenrolle deines Profils. Dann greift Schritt 2b statt eines Reviews.

Danach den Schalter wieder auf **Live** zurückstellen.

## Schritt 2a: Wenn Portfolio bestätigt — Advanced Access beantragen

App Review → Permissions and Features → `business_management` → *Request advanced access*. Nötig sind: Anwendungsfall-Beschreibung, Screencast des Verbindungsflusses, aktive Datenschutz-URL. Bis zur Freigabe bleibt die Verbindung für externe Kunden mit Portfolio-Seiten blockiert.

## Schritt 2b: Sofort-Weg ohne Review

Die Seite direkt an dein persönliches Profil binden, statt über das Portfolio: Meta Business Suite → Einstellungen → Seiten → „AdTool AI" → Personen → dein Profil mit **Vollzugriff** hinzufügen. Danach liefert `/me/accounts` die Seite auch ohne `business_management`, weil `pages_show_list` bereits Advanced Access hat.

## Schritt 3: Code an die reale Freigabelage anpassen

Aktuell fordern beide Login-Funktionen `business_management` an, obwohl die Berechtigung im Live-Modus wirkungslos ist. Das bringt keinen Nutzen und riskiert einen abgebrochenen Dialog.

- Der angeforderte Scope-Satz wird an den tatsächlichen Freigabestand gekoppelt: `business_management` wird nur dann mitgeschickt, wenn es freigegeben ist — gesteuert über einen Schalter, den wir nach dem Review umlegen.
- Die Portfolio-Abfrage bleibt als zusätzliche Quelle bestehen, scheitert aber leise und nachvollziehbar statt als Fehler.
- Der Verbindungsbereich zeigt den echten Grund an: „Meta hat dem Zugriff keine Seite zugeordnet — `business_management` steht auf Standard Access" statt einer leeren Liste.

## Technische Details

- `supabase/functions/instagram-oauth-start/index.ts`, `supabase/functions/facebook-oauth-start/index.ts`: Scope-Liste an einen Freigabe-Schalter koppeln; `auth_type=rerequest` bleibt.
- `supabase/functions/_shared/meta-page-discovery.ts`: `(#100) Missing Permission` als eigenen, benannten Diagnosegrund führen statt als generischen Fehler.
- `supabase/functions/facebook-list-pages/index.ts`: neuen Status `meta_scope_standard_access_only` ausgeben, wenn Berechtigungen fehlen und zugleich keine Ziel-IDs vorliegen.
- `src/components/performance/FacebookPageSelectDialog.tsx`: Leer-Zustand um diesen Fall erweitern.
- `src/components/performance/MetaPageProbePanel.tsx`: Befund um den Hinweis auf das Access level ergänzen.
- `src/lib/translations.ts`: Texte DE/EN/ES.
- Keine Datenbank-Änderung.
