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
- Aktionsverfügbarkeit kommt ausschliesslich aus den bereits kanonischen Selektoren — keine neue lokale Ableitungslogik im Menü:
  - Haupt-/Substate über `sceneState()` / `sceneSubstate()`.
  - Lip-Sync-Verfügbarkeit über den bestehenden Lip-Sync-Intent-Vertrag (`isLipSyncIntentionalRow`, v425-Providerliste), nicht über den Pipeline-State allein.
  - Kontinuität über die bestehenden Continuity-Helper in `src/lib/composer/continuity/continuityState.ts` (`continuity_stale`, `needsContinuityRerender`, Vorgänger-Finalität, `continuity_source_scene_id`).
- Sammelbegriff „Reset“ verschwindet aus den Labels.

## 6.2 `transitionType` → `cutStyle` (Teil-Rename)

- Vor dem Rename: vollständiges Inventar aller Reads/Writes von `transitionType` und `transition_type` im Composer-Bereich (Hydration, Persistenz, Create/Insert, Snapshot, UI). Das Inventar ist Teil des 6.2-Berichts.
- Im Composer-Domain-Modell heisst das Feld ausschliesslich `cutStyle` (`ComposerScene` in `src/types/video-composer.ts`, Composer-UI: `TransitionHandle.tsx`, `SceneTransitionInlineEditor.tsx`, `StoryboardTab.tsx`, `StoryboardScenePlayerList.tsx`, `VideoComposerDashboard.tsx`).
- An jeder tatsächlichen Persistenz-/Hydration-Grenze wird explizit `cutStyle ↔ transition_type` gemappt. Die Zahl der Grenzen bleibt minimal, wird aber nicht künstlich auf eine reduziert. Bekannt sind bereits: `src/hooks/useComposerPersistence.ts` (zwei Write-Stellen, u. a. der `'fade'`-Default), Dashboard-Hydration und `src/lib/video-composer/sceneSnapshot.ts`; Create/Insert-Pfade werden im Inventar geprüft.
- Unberührt: DB-Spalte `transition_type`, Render-Payloads, `src/remotion/**`, `src/types/directors-cut.ts`, Director's-Cut-Komponenten, `src/utils/transitionResolver.ts` (Render-Seite).
- Test: Round-Trip-Test pro Mapping-Grenze — `cutStyle` verlustfrei nach `transition_type` und zurück, inklusive Default-Verhalten.

## 6.3 Kundensprache in der normalen UI

- Fehlertexte werden **codebasiert projiziert**, nicht durch aggressives Ersetzen roher Backend-Strings: bekannter Code → Kundentext (DE/EN/ES über `i18nText`/`tx`), unbekannter Fehler → neutraler Fallback. Roh-Code und Rohtext bleiben in Details/Debug und in `console`-Logs sichtbar.
- Sichtbare Restbegriffe „Two-Shot“, „Plate“, „Cinematic-Sync“, `twoshot_stage` in Badges/Toasts/Tooltips werden auf Kundensprache umgestellt.
- Betroffen vor allem: `ClipsTab.tsx`, `SceneCard.tsx`, `SceneDialogStudio.tsx`, `SceneClipProgress.tsx`, `ComposerSequencePreview.tsx`, `RenderPreFlightDialog.tsx`.
- Nicht betroffen: Backend-Fehlerstrings, Log-Ausgaben, Vertragstests.

## 6.4 SceneCard bereinigen

- Verbliebene lokale Zustandsableitungen in `SceneCard.tsx` durch `sceneState()` / `sceneSubstate()` ersetzen; Videoquelle ausschliesslich über `resolveSceneOutput()`.
- Reine Presentational-Auslagerung, wo eine Ableitung mehrfach dupliziert ist. Keine Verhaltensänderung an Buttons, Gates oder Auto-Triggern.
- Contract-Scanner (5E) muss für `SceneCard.tsx` weiterhin 0 unerlaubte Treffer melden.

## 6.5 Gemeinsame Statusdarstellung

- Eine Komponente `SceneStatusBadge.tsx` plus eine Label-Projektion `sceneStatusLabel(state, substate)` als einzige Quelle für Szenen-Badges.
- Konsumenten: `SceneCard.tsx`/`SceneClipProgress.tsx`, Render-Queue-Ansicht und `RenderPipelinePanel.tsx` — statt drei eigener Label-Tabellen.
- Debug-Zeile (Rohzustand + Fehlercode) bleibt in allen dreien identisch verfügbar.
- Test der Projektion über **alle** States und Substates, inklusive der dynamischen Substates: interne Begriffe wie `syncso_*`, `twoshot_*` dürfen im normalen UI nicht wieder auftauchen (nur in Debug/Details).

## Tests und Abschluss

- Neue Unit-Tests: Sichtbarkeitsregeln der Szenenaktionen (6.1), `cutStyle`-Round-Trip pro Mapping-Grenze (6.2), Fehlercode-Projektion inkl. Fallback (6.3), `sceneStatusLabel` über alle States/Substates (6.5).
- Bestehende Suites: `bunx vitest run src/lib/composer src/hooks src/components` inkl. Contract-Scanner, dazu `tsgo`.
- UI-Smoke-Test im Preview (Motion Studio: Szenenkarte, Aktionen-Menü, Render-Queue, Pipeline-Panel).
- Nach 6.5 und grünen Tests: STOP mit Bericht. Lip-Sync-Writer-Migration und Reverse-Bridge-Abschaltung bleiben v431.

## Vorgehen

Nur 6.1 implementieren → testen → Bericht → STOP. 6.2 startet erst nach separater Freigabe; danach 6.3 → 6.4 → 6.5, jeweils einzeln mit Bericht.
