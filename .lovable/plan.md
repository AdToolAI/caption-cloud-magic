
## Instagram meldet fälschlich „keine Instagram-fähigen Seiten“ – gezielter Fix

### Was das eigentliche Problem ist
Der aktuelle Flow erkennt eine Seite nur dann als „Instagram-fähig“, wenn Meta bereits direkt in der `/me/accounts`-Antwort ein verknüpftes `instagram_business_account` oder `connected_instagram_account` mitsendet.

Genau das ist hier sehr wahrscheinlich die falsche Annahme:
- Im Meta-Dialog wurden Instagram-Accounts und Seiten ausgewählt.
- Trotzdem meldet die App „keine Instagram-fähigen Seiten“.
- Das spricht dafür, dass Meta die Verknüpfung **nicht zuverlässig inline in `/me/accounts`** liefert, obwohl die Verknüpfung existiert.

Die App klassifiziert dadurch reale, gültige Seiten als „nicht IG-fähig“.

### Ziel
Die Erkennung muss nicht mehr nur auf der groben `/me/accounts`-Antwort basieren, sondern jede gefundene Seite zusätzlich per **Seiten-Detail-Request** prüfen. Dadurch werden echte verknüpfte Instagram-Business-Accounts korrekt erkannt.

## Umsetzung

### 1. Robuste Meta-Page-Discovery als gemeinsame Logik bauen
**Dateien:**
- `supabase/functions/facebook-list-pages/index.ts`
- `supabase/functions/oauth-callback/index.ts`
- `supabase/functions/facebook-select-page/index.ts`

**Änderung:**
Eine gemeinsame Discovery-Logik verwenden:

```text
/me/accounts
→ alle Seiten laden
→ pro Seite mit page access token prüfen:
   /{page_id}?fields=instagram_business_account,connected_instagram_account
→ daraus has_instagram / instagram_business_account_id ableiten
```

Wichtig:
- Nicht mehr nur die Inline-Felder aus `/me/accounts` vertrauen
- Bei Instagram immer einen zweiten Prüf-Schritt pro Seite machen
- Prüfungen parallel mit `Promise.allSettled` ausführen, damit es trotz mehrerer Seiten schnell bleibt

### 2. `facebook-list-pages` auf echte Verifikation umstellen
**Datei:**
- `supabase/functions/facebook-list-pages/index.ts`

**Änderung:**
- Erst alle Pages über `/me/accounts` laden
- Dann für Instagram jede Seite einzeln gegen den Page-Node prüfen
- Erst danach `has_instagram` und `status` berechnen

Neue Erwartung:
- `pages_found_but_no_instagram_link` nur dann zurückgeben, wenn die zweite Prüfung wirklich für alle Seiten negativ war
- Wenn mindestens eine Seite positiv ist, diese korrekt in der Liste anzeigen
- Wenn nur eine Seite positiv ist, `single_instagram_page`
- Wenn mehrere positiv sind, `multiple_instagram_pages`

### 3. Auto-Resolve im OAuth-Callback auf dieselbe Logik umstellen
**Datei:**
- `supabase/functions/oauth-callback/index.ts`

**Änderung:**
`tryAutoResolveInstagram()` darf nicht mehr nur auf die Inline-IG-Felder aus `/me/accounts` schauen.

Stattdessen:
- dieselbe verlässliche Seitenprüfung verwenden wie in `facebook-list-pages`
- wenn genau eine Seite nach echter Verifikation IG-fähig ist:
  - sofort auto-select
- wenn mehrere oder keine:
  - sauber in den manuellen Auswahlflow fallen

Damit werden Auto-Connect und manueller Dialog endlich konsistent.

### 4. `facebook-select-page` auf denselben Resolver vereinheitlichen
**Datei:**
- `supabase/functions/facebook-select-page/index.ts`

**Änderung:**
Die Funktion ist bereits näher an der richtigen Lösung, weil sie pro Seite prüft. Diese Logik soll mit derselben Discovery-/Resolver-Strategie vereinheitlicht werden, damit:

- Listing
- Auto-Resolve
- finale Auswahl

alle exakt dieselbe Meta-Auswertung benutzen.

So wird verhindert, dass:
- eine Seite im Dialog als „ungültig“ erscheint,
- aber beim finalen Auswählen eigentlich funktionieren würde.

### 5. Dialog-UX an den echten Prüfstatus anpassen
**Datei:**
- `src/components/performance/FacebookPageSelectDialog.tsx`

**Änderung:**
Den leeren Fehlerzustand nur noch dann zeigen, wenn die Backend-Prüfung wirklich abgeschlossen ist.

Optional verbessern:
- während der Verifikation Text wie „Verknüpfte Instagram-Konten werden geprüft…“
- wenn Seiten existieren, aber keine erfolgreich verifiziert werden:
  - klare Meldung, dass die Seiten gefunden wurden, aber Meta für keine Seite ein verknüpftes IG-Business-Konto bestätigt hat
- wenn Seiten verifiziert werden:
  - echte Liste anzeigen, statt pauschal „keine Instagram-fähige Seite gefunden“

## Warum das sehr wahrscheinlich die richtige Lösung ist
Die Screenshots zeigen, dass Meta im Consent-Flow sowohl:
- Instagram Professional Accounts
- als auch die Pages

bereits kennt und auswählbar macht. Das Problem liegt daher sehr wahrscheinlich **nicht** daran, dass es gar keine Verknüpfung gibt, sondern daran, dass der aktuelle Code die Verknüpfung an der falschen Stelle prüft.

## Betroffene Dateien
- `supabase/functions/facebook-list-pages/index.ts`
- `supabase/functions/oauth-callback/index.ts`
- `supabase/functions/facebook-select-page/index.ts`
- `src/components/performance/FacebookPageSelectDialog.tsx`

Optional, falls zur Wiederverwendung sinnvoll:
- `supabase/functions/_shared/meta-page-discovery.ts`

## Technische Details
- Kein Datenbank-Schema-Change nötig
- Kein Auth-Umbau nötig
- Kein UI-Redesign nötig
- Kernfix ist eine robustere Meta-API-Auswertung
- Bestehende `missing_scopes`-Logik bleibt sinnvoll, ist aber nicht die Hauptursache dieses Fehlers

## Ergebnis nach dem Fix
Der Flow soll danach so aussehen:

```text
Instagram verbinden
→ Meta OAuth
→ Rückkehr in die App
→ echte Seitenprüfung pro Facebook-Seite
→ entweder:
   A) genau 1 verknüpfte IG-Seite → sofort verbunden
   B) mehrere verknüpfte IG-Seiten → korrekte Auswahl im Dialog
   C) keine verknüpfte IG-Seite → klare, echte Fehlermeldung
```

## Test
1. Bestehende Instagram-Verbindung trennen
2. Instagram neu verbinden
3. Im Meta-Dialog Instagram-Konten und Seiten auswählen, alle Toggles aktiv lassen
4. Erwartung:
   - die App erkennt die verknüpfte Seite jetzt korrekt
   - kein falscher „keine Instagram-fähige Seite“-Fehler mehr
5. Danach Sync starten und prüfen, dass echte Instagram-Daten geladen werden
