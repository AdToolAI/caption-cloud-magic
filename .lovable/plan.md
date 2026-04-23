

## Vollständigen Meta-Consent-Dialog erzwingen — für funktionierenden Review-Screencast

### Problem
Aktuell zeigt Meta beim Instagram-Connect den abgekürzten „Continue as Samuel"-Bildschirm statt des vollen Permission-Dialogs. Das passiert, weil Meta dem User die App-Berechtigung erinnert und den Consent-Screen überspringt.

**Für Meta App Review ist das ein Showstopper.** Die offizielle Doku (Screen Recordings Guide) verlangt explizit:
> *„Capture the entire login flow, from logged-out to logged-in"* + *„show the app user granting your app the permission you are demonstrating"*

Der Reviewer muss im Screencast den **kompletten Permission-Dialog mit Page-Auswahl** sehen — sonst Rejection unter Policy 1.9.

### Gute Nachricht
Funktional ist alles in Ordnung:
- Page-Auswahl funktioniert ✅
- IG-Verifikation funktioniert ✅
- Backend-Discovery liefert die Pages ✅

Es geht **nur** um die OAuth-URL-Konstruktion im Frontend.

### Lösung
`auth_type=rerequest` + frischen `auth_nonce` **immer** beim Instagram-Connect mitschicken — nicht nur als Recovery-Fallback.

**Datei:** `src/components/performance/ConnectionsTab.tsx`

Änderung in `handleConnect`:
- `forceReconsent` für Instagram **immer** auf `true` setzen
- Dadurch hängt jeder Instagram-OAuth-URL `auth_type=rerequest&auth_nonce=<uuid>` an
- Meta zeigt damit garantiert den vollen Berechtigungsdialog mit:
  - Page-Toggles
  - Instagram-Konto-Auswahl
  - Liste aller angefragten Permissions
  - "Edit Settings"-Option

Konkrete Änderung:
```text
forceReconsent =
  providerId === 'instagram'   // immer true für IG
```

Für Facebook bleibt es beim Standardverhalten (kein rerequest), weil dort nur Pages relevant sind und der Page-Picker sowieso erscheint.

### Warum das Meta-konform ist
- `auth_type=rerequest` ist ein **offiziell dokumentierter** Meta-Parameter
- Er ist nicht „aggressiv" — er entspricht exakt dem, was Meta für Re-Consent-Flows vorsieht
- Apps wie Buffer, Hootsuite, Later nutzen denselben Mechanismus
- Der `auth_nonce` umgeht zusätzlich das Meta-Session-Caching

### Was sich für den User ändert
- **Bestehender User**: sieht beim nächsten IG-Connect einmalig wieder den vollen Dialog (kein „Continue as ...")
- **Neuer User**: sieht von Anfang an den vollen Dialog
- **Funktional**: identisch — Page-Auswahl, Verbindung, Sync funktionieren weiter wie gehabt

### Bonus für den Review-Screencast
Mit dem garantierten Vollconsent kannst du jetzt einen sauberen Screencast aufnehmen, der **alle** von Meta verlangten Schritte zeigt:
1. Logged-out State
2. Login mit eigenem Account
3. Klick auf „Connect Instagram"
4. **Voller Permission-Dialog** (jetzt garantiert) mit allen 6 angefragten Berechtigungen
5. Page-Auswahl
6. Erfolgreiche Verbindung
7. Sync + echte IG-Daten anzeigen

### Betroffene Datei
- `src/components/performance/ConnectionsTab.tsx` (1 Zeile geändert)

### Technische Details
- Kein Backend-Change
- Kein Edge-Function-Deploy
- Kein Schema-Change
- Reine 1-Zeilen-OAuth-URL-Anpassung

### Test
1. Instagram trennen
2. „Connect Instagram" klicken
3. Erwartung: **voller** Meta-Permission-Dialog (kein „Continue as ...")
4. Page wählen → Verbindung steht
5. Screencast in dieser Konfiguration aufnehmen → Meta App Review einreichen

