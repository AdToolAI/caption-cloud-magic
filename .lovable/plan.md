
## Instagram-Review-Flow: Problem korrekt einordnen und nur noch die wirklich wirksamen Schritte umsetzen

### Was der aktuelle Stand zeigt
Der Code ist inzwischen bereits auf dem stärksten verfügbaren Flow:

- Instagram nutzt den dedizierten Backend-Start `instagram-oauth-start`
- dort werden alte Meta-Grants best-effort widerrufen
- die URL enthält bereits:
  - `auth_type=rerequest`
  - frischen `auth_nonce`
  - `display=page`
  - die relevanten Scopes inkl. `business_management`

Trotzdem zeigt Meta weiterhin den verkürzten Einstieg.

Der neue Screenshot ist dabei wichtig: Er zeigt bereits eine echte Permission-Seite mit den angeforderten Rechten. Das heißt:
- die App fragt die Permissions sichtbar an
- der offene Rest ist nicht mehr primär unsere URL-Konstruktion
- der verbleibende Unterschied entsteht sehr wahrscheinlich durch Meta-Session-/Review-Verhalten, nicht durch fehlende App-Parameter

### Wahrscheinliche Root Cause
Es gibt jetzt zwei realistische Ursachen, die wir getrennt behandeln müssen:

1. **Meta-Session-Caching**
   - Wenn bei Facebook/Meta bereits eine Sitzung aktiv ist, kann Meta den Login-Teil trotzdem abkürzen.
   - Das lässt sich aus der App nur begrenzt beeinflussen.

2. **Preview-/Published-Umgebung**
   - OAuth kann sich im Preview anders verhalten als auf der veröffentlichten URL.
   - Für Review-relevante Tests ist die veröffentlichte URL die belastbare Referenz.

### Ziel
Nicht noch mehr am OAuth-Link “raten”, sondern:
- den tatsächlichen Redirect-/Dialog-Pfad sichtbar machen
- Review-sichere Nutzung über die veröffentlichte URL absichern
- optional einen echten Review-Modus ergänzen, falls ein zusätzlicher Meta-Reauth-Schritt noch sinnvoll getestet werden soll

## Umsetzung

### 1. Instagram-Flow gezielt instrumentieren
**Dateien:**
- `src/components/performance/ConnectionsTab.tsx`
- `supabase/functions/instagram-oauth-start/index.ts`
- optional `supabase/functions/oauth-callback/index.ts`

Zusätzliche Diagnose-Logs einbauen, damit beim nächsten Versuch eindeutig sichtbar ist:
- welche `authUrl` final erzeugt wurde
- ob der Flow wirklich über `instagram-oauth-start` lief
- ob die App im Preview oder auf der veröffentlichten Domain gestartet wurde
- welche Redirect-URL nach dem Callback verwendet wurde

Ziel:
```text
Nicht mehr vermuten, sondern exakt sehen:
Frontend -> instagram-oauth-start -> Meta dialog URL -> oauth-callback -> App redirect
```

### 2. Review-Modus als expliziten Spezialpfad ergänzen
**Datei:** `src/components/performance/ConnectionsTab.tsx`

Einen klaren, separaten Instagram-CTA für Review-Aufnahmen ergänzen, z. B.:
- „Instagram für Review verbinden“

Dieser Pfad soll:
- nur für Instagram gelten
- den bestehenden Backend-Start weiter nutzen
- optional zusätzlich einen härteren Reauth-Intent mitschicken (falls Meta ihn berücksichtigt)
- dem Nutzer vor Redirect einen klaren Hinweis zeigen:
  - in frischer/incognito Meta-Session starten
  - idealerweise vorher komplett bei Facebook ausloggen
  - Review auf veröffentlichter URL aufnehmen

Wichtig: der normale Connect-Flow bleibt unverändert; Review-Flow ist bewusst separat.

### 3. Review-Hinweis im Dialog von “generisch” auf “verbindlich” anheben
**Datei:** `src/components/performance/FacebookPageSelectDialog.tsx`

Den bisherigen Hinweis zu einer klaren Review-Anleitung ausbauen:

- Der aktuelle Screen mit der Rechtematrix zählt bereits als Permission-Screen.
- Wenn Meta keinen separaten Login-Screen zeigt, liegt das meist an einer bestehenden Meta-Sitzung.
- Für den Screencast deshalb:
  1. veröffentlichte URL verwenden
  2. Meta/Facebook vorher vollständig ausloggen
  3. Flow in Inkognito/privatem Fenster starten
  4. dann Connect → Permissions → Page-Auswahl → erfolgreiche Verbindung → echte Nutzung aufnehmen

### 4. Published-URL als bevorzugten Review-Pfad in der UI verankern
**Datei:** `src/components/performance/ConnectionsTab.tsx`

Einen kleinen Hinweis oder Link ergänzen, dass OAuth-/Review-Tests für Meta auf der veröffentlichten App erfolgen sollen, nicht primär im Preview.

Begründung:
- Preview und veröffentlichte Umgebung können sich bei OAuth unterschiedlich verhalten
- für Meta Review ist die veröffentlichte Umgebung die relevante Zielumgebung

### 5. Kein weiterer “Parameter-Spam” im OAuth-Link
Bewusst **nicht** umsetzen:
- weitere zufällige URL-Parameter ohne klare Wirkung
- mehrfach widersprüchliche Frontend-/Backend-Logik
- erneute direkte Frontend-Konstruktion der Instagram-URL

Der aktuelle Backend-Flow bleibt Single Source of Truth.

## Erwartetes Ergebnis
Nach der Nachschärfung gibt es zwei klare Ergebnisse:

### A. Für die technische Diagnose
Wir sehen beim nächsten Lauf eindeutig,
- ob wirklich der Backend-Flow genutzt wurde
- welche Meta-URL geöffnet wurde
- ob das Verhalten nur im Preview auftritt

### B. Für den Review
Der Nutzer bekommt einen belastbaren Aufnahme-Pfad:
- veröffentlichte URL
- frische Meta-Session
- sichtbarer Permission-Screen
- sichtbare Page-Auswahl
- erfolgreicher Connect + Feature-Nutzung

## Wichtige Einschätzung
Der aktuelle Screenshot zeigt bereits eine Seite, auf der die angefragten Berechtigungen sichtbar gelistet sind. Das spricht dafür, dass der verbleibende Unterschied eher der **Login-/Session-Teil von Meta** ist als ein fehlender Permission-Request unserer App.

Wenn Meta den Nutzer schon kennt, kann die App den “vollständigen Login von Null an” nicht zuverlässig erzwingen. Deshalb ist der nächste sinnvolle Schritt nicht noch mehr OAuth-Code-Tuning, sondern:
- Flow sauber instrumentieren
- Review-Modus klar ausweisen
- Review konsequent auf der veröffentlichten URL in frischer Meta-Session aufnehmen

## Betroffene Dateien
- `src/components/performance/ConnectionsTab.tsx`
- `src/components/performance/FacebookPageSelectDialog.tsx`
- `supabase/functions/instagram-oauth-start/index.ts`
- optional `supabase/functions/oauth-callback/index.ts`

## Technische Details
```text
Ist-Zustand:
Frontend -> instagram-oauth-start -> Meta OAuth URL mit rerequest/auth_nonce/display=page

Neue Verbesserung:
gleicher Flow + präzise Logging/Instrumentation + dedizierter Review-Modus + Published-URL-Hinweis
```

## Test nach Umsetzung
1. Projekt auf veröffentlichter URL öffnen
2. Meta/Facebook vollständig ausloggen
3. Inkognito-Fenster verwenden
4. „Instagram für Review verbinden“ starten
5. Erwartung:
   - Permission-Screen erscheint
   - danach Page-Auswahl
   - Verbindung erfolgreich
   - danach echte Instagram-Nutzung/Sync im Screencast zeigen
6. Falls Preview weiterhin abweicht, gilt das als Umgebungsunterschied, nicht als App-Code-Fehler
