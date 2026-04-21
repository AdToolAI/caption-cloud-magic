

# Plan: Phase 5 — Letzte echte Lücken (4 Szenarien) + dann Schluss

## Ehrliche Einschätzung zuerst

**30/30 grün und 98 % Pass-Rate ist ein Top-Wert.** Du bist an dem Punkt, ab dem mehr Tests nicht automatisch besser sind — sie können sogar schaden (mehr Latenz, mehr Wartung, mehr Rauschen). 

Ich habe alle ~340 Edge-Funktionen gegen die Abdeckung verglichen. Es gibt **4 echte Lücken**, die User-spürbar sind, kostenlos getestet werden können und nicht doppelt abgedeckt sind. Danach würde ich aufhören.

## Block G — Die letzten 4 sinnvollen Szenarien

### 1. **Calendar Publish Dispatcher Reachability**
- Funktion: `calendar-publish-dispatcher`
- Warum kritisch: Wenn das ausfällt, werden geplante Posts nicht ausgeliefert — User merken es erst Stunden später
- Test: GET-Reachability mit `expectReachable: true`

### 2. **Web Push Notifications Reachability**
- Funktion: `send-push-notification`
- Warum kritisch: Push-Benachrichtigungen sind die Haupt-Engagement-Bridge bei iOS PWAs; stiller Ausfall ist Standard
- Test: POST mit Dry-Run-Body (kein echter Versand), `expectReachable: true`

### 3. **Cloud Storage OAuth Reachability**
- Funktion: `cloud-storage-oauth`
- Warum kritisch: Google-Drive-Integration für externe Speicher-Erweiterung — bei Ausfall können User keine Drives mehr verbinden
- Test: GET-Reachability mit `expectReachable: true`

### 4. **Render Status Polling Reachability**
- Funktion: `check-render-status`
- Warum kritisch: Diese Funktion wird von der UI permanent gepollt, um Render-Fortschritt anzuzeigen. Bei Ausfall sehen User „endlos lädt"
- Test: GET mit Dummy-renderId, `expectReachable: true` (404/400 zählt als „lebt")

## Bewusst NICHT mehr aufgenommen

Folgende Bereiche werden **nicht** ergänzt — mit Begründung, damit du es bewusst entscheiden kannst:

| Bereich | Warum nicht |
|---|---|
| **Sora/Kling/Hailuo/Wan/Luma echte Generierungen** | Würden 3–8 € pro Komplett-Test kosten. Reachability via Replicate ist bereits drin. |
| **Cron-Funktionen** (`tick-strategy-posts`, `cache-warming`, `community-spotlight-rotate`) | Eigene Logs reichen, würden Rauschen erzeugen |
| **Twitch-Integration** (~14 Funktionen) | Nischenfeature, niedrige User-Anzahl |
| **Director's Cut Sub-Funktionen** (~25) | Indirekt durch `render-queue-manager` + Lambda-Webhook abgedeckt |
| **Email-Versand** (`send-password-reset-email`, etc.) | Resend-Webhook ist schon im Sentry/Email-Monitor sichtbar |
| **Admin-Funktionen** (`admin-stats`, `admin-delete-user`) | Werden ohnehin manuell genutzt, kein User-Impact |
| **Compose-Pipeline** (`compose-video-*`) | AI Video Composer ist über `render-queue-manager` indirekt drin |

## Geänderte Dateien

- `supabase/functions/ai-superuser-test-runner/index.ts` — 4 neue Einträge im SCENARIOS-Array, alle `optional: true` und `expectReachable: true`, gruppiert als „Block G — Final Coverage" mit Kommentar-Header
- `src/pages/admin/AISuperuserAdmin.tsx` — `ACTIVE_SCENARIOS` Whitelist um die 4 Namen ergänzen, Latenz-Schwellen leicht anheben (90s grün / 130s gelb)

## Verifikation

„Komplett-Test" auslösen. Erwartung:
- **34 Szenarien** sichtbar (30 + 4)
- Alle grün oder klare Warnings (z. B. wenn Push-Service nicht konfiguriert ist → gelb statt rot)
- Latenz: ~60–80s
- Pass-Rate bleibt ≥ 95 %

## Erwartetes Ergebnis & Empfehlung danach

Nach Phase 5 ist der Superuser **vollständig** für alles, was sich kostenlos und sinnvoll testen lässt. Mein Rat:

> **Hör nach Phase 5 auf, neue Szenarien hinzuzufügen.** Stattdessen lieber:
> 1. Den **Cron-Trigger** für tägliche automatische Komplett-Tests einrichten (falls noch nicht aktiv)
> 2. **Slack/Email-Alert** bei Pass-Rate < 90 % anbinden
> 3. Die `analyze-superuser-anomalies` KI-Analyse-Funktion nutzen, um bei Ausfällen automatisch Root-Cause-Hypothesen zu generieren

Das bringt mehr Wert als noch mehr Szenarien.

