# Fortschrittsbalken: Fehlschlag beenden + Re-Render startet bei 0 %

Zwei Fehler in der globalen Pipeline-Leiste im Video Composer (`usePipelineProgress` / `PipelineProgressBar`).

## Problem 1 — Nach einem Fehlschlag lädt die Leiste weiter

Verifiziert im Code (`src/hooks/usePipelineProgress.ts`):

- Die Clips-Phase gilt nur als fertig, wenn *alle* KI-Szenen `ready` sind (`progress >= 1`).
- `failed` wird nur gemeldet, wenn gleichzeitig **keine** Szene mehr läuft (`failed > 0 && !running`). Solange irgendeine andere Szene noch aktiv ist oder das `clips`-Event-Flag gesetzt ist, ist die Phase weder `done` noch `failed`.
- Das Event-Flag `clips` wird erst bei `done || failed` gelöscht. Ergebnis: die Phase bleibt dauerhaft `running`, die Leiste zeigt endlos Ladezustand und hochlaufende Zeit (im Screenshot 20:38 min), obwohl die Szene sichtbar fehlgeschlagen ist.

**Lösung:** Fehlgeschlagene Szenen zählen als „abgeschlossen“ (settled).

- Clips-Fortschritt wird gegen `ready + failed` statt nur `ready` gerechnet.
- Sind alle KI-Szenen terminal (ready oder failed), ist die Phase terminal: `done` wenn kein Fehler, sonst `failed` — unabhängig davon, ob noch ein Event-Flag hängt.
- Das Event-Flag `clips` wird zusätzlich gelöscht, sobald alle Szenen terminal sind, damit `isActive` sicher abfällt.
- Die Leiste zeigt dann den bestehenden Fehler-Zustand (rot, „Fehler“ + Reset-Button) statt eines Dauer-Spinners.

## Problem 2 — Re-Render springt sofort auf 99 % und bleibt dort

Verifiziert im Code:

- `runFloorRef` ist bewusst monoton steigend und wird zusätzlich pro Projekt in `sessionStorage` gespeichert und beim Mount wieder eingelesen.
- Der Reset bei `clips:start` liegt in einem Effekt mit leerer Dependency-Liste; er nutzt den beim ersten Render berechneten `storageKey`. Ist `projectId` beim Mount noch nicht geladen, lautet dieser Key `…:default`, während geschrieben wird unter `…:<projectId>`. Der alte 99-%-Snapshot wird dadurch nie gelöscht und beim nächsten Mount wieder hydriert.
- Ein zusätzlicher Startpfad: läuft im Hintergrund noch etwas, greift die „Lazy Baseline“, ohne den Run-Floor zurückzusetzen.

**Lösung:** Ein Neustart ist immer ein echter Neustart bei 0 %.

- Den Storage-Key im Event-Listener über eine Ref lesen, damit immer der aktuelle Projekt-Key gelöscht wird (zusätzlich den Legacy-`default`-Key aufräumen).
- Bei jedem `clips:start` (auch bei Einzel-Szenen-Re-Render) hart zurücksetzen: `pipelineStart`, `runFloor`, alle Phasen-Floors, `startedAt`, Stall-Baseline (`realProgress`), hängende Event-Flags anderer Phasen.
- Hydrierung nur akzeptieren, wenn der Snapshot jünger als ~30 Minuten ist und tatsächlich noch eine Szene aktiv ist — sonst verworfen.

## Technische Details

Betroffene Dateien:

- `src/hooks/usePipelineProgress.ts` — `clipsReal` (settled-Logik), Event-Flag-Abbau, Reset-/Hydrations-Logik, Storage-Key-Ref.
- Optional `src/components/video-composer/PipelineProgressBar.tsx` — keine Logikänderung nötig, sichtbar wird der bestehende Fehlerzustand.

Nicht angefasst: Render-Pipeline, Edge Functions, Lip-Sync-Kette, Credits.

## Verifikation

- Vitest: bestehende Composer-Tests laufen weiter; neuer Test für `usePipelineProgress` mit den Fällen „eine Szene failed, Rest ready → Phase terminal“ und „clips:start setzt Floor auf 0“.
- Manuell: fehlgeschlagene Szene → Leiste stoppt und zeigt Fehler; „Neu rendern“ → Leiste beginnt bei ~0 % und läuft hoch.

## Problem 3 — Im anderen Account fehlt die Hälfte der Briefing-Seite (auch oben)

Verifiziert im Code:

- `useStudioPreferences` hat **Default `editorMode: 'quick'`** und speichert unter dem globalen, nicht user-gescopten Key `motion-studio:prefs:v1`.
- `BriefingTab.tsx` blendet im Quick-Modus Panels über die ganze Seite verteilt aus — oben wie unten:
  - Emotionaler Ton + Sprache (innerhalb von Panel SC 03, deshalb wirkt „Stil & Format" oben beschnitten)
  - weiterer Stil-/Format-Block
  - Video-Modus-Auswahl (`VideoModeSelector`)
  - Cast & World / Sprecher-Mapping (nur Studio)
  - Regie-Notiz
  - Visueller Stil (Panel SC 04)
- Der einzige Hinweis darauf (`hiddenPanelsHaveData`) erscheint nur, wenn die versteckten Felder bereits Daten enthalten — bei einem frischen Account also nie.

Der zweite Account steht schlicht auf QUICK (im Screenshot oben rechts aktiv), der Hauptaccount auf Direct/Studio. Es fehlt nichts wegen Plan, Rolle oder Credits.

**Lösung:**

1. Default auf `direct` umstellen, solange der Nutzer nicht selbst gewählt hat (`editorModeManual === false`) — die vollständige Briefing-Seite ist der erwartete Erststart.
2. `motion-studio:prefs:v1` pro Benutzer scopen (analog `src/lib/local-draft-scope.ts`) und beim Logout aufräumen, damit Modus-Zustände nicht zwischen Accounts im selben Browser wandern.
3. Im Quick-Modus dauerhaft eine dezente Zeile „Einige Panels sind im Quick-Modus ausgeblendet — alle Felder anzeigen" mit Ein-Klick-Umschalter zeigen, unabhängig davon, ob die versteckten Felder Daten haben.

Betroffene Dateien zusätzlich: `src/hooks/useStudioPreferences.ts`, `src/components/video-composer/BriefingTab.tsx`.

