# v430 Schritt 6 — Implementierungsvertrag (UI-Cleanup, sequenziell)

Nur Oberfläche, Begriffe und Client-Projektion. Keine Migration, keine Edge-Function-/Backend-Semantik, keine Lip-Sync-Writer, keine Reverse-Bridge-Arbeit. `transition_type`, Remotion und Director's Cut bleiben unverändert.

Jede Teilphase wird einzeln umgesetzt, getestet und berichtet. Erst nach dem Bericht startet die nächste.

## 6.1 Szenenaktionen

Heute liegen die Szenen-Operationen verstreut in `SceneCard.tsx` (u. a. `reset-lipsync-scene`, Hard-Reset mit `reset: true`, Kontinuitäts-Update in `SceneContinuityStatus.tsx`).

- Neue Komponente `SceneActionsMenu.tsx` als einziger Einstiegspunkt „Szenenaktionen“ mit drei getrennt benannten Einträgen:
  - **Lip-Sync neu erstellen** (Plate bleibt erhalten)
  - **Szene komplett neu erstellen** (voller Run-Reset, Credit-Hinweis bleibt)
  - **Kontinuität aktualisieren** (nur Anschluss neu binden, kein Render)
- Die vorhandenen Handler werden aus `SceneCard.tsx` unverändert als Callbacks hineingereicht; identische Function-Aufrufe, identische Payloads, identische Bestätigungsdialoge.
- Sichtbarkeitslogik pro Eintrag kommt aus `sceneState()` / `sceneSubstate()`; Lip-Sync-Eintrag nur bei bestehendem Lip-Sync-Intent.
- Sammelbegriff „Reset“ verschwindet aus den Labels.

## 6.2 `transitionType` → `cutStyle` (Teil-Rename)

- Umbenennung im Composer-Modell (`ComposerScene` in `src/types/video-composer.ts`) und in Composer-UI (`TransitionHandle.tsx`, `SceneTransitionInlineEditor.tsx`, `StoryboardTab.tsx`, `StoryboardScenePlayerList.tsx`, `VideoComposerDashboard.tsx`).
- Genau eine Mapping-Grenze: `src/lib/video-composer/sceneSnapshot.ts` (`transition_type: scene.cutStyle`) plus die DB-Lesestelle im Dashboard-Mapping. Sonst nirgends.
- Unberührt: DB-Spalte `transition_type`, Render-Payloads, `src/remotion/**`, `src/types/directors-cut.ts`, Director's-Cut-Komponenten, `src/utils/transitionResolver.ts` (Render-Seite).
- Test: Snapshot-Test, dass `cutStyle` verlustfrei nach `transition_type` und zurück gemappt wird.

## 6.3 Kundensprache in der normalen UI

- Sichtbare Begriffe „Two-Shot“, „Plate“, „Cinematic-Sync“, `twoshot_stage`, rohe Fehlercodes in Badges/Toasts/Tooltips werden auf Kundentexte umgestellt (DE/EN/ES über `i18nText`/`tx`).
- Betroffen vor allem: `ClipsTab.tsx`, `SceneCard.tsx`, `SceneDialogStudio.tsx`, `SceneClipProgress.tsx`, `ComposerSequencePreview.tsx`, `RenderPreFlightDialog.tsx`.
- Interne Codes bleiben erhalten: eine zentrale Abbildung `errorCode → Kundentext` mit Beibehaltung des Rohcodes in der Debug-/Detailzeile und in `console`-Logs. Kein Fehlercode wird gelöscht.
- Nicht betroffen: Backend-Fehlerstrings, Log-Ausgaben, Vertragstests.

## 6.4 SceneCard bereinigen

- Verbliebene lokale Zustandsableitungen in `SceneCard.tsx` durch `sceneState()` / `sceneSubstate()` ersetzen; Videoquelle ausschliesslich über `resolveSceneOutput()`.
- Reine Presentational-Auslagerung, wo eine Ableitung mehrfach dupliziert ist. Keine Verhaltensänderung an Buttons, Gates oder Auto-Triggern.
- Contract-Scanner (5E) muss für `SceneCard.tsx` weiterhin 0 unerlaubte Treffer melden.

## 6.5 Gemeinsame Statusdarstellung

- Eine Komponente `SceneStatusBadge.tsx` plus eine Label-Projektion `sceneStatusLabel(state, substate)` als einzige Quelle für Szenen-Badges.
- Konsumenten: `SceneCard.tsx`/`SceneClipProgress.tsx`, Render-Queue-Ansicht und `RenderPipelinePanel.tsx` — statt drei eigener Label-Tabellen.
- Debug-Zeile (Rohzustand + Fehlercode) bleibt in allen dreien identisch verfügbar.

## Tests und Abschluss

- Neue Unit-Tests: `cutStyle`-Mapping, `sceneStatusLabel`-Projektion über alle States/Substates, Sichtbarkeitsregeln der Szenenaktionen.
- Bestehende Suites: `bunx vitest run src/lib/composer src/hooks src/components` inkl. Contract-Scanner, dazu `tsgo`.
- UI-Smoke-Test im Preview (Motion Studio: Szenenkarte, Aktionen-Menü, Render-Queue, Pipeline-Panel).
- Nach 6.5 und grünen Tests: STOP mit Bericht. Lip-Sync-Writer-Migration und Reverse-Bridge-Abschaltung bleiben v431.

## Vorgehen

6.1 → Bericht → 6.2 → Bericht → 6.3 → Bericht → 6.4 → Bericht → 6.5 → Tests → STOP.
