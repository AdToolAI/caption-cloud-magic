
Problem erkannt: Der neue Seiten-Auswahl-Flow ist zwar teilweise eingebaut, wird aber im echten Callback offenbar nicht erreicht. Deshalb siehst du weiter nur den bereits gespeicherten Seitennamen.

Was ich im Code gefunden habe:
- Der Dialog `FacebookPageSelectDialog` existiert und ist in `src/components/performance/ConnectionsTab.tsx` eingebunden.
- Der Dialog öffnet nur im Branch `status === 'success'`.
- Der allgemeine OAuth-Callback `supabase/functions/oauth-callback/index.ts` redirectet aber aktuell mit `?connected=facebook` nach `/performance` statt mit `?provider=facebook&status=success&tab=connections`.
- Zusätzlich speichert derselbe Callback für Facebook schon sofort die erste gefundene Seite aus `/me/accounts` als Verbindung. Damit ist die Auswahl technisch schon vorweggenommen.

Warum du deshalb nur den Namen siehst:
1. Nach OAuth landest du auf der Overview/Performance-Seite statt sicher im Connections-Flow.
2. Der Callback schreibt bereits die erste Seite in `social_connections`.
3. Die UI zeigt dann nur `connection.account_name` auf der Karte an.
4. Der Auswahl-Dialog wird gar nicht oder nicht zuverlässig geöffnet.

Implementierungsplan:
1. OAuth-Redirect für Facebook korrigieren
- Den Facebook-Callback so anpassen, dass er nach erfolgreichem Connect auf die Connections-Ansicht mit eindeutigen Success-Parametern zurückleitet.
- Ziel: der bestehende `status === 'success'`-Pfad in `ConnectionsTab` wird sicher ausgelöst.

2. Facebook-Callback auf “User-Token zuerst, Seitenwahl danach” umstellen
- Im Callback für Facebook nicht mehr sofort die erste Seite auswählen.
- Stattdessen den Facebook User Access Token speichern, plus Metadaten wie `selection_required: true`.
- `account_name` zunächst generisch setzen, z. B. „Facebook account connected“ oder den Facebook-Namen, aber nicht schon eine konkrete Seite.

3. Seiten-Auswahl sauber finalisieren
- `facebook-list-pages` weiter nutzen, aber auf Basis des gespeicherten User-Tokens die komplette Seitenliste laden.
- Bei Auswahl im Dialog nicht nur `account_name` und `account_id` setzen, sondern auch:
  - das ausgewählte Page Access Token speichern/ersetzen
  - `selection_required` auf false setzen
  - optional zusätzliche Seiten-Metadaten speichern (Kategorie, Bild-URL)

4. Verbindungs-Karte für Facebook verbessern
- Solange noch keine Seite gewählt wurde, statt nur eines Namens einen klaren Zustand anzeigen:
  - „Page selection required“
  - Button „Choose Page“
- Nach Auswahl:
  - Seitenname anzeigen
  - optional kleine Zusatzinfo wie Kategorie oder Page-ID-Shortform anzeigen
- Damit ist für den Reviewer sichtbarer, dass wirklich eine Auswahl stattgefunden hat.

5. Sync-Verhalten anpassen
- Für Facebook kein automatisches `handleSync(...)`, bevor eine Seite ausgewählt wurde.
- Erst nach erfolgreicher Seitenauswahl Sync erlauben/triggern, damit keine falsche oder zufällige Seite verwendet wird.

6. End-to-End prüfen
- Flow testen:
  - Facebook Connect
  - Redirect zurück in Connections
  - Dialog öffnet
  - mehrere Seiten werden gelistet
  - Auswahl speichert korrekt
  - Karte zeigt gewählte Seite
- Danach kann der Screencast für `pages_show_list` sauber aufgenommen werden.

Betroffene Dateien:
- `supabase/functions/oauth-callback/index.ts`
- `supabase/functions/facebook-list-pages/index.ts`
- `src/components/performance/ConnectionsTab.tsx`
- `src/components/performance/FacebookPageSelectDialog.tsx`

Technische Details:
- Aktuelle Hauptursache ist der Mismatch zwischen Callback-Redirect und Frontend-Callback-Logik.
- Zweite Hauptursache ist, dass Facebook im Callback schon `pagesData.data[0]` auswählt.
- Für `pages_show_list` ist es besser, erst den User zu verbinden und dann explizit eine Seite in der UI auswählen zu lassen.
- Optional kann `account_metadata` genutzt werden für:
  - `selection_required`
  - `selected_page_category`
  - `selected_page_picture_url`

Ergebnis nach Umsetzung:
- Nicht mehr nur „der Name“ auf der Karte
- Stattdessen ein echter, sichtbarer Schritt mit Seitenliste und Auswahl
- Das ist deutlich review-sicherer für `pages_show_list`
