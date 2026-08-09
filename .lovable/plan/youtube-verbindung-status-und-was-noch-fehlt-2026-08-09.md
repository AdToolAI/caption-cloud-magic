# YouTube-Verbindung: Status und was noch fehlt

## Kurzantwort

Der Weg ist gebaut, aber **noch nie live durchlaufen**: In der Datenbank gibt es aktuell 1 Facebook-, 1 LinkedIn- und 3 TikTok-Verbindungen — **null YouTube-Verbindungen**. Technisch fehlt außerdem eine Kleinigkeit, die den ersten echten Connect kippen kann, plus eine tote Publish-Funktion.

## Befunde (geprüft)

1. **Start und Callback sind sauber.** `youtube-oauth-start` baut die Google-URL serverseitig (Client-ID aus Server-Secret, `access_type=offline`, `prompt=consent`, State in `oauth_states`), `oauth-callback` tauscht den Code, speichert Access- und Refresh-Token verschlüsselt und liest den Kanalnamen. Beide Google-Secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) sind hinterlegt.

2. **Posten über `publish` ist korrekt und ehrlich.** Ohne Verbindung kommt `YT_NO_CONNECTION`, abgelaufene Token werden über den Refresh-Token erneuert, Fehler sind benannt (kein Fake-Erfolg mehr).

3. **Tote zweite Publish-Funktion.** `publish-to-youtube` lädt über eine Umgebungsvariable `YOUTUBE_ACCESS_TOKEN`, die es gar nicht gibt — jeder Aufruf scheitert mit „YouTube credentials not configured“. `src/hooks/useSocialPublishing.ts` ruft genau diese Funktion auf. Es gibt also zwei Posting-Wege, von denen einer garantiert kaputt ist.

4. **Ungeprüfte Google-Freigabe.** Die verwendeten Scopes (`youtube.upload`, `youtube.force-ssl`, `youtube.readonly`) sind bei Google „sensitive/restricted“. Steht das Google-Projekt im Testmodus, können sich nur eingetragene Tester verbinden; ohne Verification sieht der Kunde den „App nicht verifiziert“-Warnbildschirm. Der Freigabestatus ist von hier aus nicht auslesbar — das musst du in der Google-Konsole prüfen.

5. **Überflüssiges Secret.** `YOUTUBE_CLIENT_SECRET` existiert, wird aber nirgends gelesen (der Code nutzt `GOOGLE_CLIENT_SECRET`). Verwirrungsquelle.

## Was ich umsetze

**A. Einen einzigen Posting-Weg**
- `useSocialPublishing.ts` auf die funktionierende `publish`-Funktion (YouTube-Zweig mit Verbindung, Token-Refresh, echten Fehlercodes) umstellen.
- Die tote `publish-to-youtube`-Funktion entfernen, damit es nur eine Wahrheit gibt.

**B. Verbindungs-Diagnose für YouTube**
- Im Verbindungsbereich pro Kanal sichtbar machen: Zugangsdaten gesetzt, Verbindung vorhanden, Kanalname, Token gültig/abgelaufen, Refresh-Token vorhanden. Grundlage sind `health-yt` und die bestehende `social-health`.
- Fehlt der Refresh-Token (passiert, wenn Google bei erneuter Zustimmung keinen neuen ausgibt), wird das klar als „Neu verbinden nötig“ markiert statt erst beim Posten zu scheitern.

**C. Klare Fehlermeldungen im Frontend**
- `YT_NO_CONNECTION`, `YT_NO_REFRESH_TOKEN`, `YT_TOKEN_INVALID` und Google-Quota-Fehler in verständliche Texte (DE/EN/ES) übersetzen, mit Direktlink zu den Verbindungen.

**D. Abnahme mit deinem Konto**
Nach den Änderungen: einmal verbinden → Diagnose muss „verbunden + Kanalname“ zeigen → ein kurzes Testvideo als „privat“ hochladen. Ich lese die Protokolle parallel mit und benenne jeden Abbruch mit Ursache. Erst danach ist „Kunden können auf YouTube posten“ belegt.

## Was du parallel prüfen musst (nicht im Code lösbar)

- Google Cloud → OAuth-Zustimmungsbildschirm: Veröffentlichungsstatus (Test vs. Produktion) und ob die drei YouTube-Scopes für Verification eingereicht sind.
- Autorisierte Redirect-URI muss exakt `https://<projekt>.supabase.co/functions/v1/oauth-callback?provider=youtube` enthalten.
- YouTube Data API v3 im Projekt aktiviert; Upload-Kontingent beachten (ein Upload kostet ~1600 Einheiten von 10.000/Tag).

## Technische Details

- Ändern: `src/hooks/useSocialPublishing.ts` (Invoke auf `publish` mit `channels: ['youtube']` + `youtubeConfig`).
- Löschen: `supabase/functions/publish-to-youtube/` und der Eintrag in `supabase/functions/_shared/smokeRegistry.ts`.
- Erweitern: Diagnose-Panel in `src/components/performance/ConnectionsTab.tsx` um YouTube-Zeile (Quelle: `health-yt`, `social_connections`-Felder `account_name`, `token_expires_at`, `refresh_token_hash` vorhanden ja/nein).
- Texte in `src/lib/translations.ts` (DE/EN/ES).
- Keine Änderung an `youtube-oauth-start` oder am YouTube-Zweig in `oauth-callback` — beide sind korrekt.
