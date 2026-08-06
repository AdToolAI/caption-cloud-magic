# Gefunden: `public_profile` steht auf Standard-Zugriff

## Die Ursache

Screenshot „Facebook Login → Settings" zeigt es wörtlich:

> **Facebook Login requires advanced access** — Your app has standard access to `public_profile`. To use Facebook Login, switch `public_profile` to advanced access.

Das ist exakt der Grund für „Feature nicht verfügbar. Du kannst dich aktuell nicht über Facebook bei dieser App anmelden". Ohne **Advanced Access auf `public_profile`** funktioniert der Login-Dialog nur für Personen mit einer Rolle in der App — für alle anderen bricht Meta mit dieser generischen Meldung ab.

Alles andere ist sauber:
- Client OAuth login: **Yes**, Web OAuth login: **Yes**, Enforce HTTPS: **Yes**, Strict Mode: **Yes**
- Gültige OAuth-Redirect-URIs enthalten `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/oauth-callback` — passt
- Grunddaten, Kategorie, Business- und Access-Verifizierung: vollständig

Es ist also **kein Code-Fehler** und keine fehlende Grunddaten-Angabe.

## Was du in Meta machst (2 Minuten)

1. Auf der Seite Facebook Login → Settings den Link **„Get Advanced Access"** klicken (im gelben Kasten).
2. Alternativ: **App Review → Permissions and Features** → Zeile `public_profile` → **Request Advanced Access**.
3. `public_profile` ist eine Standardberechtigung; Advanced Access wird nach Business-Verifizierung in der Regel sofort gewährt — bei dir ist die Verifizierung bereits „Verified".
4. Gleich mitprüfen, dass auch `email` (falls genutzt) auf Advanced Access steht.

Danach in der App erneut „Mit Facebook verbinden" — der Dialog sollte durchlaufen.

## Was ich am Code nachziehe

**1. Diagnose meldet genau diesen Zustand**
`oauth-config-check` liest künftig den Zugriffslevel der Meta-Berechtigungen (`public_profile`, `email`, `pages_manage_posts`, `instagram_content_publish`) und zeigt pro Berechtigung „Advanced / Standard / fehlt". Steht eine Login-relevante Berechtigung auf Standard, erscheint im Panel der Klartexthinweis „Facebook-Login blockiert: `public_profile` braucht Advanced Access" mit Direktlink.

**2. Phantom-Fehler entfernen**
`category` und `app_type` werden nicht mehr als Pflichtfelder gewertet — die Grunddaten sind gepflegt, unsere Prüfung hat falsch gemeldet. Nicht per API lesbare Felder werden als „nicht lesbar" statt „fehlt" ausgewiesen.

**3. TikTok-Fehlalarm beheben**
TikTok nutzt `tiktok-oauth-callback`, nicht `oauth-callback`. Die Prüfung bekommt pro Kanal das korrekte Soll-Ziel, damit die rote Warnung verschwindet.

## Technische Details

- `supabase/functions/oauth-config-check/index.ts`: zusätzlicher Graph-Call auf die Permissions-Übersicht der App (App-Token); Ergebnis als `meta_permissions: [{ permission, status }]`; Pflichtfeld-Liste um `category`/`app_type` bereinigt; unlesbare Felder als `unreadable`; `expected_redirect` je Provider (TikTok → `.../functions/v1/tiktok-oauth-callback`).
- `src/components/performance/ConnectionDiagnostics.tsx`: neuer Abschnitt „Meta-Berechtigungen" mit Ampel je Permission; Blocker-Hinweis wenn `public_profile !== advanced`; Meta-Block dreistufig (ok / nicht lesbar / fehlt).
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Änderung an der OAuth-Logik selbst.
