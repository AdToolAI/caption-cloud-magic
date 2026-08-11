# Briefing-Analyse: Audit-Ergebnis und Bereinigungsplan

## Was ich gefunden habe

Es gibt heute **drei parallele Briefing-Analyse-Pfade**, die im Kern dasselbe tun (Briefing → Szenen/Manifest):

```text
A) Formular  → compose-video-storyboard  → Szenen direkt in Composer-State
B) Freitext  → parse-briefing            → Manifest → useApplyBriefingManifest
C) Freitext  → briefing-deep-parse (2 Pässe, 3258 Zeilen)
                                          → composer_production_plans → useApplyProductionPlan
```

Content Studio (`BriefStep`) nutzt keinen dieser drei Wege — dort läuft ein vierter, eigener Weg.

### Konkrete Widersprüche

1. **Drei Kopien desselben Tool-Schemas** (je eine pro Edge Function), die laut Code-Kommentar das Frontend-Zod-Schema „spiegeln“ sollen. Schema-Drift ist strukturell eingebaut.
2. **Drei verschiedene Modell-Ketten**: Pfad A auf `gemini-3-flash-preview` (Preview-Modell im Hauptpfad), B und C auf `gemini-2.5-*`.
3. **Zwei verschiedene Apply-Hooks** mit je eigener Mention-Auflösung (`useApplyBriefingManifest` vs. `useApplyProductionPlan`).
4. **i18n-Bruch**: Fehlermeldungen in `compose-video-storyboard` (429/402) sind hart englisch, während `briefing-deep-parse` sauber DE/EN/ES liefert.
5. **Timeout-Mismatch**: Pfad C nutzt bewusst rohes `fetch` mit 120 s, Pfad A/B laufen weiter über `supabase.functions.invoke` (~30 s) — obwohl Pfad A bis zu 4 Gateway-Versuche mit Backoff macht.
6. **Keine serverseitige Validierung** in `parse-briefing`: rohes LLM-JSON geht raus, Zod prüft erst im Client, Fehlerfall nur `console.warn`.
7. **Doppelte Dauer-Logik**: Regex-Heuristiken für Zeitangaben in `briefing-deep-parse` konkurrieren mit der LLM-Extraktion (deshalb existiert überhaupt ein `canonical.source`-Feld).
8. **Credits**: In keiner der drei Functions ist Abzug oder Refund sichtbar. Bei Pfad C (2 Pässe) fehlt ein Refund-Pfad, falls Pass B nach Pass A scheitert.

## Vorgeschlagene Umsetzung (priorisiert)

### Stufe 1 — Korrektheit und Nutzer-sichtbare Fehler
- `compose-video-storyboard`: Fehlertexte (Rate-Limit, Credits, Parse-Fehler) auf `tl()/withLang()` umstellen, Sprache aus dem Request übernehmen.
- `parse-briefing`: Manifest serverseitig gegen dasselbe Schema validieren, bei Fehler strukturierter Fehler statt halb-valider Daten.
- `BriefingImportDialog`: bei ungültigem Manifest sichtbaren Fehler-Toast statt stiller Warnung.
- Frontend-Aufrufe von `compose-video-storyboard` und `parse-briefing` auf `fetch` + `AbortController` (120 s) umstellen, analog `useStoryboardTransition`.

### Stufe 2 — Eine Quelle der Wahrheit
- Das Zod-Manifest-Schema als gemeinsame Datei nach `supabase/functions/_shared/briefingManifest.ts` ziehen; alle drei Functions leiten ihr Tool-Schema daraus ab statt aus manuellen Kopien.
- Modell-Policy zentralisieren (`_shared/briefingModels.ts`): ein Primary + Fallback-Kette für alle Briefing-Calls; Preview-Modell im Hauptpfad durch stabiles Modell ersetzen.
- Mention-Auflösung in einen gemeinsamen Helper zusammenziehen, den beide Apply-Hooks nutzen.

### Stufe 3 — Konsolidierung der Pfade
- `parse-briefing` als eigenständigen Pfad auflösen: Freitext-Import läuft künftig über `briefing-deep-parse` (Pass A allein reicht für den Import-Dialog), Ergebnis wird auf dasselbe Manifest gemappt. Damit bleiben zwei Pfade: Formular (A) und Freitext (C).
- Dauer-Heuristik: Regex bleibt nur noch als Plausibilitätsprüfung mit Warnung, nicht als konkurrierende Quelle; `canonical.source` dokumentieren.
- Credits: prüfen, wo Abzug tatsächlich passiert; für `briefing-deep-parse` idempotenten Refund ergänzen, falls Pass B fehlschlägt (gemäß Projekt-Regel zu Credit-Refunds).
- Tote Refactoring-Reste in `BriefingTab.tsx` entfernen.

## Technische Details
- Betroffen: `supabase/functions/compose-video-storyboard/index.ts`, `supabase/functions/parse-briefing/index.ts`, `supabase/functions/briefing-deep-parse/index.ts`, neue Dateien unter `supabase/functions/_shared/`, `src/components/video-composer/BriefingTab.tsx`, `src/components/video-composer/briefing/BriefingImportDialog.tsx`, `src/hooks/useApplyBriefingManifest.ts`, `src/hooks/useApplyProductionPlan.ts`, `src/hooks/useStoryboardTransition.ts`.
- Keine DB-Schemaänderung nötig; `composer_production_plans` bleibt unverändert.
- Absicherung: Vitest-Test, der Frontend-Zod-Schema und die drei Tool-Schemas auf Feldgleichheit prüft, damit Drift künftig den Build bricht.

## Offene Frage
Soll Stufe 3 (Auflösen von `parse-briefing`) direkt mit rein, oder erst Stufe 1+2 als risikoarme Bereinigung?
