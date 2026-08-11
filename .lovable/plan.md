# Briefing-Analyse: eine Pipeline statt drei

## Die smarteste Lösung

Nicht drei Pfade parallel reparieren, sondern **einen einzigen Briefing-Service** bauen, den alle Einstiege benutzen. Jeder zusätzliche Pfad ist eine weitere Stelle, an der Schema, Modell, Sprache und Fehlerverhalten auseinanderlaufen — genau das verursacht heute die Widersprüche.

Zielbild:

```text
Formular-Briefing  ┐
Freitext-Import    ├─→  analyze-briefing (eine Edge Function)
Production Plan    ┘         │
                             ├─ Pass A: Struktur extrahieren (Manifest)
                             ├─ Pass B: Mentions auflösen + Konsistenz (optional)
                             └─ Ergebnis: EIN Manifest-Objekt
                                       │
                             ein Apply-Hook → Composer-State (+ optional persistiert)
```

Ein Schema, ein Modell-Set, ein Fehler- und Sprachverhalten, ein Apply-Weg.

## Warum das „fehlerfrei für den Kunden" bedeutet

- **Kein Schema-Drift mehr**: Das Manifest-Schema liegt einmal in `_shared/` und wird sowohl für den Tool-Call als auch für die Validierung benutzt. Ein Feld ändern heißt: eine Datei ändern.
- **Kein stiller Teilfehler**: Das Modell-Ergebnis wird serverseitig validiert. Ungültig heißt „nochmal versuchen" (ein Repair-Durchlauf mit den Validierungsfehlern im Prompt) und danach eine klare Fehlermeldung — nie halb-befüllte Szenen.
- **Verständliche Fehler in der Sprache des Nutzers**: Rate-Limit, Guthaben, Modellfehler kommen übersetzt (DE/EN/ES) aus einer gemeinsamen Fehlerhilfe.
- **Kein Abbruch mitten in der Generierung**: Die Analyse streamt, statt nach ~30 s ins Leere zu laufen. Der Nutzer sieht Fortschritt ("Briefing wird gelesen…", "Szenen werden gebaut…") statt eines toten Spinners.
- **Guthaben stimmt immer**: Ein Abrechnungspunkt am Ende des erfolgreichen Laufs; bricht Pass B ab, wird nichts belastet bzw. idempotent erstattet.

## Umsetzung in vier Schritten

**Schritt 1 — Fundament (ohne Verhaltensänderung)**
- `supabase/functions/_shared/briefingManifest.ts`: Zod-Schema + daraus generiertes Tool-Schema, ein einziges Mal.
- `supabase/functions/_shared/briefingModels.ts`: Primary + Fallback-Kette, stabiles Modell statt Preview im Hauptpfad.
- `supabase/functions/_shared/briefingErrors.ts`: übersetzte Fehler (429/402/Timeout/Validierung).

**Schritt 2 — `analyze-briefing` als neue Zielfunktion**
- Basis ist die vorhandene Deep-Parse-Logik (die reifste der drei), aufgeräumt und auf die shared Bausteine gesetzt.
- Zwei Modi: `mode: "structured"` (Formular) und `mode: "freeform"` (Import/Plan). Beide liefern dasselbe Manifest.
- Streaming-Antwort mit Statusereignissen; Validierung + ein Repair-Retry vor dem Fehlerfall.
- Persistenz in `composer_production_plans` bleibt optional per Flag.

**Schritt 3 — Frontend auf einen Weg umstellen**
- `BriefingTab` (Formular), `BriefingImportDialog` (Freitext) und `useStoryboardTransition` rufen alle `analyze-briefing`.
- Ein gemeinsamer Apply-Hook (`useApplyBriefingManifest` erweitert, `useApplyProductionPlan` geht darin auf) inklusive einer einzigen Mention-Auflösung.
- Sichtbare Fehlerzustände im Dialog statt `console.warn`.

**Schritt 4 — Altlasten entfernen und absichern**
- `parse-briefing` und `compose-video-storyboard` werden entfernt, sobald der neue Pfad läuft.
- Regex-Dauer-Heuristik wird zur reinen Plausibilitätswarnung degradiert (nicht mehr konkurrierende Quelle).
- Tests: Schema-Paritätstest (bricht den Build bei Drift), Snapshot-Test „Briefing → Manifest" für ein deutsches und ein englisches Beispielbriefing, Fehlerpfad-Test für 429/402/ungültiges Manifest.

## Technische Details
- Neue Dateien: `supabase/functions/analyze-briefing/index.ts`, `supabase/functions/_shared/briefingManifest.ts`, `briefingModels.ts`, `briefingErrors.ts`.
- Geändert: `src/components/video-composer/BriefingTab.tsx`, `src/components/video-composer/briefing/BriefingImportDialog.tsx`, `src/components/video-composer/briefing/ProductionPlanSheet.tsx`, `src/hooks/useStoryboardTransition.ts`, `src/hooks/useApplyBriefingManifest.ts`, `src/hooks/useApplyProductionPlan.ts`.
- Entfernt (Schritt 4): `supabase/functions/parse-briefing/`, `supabase/functions/compose-video-storyboard/`.
- Keine DB-Schemaänderung; `composer_production_plans` bleibt wie es ist.
- Kein künstliches Client-Timeout auf den Modell-Aufruf — stattdessen Streaming, damit lange Analysen sauber durchlaufen.

## Risiko und Reihenfolge
Schritte 1–3 sind additiv: Der neue Pfad läuft neben dem alten, umgeschaltet wird pro Einstieg. Schritt 4 (Löschen) passiert erst, wenn alle drei Einstiege verifiziert auf `analyze-briefing` laufen.
