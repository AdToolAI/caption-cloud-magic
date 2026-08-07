# Facebook-Seite wird im Meta-Dialog gezeigt, kommt aber nie bei uns an

Du hast recht: wenn Meta die Seite im Dialog anzeigt und du bestätigst, liegt der Rest bei uns. Ich habe den Code gelesen — es gibt zwei konkrete Stellen auf unserer Seite, die genau dieses Verhalten erzeugen.

## Befund 1: Wir starten den falschen Login-Typ für Business-Portfolios

`facebook-oauth-start` baut die Dialog-URL so:

- Wenn das Secret `META_LOGIN_CONFIG_ID` gesetzt ist → „Facebook Login for Business" (Asset-Auswahl, Seiten werden dem Token fest zugeordnet).
- Wenn es fehlt → klassischer Login mit `scope=...`.

**`META_LOGIN_CONFIG_ID` ist in unseren Secrets nicht vorhanden** (Secret-Liste geprüft). Wir laufen also im klassischen Modus. Genau der zeigt bei Seiten, die in einem Business-Portfolio liegen, die Seite im Dialog an — bindet sie aber nicht als Asset an das Token. Ergebnis: Zustimmung „erfolgreich", danach `/me/accounts` leer.

Dazu passt exakt, was in deiner gespeicherten Verbindung steht: `meta_pages_found_count: 0`, `meta_page_discovery_status: "meta_pages_hidden_or_unavailable"`, und `granted_scopes` enthält **kein** `business_management` — obwohl wir es anfordern. Meta lässt es im klassischen Dialog still weg.

## Befund 2: Wir werfen gefundene Seiten wieder weg

In `_shared/meta-page-discovery.ts` (`collectMetaPagesAllSources`) übernehmen wir zusätzlich gefundene Seiten nur, wenn sie ein Seiten-Token mitliefern:

```text
if (p?.id && p.access_token) byId.set(...)
```

Seiten, die über `debug_token`-Ziel-IDs oder das Business-Portfolio gefunden werden, liefern beim Hydrieren mit dem Nutzer-Token häufig `id` und `name`, aber **kein** `access_token`. Diese Seiten verschwinden dadurch spurlos — die Zählung landet wieder bei 0, und im UI steht „keine Seite gefunden", obwohl Meta sie genannt hat.

## Befund 3: Der Facebook-Zweig im Callback misst gar nichts

Im `oauth-callback` läuft für `instagram` die volle Seiten-Erkennung inklusive Diagnose und Long-Lived-Token-Tausch. Der `facebook`-Zweig holt nur `/me?fields=id,name` und setzt `selection_required: true` — keine Seiten-Erkennung, keine Scope-Prüfung, kein Long-Lived-Tausch. Deshalb sehen wir den Fehlschlag erst später und ohne Kontext.

## Umsetzung

**1. Login for Business aktivieren (behebt die Ursache)**
- `facebook-oauth-start` und `instagram-oauth-start` verlangen künftig eine Konfigurations-ID. Fehlt sie, liefert die Funktion einen klaren Fehler statt still in den klassischen Modus zu fallen.
- Du legst dazu in der Meta-App unter *Facebook Login for Business → Configurations* eine Konfiguration an (Assets: Pages; Permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`, für IG zusätzlich `instagram_basic`, `instagram_content_publish`) und gibst mir die Konfigurations-ID — ich hinterlege sie als `META_LOGIN_CONFIG_ID`.
- `oauth-config-check` zeigt zusätzlich an, ob die Konfigurations-ID gesetzt ist und welcher Login-Typ aktiv verwendet wird.

**2. Seiten nicht mehr verwerfen**
- Hydrierte Seiten ohne Seiten-Token werden behalten. Das Seiten-Token wird in einem zweiten, gezielten Aufruf (`/{page_id}?fields=access_token`) nachgeholt.
- Bleibt es leer, erscheint die Seite trotzdem in der Auswahl — mit klarer Markierung „Token fehlt, Posten nicht möglich" statt sie unsichtbar zu machen.
- Der Nutzer-Token wird in `listMetaPages` URL-kodiert (bisher roh angehängt).

**3. Facebook-Callback misst wie Instagram**
- Long-Lived-Token-Tausch, Scope-Abfrage und eine Diagnose-Erkennung laufen auch im Facebook-Zweig; die Ergebnisse landen in `account_metadata`, damit direkt nach dem Verbinden sichtbar ist, was Meta geliefert hat.

**4. Ehrlicher Leerzustand**
- Zeigt Meta trotz allem keine Seite, nennt der Auswahl-Dialog den gemessenen Grund (Login-Typ, Scopes, Rohanzahl der Quellen) statt einer allgemeinen Meldung. Texte in DE/EN/ES.

## Technische Details

- `supabase/functions/facebook-oauth-start/index.ts`, `supabase/functions/instagram-oauth-start/index.ts`: `config_id` verpflichtend, klarer Fehler bei fehlendem Secret, Login-Typ ins Log.
- `supabase/functions/_shared/meta-page-discovery.ts`: Token-Nachholung, Seiten ohne Token behalten, `encodeURIComponent` in `listMetaPages`, neues Diagnosefeld `pages_without_token_count`.
- `supabase/functions/oauth-callback/index.ts`: Facebook-Zweig um Long-Lived-Tausch, `fetchMetaPermissions` und Discovery-Diagnose ergänzen.
- `supabase/functions/oauth-config-check/index.ts`: Login-Typ und Konfigurations-ID ausweisen.
- `src/components/performance/FacebookPageSelectDialog.tsx` + `src/lib/translations.ts`: Leerzustand mit gemessenem Grund.
- Keine Datenbank-Änderung.

Ohne die Konfigurations-ID aus deiner Meta-App kann ich Punkt 1 nur vorbereiten, nicht scharf schalten — Punkte 2–4 wirken sofort.
