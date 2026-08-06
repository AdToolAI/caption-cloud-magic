# Der 418 im Debugger: die Änderungen sind noch nicht live

## Befund (gerade geprüft)

Ich habe `https://useadtool.ai/` mehrfach als Facebook-Crawler (`facebookexternalhit`) abgerufen:

| Prüfung | Ergebnis |
|---|---|
| 5 Abrufe der Startseite | jedes Mal **200**, 0,07–0,18 s |
| `/privacy` | **200** |
| `og:url` im Live-Head | **noch vorhanden** (`https://useadtool.ai`) |
| `fb:app_id` im Live-Head | **fehlt noch** |

Zwei Dinge folgen daraus:

**1. Die veröffentlichte Version ist noch der alte Stand.** Meine Änderungen (og:url entfernt, `fb:app_id` ergänzt) liegen bisher nur in der Vorschau. Deshalb zeigt der Debugger weiterhin die Startseite als Canonical und die alte Vorschaugrafik.

**2. Der `418` / „Curl Timeout" ist kein Serverfehler.** Die Seite antwortet zuverlässig mit 200 und in unter 0,2 Sekunden. Vor der Auslieferung sitzt Cloudflare (der Response setzt ein `__cf_bm`-Bot-Management-Cookie). Ein `418` ist genau die Antwort, die Cloudflare bei einer Bot-Prüfung ausspielt — Metas Scraper ist in diesem einen Lauf in die Prüfung gelaufen. Das passiert sporadisch, nicht dauerhaft.

## Was zu tun ist

**Schritt 1 — Veröffentlichen.** Ohne Publish sieht Meta die Korrekturen nicht. Das ist Voraussetzung für alles Weitere.

**Schritt 2 — Erneut scrapen.** Im Sharing Debugger nacheinander:
- `https://useadtool.ai/` → „Scrape Again"
- `https://useadtool.ai/privacy` → „Scrape Again"

Erwartung danach: Canonical bei `/privacy` ist `…/privacy` (nicht mehr die Startseite), und die Warnung `fb:app_id` ist weg.

**Schritt 3 — Bei erneutem 418 einfach nochmal „Scrape Again".** Da es die Bot-Prüfung ist, greift beim zweiten oder dritten Versuch in aller Regel der reguläre 200er. Bleibt es dauerhaft bei 418, prüfe ich als Nächstes gezielt, ob sich das Verhalten reproduzieren lässt und ob eine Ausnahme für Metas Crawler nötig ist.

## Kein Code-Änderungsbedarf aktuell

Am Projekt ist für diesen Punkt nichts mehr zu ändern — `fb:app_id` (1769514810345813) und die og:url-Korrektur sind bereits eingebaut und warten nur auf die Veröffentlichung. Sollte der 418 nach dem Publish reproduzierbar bleiben, kommt ein Folgeschritt zur Crawler-Ausnahme.
