# Briefing-Analyse: Status und die drei verbleibenden Lücken

## Kurzantwort

Die Analyse selbst ist jetzt einstimmig: ein Endpunkt (`analyze-briefing` mit `storyboard` / `freeform` / `deep`), ein Manifest-Schema, eine Modell-Kette, eine übersetzte Fehleroberfläche. Der Router liest den Body einmal und reicht ihn an den jeweiligen Handler weiter — kein doppeltes Lesen, kein Schema-Drift mehr.

Die Übernahme ins Storyboard ist **nicht vollständig**. Drei Punkte sind belegt und sollten geschlossen bzw. bewusst bestätigt werden.

## 1. Dialogtext wird bewusst nicht übernommen

Beim Anwenden des Plans werden `dialogScript` und `dialogTurns` fest auf „leer" gesetzt (Entscheidung „v229"). Übernommen werden Sprecher-Slots, Dialog-Modus, Voiceover-Skript auf Projektebene, Szenen, Dauer, Location, Shot-Direction, Negative Prompts und Captions — aber **nicht der Wortlaut der Dialoge**. Wer im Briefing Dialogzeilen schreibt, findet sie danach im Dialog-Studio nicht wieder.

Vorschlag: Dialogzeilen aus dem Plan wieder übernehmen, aber nur wenn sie eindeutig als Sprechtext markiert sind (Sprecher + Zeile aus `dialogTurns`), mit sichtbarem Hinweis im Plan-Sheet („3 Dialogzeilen werden übernommen") und einem Schalter zum Abwählen. Freitext-/Meta-Zeilen ohne Sprecherzuordnung bleiben draußen — das war das ursprüngliche Fragilitätsproblem.

## 2. Die Deep-Analyse läuft teilweise doppelt

Der Aufrufer feuert 700 ms nach dem ersten Request einen zweiten identischen Deep-Parse-Request („Parallel-Fire"). Bei jeder Analyse, die länger als 700 ms braucht — also praktisch immer — laufen zwei komplette Analysen, zwei Modell-Kosten und potenziell zwei persistierte Planversionen; der Verlierer wird nur abgebrochen.

Vorschlag: Parallel-Fire entfernen und stattdessen einen einzigen Request mit gezieltem Retry bei Netzabbruch/5xx verwenden.

## 3. Sprachmischung im Import-Dialog

Der Freitext-Import-Dialog enthält noch hart kodierte deutsche Strings (Titel, Beschreibung, „Alles übernehmen", Bestätigungs-Toast). In der englischen und spanischen UI erscheint dort Deutsch.

Vorschlag: alle verbleibenden Strings über `tx({de,en,es})` führen, damit der Sprachreinheits-Check greift.

## Umsetzung

1. `src/hooks/useApplyProductionPlan.ts`: Dialogzeilen aus `plan.scenes[].dialogTurns` übernehmen (Sprecher-ID muss auflösbar sein), Schutzregeln für gesperrte/gerenderte Szenen unverändert lassen.
2. `src/components/video-composer/briefing/ProductionPlanSheet.tsx`: Anzeige und Schalter „Dialogzeilen übernehmen".
3. `src/hooks/useStoryboardTransition.ts`: Parallel-Fire durch einfachen Request mit Retry ersetzen.
4. `src/components/video-composer/briefing/BriefingImportDialog.tsx`: Restliche Strings lokalisieren.
5. Test: Snapshot „Plan → Szenen" prüft, dass Dauer, Cast, Location, Shot-Direction, Negative Prompt, Captions und (neu) Dialogzeilen ankommen und geschützte Szenen unangetastet bleiben.

Keine Änderungen an Lip-Sync-Tabellen, Anker-Logik oder der Edge-Function-Struktur.
