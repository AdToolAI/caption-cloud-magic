
## Instagram-Page-Select sauber reparieren

### Aktuell bestätigtes Problem
Der Instagram-OAuth-Callback legt die Verbindung nur als `instagram_pending` an, und danach findet die App keine auswählbare Seite für die Finalisierung.

Aus dem aktuellen Stand ist klar:
- die Instagram-Connection wird angelegt
- sie bleibt auf `selection_required: true`
- der Auto-Resolve findet `0` IG-fähige Seiten
- der Dialog zeigt denselben Fehlertext sowohl bei
  - fehlendem Page-Zugriff als auch bei
  - fehlender Instagram-Verknüpfung

Damit ist die Fehlermeldung momentan zu unscharf, und die Backend-Logik ist zu strikt.

### Wahrscheinliche Ursache im Code
Die aktuelle Implementierung prüft nur auf `instagram_business_account` und behandelt `0 Seiten`, `0 IG-Verknüpfungen` und „Meta hat die Page-Rechte nicht wirklich geliefert“ praktisch gleich. Dadurch landet der Nutzer immer wieder in derselben Sackgasse, obwohl er im Meta-Dialog Seiten angeklickt hat.

## Was umgesetzt wird

### 1. Page-Discovery robuster machen
**Dateien:**
- `supabase/functions/facebook-list-pages/index.ts`
- `supabase/functions/oauth-callback/index.ts`

**Änderung:**
- Beim Laden der Pages nicht nur `instagram_business_account`, sondern auch alternative Meta-Link-Felder berücksichtigen, falls Meta die Verknüpfung anders zurückliefert.
- Zusätzlich unterscheiden zwischen:
  - `no_pages_access` → `/me/accounts` liefert gar keine Seiten
  - `pages_found_but_no_instagram_link` → Seiten da, aber keine IG-Verknüpfung
  - `single_instagram_page` → Auto-Select möglich
  - `multiple_instagram_pages` → Dialog anzeigen

### 2. Granted Permissions explizit prüfen
**Dateien:**
- `supabase/functions/oauth-callback/index.ts`
- `supabase/functions/facebook-list-pages/index.ts`

**Änderung:**
- Nach dem Meta-Login `/me/permissions` auswerten
- fehlende Scopes wie `pages_show_list`, `pages_read_engagement`, `instagram_basic` klar erkennen
- die Information in `account_metadata` hinterlegen, damit die UI weiß, ob wirklich ein Link-Problem oder ein Berechtigungsproblem vorliegt

### 3. Re-Consent zuverlässig erzwingen, wenn Page-Rechte fehlen
**Datei:**
- `src/components/performance/ConnectionsTab.tsx`

**Änderung:**
- Wenn die letzte Instagram-Verbindung fehlende Page-Scopes zeigt, den nächsten Connect-Versuch mit `auth_type=rerequest` starten
- damit Meta den Berechtigungsdialog erneut vollständig zeigt, statt frühere Ablehnungen still weiterzuverwenden

### 4. Dialog-UX korrigieren
**Datei:**
- `src/components/performance/FacebookPageSelectDialog.tsx`

**Änderung:**
- nicht mehr pauschal „Keine Facebook-Seite mit verknüpftem Instagram Business-Konto gefunden“ anzeigen
- stattdessen drei getrennte Hinweise:
  1. **Keine Seitenfreigabe erhalten**
  2. **Seiten gefunden, aber kein verknüpftes Instagram-Profil**
  3. **Seiten gefunden** → Liste anzeigen
- optionaler CTA: „Instagram erneut verbinden“

### 5. Finalisierung für Instagram-Select absichern
**Datei:**
- `supabase/functions/facebook-select-page/index.ts`

**Änderung:**
- dieselbe erweiterte IG-Link-Erkennung wie in der Listing-/Callback-Logik verwenden
- damit eine Seite, die in der Liste als gültig erscheint, auch wirklich finalisiert werden kann

## Erwartetes Ergebnis
Nach dem Fix gibt es keinen irreführenden Sammelfehler mehr:

```text
Meta-Login
→ Rückkehr in die App
→ entweder:
   A) Auto-Connect bei genau 1 gültiger Seite
   B) Page-Select mit echten auswählbaren Seiten
   C) klarer Hinweis: Rechte fehlen / IG nicht verknüpft
```

## Betroffene Dateien
- `supabase/functions/oauth-callback/index.ts`
- `supabase/functions/facebook-list-pages/index.ts`
- `supabase/functions/facebook-select-page/index.ts`
- `src/components/performance/FacebookPageSelectDialog.tsx`
- `src/components/performance/ConnectionsTab.tsx`

## Technische Details
- Kein Datenbank-Schema-Change nötig
- Bestehende `social_connections`-Zeilen bleiben nutzbar
- Die Reparatur ist hauptsächlich:
  - bessere Meta-Antwort-Auswertung
  - bessere Fehlerklassifizierung
  - gezielter Re-Consent statt blindem Retry

## Test nach Umsetzung
1. Bestehende Instagram-Connection trennen
2. Instagram neu verbinden
3. Im Meta-Dialog alle nötigen Toggles aktivieren
4. Erwartung:
   - bei genau 1 gültiger Seite: sofort verbunden
   - bei mehreren: korrekte Seitenauswahl
   - bei fehlenden Rechten: klarer Re-Consent-Hinweis statt falscher „keine Seite gefunden“-Meldung
5. Danach Sync starten und prüfen, dass echte IG-Daten geladen werden
