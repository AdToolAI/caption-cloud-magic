

## Plan: B2 Web-Push-Reminders (Activation & Retention)

B1 ist abgeschlossen. Jetzt B2 — und das wird klein, weil die Web-Push-Infrastruktur bereits steht.

## Was bereits existiert
- ✅ Service Worker (`public/sw.js`) mit Push-Handler
- ✅ `usePushNotifications` Hook (subscribe/unsubscribe)
- ✅ Edge Function `send-push-notification` (sendet via VAPID)
- ✅ DB-Tabelle `notification_preferences` (`push_enabled`, `push_subscription`)
- ✅ VAPID-Keys als Secrets gesetzt

## Was fehlt für B2
Push-Reminder-Kampagne parallel zu Email-Drips — gleiche Trigger-Logik (Tag 1/3/7), aber als Browser-Push.

### 1. DB-Migration
- Tabelle `push_reminder_log` (`user_id`, `reminder_step` 1/3/7, `sent_at`, `progress_at_send`, `status`)
- Unique-Index `(user_id, reminder_step)` → Idempotenz
- Spalte `notification_preferences.reminder_pushes_enabled` BOOLEAN DEFAULT true

### 2. Edge Function `process-push-reminders`
- Cron-getriggert (stündlich, parallel zu Email-Drips)
- Findet User in Zeitfenstern: 24h±30min / 72h±30min / 7d±30min
- Filter: `push_enabled = true`, `reminder_pushes_enabled = true`, gültige `push_subscription`, kein Eintrag in `push_reminder_log` für Step
- Berechnet Progress (5 Tabellen, gleiche Logik wie B1)
- Threshold: Tag 1 < 100%, Tag 3 < 60%, Tag 7 < 100%
- Lädt lokalisierte Push-Nachricht (DE/EN/ES aus `profiles.language`)
- Ruft `send-push-notification` mit Title, Body, Deep-Link auf
- Loggt nach `push_reminder_log`
- Optional: `?dry_run=true&user_id=<uuid>&step=1` für sofortigen Test

### 3. Push-Texte (3 Steps × 3 Sprachen, kurz!)

| Tag | Title (DE / EN / ES) | Body | URL |
|---|---|---|---|
| **1** | „Dein erstes Video wartet 🎬" / „Your first video awaits 🎬" / „Tu primer video te espera 🎬" | „Erstelle es in 90 Sekunden" / „Create it in 90 seconds" / „Créalo en 90 segundos" | `/hailuo-video-studio` |
| **3** | „Du bist auf halbem Weg 🚀" / „You're halfway there 🚀" / „Estás a mitad de camino 🚀" | „Noch X Schritte bis zum Erfolg" / „X steps to go" / „X pasos para el éxito" | `/dashboard` (Checkliste) |
| **7** | „Letzte Erinnerung ⏰" / „Last reminder ⏰" / „Último recordatorio ⏰" | „Schließe dein Setup ab" / „Complete your setup" / „Completa tu configuración" | `/dashboard` |

### 4. Pg_cron Schedule
Job stündlich (`15 * * * *` — versetzt 15min nach Email-Cron, um Spitzenlast zu vermeiden).

### 5. Frontend
- **Toggle in `ProfileTab.tsx`** (neben Drip-Email-Toggle): „Push-Erinnerungen erhalten" — schaltet `notification_preferences.reminder_pushes_enabled`
- **`/email-preferences` Page erweitern**: zweiter Toggle für Push-Reminders (gleiche Logik wie Email-Toggle)

### 6. End-to-End-Test
- Push-Permission im Browser aktivieren (falls noch nicht)
- Dry-Run-Aufrufe für Tag 1, 3, 7 → Push erscheint sofort im Browser
- Klick auf Push → öffnet korrekten Deep-Link

## Aufwand
| Schritt | Zeit |
|---|---|
| DB-Migration | 5 min |
| Edge Function `process-push-reminders` | 20 min |
| Push-Texte lokalisiert (3×3) | 10 min |
| Pg_cron Job | 5 min |
| Profile-Toggle + Preferences-Page-Update | 10 min |
| E2E-Test (Dry-Run für Tag 1/3/7) | 10 min |
| **Gesamt** | **~60 min** |

## Wichtiger Hinweis
- Push-Reminders erreichen nur User, die zuvor Push-Permission erteilt haben (`push_enabled = true`). Für die meisten User wird also **erst der Email-Drip** triggern. Push ist additiv für die engagierte Subgruppe.
- **iOS Safari** unterstützt Web-Push nur in installierten PWAs (Home-Screen-Add). Dieses Verhalten ist im bestehenden System bereits berücksichtigt.

## Nach Approval
1. Migration ausführen
2. Edge Function bauen + deployen
3. Pg_cron einrichten
4. Frontend (Toggle in Profile + Preferences-Page)
5. Dry-Run für alle 3 Push-Reminders

Danach: **B3 (Streak-Mechanik)** als finaler Activation-Baustein.

