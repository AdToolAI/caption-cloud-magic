# Wave 4: Letzte deutsche Texte in der englischen UI beseitigen

## Befund (gemessen, nicht geschätzt)

Ein Scan über `src/` (ohne Wörterbücher und Tests) findet aktuell **1.419 hartcodierte Textstellen in 429 Dateien**, die noch deutsch sind und nicht durch `tx({de,en,es})` laufen. Das heißt: in der englischen UI erscheinen an diesen Stellen weiterhin deutsche Sätze.

Typische Kategorien:

| Kategorie | Beispiel | Datei |
| --- | --- | --- |
| Interview-/Onboarding-Fragen | „Welches Produkt möchtest du bewerben?" | `config/universal-video-interviews.ts` (55) |
| KI-Assistent Schnellaktionen | „Was kann AdTool?" | `ai-companion/QuickActions.tsx` (41) |
| Marketing-/Katalogtexte | Arsenal- und Storyline-Texte | `landing/…` (42) |
| Presets & Konfigurationen | „Glasoptik mit weichem Rand", Tonalitätsprofile | `overlayPresets.ts`, `adTonalityProfiles.ts` (30) |
| Toasts/Fehler in Hooks | „Unbekannter Fehler", „Kauf erfolgreich" | `useMarketplace.ts`, `useAutopilot.ts`, `useAICoPilot.ts` |
| Studio-/Composer-UI | Scene-, Assembly-, Export-Panels | `video-composer/*`, `directors-cut/*` |
| Altlast-Ternäre | `language === 'de' ? tx({…}) : 'English'` | u. a. `ToolkitGenerator.tsx` |

Nicht zu ändern (bewusst deutsch bzw. keine UI): Asset-Dateipfade (`hub-covers/erstellen/…`), Produktnamen („Wan Video (Replicate)"), rechtliche Seiten mit eigener Sprachlogik, Demo-/Seed-Daten.

## Was gebaut wird

1. **Vollständige Inventur** — der Scan wird als Datei fixiert (Pfad, Zeile, Text), false positives (Pfade, Marken-/Modellnamen, Enum-Werte, Log-Ausgaben) werden herausgefiltert. Ergebnis: eine belastbare Arbeitsliste echter UI-Strings.

2. **Übersetzung in Wellen** — die Liste wird in Pakete zerlegt und parallel abgearbeitet. Jeder String wird auf `tx({ de, en, es })` (bzw. `useTx()` in Komponenten) umgestellt, Platzhalter und Template-Variablen bleiben erhalten. Fachbegriffe und Markennamen (AdTool AI, Director's Cut, Lip-Sync, Modellnamen) bleiben unübersetzt.

3. **Altlast-Ternäre aufräumen** — Muster wie `language === 'de' ? tx({…}) : '…'` werden auf reines `tx({…})` reduziert, damit Spanisch nicht auf Englisch zurückfällt.

4. **Config-Dateien sprachfähig machen** — Interview-Fragebögen, Overlay-Presets, Tonalitätsprofile und Hub-Beschreibungen liefern ihre Labels künftig über `tx()` statt fester deutscher Strings; die Datenstruktur bleibt gleich.

5. **Regressionsschutz** — ein Test (analog zu `brand-consistency.test.ts`) schlägt fehl, sobald in `src/` neue hartcodierte deutsche UI-Strings außerhalb von `tx()`/Wörterbüchern auftauchen. Die zulässigen Ausnahmen stehen in einer expliziten Allowlist.

6. **Stichprobe in der laufenden App** — nach der Umstellung werden die wichtigsten Flows (Dashboard, AI Video Studio, Video Composer, Director's Cut, Autopilot, Einstellungen/Verbindungen, Mediathek) mit Sprache = English geprüft und Restfunde nachgezogen.

## Technische Details

- Scanner: Python-Skript über `src/**/*.ts(x)`, String-Literale mit deutschem Wortmarker, Ausschluss von `translations.ts`, `translationsFill.ts`, `i18nText.ts`, Tests und Kommentaren.
- Umstellung erfolgt datei-lokal über `tx()` aus `src/lib/i18nText.ts`; keine neuen Keys im zentralen Wörterbuch nötig.
- Reine Datenkonstanten (Presets, Interviews) erhalten Labels als Funktion/`tx()`-Aufruf zur Renderzeit, damit ein Sprachwechsel ohne Reload greift.
- Kein Backend-Eingriff: die Edge Functions sind bereits über `x-app-lang` / `profiles.language` dreisprachig.

## Umfang

Etwa 400 Dateien, verteilt auf 5–6 parallele Pakete. Backend, Datenmodell und Geschäftslogik bleiben unverändert — es werden ausschließlich Anzeigetexte angefasst.
