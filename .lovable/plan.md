
## Instagram-Page-Discovery gezielt nachschärfen

### Was jetzt klar ist
Der aktuelle Fix für die Inline-IG-Felder greift bereits, aber der Fehler bleibt bestehen. Die neuesten Daten zeigen:

- die Instagram-Verbindung wird erfolgreich als `instagram_pending` gespeichert
- die nötigen bisherigen Scopes sind bereits vorhanden (`pages_show_list`, `pages_read_engagement`, `instagram_basic`, etc.)
- `missing_page_scopes` ist leer
- trotzdem meldet `tryAutoResolveInstagram` weiterhin `verified IG-capable page count: 0`

Damit ist das Problem sehr wahrscheinlich **nicht mehr**:
- fehlende Toggles im Consent-Dialog
- nur ein UI-Fehlertext
- nur fehlende Inline-Felder in `/me/accounts`

Der wahrscheinliche Engpass liegt jetzt tiefer in der Meta-Auswertung:
1. entweder liefert `/me/accounts` für diesen Account gar keine nutzbaren Seiten zurück  
2. oder die Seiten kommen zurück, aber Meta liefert für diese Seiten weder eine nutzbare IG-Verknüpfung noch verwertbare Page-Tokens  
3. oder die Seite ist business-verwaltet und wird unter neueren Graph-Versionen nur eingeschränkt geliefert

Web-/Doku-Hinweise deuten zusätzlich darauf hin, dass Meta bei business-gebundenen Seiten inzwischen teils restriktiver ist.

## Ziel
Den Fehler nicht mehr „blind“ als „keine Instagram-fähige Seite“ zu behandeln, sondern den echten Backend-Fall sauber zu erkennen und den Resolver entsprechend robuster zu machen.

## Umsetzung

### 1. Meta-Discovery hart instrumentieren
**Datei:** `supabase/functions/_shared/meta-page-discovery.ts`

Es werden gezielte Diagnosefelder und Logs ergänzt:

- Anzahl Seiten aus `/me/accounts`
- für jede Seite:
  - `id`, `name`
  - ob `access_token` vorhanden ist
  - ob Inline-IG-Felder vorhanden sind
  - Ergebnis des Detail-Checks
  - konkreter Fehlerbody bei fehlgeschlagenem Page-Node-Request
- Rückgabe um Debug-Metadaten erweitern, z. B.:
  - `pages_found_count`
  - `verified_instagram_count`
  - `page_verify_failures`
  - `meta_discovery_mode`

Damit wird sichtbar, **ob überhaupt Seiten kommen** oder **ob die Verifikation scheitert**.

### 2. Statusmodell präzisieren
**Dateien:**
- `supabase/functions/_shared/meta-page-discovery.ts`
- `supabase/functions/facebook-list-pages/index.ts`
- `supabase/functions/oauth-callback/index.ts`

Die aktuelle Klassifizierung wird erweitert, damit diese Fälle getrennt werden:

```text
no_pages_found
pages_found_but_verification_failed
pages_found_but_no_instagram_link
single_instagram_page
multiple_instagram_pages
meta_pages_hidden_or_unavailable
```

Wichtig:
- `pages_found_but_no_instagram_link` nur dann, wenn Seiten wirklich da sind und Meta explizit keine IG-Verknüpfung bestätigt
- `pages_found_but_verification_failed`, wenn die Detail-Requests pro Seite fehlschlagen
- `meta_pages_hidden_or_unavailable`, wenn Scopes okay sind, aber `/me/accounts` trotzdem leer bleibt

### 3. OAuth-Callback und Listing auf dieselben Debug-Daten umstellen
**Dateien:**
- `supabase/functions/oauth-callback/index.ts`
- `supabase/functions/facebook-list-pages/index.ts`

Beide Pfade sollen dieselbe Discovery-Antwort verwenden und zusätzlich die Diagnose in `account_metadata` mit ablegen, z. B.:

- `meta_page_discovery_status`
- `meta_pages_found_count`
- `meta_verified_instagram_count`
- `meta_page_verify_failures`
- `meta_last_discovery_at`

So sieht die UI später exakt, **warum** keine Seite gefunden wurde.

### 4. Falls nötig: Meta-Scope für business-verwaltete Seiten ergänzen
**Datei:** `src/components/performance/ConnectionsTab.tsx`

Wenn die neue Diagnose zeigt, dass `/me/accounts` trotz vorhandener Standard-Scopes leer bleibt, wird der Instagram-OAuth-Flow optional um einen zusätzlichen Meta-Scope erweitert, der für business-verwaltete Seiten relevant sein kann.

Dabei:
- nur für Instagram-Connect
- zusammen mit `auth_type=rerequest`
- klar getrennt von der normalen Re-Consent-Logik

So kann geprüft werden, ob Meta die Seiten nur wegen neuerer Business-Einschränkungen nicht zurückgibt.

### 5. Dialog-UX auf echte Backend-Ursache umstellen
**Datei:** `src/components/performance/FacebookPageSelectDialog.tsx`

Der Dialog soll nicht mehr pauschal behaupten, es gäbe keine IG-fähige Seite, sondern je nach Status:

1. **Meta gibt keine Seiten zurück**
   - Hinweis: Seiten wurden der App von Meta nicht bereitgestellt
2. **Seiten gefunden, aber Verifikation fehlgeschlagen**
   - Hinweis: Meta hat die Seiten geliefert, aber die Detailprüfung schlug fehl
3. **Seiten gefunden, aber keine IG-Verknüpfung bestätigt**
   - aktueller IG-Link-Hinweis bleibt
4. **Seiten vorhanden**
   - echte Auswahl anzeigen

Optional zusätzlich:
- kleines Diagnose-Detail im UI für Support/debugging, z. B. „0 Seiten von Meta zurückgegeben“ oder „3 Seiten gefunden, 3 Verifikationen fehlgeschlagen“

### 6. Finale Auswahl auf dieselbe Fehlerdiagnose bringen
**Datei:** `supabase/functions/facebook-select-page/index.ts`

Auch beim finalen Select sollen die Detailfehler klarer zurückgegeben werden:
- nicht nur `kein verknüpftes Instagram Business-Konto`
- sondern unterscheiden zwischen
  - Page-Node nicht lesbar
  - IG-Link fehlt
  - IG-Profil-Request fehlgeschlagen

## Erwartetes Ergebnis
Nach dem Fix gibt es zwei mögliche Ausgänge:

```text
A) Meta liefert die Seite korrekt
→ Auto-Resolve oder Select funktioniert endlich

B) Meta liefert die Seite technisch nicht an die App
→ klare, genaue Fehlermeldung statt irreführendem „keine Instagram-fähige Seite“
→ sichtbarer Hinweis, ob Business-/Meta-Scope das Problem ist
```

## Betroffene Dateien
- `supabase/functions/_shared/meta-page-discovery.ts`
- `supabase/functions/facebook-list-pages/index.ts`
- `supabase/functions/oauth-callback/index.ts`
- `supabase/functions/facebook-select-page/index.ts`
- `src/components/performance/FacebookPageSelectDialog.tsx`
- `src/components/performance/ConnectionsTab.tsx`

## Technische Details
- Kein Datenbank-Schema-Change nötig
- Kein Auth-Umbau nötig
- Kernarbeit ist:
  - tiefere Meta-Diagnostik
  - sauberere Statusklassifikation
  - optionaler Business-Fallback im OAuth-Scope
- Der nächste Fix basiert dann auf echten Meta-Rückgaben statt Vermutungen

## Test nach Umsetzung
1. Bestehende Instagram-Verbindung trennen
2. Instagram neu verbinden
3. Im Meta-Dialog alle Seiten und Instagram-Optionen aktiv lassen
4. Erwartung:
   - entweder Seite wird korrekt erkannt
   - oder die UI zeigt den exakten technischen Grund
5. Danach anhand der neuen Logs prüfen:
   - wie viele Seiten `/me/accounts` liefert
   - ob Page-Detail-Requests fehlschlagen
   - ob ein Business-/Meta-Scope-Fallback nötig ist
