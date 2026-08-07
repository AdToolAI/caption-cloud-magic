# Befund aus dem Test — und was jetzt zu tun ist

## Gemessen (Diagnose-Tabelle, nicht vermutet)

Die beiden verglichenen Versuche gehören zu **zwei verschiedenen Facebook-Profilen**. Der Kontowechsel hat also funktioniert.

| | Versuch A (22:33) | Versuch B (21:08) |
|---|---|---|
| Meta-Profil-ID | 122116259151337304 | 122337042788329815 |
| `business_management` erteilt | **nein** | ja |
| `/me/accounts` | 200, **0 Seiten** | 200, 2 Seiten |
| `/me/businesses` | 400 „Missing Permission" | 200, 3 Portfolios |
| Seiten gefunden | 0 | 2 |

Alle bisherigen Versuche mit Profil `…337304` liefern konstant 2 Seiten, alle Versuche mit Profil `…337304`-Gegenstück `…151337304` konstant 0 Seiten und **nie** `business_management`.

## Die Ursache

Beim Profil `…151337304` steht `business_management` nicht in `granted_scopes`, aber auch nicht in `declined_scopes` — Meta hat die Berechtigung im Dialog also gar nicht erst zur Entscheidung gestellt bzw. eine ältere, unvollständige Zustimmung stillschweigend wiederverwendet. Ohne diese Berechtigung ist der Business-Pfad blockiert (400) und `/me/accounts` liefert für dieses Profil zusätzlich 0 Seiten, weil im Dialog keine Seite für den Zugriff ausgewählt wurde.

Das ist kein Fehler unseres Abrufs und kein Cache: derselbe Code liefert für das andere Profil im selben Moment 2 Seiten.

## Umsetzung

1. **Ehrlicher Fehlzustand statt stiller Erfolgsmeldung**
   Wenn nach dem Callback `business_management` fehlt oder 0 Seiten geliefert werden, zeigt die Verbindungskarte einen klaren Befund: verbundenes Meta-Profil (Name + maskierte ID), fehlende Berechtigung, 0 Seiten — plus Button „Zustimmung zurücksetzen und neu verbinden". Kein „verbunden" ohne nutzbare Seite.

2. **Zustimmung wirklich erzwingen**
   `auth_type=rerequest` reicht nachweislich nicht. Der Reconnect-Weg führt künftig zuerst auf Facebooks Seite für App-Berechtigungen (`facebook.com/settings?tab=applications`) mit Anleitung, die App „AdTool AI" dort für dieses Profil zu entfernen, und startet danach den Login neu. Damit zeigt Meta zwingend den vollständigen Dialog inklusive Business- und Seitenauswahl.

3. **Seitenauswahl im Dialog sichtbar machen**
   Vor dem Verbinden ein kurzer, nicht überspringbarer Hinweis: Im Meta-Dialog müssen im Schritt „Welche Seiten möchtest du verwenden?" die Seiten explizit angehakt werden — „Weiter" ohne Auswahl erzeugt genau dieses Ergebnis.

4. **Abnahme**
   Erneuter Connect mit Profil `…151337304` nach App-Entfernung. Erfolgskriterium in der Diagnose: `business_management` in `granted_scopes` **und** `me_accounts_count > 0`. Bleibt es bei 0 Seiten trotz vollständiger Zustimmung, ist bewiesen, dass dieses Profil bei Meta keine Seite administriert — dann ist die Sache auf Meta-Seite zu klären, nicht im Code.

## Technische Details

- `supabase/functions/oauth-callback/index.ts`: fehlende Scopes und Seitenanzahl als Ergebnisstatus zurückgeben statt pauschalem Erfolg.
- `supabase/functions/facebook-oauth-start/index.ts` / `instagram-oauth-start/index.ts`: neuer Modus `resetConsent`, der die App-Berechtigungsseite als Zwischenschritt nutzt.
- `src/components/performance/ConnectionsTab.tsx`: Warn-Zustand der Verbindungskarte, Reconnect-Aktion, Vorab-Hinweis zur Seitenauswahl.
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Datenbankänderung, keine Scope-Änderung.
