
## Instagram-Review-Flow wirklich auf den vollständigen Meta-Consent umstellen

### Was aktuell schiefläuft
Der abgekürzte Bildschirm erscheint weiterhin, obwohl `auth_type=rerequest` bereits im Frontend gesetzt wird. Der Code zeigt warum:

- `src/components/performance/ConnectionsTab.tsx` baut für Instagram noch **direkt** eine Facebook-OAuth-URL im Browser
- dabei wird **nicht** der stärkere Backend-Flow `supabase/functions/instagram-oauth-start/index.ts` genutzt
- genau dort liegt aber bereits die robustere Logik:
  - Backend-Hard-Reset der alten Meta-App-Freigabe
  - Löschen alter `instagram`/`facebook` Verbindungen
  - `auth_type=rerequest`
  - frischer `auth_nonce`
  - `display=page`
  - Graph API v24

Das heißt: der wichtigste Fix existiert schon im Backend, wird vom aktuellen Instagram-Connect aber umgangen.

## Ziel
Der Instagram-Connect muss immer über den dedizierten Backend-Start laufen, damit Meta nicht mehr den verkürzten „Continue as …“-Pfad aus dem gecachten Alt-Grant nimmt.

## Umsetzung

### 1. Instagram im Frontend auf den Backend-Start umstellen
**Datei:** `src/components/performance/ConnectionsTab.tsx`

Den aktuellen direkten Instagram-OAuth-Link entfernen bzw. für Instagram nicht mehr verwenden.

Stattdessen soll `handleConnect('instagram', ...)`:
- die aktuelle Session holen
- `instagram-oauth-start` per Edge-Function aufrufen
- `returnTo` übergeben
- die zurückgegebene `authUrl` öffnen

Wichtig:
- Facebook bleibt beim bestehenden Flow
- nur Instagram wird auf den dedizierten Startpfad umgestellt

### 2. Alle Instagram-Reconnect-Pfade auf denselben Start zwingen
**Dateien:**
- `src/components/performance/ConnectionsTab.tsx`
- optional prüfen: `src/components/account/LinkedAccountsCard.tsx`

Sicherstellen, dass wirklich **jeder** Instagram-Reconnect denselben Backend-Start nutzt:
- normaler „Connect Instagram“-Button
- „Instagram erneut verbinden“-CTA im Page-Select-Dialog
- Disconnect → Reconnect-Fälle
- evtl. Account/Settings-Karten mit eigenem Reconnect

So gibt es keinen Pfad mehr, der versehentlich wieder den verkürzten Direkt-Link benutzt.

### 3. Doppelte / widersprüchliche Frontend-IG-OAuth-Logik bereinigen
**Datei:** `src/components/performance/ConnectionsTab.tsx`

Die lokale Instagram-URL-Konstruktion mit:
- `v18.0`
- `scope=...`
- `auth_type=rerequest`
- `auth_nonce`
soll entfernt oder klar deaktiviert werden, damit künftig nur noch **eine** Wahrheit existiert: `instagram-oauth-start`.

Das verhindert, dass spätere Änderungen wieder am Backend vorbeigehen.

### 4. Disconnect-Hinweis für Review-Fall schärfen
**Datei:** `src/components/performance/ConnectionsTab.tsx`

Die bestehende Disconnect-Logik nutzt bereits `instagram-oauth-revoke`. Der Hinweis danach sollte noch klarer machen:

- Für den Review-Screencast zuerst trennen
- dann neu verbinden
- idealerweise in einer frischen / ausgeloggten Meta-Sitzung aufnehmen

So ist auch der Nutzerfluss für den Reviewer nachvollziehbar.

### 5. Optionalen Review-Hinweis im Dialog ergänzen
**Datei:** `src/components/performance/FacebookPageSelectDialog.tsx`

Kleine Hinweiszeile für den Review-Fall:
- Falls Meta weiterhin nur die Kurzversion zeigt, zuerst vollständig trennen und den Flow in frischer Meta-Session erneut starten
- Fokus: Reviewer muss Permission-/Page-Auswahl sichtbar sehen

Das ist kein technischer Fix, aber reduziert Missverständnisse beim finalen Test.

## Erwartetes Ergebnis
Nach der Umstellung läuft Instagram nicht mehr über den schwächeren Direkt-Link, sondern immer über den Backend-Flow mit Hard-Reset + Re-Consent.

Erwarteter Effekt:
- deutlich höhere Chance auf den vollständigen Meta-Dialog
- keine versehentliche Rückkehr zum verkürzten „Continue as …“-Screen durch den Frontend-Link
- konsistenter Review-tauglicher Flow

## Betroffene Dateien
- `src/components/performance/ConnectionsTab.tsx`
- `src/components/performance/FacebookPageSelectDialog.tsx`
- optional Prüfung/Anpassung: `src/components/account/LinkedAccountsCard.tsx`

## Technische Details
```text
Aktuell:
Frontend -> direkte facebook.com OAuth-URL

Soll:
Frontend -> instagram-oauth-start -> Backend hard reset + authUrl -> Redirect zu Meta
```

Der entscheidende Punkt ist nicht noch ein weiterer Query-Parameter im Frontend, sondern dass der Instagram-Flow den vorhandenen Backend-Start endlich wirklich benutzt.

## Test nach Umsetzung
1. Instagram/Facebook-Verbindung trennen
2. prüfen, dass der Hard-Reset erfolgreich lief
3. Instagram neu verbinden
4. Erwartung:
   - Redirect kommt aus `instagram-oauth-start`
   - voller Meta-Consent erscheint deutlich zuverlässiger
   - danach Page-Auswahl funktioniert weiter
5. Für den Review-Screencast:
   - logged-out bzw. frische Meta-Session
   - kompletter Flow sichtbar aufnehmen
