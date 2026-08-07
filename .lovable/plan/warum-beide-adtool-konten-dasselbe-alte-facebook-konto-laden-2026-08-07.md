# Warum beide AdTool-Konten dasselbe alte Facebook-Konto laden

## Was gesichert ist (aus dem Code gelesen)

- `facebook-oauth-start` bindet den Login an den angemeldeten AdTool-Nutzer: `user_id` steckt im `state`, die `oauth_states`-Zeile wird pro Nutzer geschrieben. Es gibt keinen gemeinsamen Cache, aus dem ein „altes Konto" nachgeladen würde.
- Die Dialog-URL enthält nur `client_id`, `redirect_uri`, `state`, `scope` und `auth_type=rerequest`. **Kein Parameter, der Facebook zwingt, das Konto neu zu wählen.**

Daraus folgt: Welches Facebook-Konto im Dialog erscheint, entscheidet allein die **Facebook-Browser-Session** (Cookies auf facebook.com), nicht dein AdTool-Login. Beide AdTool-Konten sitzen im selben Browser → beide sehen dasselbe eingeloggte Facebook-Profil mit dessen 2 Seiten. `auth_type=rerequest` erzwingt nur den Berechtigungs-Dialog erneut, **nicht** einen Kontowechsel.

Nicht geprüft und deshalb nicht behauptet: ob im Callback anschließend Daten falsch zugeordnet werden. Das wird in Schritt 3 gemessen.

## Schritt 1: Kontowechsel im Dialog ermöglichen

Im Verbindungsbereich zwei klar getrennte Aktionen statt einem Button:

- „Verbinden" — wie bisher.
- „Mit anderem Facebook-Konto verbinden" — führt zuerst über Facebooks eigene Konto-Umschaltung (`https://www.facebook.com/login.php?next=<Dialog-URL>`), sodass Facebook die Anmeldemaske zeigt, statt still das gemerkte Profil zu verwenden.

Dazu ein Hinweistext direkt im Dialogbereich: Facebook merkt sich das Profil im Browser; für ein anderes Profil bei Facebook abmelden oder ein privates Fenster nutzen.

## Schritt 2: Anzeigen, mit welchem Facebook-Profil verbunden wurde

Nach dem Connect zeigt die Verbindungskarte Facebook-Name + Facebook-User-ID der Verbindung. Damit ist sofort sichtbar, ob versehentlich wieder das alte Profil verbunden wurde — heute sieht man das erst an den Seiten.

## Schritt 3: Prüfen, ob die Zuordnung stimmt

Mit dem bereits gebauten Protokoll (`meta_oauth_diagnostics`): nach je einem Connect pro AdTool-Konto vergleichen, ob `user_id` (AdTool) und Facebook-User-ID paarweise korrekt sind. Falls dort dieselbe AdTool-`user_id` für beide Sitzungen auftaucht, liegt doch ein Zuordnungsfehler vor — dann folgt ein eigener Fix.

## Technische Details

- `supabase/functions/facebook-oauth-start/index.ts` und `instagram-oauth-start/index.ts`: optionaler Body-Parameter `forceAccountChooser`; ist er gesetzt, wird die zurückgegebene URL als `https://www.facebook.com/login.php?next=<encodeURIComponent(dialogUrl)>` gebaut. Scopes, `state` und `auth_type` bleiben unverändert.
- `src/components/performance/ConnectionsTab.tsx` (bzw. die Facebook/Instagram-Karten darin): zweite Aktion „Mit anderem Konto verbinden" + Hinweistext.
- Verbindungskarte zeigt `platform_username` / Meta-User-ID aus `social_connections`.
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Datenbank-Änderung, keine Änderung an Scopes oder am Token-Tausch.
