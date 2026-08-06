# Facebook-Login: "Feature nicht verfügbar" einordnen und absichern

## Was das Bild zeigt

Die Fehlerseite kommt von **Facebook**, nicht von TikTok. Die Adresszeile ist exakt die URL, die unsere Facebook-Verbindung baut (`facebook.com/v24.0/dialog/oauth` mit unserer App-ID `1769514810345813` und unserem Callback).

Meta-Text: "Du kannst dich aktuell nicht über Facebook bei dieser App anmelden, da wir zusätzliche Details für diese App aktualisieren."

Das ist eine **Meta-seitige Sperre**, kein Fehler im Code. Typische Auslöser:
1. Die App-Konfiguration wurde gerade geändert (Advanced Access, Data Use Checkup) und Meta rollt die Änderung noch aus — dauert meist Minuten bis wenige Stunden.
2. Es wird eine Berechtigung angefragt, die (noch) nicht freigegeben ist.
3. Die App wurde auf "Facebook Login for Business" umgestellt — dann lehnt Meta den klassischen Scope-Dialog ab und verlangt eine `config_id`.

Wichtig: Der Screenshot ist von **09:19 Uhr heute Morgen** — also **vor** der Freigabe von `public_profile` und den Pages-/Instagram-Scopes. Sehr wahrscheinlich beschreibt er einen bereits behobenen Zustand.

## Schritt 1 — Aktuellen Stand prüfen (kein Code nötig)

Bitte jetzt erneut "Facebook verbinden" klicken. Zwei mögliche Ausgänge:

- **Es funktioniert:** Fall erledigt, Screenshot war der alte Stand.
- **Fehler kommt erneut:** bitte einen frischen Screenshot inkl. vollständiger URL schicken. Dann greift Schritt 2.

## Schritt 2 — Falls der Fehler bleibt: Business-Login-Konfiguration

Die Verbindungsfunktion unterstützt bereits beide Varianten:
- klassischer Dialog mit Scope-Liste (Standard heute)
- Business-Login mit `config_id`, sobald ein Secret hinterlegt ist

Wenn Meta den klassischen Dialog blockt, holst du im Meta-Dashboard unter **Facebook-Login für Unternehmen → Konfigurationen** die Konfigurations-ID; ich hinterlege sie als Secret, danach nutzt der Flow automatisch die Business-Variante.

## Schritt 3 — TikTok separat betrachten

TikTok läuft über eine eigene Funktion und leitet auf `tiktok.com/v2/auth/authorize/` mit den Scopes `user.info.basic`, `video.upload`, `video.publish`. Der gezeigte Fehler kann also nicht von TikTok stammen. Falls TikTok wirklich klemmt, brauche ich die dort angezeigte Meldung — der TikTok-Zugang steht aktuell noch im Sandbox-Modus, was fremde Konten blockiert.

## Technische Details

- Betroffene Funktion: `supabase/functions/facebook-oauth-start/index.ts` — angefragte Scopes: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`; `config_id` wird über `META_LOGIN_CONFIG_ID` aktiviert.
- Für Schritt 2 ist nur das Setzen des Secrets nötig, keine Codeänderung.
- Optional (nur auf Wunsch): Im Diagnose-Panel den Live-Status jeder Berechtigung aus der Graph API anzeigen, damit solche Sperren sofort sichtbar sind.
