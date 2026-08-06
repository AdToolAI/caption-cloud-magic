# Der eigentliche Blocker: Meta kann die App nicht live schalten

## Was die beiden Screenshots zeigen

1. **„Broken URL detected"** — Meta blockiert den Wechsel in den Live-Modus, weil es die **Site URL `https://useadtool.ai/`** als nicht erreichbar bewertet.
2. **„Invalid Privacy Policy URL"** — dieselbe Bewertung für die Datenschutz-URL; deshalb lässt Meta auch kein „Request advanced access" für `public_profile` zu.

Damit ist die Kette vollständig erklärt:

```text
Site-/Privacy-URL von Metas Crawler als "broken" bewertet
   -> App kann nicht wirklich Live gehen
   -> public_profile bleibt auf "Standard access" (Verification required)
   -> Facebook Login zeigt "Feature nicht verfügbar"
```

## Was ich geprüft habe

Ich habe die drei URLs direkt abgefragt — einmal normal und einmal mit Metas Crawler-Kennung `facebookexternalhit`:

| URL | normal | als Meta-Crawler |
|---|---|---|
| `https://useadtool.ai/` | 200 | 200 |
| `https://useadtool.ai/privacy` | 200 | 200 |
| `https://useadtool.ai/legal/terms` | 200 | 200 |

`robots.txt` erlaubt `/` und blockiert keine der drei Seiten.

Aus unserer Sicht sind die Links also erreichbar. Das heißt: Metas Urteil beruht entweder auf einem **zwischengespeicherten alten Ergebnis** (früherer Ausfall/Redirect) oder darauf, dass der Meta-Crawler von seinen eigenen IP-Bereichen aus geblockt/gedrosselt wird — beides sehen wir von hier aus nicht.

## Was du in Meta machst (Reihenfolge wichtig)

1. **Sharing Debugger** öffnen: `https://developers.facebook.com/tools/debug/`
   - `https://useadtool.ai/` eingeben → **„Scrape Again"**. Response Code muss 200–299 sein.
   - Dasselbe für `https://useadtool.ai/privacy` und `https://useadtool.ai/legal/terms`.
   - Zeigt der Debugger dort einen Fehlercode oder eine Weiterleitung, schick mir bitte einen Screenshot davon — das ist die harte Diagnose.
2. Danach **App Mode auf Live** schalten. Erst wenn das ohne Dialog durchgeht, ist der Blocker weg.
3. Dann **App Review → Permissions and Features → `public_profile` → Request advanced access**.
4. Zum Schluss in der App „Mit Facebook verbinden" testen.

## Was ich am Code nachziehe

**1. Meta-Crawler garantiert bedienen**
Für `/`, `/privacy` und `/legal/terms` stelle ich sicher, dass ohne JavaScript sofort ein vollständiges HTML-Grundgerüst mit `<title>`, Meta-Description und Open-Graph-Tags ausgeliefert wird. Metas Crawler führt kein JavaScript aus; eine leere Seiten-Hülle kann er als „broken" bewerten, selbst bei HTTP 200.

**2. Keine Weiterleitungen auf diesen drei URLs**
Prüfen und sicherstellen, dass weder Root noch die Rechtsseiten über eine Zwischenweiterleitung laufen (`useadtool.ai` → `www` → App-Route) — Umleitungsketten sind eine häufige Ursache für Metas Broken-URL-Urteil.

**3. Diagnose ehrlich machen** (aus der vorherigen Runde, weiterhin gültig)
- Meta-Berechtigungen mit Zugriffslevel (Advanced / Standard) im Diagnose-Panel anzeigen, inklusive Klartext-Blocker „`public_profile` braucht Advanced Access".
- `category` und `app_type` nicht mehr als Pflichtfelder werten (Grunddaten sind gepflegt, unsere Prüfung meldete falsch).
- TikTok-Fehlalarm beheben: pro Kanal das korrekte Soll-Callback-Ziel prüfen (`tiktok-oauth-callback` statt `oauth-callback`).

## Technische Details

- `index.html`: vollständige statische Head-Metadaten (Title, Description, OG, Canonical) sicherstellen, damit Crawler ohne JS verwertbaren Inhalt bekommen.
- Routing/Redirects (`public/_headers`, `public/.htaccess`, `vercel.json`) auf Weiterleitungsketten für `/`, `/privacy`, `/legal/terms` prüfen und ggf. auf direkte 200-Auslieferung stellen.
- `supabase/functions/oauth-config-check/index.ts`: zusätzlicher Graph-Call auf die Permissions-Übersicht (`meta_permissions: [{ permission, status }]`); Pflichtfeld-Liste um `category`/`app_type` bereinigt; nicht lesbare Felder als `unreadable`; `expected_redirect` je Provider.
- `src/components/performance/ConnectionDiagnostics.tsx`: Abschnitt „Meta-Berechtigungen" mit Ampel je Permission; Blocker-Hinweis bei `public_profile !== advanced`; Soll-Redirect je Kanal.
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Änderung an der OAuth-Logik selbst.
