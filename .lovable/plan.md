# Diagnose-Auswertung: Meta blockiert wegen fehlender Grunddaten

Die Diagnose liefert jetzt Daten. Zwei Befunde, davon einer echt und einer ein Fehlalarm im Prüfcode.

## Befund 1 — Meta: fehlende Pflichtangaben (echte Ursache)

Der Meta-Block zeigt:
- App-ID: 1769514810345813
- **App-Typ: —** (leer)
- **Kategorie: —** (leer, als „Fehlende Pflichtfelder: category" markiert)

Genau das ist das Muster hinter „Feature nicht verfügbar / wir aktualisieren zusätzliche Details für diese App". Meta blockt den Login-Dialog einer Live-App, solange Grunddaten fehlen — unabhängig davon, dass App Review durch ist.

Das ist **nicht am Code reparierbar**. Es muss im Meta App Dashboard erledigt werden:

1. App-Einstellungen → Grunddaten: **Kategorie** setzen (z. B. „Business and Pages"), Datenschutz-URL, Nutzungsbedingungen-URL, Datenlöschungs-Callback, App-Symbol 1024×1024 — speichern.
2. Falls der App-Typ leer bleibt: unter „Anwendungsfälle" den Use Case „Facebook Login for Business" bzw. „Authentifizierung und Kontoerstellung" vollständig konfigurieren.
3. „Required actions" in der linken Leiste abarbeiten — offene Pflichtaufgaben blockieren den Dialog ebenfalls.

Nach dem Speichern in der Diagnose „Erneut prüfen" drücken: Kategorie muss dann gefüllt sein und „Felder fehlen" verschwinden.

## Befund 2 — TikTok-Warnung ist ein Fehlalarm

Die Zeile „Redirect-URI zeigt nicht auf den Backend-Callback — Verbinden schlägt fehl" stimmt so nicht. TikTok benutzt bei uns eine **eigene** Callback-Funktion (`tiktok-oauth-callback`), nicht die gemeinsame `oauth-callback`. Die Prüfung akzeptiert aber nur `oauth-callback` als gültiges Ziel und stuft deshalb jede korrekte TikTok-Konfiguration als Fehler ein.

Fix: Die Prüfung bekommt pro Kanal das jeweils erwartete Callback-Ziel, statt für alle dasselbe zu verlangen. TikTok gilt als in Ordnung, wenn die Redirect-URI auf `.../functions/v1/tiktok-oauth-callback` zeigt; passt sie nicht, wird der erwartete Wert im Klartext angezeigt (mit Kopier-Button, wie bei Meta).

## Was ich umsetze

1. `oauth-config-check`: kanal-spezifische Soll-Callback-URL (`expected_redirect`) je Provider; `redirect_ok` vergleicht gegen diesen Wert statt gegen den Meta-Callback.
2. Diagnose-Panel: bei nicht passender Redirect-URI wird der Soll-Wert des jeweiligen Kanals angezeigt und kopierbar gemacht — nicht mehr nur die Meta-URL.
3. Meta-Block: Hinweiszeile ergänzen, dass fehlende Grunddaten den Login-Dialog blockieren, mit Direktlink in die Meta-App-Einstellungen.

## Technische Details

- `supabase/functions/oauth-config-check/index.ts`: `ProviderCheck` um `expected_redirect` erweitern; `pointsAtBackend` durch `matchesExpected(uri, expected)` ersetzen; TikTok → `${supabaseUrl}/functions/v1/tiktok-oauth-callback`, Meta → `${supabaseUrl}/functions/v1/oauth-callback`, YouTube unverändert.
- `src/components/performance/ConnectionDiagnostics.tsx`: pro Kanalzeile den Soll-Redirect rendern, wenn `redirect_ok === false`; Kopier-Button wiederverwenden.
- `src/lib/translations.ts`: neue Texte DE/EN/ES für Soll-Redirect je Kanal und den Meta-Grunddaten-Hinweis.
- Keine Änderung an der OAuth-Logik selbst.
