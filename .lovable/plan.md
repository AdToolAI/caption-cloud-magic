# Auswertung Sharing Debugger: die Startseite ist sauber

## Was die drei Screenshots sagen

| Prüfpunkt | Ergebnis |
|---|---|
| Response Code | **200** |
| Fetched URL / Canonical | `https://useadtool.ai/` — identisch, keine Weiterleitungskette |
| Link Preview | wird korrekt mit Bild, Titel und Beschreibung gerendert |
| Einzige Warnung | **„Missing Properties: fb:app_id"** |

Damit ist belegt: `https://useadtool.ai/` ist für Metas Crawler **nicht kaputt**. Der Dialog „Broken URL detected" beruhte auf einem älteren, zwischengespeicherten Scrape-Ergebnis — der neue Scrape von vor 3 Minuten ist 200.

Zwei Nebenbefunde aus Screenshot 3 (kosmetisch, kein Blocker):
- Titel, Description, Card und Image tauchen **doppelt** auf (`og:temporal:twitter:*` zeigt jeweils zwei Werte) — es gibt zwei Quellen für dieselben Social-Tags.
- `og:temporal:twitter:url` steht auf `https://useadtool.ai/https://useadtool.ai/` — eine URL wurde doppelt zusammengesetzt.

## Was jetzt zu tun ist

**Dein Schritt in Meta (der Blocker):**
1. Sharing Debugger nochmal, diesmal mit der **Datenschutz-URL** (die, die du in App-Grundeinstellungen als Privacy Policy URL eingetragen hast) → „Scrape Again". Nur wenn die auch 200 liefert, ist der „Invalid Privacy Policy URL"-Dialog ebenfalls nur ein alter Cache-Stand.
2. Danach App Mode erneut auf **Live** stellen. Der Dialog sollte jetzt nicht mehr kommen.
3. Dann **App Review → Permissions and Features → `public_profile` → Request advanced access**. Das ist der verbliebene echte Grund für „Feature nicht verfügbar".

**Mein Schritt im Code:**

**1. `fb:app_id` ergänzen** — die einzige Warnung, die der Debugger meldet. Meta wertet das bei Login-Apps als Signal für die Zuordnung Website ↔ App.
- Neues Meta-Tag `<meta property="fb:app_id" content="<Meta App-ID>" />` im Head.

**2. Doppelte Social-Tags auflösen**
- Sitewide-Tags bleiben in `index.html`, die zweite Quelle liefert für die Startseite keine abweichenden Werte mehr — der Debugger sieht dann je Property genau einen Wert.

**3. Kaputte `twitter:url` reparieren**
- In der Komponente, die pro Route die Social-Tags setzt, wird die URL doppelt mit der Domain verkettet. Künftig genau einmal absolut auflösen (`https://useadtool.ai/…`).

**4. Diagnose-Panel ehrlich machen** (weiterhin offen aus den letzten Runden)
- Meta-Berechtigungen mit Zugriffslevel (Advanced/Standard) anzeigen, inkl. Klartext-Blocker „`public_profile` braucht Advanced Access".
- `category` und `app_type` nicht mehr als fehlende Pflichtfelder werten — deine Grunddaten sind gepflegt, unsere Prüfung meldete falsch.
- TikTok-Fehlalarm beheben: pro Kanal das korrekte Soll-Callback prüfen (`tiktok-oauth-callback` statt `oauth-callback`).

## Technische Details

- `index.html`: `fb:app_id` ergänzen; Social-Tag-Block als alleinige Quelle für die Startseite belassen.
- `src/components/SEO.tsx`: `twitter:url` (und analog `og:url`/canonical) über einen einzigen Helper absolut auflösen, damit keine Domain-Verdopplung entsteht; auf der Startseite keine identischen Duplikate mehr emittieren.
- `supabase/functions/oauth-config-check/index.ts`: Graph-Call auf die Permissions-Übersicht (`meta_permissions: [{ permission, status }]`); Pflichtfeld-Liste um `category`/`app_type` bereinigt; `expected_redirect` je Provider.
- `src/components/performance/ConnectionDiagnostics.tsx`: Abschnitt „Meta-Berechtigungen" mit Ampel je Permission, Blocker-Hinweis bei `public_profile !== advanced`, Soll-Redirect je Kanal.
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Änderung an der OAuth-Logik selbst.

Für Punkt 1 brauche ich die **Meta App-ID** (steht in den App-Grundeinstellungen ganz oben) — schick sie mir, dann trage ich sie ein.
