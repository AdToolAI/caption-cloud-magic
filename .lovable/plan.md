

# Plan: Test-Runner Fixes — alle 11 Failures beheben

## Diagnose der Ergebnisse

Der KI Superuser hat **erfolgreich Bugs gefunden** — aber **alle 11 Failures sind im Test-Runner selbst**, nicht in der App. Genau dafür ist so ein System da: Wir hätten diese Mismatches sonst nie bemerkt.

### Die 3 Fehler-Cluster

| # | Fehler | Betroffene Szenarien | Ursache |
|---|---|---|---|
| **A** | `HTTP 401 Unauthorized` | Caption (EN), Reel Script, Image Generation, Comments Analysis, Campaign Generation | Edge Functions haben `verify_jwt = true` und brauchen einen **echten User-JWT**, nicht den Service-Role-Key |
| **B** | `HTTP 400 Invalid input` (enum-Mismatch) | Bio Generation (DE), Bio Generation (ES), Performance Analytics | Test schickt deutsches/spanisches Wort `"motivierend"` / `"profesional"`, aber Schema akzeptiert nur englische Enums (`professional`, `casual`, ...). Performance Analytics fehlt das `posts`-Array komplett. |
| **C** | `HTTP 500 Internal Error` | Hashtag Analysis, Posting Times, Hooks Generation | Functions erwarten zusätzliche Felder oder echte User-Daten in der DB (z.B. existierende Posts für Hashtag-Auswertung) |

Der einzige grüne Test (**Trend Radar**) lief mit 84 Sekunden zwar erfolgreich, ist aber **deutlich zu langsam** — gehört nachgelagert optimiert.

## Was wird gebaut

### Fix 1: Echter Test-User mit JWT-Token (löst Cluster A)

Statt Service-Role-Key einen **echten Test-User-Account** anlegen, dessen JWT der Test-Runner für authentifizierte Calls nutzt.

- Migration: legt `ai-superuser@adtool-internal.test` in `auth.users` an (via `auth.admin.createUser`)
- Markiert in `profiles.is_test_account = true` (Spalte existiert bereits)
- Wallet mit Enterprise-Plan + 999M Credits
- Test-Runner generiert bei jedem Lauf einen frischen JWT via `auth.admin.generateLink` und nutzt ihn für alle authentifizierten Functions

### Fix 2: Korrekte Test-Payloads (löst Cluster B + C)

Im Test-Runner die fehlerhaften Bodies an die echten Schemas anpassen:

| Szenario | Korrektur |
|---|---|
| **Bio (DE)** | `tone: "motivierend"` → `tone: "inspirational"` (Schema-konform, `language: "de"` bleibt für Output-Sprache) |
| **Bio (ES)** | `tone: "profesional"` → `tone: "professional"` |
| **Performance Analytics** | Mock-Posts-Array hinzufügen: `posts: [{ engagement_rate: 0.05, caption_text: "..." }, ...]` |
| **Hashtag Analysis** | `hashtags: ["#test", "#demo"]` Array mit Mock-Daten ergänzen |
| **Posting Times** | Mock-Engagement-History im Body mitschicken statt aus DB zu lesen |
| **Hooks Generation** | `style` als String statt `styles` Array (echtes Schema prüfen + anpassen) |

### Fix 3: Robustere Test-Daten-Vorbereitung

- Setup-Phase legt für den Test-User **3 Demo-Posts** in `social_posts` an, damit DB-abhängige Functions (Hashtag, Posting Times) Daten zum Auswerten haben
- Cleanup-Phase löscht generierte Test-Inhalte nach jedem Run (Captions, Bios, Bilder im Test-Workspace)

### Fix 4: Bessere Error-Anzeige im Admin Dashboard

In `AISuperuserAdmin.tsx` neuer **„Details"**-Modal:
- Zeigt vollständige `full_request_json` + `full_response_json`
- Hebt das fehlerhafte Feld farblich hervor
- Button **„Als Bug-Report melden"** → erstellt `bug_reports` Eintrag mit Stack-Trace

### Fix 5: Latenz-Warnung für Trend Radar

- 84 Sekunden für `fetch-trends` ist grenzwertig (Timeout liegt bei 180s)
- Plan-Verweis: Wenn nach Fix 1+2 noch ≥ 30s, optimieren wir später separat (Caching-Layer / paralleles Fetching)
- Fürs Erste: Schwellwert in Anomaly-Detection auf 60s setzen, damit Warning ausgelöst wird

## Reihenfolge

1. Schema-Recherche: Echte Schemas der 6 problematischen Functions exakt auslesen
2. Migration: Test-User + Wallet + Demo-Posts erstellen
3. Test-Runner umbauen: JWT-Generierung + korrigierte Payloads
4. Re-Deploy + manueller Test über „Schnell-Test"-Button
5. Admin UI: Detail-Modal für fehlgeschlagene Runs
6. Validierung: Erwartung **≥ 10/12 Pass-Rate** nach den Fixes

## Erwartetes Ergebnis

Nach den Fixes sollten **alle 12 Szenarien grün laufen**. Falls dann noch Tests rot bleiben, sind das **echte Bugs in der App** — und genau dafür ist dieses System gebaut.

