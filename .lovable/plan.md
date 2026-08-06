# Social-Verbindungen: ehrliche Antwort + Abnahme-Runde

## Kurzantwort

Technisch ist alles verdrahtet, aber **„problemlos" kann ich heute für keinen der vier Kanäle garantieren**, weil noch kein einziger echter Kunden-Connect stattgefunden hat.

Was die Daten sagen:
- In der Datenbank existieren aktuell nur **2 TikTok-Verbindungen (April, Testkonten)** und **1 LinkedIn**.
- **Instagram, Facebook und YouTube: null Verbindungen** — der Weg wurde also nie live durchlaufen.

Was gesichert ist:
- Alle Zugangsdaten sind hinterlegt (Meta, Google, TikTok).
- Jeder der vier Kanäle hat einen serverseitigen OAuth-Start und eine Posting-Funktion.
- Die Fake-Erfolge beim Posten sind weg — ohne Verbindung kommt jetzt ein ehrlicher Fehler.

## Drei offene Risiken

1. **TikTok-Rückleitung.** Im Frontend steht als Rückleitungsziel `https://useadtool.ai/api/oauth/tiktok/callback`. Diesen Pfad gibt es auf der Seite nicht (alles wird auf die App-Startseite umgeleitet). Wenn das serverseitige Rückleitungsziel denselben Wert hat, landet der Kunde nach der TikTok-Zustimmung auf einer leeren Seite statt verbunden zu sein. Muss geprüft und, falls nötig, auf die Backend-Callback-Adresse gesetzt werden.
2. **Meta-Berechtigungen (Instagram/Facebook).** Verbinden funktioniert immer; **Posten** funktioniert nur, wenn Meta die Veröffentlichungs-Berechtigungen freigegeben hat. Ist die App-Prüfung nicht durch, können nur App-Rollen posten — normale Kunden bekommen eine Fehlermeldung.
3. **YouTube-Weg ist neu und ungetestet.** Der serverseitige Start wurde gestern gebaut, aber noch nie mit einem echten Google-Konto durchlaufen (Freigabe-Status des Google-Projekts: unbestätigt; im Testmodus dürfen nur eingetragene Tester verbinden).

## Was ich vorschlage: eine Abnahme-Runde

**Schritt 1 — Konfiguration hart prüfen (ohne Klick)**
- Serverseitige Rückleitungsziele für TikTok, Meta und Google auslesen und gegen die in den jeweiligen Entwickler-Konsolen hinterlegten Adressen abgleichen.
- Frontend-Variablen, die nicht mehr gebraucht werden (`VITE_TIKTOK_REDIRECT_URI`, `VITE_TIKTOK_CLIENT_KEY`), aus dem Verbindungspfad entfernen, damit es nur eine Wahrheit gibt.

**Schritt 2 — Vier echte Verbindungen durchlaufen (du, mit deinen Accounts)**
Pro Kanal: Verbinden → Rückkehr in die App → Diagnose-Panel muss „verbunden" zeigen. Ich lese parallel die Server-Protokolle mit und benenne jeden Abbruch mit Ursache.

**Schritt 3 — Ein echter Testpost pro Kanal**
Ein kurzes Testvideo/Bild über den Composer auf alle vier Kanäle. Erst danach ist die Aussage „Kunden können posten" belegt.

**Schritt 4 — Ergebnis kundentauglich machen**
- Kanäle, bei denen Posten (noch) nicht freigegeben ist, in der Oberfläche klar als „Verbinden möglich, Posten in Prüfung" kennzeichnen — statt den Kunden erst am Ende des Flows in einen Fehler laufen zu lassen.
- Fehlerursachen aus den Tests in verständliche Meldungen übersetzen (abgelaufenes Token, fehlende Berechtigung, kein Kanal ausgewählt).

## Technische Details

- Prüfen: `TIKTOK_REDIRECT_URI`, `META_REDIRECT_URI` und das Google-Rückleitungsziel in `youtube-oauth-start` gegen `oauth-callback` bzw. `tiktok-oauth-callback`.
- `src/components/performance/ConnectionsTab.tsx`: toten `oauthUrls`-Eintrag `tiktok: /api/oauth/tiktok/start` entfernen (unerreichbar, aber irreführend); LinkedIn-Eintrag gleich mitprüfen.
- Protokolle je Kanal: `tiktok-oauth-start`/`-callback`, `facebook-oauth-start`, `instagram-oauth-start`, `youtube-oauth-start`, `oauth-callback`, `publish`.
- Posting-Pfade zum Testen: `publish` (FB/YT/TT-Zweige), `publish-to-instagram`, `tiktok-upload`.
- Keine Änderung an der bestehenden OAuth-Logik, bevor ein Test sie widerlegt.
