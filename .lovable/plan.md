

## Plan: Facebook-Seiten-Auswahl nach OAuth einbauen

### Problem
Meta will beim `pages_show_list` Screencast sehen, dass die App die Facebook-Seiten des Nutzers **auflistet**. Aktuell wird nur der Name der verbundenen Seite angezeigt, aber es gibt keinen Schritt, bei dem der Nutzer seine Seiten sieht und eine auswählt.

### Lösung
Nach dem Facebook-OAuth einen **Seiten-Auswahl-Dialog** einbauen, der über die Graph API (`/me/accounts`) alle Seiten des Nutzers abruft und als Liste anzeigt. Der Nutzer wählt eine Seite aus, die dann als Verbindung gespeichert wird.

### Technische Umsetzung

**1. Neue Edge Function: `facebook-list-pages`**
- Nimmt den User-Token aus der OAuth-Callback-Phase
- Ruft `GET /me/accounts` auf der Facebook Graph API auf
- Gibt eine Liste der Seiten zurück (Name, ID, Kategorie, Profilbild)

**2. Neuer Dialog: `FacebookPageSelectDialog.tsx`**
- Wird nach erfolgreichem Facebook-OAuth angezeigt
- Zeigt alle verfügbaren Seiten als Karten (Icon, Name, Kategorie)
- Nutzer klickt auf eine Seite → wird als `account_name` in `social_connections` gespeichert
- Visuell ansprechend mit Seiten-Avataren und Kategorien

**3. Anpassung `ConnectionsTab.tsx`**
- Nach Facebook-OAuth-Callback: Statt direkt zu verbinden, erst den Seiten-Auswahl-Dialog öffnen
- Nach Auswahl wird die Verbindung mit der gewählten Seite gespeichert

### Screencast-Flow danach
1. Login → Integrations → Facebook Connect
2. OAuth-Dialog mit `pages_show_list` Scope sichtbar
3. **NEU:** Seiten-Auswahl-Dialog zeigt alle Seiten des Nutzers
4. Nutzer wählt eine Seite aus
5. Verbindung wird hergestellt → Seitenname wird angezeigt

### Dateien
| Datei | Aktion |
|---|---|
| `supabase/functions/facebook-list-pages/index.ts` | Neu – Graph API `/me/accounts` aufrufen |
| `src/components/performance/FacebookPageSelectDialog.tsx` | Neu – Seiten-Auswahl UI |
| `src/components/performance/ConnectionsTab.tsx` | Anpassen – Dialog nach FB-OAuth triggern |

