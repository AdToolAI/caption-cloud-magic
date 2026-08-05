# Social-Verbindungen: Status und Nachbesserungen

## Kurzantwort

Technisch ist alles verdrahtet: Instagram, Facebook, TikTok und YouTube haben je einen vollständigen OAuth-Weg (Verbinden → Token verschlüsselt speichern → Posten). Alle nötigen Zugangsdaten (Meta, TikTok, Google) sind hinterlegt. Drei Dinge sind aber noch nicht kundentauglich.

## Befunde

1. **Falscher Erfolg beim Posten (kritisch).** Wenn ein Kunde ohne verbundenen Facebook- oder YouTube-Account postet, meldet das System „erfolgreich veröffentlicht" mit einer erfundenen Post-ID (`FB_MOCK`, `YT_MOCK`) — es wurde nichts gepostet. Das ist ein MVP-Rest und muss vor echten Kunden weg. Instagram, TikTok, LinkedIn und X verhalten sich bereits korrekt und melden „nicht verbunden".

2. **YouTube-Verbindung läuft nicht über eine Backend-Startfunktion.** Instagram, Facebook, TikTok und X starten OAuth serverseitig; YouTube baut die Google-URL im Browser zusammen und liest die Client-ID aus einer Frontend-Variable. Das funktioniert, ist aber der einzige Sonderweg und bricht still, wenn die Variable im Published-Build fehlt.

3. **TikTok ist genehmigt — nur der Umgebungsschalter muss sichtbar sein.** Der Content-Posting-Audit ist durch, Verbinden und Posten sind für echte Kunden freigegeben. Im Code steuert eine Einstellung weiterhin Sandbox oder Produktion; steht sie versehentlich auf Sandbox, können sich nur eingetragene Testkonten verbinden. Deshalb wird der aktive Modus künftig angezeigt statt still angenommen.

Zusätzlich: Für Instagram- und Facebook-Posting braucht Meta die freigeschalteten Berechtigungen (App Review). Ohne Freigabe können nur Rollen der App posten.

## Was ich umsetze

**A. Ehrliche Publish-Ergebnisse**
- Facebook und YouTube liefern bei fehlender Verbindung `ok: false` mit `NO_CONNECTION` statt Fake-Erfolg.
- Die Oberfläche zeigt in dem Fall den Hinweis „Kanal nicht verbunden" mit Direktlink zu den Verbindungen, statt „veröffentlicht".

**B. YouTube auf denselben sicheren Weg wie die anderen**
- Neue Funktion `youtube-oauth-start`, die die Google-Autorisierungs-URL serverseitig baut (Client-ID aus den Server-Secrets, Offline-Zugriff für Refresh-Token).
- Der Verbinden-Button ruft künftig diese Funktion auf; der Browser-Sonderweg entfällt.

**C. Verbindungs-Selbstdiagnose**
- Ein Diagnose-Panel in den Verbindungen zeigt pro Kanal: Zugangsdaten hinterlegt, Redirect-URI gesetzt, Token gültig/abgelaufen, Posting freigeschaltet. Nutzt die vorhandenen Health-Funktionen (`health-ig`, `health-tt`, `health-yt`, `health-li`, `health-x`) und `social-health`.
- Nicht postfähige Kanäle werden klar als „Verbinden möglich, Posten noch in Prüfung" markiert, statt einen Fehler am Ende des Flows zu produzieren.

**D. TikTok-Modus sichtbar machen**
- Der aktive Modus (Produktion/Sandbox) wird im Diagnose-Panel ausgewiesen, damit die genehmigte Live-Integration nicht unbemerkt in Sandbox läuft.

## Technische Details

- `supabase/functions/publish/index.ts`: Mock-Zweige in `publishToFacebook` (Z. ~616) und `publishToYouTube` (Z. ~1037) durch echte Fehlerergebnisse ersetzen.
- Neu: `supabase/functions/youtube-oauth-start/index.ts` (JWT-verifiziert, `oauth_states`-Eintrag wie bei X, Redirect auf `oauth-callback?provider=youtube`). `oauth-callback` bleibt unverändert und nutzt weiter `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- `src/components/performance/ConnectionsTab.tsx`: YouTube-Eintrag aus der Browser-`oauthUrls`-Map entfernen und auf die neue Startfunktion umstellen; neues Diagnose-Panel als eigene Komponente.
- Texte für DE/EN/ES in `src/lib/translations.ts`.

Kein Eingriff in Instagram-, Facebook-, TikTok- oder X-OAuth-Logik — die bleibt unverändert.
