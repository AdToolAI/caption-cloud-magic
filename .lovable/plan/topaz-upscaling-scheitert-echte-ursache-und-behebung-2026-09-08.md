# Topaz-Upscaling scheitert — echte Ursache und Behebung

## Was tatsächlich passiert (geprüft in den Daten)

Das früher behobene Problem war die **Sicherung der fertigen Datei**. Das hier ist ein
anderes, neues Problem — und es liegt nicht am Kunden und nicht an seinem Guthaben.

Alle drei fehlgeschlagenen Läufe von `yaxac88729@watchyio.com`
(07.09. 16:52, 08.09. 05:14, 08.09. 05:21) sind vom Anbieter Topaz mit der Meldung
`INSUFFICIENT_CREDITS` zurückgekommen — also **unser Topaz-Konto hat kein Guthaben mehr**.
Der Kunde hatte zum selben Zeitpunkt 4.973 $ im Konto.

Belege:

- Alle Läufe bis 07.09. 09:50 sind fertig geworden; ab 07.09. 16:52 scheitert
  **jeder** Topaz-Lauf im gesamten System (nicht nur bei diesem Kunden).
- Fehlerstufe ist `provider`, nicht `wallet` — die Prüfung unseres eigenen
  Guthabens war bestanden, der Auftrag lief bereits beim Anbieter.
- Das Guthaben des Kunden wurde jedes Mal korrekt wieder freigegeben
  (drei `release`-Buchungen, insgesamt 8,35 €). Es ist ihm nichts verloren gegangen.
- Ein vierter Lauf (07.09. 16:12) scheiterte anders: die fertige Datei war beim
  Anbieter schon nicht mehr abrufbar (403), als wir sie sichern wollten —
  auch hier volle Rückgabe (3,93 €).

## Was zu tun ist

### 1. Topaz-Konto aufladen (Voraussetzung, außerhalb des Codes)
Ohne Guthaben beim Anbieter kann kein Upscaling laufen. Das muss im Topaz-Konto
passieren; danach funktioniert die Funktion sofort wieder, ohne Codeänderung.

### 2. Ehrliche Fehlermeldung statt „INSUFFICIENT_CREDITS"
Heute steht im Verlauf des Kunden rot „INSUFFICIENT_CREDITS", obwohl sein Konto
voll ist — das liest sich, als sei er schuld. Künftig zwei klar getrennte Texte
(EN/DE/ES):

- Anbieter-Ausfall: „Die Veredelung konnte gerade nicht ausgeführt werden.
  Dein Guthaben wurde vollständig zurückgebucht. Bitte in Kürze erneut versuchen."
- Echtes Kundenguthaben zu niedrig: bisheriger Hinweis mit Weg zum Aufladen.

Dazu wird die rohe Anbietermeldung nie mehr unverändert angezeigt.

### 3. Frühwarnung für uns
Sobald der Anbieter zweimal in Folge wegen fehlendem Anbieterguthaben ablehnt,
wird das als Betriebsstörung markiert (Admin-Sicht/Log), damit wir es merken,
bevor Kunden es merken. Optional: neue Aufträge in diesem Zustand gar nicht erst
starten, statt sie scheitern zu lassen.

### 4. Schnellere Rückbuchung
Die Rückgabe kam beim Lauf um 16:52 erst um 18:40 (Abgleich alle 5 Minuten,
Erkennung hing an der Statusabfrage). Der Anbieterfehler wird künftig direkt beim
Statuswechsel erkannt und sofort zurückgebucht, nicht erst beim nächsten Abgleich.

### 5. Abgelaufene Anbieterdatei (403)
Der Sicherungslauf startet künftig unmittelbar nach Fertigmeldung und speichert
die Ablauffrist des Anbieter-Links; ist der Link abgelaufen, wird die Datei beim
Anbieter einmal neu angefordert, bevor der Lauf als verloren gilt.

## Technische Details

- `supabase/functions/video-enhance-reconcile/index.ts:288` — Anbieterfehler wird
  wörtlich als `error_message` gespeichert; hier auf einen eigenen Fehlercode
  `PROVIDER_ACCOUNT_CREDITS` abbilden und sofort `finalizeFailure` + Freigabe.
- `supabase/functions/_shared/video-enhance-finalize.ts` — Stufenlogik
  (`persist` → `output_lost`) bleibt; nur ein erneuter Download-Versuch beim
  Anbieter kommt vor dem 403-Abbruch dazu.
- Anzeige: Fehlercode-Mapping in der Enhance-Oberfläche und Verlaufskarte,
  Texte in `src/lib/translations.ts` (EN/DE/ES).
- Unangetastet: Preis-, Wallet-, Rückerstattungs- und Reservierungslogik,
  Lip-Sync, Director's Cut, Stripe.

## Prüfung

Ein Lauf nach dem Aufladen (kürzestes Video), ein simulierter Anbieterfehler
(Testpfad) für Meldungstext und sofortige Rückbuchung, sowie Sprachprüfung EN/DE/ES.
