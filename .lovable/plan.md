

## Plan: Email-Admin-Dashboard

Du hast jetzt ein voll funktionierendes Email-System mit Bounce-Handling, Suppression-Liste und Send-Logging. Was fehlt: **eine UI um das alles zu sehen und zu verwalten.** Ohne Dashboard musst du jedes Mal SQL ausführen lassen — mit Dashboard siehst du auf einen Blick was läuft.

### Was du bekommst

Eine neue Admin-Seite **`/admin/emails`** (eingebettet ins bestehende Admin-Dashboard als dritter Tab neben „Conversion Funnel" und „System Monitor"). Nur für Admins zugänglich (über bestehende `has_role(auth.uid(), 'admin')`-Prüfung).

### Aufbau (ein Screen, drei Bereiche)

**1. KPI-Kacheln oben** — letzte 7 Tage (umschaltbar 24h / 7d / 30d):
- Versendete Mails (grün)
- Suppressed/Geblockt (gelb)
- Failed/DLQ (rot)
- Bounces + Complaints aus der Suppression-Liste (separat, da long-term)
- Bounce-Rate in % (Industriestandard: <2% gut, >5% kritisch)

**2. Send-Log-Tabelle** mit Filtern:
- Filter: Zeitraum, Template (`verification`, `password-reset`, `support`, `drip-*` etc.), Status (`sent` / `suppressed` / `failed` / `dlq`)
- Spalten: Zeitstempel, Template, Empfänger, Status (farbiges Badge), Fehler-Message (bei Failures)
- Pagination (50 pro Seite)
- Deduplizierung per `message_id` (eine Mail = eine Zeile, neuester Status gewinnt)

**3. Suppression-Liste** mit Verwaltung:
- Tabelle: Email, Grund (`bounce` / `complaint` / `manual`), hinzugefügt am, Metadata
- Suchfeld (Email)
- **Aktion: Adresse entfernen** (mit Bestätigungs-Dialog) — z.B. wenn ein Kunde nach Mailbox-Wechsel wieder Mails bekommen will
- **Aktion: Manuell hinzufügen** (für Spam-Beschwerden die nicht über Resend kamen)

### Technisch

| Datei | Was passiert |
|---|---|
| `src/pages/admin/EmailDashboard.tsx` | Neue Seite mit den drei Bereichen |
| `src/pages/Admin.tsx` | Dritter Tab „Email Monitor" (Mail-Icon) hinzufügen |
| `src/components/admin/email/*` | KPI-Kacheln, LogTable, SuppressionManager als kleine Komponenten |
| RLS-Check | `email_send_log` und `email_suppression_list` brauchen SELECT-Policy für Admin-Rolle (prüfen, ggf. ergänzen) |
| Neue Edge Function `admin-suppression-manage` | Für Insert/Delete auf `email_suppression_list` (mit Admin-Rollen-Check) — keine direkten Client-Mutations auf der Tabelle |

Design: bestehender James-Bond-2028-Stil (Glassmorphism, Gold-Akzente, dunkler Hintergrund) — passt zum Rest des Admin-Bereichs.

### Was du machen musst

Nichts. Plan freigeben → ich baue alles, deploye die Edge Function und du kannst direkt in `/admin` auf den neuen Tab klicken.

