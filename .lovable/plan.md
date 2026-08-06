# Meta-Diagnose korrigieren: unsere Prüfung liest falsch

## Was die neuen Screenshots ändern

In den Grunddaten ist alles gesetzt:
- Kategorie: **Social networks & dating**
- Datenschutz-URL, Nutzungsbedingungen, Datenlöschungs-URL, App-Symbol, App-Domain `useadtool.ai`, Kontakt-E-Mail
- Business-Verifizierung: **Verified**, Access-Verifizierung: **Verified**, Data Use Checkup: **complete**

Damit ist meine bisherige Aussage „Kategorie fehlt" **falsch**. Nicht Meta meldet ein fehlendes Feld — **unsere eigene Prüfung** (`oauth-config-check`) liest per App-Token nur einen Teil der Felder und interpretiert leere Rückgaben als „fehlt". `app_type: None` ist bei modernen Meta-Apps zudem normal und kein Fehler.

Auch die 11 Alerts sind, wie du sagst, gewöhnliche Nachrichten — kein Blocker.

Kurz: Die Diagnose zeigt derzeit einen Phantom-Fehler, und die echte Ursache ist noch nicht benannt.

## Der verbleibende Hauptverdacht

Der Login-Dialog wird nicht von den Grunddaten blockiert, sondern von der **Facebook-Login-Produktkonfiguration**:
- „Gültige OAuth-Redirect-URIs" unter Facebook Login → Einstellungen: fehlt dort unsere Backend-Callback-URL, verweigert Meta den Dialog.
- „Client-OAuth-Login" / „Web-OAuth-Login" müssen aktiviert sein.
- Der Use Case „Authentifizierung und Kontoerstellung" bzw. „Facebook Login" muss vollständig konfiguriert sein (das ist auch der Grund für `App type: None`).

Diese Werte sind in den Screenshots nicht enthalten — und genau die liest unsere Diagnose bisher nicht aus.

## Was ich umsetze

**1. Phantom-Fehler abschalten**
`category`/`app_type` werden nicht mehr als Pflichtfelder bewertet. Fehlt ein Feld in der Graph-Antwort, steht künftig „nicht per API lesbar" statt „fehlt" — keine roten Fehlanzeigen mehr für korrekt gepflegte Apps.

**2. Die richtigen Werte auslesen**
`oauth-config-check` fragt zusätzlich die Login-Konfiguration der App ab und zeigt im Panel:
- die bei Meta hinterlegten gültigen OAuth-Redirect-URIs (soweit per App-Token lesbar),
- ob unsere Backend-Callback-URL darunter ist (Abgleich Soll/Ist),
- ob Client-/Web-OAuth-Login aktiv ist.
Ist ein Wert per App-Token nicht lesbar, wird das ehrlich als „nicht lesbar — bitte manuell prüfen" ausgewiesen, mit Direktlink zur Facebook-Login-Einstellungsseite.

**3. Rohantwort sichtbar machen**
Ein ausklappbarer „Details"-Bereich zeigt die vollständige Graph-Antwort. Damit müssen wir bei der nächsten Runde nicht mehr raten, was Meta wirklich liefert.

**4. TikTok-Fehlalarm beheben**
Die Zeile „Redirect-URI zeigt nicht auf den Backend-Callback" bei TikTok ist ebenfalls falsch: TikTok nutzt die eigene Funktion `tiktok-oauth-callback`, die Prüfung akzeptiert aber nur `oauth-callback`. Künftig gilt pro Kanal das jeweils korrekte Soll-Ziel.

## Was du parallel prüfst

Meta App Dashboard → **Facebook Login → Einstellungen**: Steht unter „Gültige OAuth-Redirect-URIs" exakt
`https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/oauth-callback`?
Falls nicht: eintragen und speichern. Screenshot dieser Seite hilft mir, den Rest zu bestätigen.

## Technische Details

- `supabase/functions/oauth-config-check/index.ts`: Pflichtfeld-Liste auf tatsächlich blockierende Felder reduzieren (`category`, `app_type` raus); zusätzlicher Graph-Call auf die Login-Settings-Felder der App; unlesbare Felder als `unreadable` statt `missing` markieren; komplette Graph-Rohantwort unter `meta_app_status.raw` zurückgeben; `expected_redirect` je Provider (TikTok → `.../functions/v1/tiktok-oauth-callback`).
- `src/components/performance/ConnectionDiagnostics.tsx`: Meta-Block auf drei Zustände (ok / nicht lesbar / fehlt); Redirect-Ist/Soll-Vergleich; ausklappbarer Rohdaten-Bereich; Soll-Redirect je Kanalzeile.
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Änderung an der OAuth-Logik selbst.
