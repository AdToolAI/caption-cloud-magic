

## Plan: Kostenlose Push-Notifications einbauen

### Was gebaut wird

Nutzer können Browser-Push-Benachrichtigungen aktivieren und erhalten Erinnerungen für geplante Posts (z.B. 1h vorher). Komplett kostenlos über die native Web Push API.

### Änderungen

**1. Datenbank: `notification_preferences` erweitern**
- Neue Spalten: `push_enabled` (boolean, default false), `push_subscription` (jsonb, für Web Push Subscription-Daten)

**2. `public/sw.js` — Push-Event-Handler hinzufügen**
- `push`-Event-Listener: Zeigt Notification mit Titel, Body und Icon an
- `notificationclick`-Event: Öffnet die App beim Klick auf die Notification

**3. Neuer Hook: `src/hooks/usePushNotifications.ts`**
- Prüft ob Browser Push unterstützt
- Fordert Berechtigung an (`Notification.requestPermission()`)
- Registriert Push-Subscription beim Service Worker
- Speichert Subscription in `notification_preferences.push_subscription`

**4. `NotificationSettings.tsx` (Account) erweitern**
- Neuer Abschnitt "Push-Benachrichtigungen" mit:
  - Toggle zum Aktivieren (löst Berechtigungsabfrage aus)
  - Status-Anzeige (aktiv/blockiert/nicht unterstützt)
  - Info-Text für iOS (PWA erforderlich)

**5. Edge Function: `send-push-notification`**
- Empfängt Event-Daten (Titel, Nachricht, User-ID)
- Lädt Push-Subscription aus DB
- Sendet Web Push via `web-push` Protokoll (kein externer Dienst nötig)
- VAPID-Keys für Authentifizierung (einmalig generiert, als Secrets gespeichert)

**6. `calendar-send-notification` erweitern**
- Nach Slack/Discord: Prüft ob Push aktiviert
- Ruft `send-push-notification` auf

### Voraussetzung: VAPID Keys

Web Push benötigt ein VAPID-Schlüsselpaar (öffentlich + privat). Diese werden einmalig generiert und als Secrets gespeichert:
- `VAPID_PUBLIC_KEY` — auch im Frontend verwendet
- `VAPID_PRIVATE_KEY` — nur in Edge Functions

Ich generiere diese Keys automatisch beim Einrichten.

### Betroffene Dateien

1. Migration — `notification_preferences` erweitern
2. `public/sw.js` — Push-Handler
3. `src/hooks/usePushNotifications.ts` — neuer Hook
4. `src/components/account/NotificationSettings.tsx` — Push-UI
5. `supabase/functions/send-push-notification/index.ts` — Push-Versand
6. `supabase/functions/calendar-send-notification/index.ts` — Integration

### Kein externer Dienst nötig

Push-Notifications laufen über die native Web Push API. Es wird **kein** Drittanbieter-Account benötigt — nur die VAPID-Keys, die ich automatisch generiere.

