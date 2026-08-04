# Launch Radar — merken, sobald der erste echte Nutzer kommt

## Ausgangslage (geprüft)

- Insgesamt 57 Accounts in der Datenbank, davon **0 neu in den letzten 7 Tagen** — also praktisch nur Test-/Altbestand.
- 1 Founders-Slot beansprucht.
- **0 App-Events in den letzten 7 Tagen** — das interne Event-Tracking meldet aktuell nichts.
- Vorhandene Überwachung: `health-alerter` (alle 10 Min, technische Fehler/Kosten) und `weekly-health-report` (Sonntag 8 Uhr, enthält Signups). Es gibt **keinen** Alarm, der beim ersten echten Nutzer oder beim ersten Kauf sofort meldet.
- Es gibt bereits ein Admin-Analytics-Dashboard, aber es ist "Pull": man muss hinschauen. Bei 0 Nutzern schaut niemand täglich rein.

Kurz: Die Plattform ist live, aber sie tippt dir nicht auf die Schulter, wenn etwas passiert. Genau das bauen wir.

## Was gebaut wird

### 1. Sofort-Signal bei jedem neuen Nutzer
Bei jeder neuen Registrierung geht sofort eine E-Mail an die Admin-Adresse:
"Neuer Nutzer Nr. 3 — registriert um 14:22, Sprache DE, Trial läuft bis …".
So erfährst du es innerhalb von Sekunden, ohne irgendwo nachzusehen.

### 2. Meilenstein-Alarme
Eigene, hervorgehobene Benachrichtigung bei den Ereignissen, die wirklich zählen:
- allererster echter Nutzer nach Launch
- erstes fertig gerendertes Video eines echten Nutzers (= Produkt funktioniert im Feld)
- erster zahlender Kunde
- 10., 50., 100. Nutzer

### 3. Täglicher Puls (auch bei Null)
Jeden Morgen eine kurze Mail mit den Zahlen von gestern: Besucher, Registrierungen, gestartete Trials, erstellte Videos, Käufe — plus Vergleich zum Vortag.
Wichtig: Die Mail kommt **auch bei 0** und zählt "Tag 9 seit Launch, noch keine Registrierung". Stille wird damit zu einer Information statt zu einer Lücke.

### 4. Launch Radar im Admin-Bereich
Eine Karte ganz oben unter `/admin`, die auf einen Blick zeigt:
Besucher heute → Registrierungen → erstes Video → Kauf, dazu die letzten Ereignisse live.
Ein Ort, statt vier Dashboards.

### 5. Tracking-Prüfung (Voraussetzung für alles andere)
Da seit 7 Tagen keine App-Events ankommen, wird zuerst verifiziert, dass Seitenaufrufe, Registrierung und Videoerstellung tatsächlich aufgezeichnet werden. Sonst meldet der Radar dauerhaft Null, obwohl etwas passiert.

## Technische Umsetzung

- Neue Edge Function `launch-radar-notify`: nimmt ein Ereignis (`signup`, `first_render`, `first_payment`, `milestone`) entgegen, entprellt über `alert_notifications` (kein Doppelversand), verschickt über den bestehenden `sendEmail`-Helper an `ADMIN_ALERT_EMAIL` aus `_shared/admin-config.ts`.
- Auslöser: Datenbank-Trigger auf der bestehenden Profil-Anlage bei Registrierung (kein Eingriff ins `auth`-Schema) ruft die Function per `pg_net` auf. Kauf-Signal wird im vorhandenen `stripe-webhook` bei `checkout.session.completed` ergänzt.
- Neue Edge Function `daily-pulse` + `pg_cron`-Eintrag `daily-pulse-8am` (`0 6 * * *` UTC). Aggregiert Registrierungen, Trials, `video_creations`, Zahlungen und Lovable-Analytics-Besucher der letzten 24 h.
- Neue Tabelle `launch_milestones` (erreichte Meilensteine, damit jeder nur einmal feuert) inkl. GRANTs und RLS (nur `service_role` schreibt, Admins lesen).
- Frontend: `src/components/admin/LaunchRadarCard.tsx`, eingebunden oben in `src/pages/Admin.tsx`; nutzt die vorhandene Admin-Rollenprüfung.
- Tracking-Audit: `trackEvent`-Aufrufe für Landingpage-Aufruf, Registrierung und Video-Fertigstellung prüfen und dort ergänzen, wo sie fehlen.

## Was dieser Plan bewusst nicht macht

Er beschafft keine Nutzer. Er sorgt dafür, dass du den ersten sofort bemerkst und sein Verhalten lückenlos siehst. Wenn du willst, ist der nächste Schritt danach ein separater Plan zur Nutzergewinnung (Landingpage-Test, Beta-Einladungen, Founders-Kampagne).
