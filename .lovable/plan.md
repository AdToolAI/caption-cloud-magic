# Unbegrenztes Guthaben für yaxac88729@watchyio.com

Ziel: Der Account kann alle Modelle nutzen, ohne je selbst zu zahlen (Social-Media-Management).

Aktueller Stand: Konto existiert, Guthaben 86,87 (USD), bisher 17,21 verbraucht. Das Guthaben wird an über 30 Stellen (alle Videomodelle, Bild, Musik, Stimme, Enhance) geprüft — es gibt heute keine "unbegrenzt"-Kennzeichnung.

## Vorgehen (empfohlen: Dauer-Auffüllung statt Code-Umbau)

1. **Guthaben sofort auf 5.000 setzen** (Gutschrift als interne Team-Aufladung verbucht, nicht als Kauf — zählt damit nicht in Umsatz/Marge).
2. **Automatische Nachfüllung**: ein kleiner geplanter Job prüft täglich das Guthaben dieses Kontos und füllt es wieder auf 5.000 auf, sobald es unter 1.000 fällt. Damit ist es praktisch unbegrenzt, ohne dass an der Abrechnungslogik der Modelle etwas geändert wird.
3. **Kennzeichnung**: das Konto wird intern als Team-/Staff-Konto markiert, damit sein Verbrauch in Auswertungen von echtem Kundenumsatz getrennt bleibt.

Warum nicht ein echtes "unbegrenzt"-Flag: das müsste in jeder einzelnen Modell-Funktion eingebaut und getestet werden — mehr Risiko für die Abrechnung aller anderen Nutzer, direkt nach dem großen Video-Release. Die Auffüll-Lösung erreicht dasselbe Ergebnis ohne Eingriff in die Abrechnung.

## Technisch

- Datenbank: `ai_video_wallets.balance_euros` für User `ee1f91c5-…` auf 5000 setzen; Buchung in der bestehenden Transaktions-/Ledger-Tabelle als `admin_grant` (Team-Konto) protokollieren.
- Neue Edge Function `staff-wallet-topup` (Service-Role, kein öffentlicher Zugang) + Cron einmal täglich: Guthaben < 1000 → auf 5000 anheben, sonst nichts tun. Idempotent, protokolliert jede Aufladung.
- Kennzeichnung über eine Staff-Markierung am Konto (z. B. Rolle `staff` in `user_roles`), damit Reporting den Verbrauch ausfiltern kann.
- Unangetastet: Preislogik, Kostendeckel, Rückerstattungen, Capability-Gate, Lip-Sync, Director's Cut, alle anderen Konten.

## Verifikation

Guthaben im Konto sichtbar, ein Testlauf (günstiges Modell) läuft ohne Guthaben-Warnung durch, Cron-Lauf einmal manuell ausgelöst und Protokoll geprüft.
