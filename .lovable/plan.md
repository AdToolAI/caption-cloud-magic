# Creator-Account: 100 € Startguthaben + 40 % Rabatt auf alle AI-Kosten

Neuer Account-Typ "Creator" mit drei Eigenschaften:

1. Einmalig 100 € AI-Guthaben auf der AI-Wallet.
2. 40 % Rabatt auf jede kostenpflichtige AI-Aktion (Video, Bild, Musik, Audio, Text).
3. Voller Plattform-Zugang (Beta-Basic) ohne Zahlung.

Erster Account: `krishna.banofficial@gmail.com`, mit einem zufälligen 10-stelligen Passwort (Buchstaben + Zahlen), das ich dir nach dem Anlegen im Chat nenne.

## Wie der Rabatt greift

Der Rabatt wird zentral an der Abbuchungsstelle in der Datenbank angewendet, nicht in den ~30 einzelnen Generator-Funktionen. Damit gilt er automatisch für jeden heutigen und künftigen AI-Anbieter auf der Plattform, ohne dass irgendwo ein Anbieter vergessen werden kann.

```text
Generator-Funktion  ->  Abbuchung (DB)  ->  Rabatt-Faktor 0.6 fuer Creator  ->  Wallet
Preis-Anzeige (UI)  ->  Preis-Katalog   ->  gleicher Faktor                 ->  Nutzer sieht rabattierten Preis
```

Anzeige und tatsächliche Abbuchung bleiben dadurch identisch. Rückerstattungen bei Fehlschlägen erstatten ebenfalls exakt den rabattierten Betrag, damit keine Guthaben-Drift entsteht.

## Umsetzung

**Datenbank (Migration)**
- Neue Spalten auf `profiles`: `account_type` (Standardwert `standard`, zusätzlich `creator`) und `ai_discount_percent` (Standard 0). Beide nur serverseitig setzbar; sie kommen in die bestehende Sperrliste des Privileged-Column-Triggers, damit Nutzer sich den Rabatt nicht selbst geben können.
- Hilfsfunktion `get_user_ai_discount_factor(user_id)` (SECURITY DEFINER), liefert 1.0 bzw. 0.6.
- `deduct_ai_video_credits`, `deduct_text_studio_credits`, `deduct_credits` sowie die Composer-Reservierungspfade (`composer_reserve_run_credits`, `composer_settle_run_reservation`, `composer_refund_charge`) multiplizieren den Betrag mit dem Faktor und protokollieren den Originalbetrag in der Transaktionsbeschreibung.

**Backend**
- `pricing-catalog` liefert Preise für Creator-Accounts bereits rabattiert plus ein Feld `discount_percent`, damit die UI den Rabatt ausweisen kann.
- `check-subscription` behandelt `account_type = 'creator'` als voll abonniert (Beta-Basic), analog zum bestehenden Out-of-Band-Plan-Pfad.
- Neue Admin-Funktion `admin-create-creator-account` (nur für Admins): legt den Auth-Nutzer an (E-Mail bestätigt), setzt `account_type`/`ai_discount_percent`/Plan und schreibt die einmalige 100-€-Gutschrift über die bestehende Gutschriftfunktion — idempotent, damit ein zweiter Aufruf nicht erneut gutschreibt.

**Frontend**
- Neuer Hook `useAccountType`, der Account-Typ und Rabatt liefert.
- Wallet-/Preisanzeigen (AI-Wallet-Panel, Modell-Preis-Chips, Kostenvorschau) zeigen bei Creator-Accounts den rabattierten Preis und ein kleines "Creator −40 %"-Abzeichen.
- Alle neuen Texte über `tx({de,en,es})`, passend zur bestehenden Englisch-Standard-Regel.

**Erster Creator-Account**
- Passwort zufällig erzeugen (10 Zeichen, Buchstaben + Zahlen), Account über die Admin-Funktion anlegen, Guthaben und Rabatt anschließend per Abfrage verifizieren, Zugangsdaten im Chat ausgeben.

## Tests
- Unit-Test für die Rabattberechnung (Standard voll, Creator 0.6, Rundung auf Cent).
- DB-Verifikation: Testabbuchung eines Creator-Accounts zieht 60 % des Listenpreises; Rückerstattung stellt exakt denselben Betrag zurück.
- Verifikation, dass ein normaler Nutzer `account_type`/`ai_discount_percent` nicht selbst setzen kann.
