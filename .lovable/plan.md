# Creator-Account für Iamdevilofficial00@gmail.com

Neuer Creator-Account mit:

- Startguthaben: 30 $ (USD-Wallet)
- 20 % Rabatt auf alle kostenpflichtigen KI-Aktionen (Video, Bild, Musik, Stimme, Text, Video-Enhance/Topaz)
- Voller Plattform-Zugang (Beta-Basic) ohne Zahlung
- Zufälliges Passwort (10 Zeichen, Buchstaben + Zahlen), E-Mail direkt bestätigt

Die Zugangsdaten nenne ich dir nach dem Anlegen im Chat.

## Warum der Rabatt überall greift

Der Rabatt hängt am Konto und wird zentral beim Abbuchen angewendet, nicht in den einzelnen Generatoren. Dadurch gilt er automatisch für jedes heutige und künftige Modell — inklusive Topaz-Hochskalierung — und Rückerstattungen bei Fehlschlägen erstatten exakt den rabattierten Betrag.

## Umsetzung

- Anlegen über die bestehende Admin-Funktion `admin-create-creator-account` mit Rabatt 20 und Startguthaben 30, Wallet-Währung USD.
- Keine Änderung an Preisen, Abrechnungslogik, anderen Konten oder Code.

## Verifikation

Abfrage nach dem Anlegen: `account_type = creator`, `ai_discount_percent = 20`, Wallet-Guthaben 30,00 USD.
