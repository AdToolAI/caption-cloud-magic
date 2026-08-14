# v430.1 Schritt 2A — Sieben Anzeige-/Polling-Gates auf die SSoT umstellen

Scope: ausschliesslich die sieben freigegebenen Gates. Alles andere (1–6, 8, 9, 14, 16, 18, 19) bleibt unveraendert.

## Umzustellende Gates

| # | Gate-ID | Stelle | Wirkung heute | Nach Umstellung |
|---|---------|--------|---------------|-----------------|
| 7 | scenecard-lipsync-actions | SceneCard.tsx:2385 | Lip-Sync-Aktionsleiste | sichtbar bei kanonischem Intent |
| 10 | clipprogress-is-cinematic | SceneClipProgress.tsx:126 | Lip-Sync-Fortschrittsanzeige | Anzeige folgt SSoT |
| 11 | clipprogress-should-be-lipsync | SceneClipProgress.tsx:132 | Erwartungs-/Warnzustand | folgt SSoT |
| 12 | inlineplayer-needs-lipsync | SceneInlinePlayer.tsx:76 | Player wartet auf Lip-Sync-Output | folgt SSoT |
| 13 | inlineplayer-legacy-happyhorse-warn | SceneInlinePlayer.tsx:224 | Legacy-Hinweis | folgt SSoT |
| 15 | clipstab-poll-cinematic | ClipsTab.tsx:550 | Polling der Lip-Sync-Szenen | folgt SSoT |
| 17 | pipelineprogress-cinematic-generating | usePipelineProgress.ts:922 | "generiert"-Zustand im Pipeline-Panel | folgt SSoT |

Bewusst akzeptierte Semantik-Aenderung:
- Ausgeschalteter Lip-Sync-Toggle wird nicht mehr durch `engineOverride = 'cinematic-sync'` ueberstimmt (heutige False Positives entfallen).
- `sync-segments`, `native-dialogue` und der Voiceover-Opt-in-Weg werden nicht mehr uebersehen (heutige False Negatives entfallen).

Kein Gate in diesem Batch beeinflusst Provider-Wahl, Dispatch, Rendering oder Kosten — nur Sichtbarkeit, Statusdarstellung und Polling-Frequenz.

## Vorgehen

1. In jeder der sechs Dateien den lokalen Intent-Ausdruck durch `isLipSyncIntentional(scene)` (bzw. das vorhandene Szenen-Objekt) ersetzen; orthogonale Bedingungsteile (clipSource, Status, URLs, Provider-Checks) bleiben unveraendert stehen.
2. Import aus `src/lib/video-composer/lipSyncIntent.ts`; keine neue Hilfsfunktion, keine Signaturaenderung.
3. `fixtures/lipSyncIntentGates.ts`: die sieben Praedikate auf die neue Bedingung nachziehen, damit das Inventar den Code weiterhin exakt spiegelt.
4. Allowlist des AST-Scanners (`lipSyncIntentGateScanner.test.ts`) fuer die entfernten Direkt-Lesezugriffe aktualisieren, damit der Scanner gruen bleibt und die verbleibenden 12 Gates weiter eingefroren sind.
5. `lipSyncIntentGateParity.test.ts`: fuer diese sieben Gates von "charakterisierte Abweichung" auf "exakte Paritaet erwartet" umstellen; die restlichen Gates behalten ihre eingefrorenen Abweichungs-Erwartungen.

## Nachweis vor STOP

- Volle Composer-Testsuite plus die drei v430.1-Tests gruen; Paritaetsbericht `docs/v430-1-intent-gate-parity.md` neu erzeugen, danach stehen 7/19 Gates auf exakt paritaetisch.
- UI-/Polling-Smoke im Preview: Szene mit Toggle AUS + `cinematic-sync` (keine Lip-Sync-UI, kein Lip-Sync-Polling), Szene mit `sync-segments` und Szene mit Voiceover-Opt-in (Aktionsleiste, Fortschritt, Player, Polling aktiv), plus eine reine Text-zu-Video-Szene als Negativfall.
- Kurzbericht mit PASS/FAIL je Gate, dann STOP. 2B (Gate 8/18) und der Provider-Routing-Nachweis fuer Gate 9 folgen separat.
