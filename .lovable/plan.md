# Meta-Seiten sichtbar machen: Review einreichen und Alternativursachen ausschließen

## Nicht in den Development-Modus wechseln

Metas eigener Dialog warnt: beim Zurückschalten auf Live kann ein Data-Access-Renewal fällig werden, das bis zu 10 Tage Prüfung kostet. Für einen reinen Beweis ist das zu teuer. Dialog mit **Cancel** schließen.

## Befund bisher

`business_management` steht auf **Standard Access** und wurde nie zur Prüfung eingereicht. Im Live-Modus wirkt Standard Access nicht — das passt zu den Rohdaten: der Scope fehlt in den erteilten Berechtigungen, `/me/businesses` antwortet mit `(#100) Missing Permission`.

Was damit noch **nicht** bewiesen ist: dass `business_management` die einzige Ursache ist. `/me/accounts` war ebenfalls leer, obwohl `pages_show_list` bereits Advanced Access hat. Das wäre bei einer Seite, die dein Profil direkt verwaltet, nicht der Fall — also gibt es mindestens eine zweite mögliche Ursache.

## Schritt 1: Review für business_management einreichen (sofort, läuft im Hintergrund)

App Review → Permissions and Features → `business_management` → *Request advanced access*. Benötigt: Anwendungsfall, Screencast des Verbindungsflusses, aktive Datenschutz-URL. Das ist ohnehin nötig, sobald Kunden Seiten aus einem Business-Portfolio verbinden wollen — unabhängig davon, ob es dein aktuelles Problem löst.

## Schritt 2: Die Alternativursachen prüfen — jede in 2 Minuten, ohne Wartezeit

Wenn nicht `business_management` schuld ist, kommen genau diese vier Ursachen in Frage. Sie erzeugen dasselbe Symptom (leere Seitenliste), lassen sich aber sofort unterscheiden:

**A) Dein Facebook-Profil verwaltet die Seite gar nicht.**
Die wahrscheinlichste Alternative. `pages_show_list` hat Advanced Access und liefert trotzdem null Seiten — das passiert genau dann, wenn das eingeloggte Profil keine Seitenrolle hat. Prüfen: Meta Business Suite → Einstellungen → Seiten → „AdTool AI" → Personen. Steht dein Profil dort mit Vollzugriff? Falls nein: hinzufügen. Das löst das Problem sofort und ohne Review.

**B) Du warst mit einem anderen Meta-Profil eingeloggt.**
Die Probe zeigt Nutzer-ID `122116259151337304`. Der historisch erfolgreiche Instagram-Post im Mai lief über eine andere Identität (`17841477402452109`). Prüfen: im Login-Dialog oben rechts anzeigen lassen, mit welchem Konto du zustimmst.

**C) Es gibt keine Facebook-Seite, nur ein persönliches Profil.**
Instagram-Publishing verlangt zwingend eine echte Seite. Prüfen: Business Suite → Einstellungen → Seiten — ist „AdTool AI" dort als Seite gelistet?

**D) Kein „Facebook Login for Business"-Konfigurations-ID im Einsatz.**
Ohne `config_id` zeigt Meta bei manchen Apps den Asset-Auswahlschritt nicht an — dann bleiben `granular_scopes` ohne `target_ids`, exakt wie in deiner Probe. Prüfen: App → Facebook Login for Business → Konfigurationen. Gibt es dort eine aktive Konfiguration, hinterlegen wir ihre ID als Secret; der Code unterstützt sie bereits.

Die Reihenfolge ist bewusst: A und C kosten zusammen zwei Minuten und schließen den häufigsten Fall aus, bevor du auf ein Review wartest.

## Schritt 3: Code an die reale Freigabelage anpassen

Unabhängig vom Ausgang: aktuell fordern beide Login-Funktionen `business_management` an, obwohl es im Live-Modus wirkungslos ist.

- Der Scope wird an einen Freigabe-Schalter gekoppelt und erst mitgeschickt, wenn Advanced Access erteilt ist.
- `META_LOGIN_CONFIG_ID` wird ausgewertet, sobald du eine Business-Login-Konfiguration hast.
- Der Verbindungsbereich nennt den echten Grund statt einer leeren Liste: fehlende Seitenrolle, fehlende Berechtigung oder fehlende Asset-Zuordnung — jeweils mit passender Handlungsanweisung.

## Technische Details

- `supabase/functions/instagram-oauth-start/index.ts`, `supabase/functions/facebook-oauth-start/index.ts`: Scope-Satz an Freigabe-Schalter koppeln, `config_id` durchreichen, `auth_type=rerequest` beibehalten.
- `supabase/functions/_shared/meta-page-discovery.ts`: `(#100) Missing Permission` und „null Seiten trotz Advanced Access" als zwei getrennte, benannte Diagnosegründe führen.
- `supabase/functions/facebook-list-pages/index.ts`: diese Gründe an die UI durchreichen.
- `src/components/performance/FacebookPageSelectDialog.tsx`, `src/components/performance/MetaPageProbePanel.tsx`: Leer-Zustand und Befund um die vier Ursachen erweitern.
- `src/lib/translations.ts`: Texte DE/EN/ES.
- Keine Datenbank-Änderung.
