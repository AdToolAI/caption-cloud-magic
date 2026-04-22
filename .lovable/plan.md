
## Instagram auf dieselbe Verbindungslogik wie Facebook umstellen

Ja — die Pipeline lässt sich übertragen. Der wichtigste Unterschied aktuell ist:

- **Facebook** speichert nach OAuth erst nur den Meta/Facebook-User-Grant und zeigt **danach** den Page-Chooser.
- **Instagram** versucht im Callback schon sofort die finale IG-Business-Verbindung zu bauen, indem direkt über `/me/accounts` die erste passende Seite/IG-Verknüpfung aufgelöst wird.

Dadurch fühlt sich Facebook stabil an, während Instagram viel stärker vom bereits gemerkten Meta-App-Grant und der automatischen Kontenauflösung abhängt.

## Ziel
Instagram soll denselben Ablauf wie Facebook bekommen:

```text
Connect Instagram
→ Meta/Facebook Login/Continue
→ zurück in die App
→ Seitenauswahl
→ aus gewählter Seite verknüpftes Instagram Business laden
→ Instagram-Verbindung speichern
```

## Was ich ändern werde

### 1. Instagram-Callback auf „pending selection“ umstellen
**Datei:** `supabase/functions/oauth-callback/index.ts`

Statt bei `provider=instagram` sofort `getInstagramBusinessAccountInfo(...)` aufzurufen und die erste passende Seite automatisch zu nehmen, stelle ich den Flow auf das Facebook-Muster um:

- nach Token-Exchange wird zunächst nur der **Meta-User-Zugang** gespeichert
- die Instagram-Verbindung wird mit `selection_required: true` angelegt
- zusätzlich speichere ich in `account_metadata`, dass es ein **Instagram-Connect im Auswahlzustand** ist

Beispielrichtung:
- `account_type: 'instagram_pending'`
- `selection_required: true`
- optional `connection_stage: 'awaiting_page_selection'`

Damit wird Instagram nicht mehr im Callback „blind fertiggebaut“.

### 2. Instagram-Seitenauswahl wie bei Facebook einführen
**Betroffene Dateien:**
- `src/components/performance/FacebookPageSelectDialog.tsx`
- `supabase/functions/facebook-list-pages/index.ts`
- `supabase/functions/facebook-select-page/index.ts`

Ich übertrage das bestehende Facebook-Pattern auf Instagram:

#### Variante der Umsetzung
Ich generalisiere den bestehenden Facebook-Dialog zu einem Meta-Dialog statt zwei komplett getrennte UIs zu pflegen.

Der Dialog bekommt einen Modus:
- `mode="facebook"`
- `mode="instagram"`

#### Verhalten im Instagram-Modus
- listet Facebook-Seiten des verbundenen Meta-Users
- markiert oder filtert nur Seiten, die ein `instagram_business_account` haben
- zeigt klare Meldung, wenn eine Seite **kein** verknüpftes Instagram-Business-Konto hat

### 3. Instagram-Finalisierung aus der gewählten Facebook-Seite ableiten
**Neue oder angepasste Serverlogik:**
- entweder neues `instagram-select-page`
- oder bestehendes `facebook-select-page` zu einer Meta-Funktion erweitern

Bei Auswahl einer Seite passiert dann serverseitig:

1. Page Access Token der gewählten Seite verwenden
2. `instagram_business_account` der Seite laden
3. IG-Profil über Graph laden:
   - `id`
   - `username`
   - `profile_picture_url`
   - `followers_count`
   - `media_count`
4. Page Access Token verschlüsselt speichern
5. bestehende `instagram`-Connection fertig aktualisieren:
   - `account_id = ig_business_id`
   - `account_name = @username`
   - `selection_required = false`
   - `connected_via = 'oauth_user_token'`
   - `page_id`
   - `page_access_token_encrypted`

Damit entsteht dieselbe saubere Zweistufen-Logik wie bei Facebook.

### 4. Connect-UI auf denselben Ablauf umstellen
**Datei:** `src/components/performance/ConnectionsTab.tsx`

Nach erfolgreichem Instagram-Callback soll die App:

- nicht sofort syncen
- nicht davon ausgehen, dass die Verbindung final fertig ist
- stattdessen den neuen Auswahl-Dialog öffnen, genau wie bei Facebook

Also:
- `connected === 'instagram' && status === 'success'`
- wenn `selection_required === true` → Dialog öffnen
- erst nach Seitenauswahl als vollständig verbunden markieren

### 5. Revoke-/Disconnect-Flow kompatibel halten
**Dateien:**
- `supabase/functions/instagram-oauth-revoke/index.ts`
- ggf. `src/components/account/LinkedAccountsCard.tsx`
- ggf. `src/components/performance/ConnectionsTab.tsx`

Der Hard-Reset bleibt bestehen, aber ich passe ihn an den neuen staged Flow an:

- auch „pending“ Instagram-Verbindungen werden korrekt entfernt
- Meta-App-Grant bleibt beim Disconnect weiterhin sauber widerrufen
- UI meldet klar, ob nur lokal gelöscht oder Meta-seitig wirklich zurückgesetzt wurde

## Warum Facebook „funktioniert“, Instagram aber nicht
Weil Facebook aktuell diesen robusteren Ablauf hat:

```text
OAuth erfolgreich
→ User-Token speichern
→ Nutzer wählt Seite explizit
→ Seite wird final verbunden
```

Instagram macht derzeit eher das:

```text
OAuth erfolgreich
→ sofort automatisch erste passende IG-Page-Verknüpfung suchen
→ direkt final speichern
```

Das ist fehleranfälliger und gibt dem Nutzer keinen sichtbaren Zwischenschritt wie bei Facebook.

## Wichtige Erwartung
Ich kann die **App-Pipeline** exakt an Facebook angleichen.

Was ich **nicht garantieren** kann:
- dass Meta/Facebook den allerersten externen Screen visuell immer exakt gleich zeigt

Der Screen
```text
You previously logged into ...
```
kommt von Meta selbst. Den kontrollieren wir nicht vollständig.

Aber:
- der **Flow in unserer App**
- die **Schrittfolge**
- die **Seitenauswahl**
- die **finale Instagram-Auflösung**

kann ich auf dieselbe robuste Logik wie Facebook umstellen.

## Betroffene Dateien
- `supabase/functions/oauth-callback/index.ts`
- `src/components/performance/ConnectionsTab.tsx`
- `src/components/performance/FacebookPageSelectDialog.tsx`
- `supabase/functions/facebook-list-pages/index.ts`
- `supabase/functions/facebook-select-page/index.ts`
- ggf. neue Funktion für Instagram-Finalisierung statt Facebook-Select zu überladen
- ggf. kleine Anpassung in `supabase/functions/instagram-oauth-start/index.ts`

## Risiko
- gering bis mittel
- keine Migration notwendig, solange der Auswahlzustand in `account_metadata` gespeichert wird
- größter Vorteil: Instagram wird nicht mehr im Callback automatisch „erraten“, sondern wie Facebook sauber finalisiert

## Test nach Umsetzung
1. Instagram trennen
2. erneut auf **Connect Instagram**
3. Meta/Facebook-Dialog durchlaufen
4. zurück zur App
5. prüfen, dass jetzt ein **Seitenauswahl-Dialog** erscheint
6. Seite mit verknüpftem Instagram-Business wählen
7. prüfen, dass danach die Instagram-Verbindung korrekt gespeichert und angezeigt wird
8. prüfen, dass Fälle ohne verknüpftes IG-Konto sauber abgefangen werden
