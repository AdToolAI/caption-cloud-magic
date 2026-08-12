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

## Problem 3 — Im anderen Account fehlt die Hälfte der Briefing-Seite

Verifiziert im Code:

- `BriefingTab.tsx` blendet je nach Editor-Modus Panels aus: `showDirect = editorMode !== 'quick'` versteckt sechs Blöcke (u. a. Stil & Format-Details, Marken-Kit-Optionen, Cast/Charaktere, Studio-Panel).
- Der Modus kommt aus `useStudioPreferences` mit **Default `quick`** und wird in `localStorage` unter dem globalen Key `motion-studio:prefs:v1` gespeichert — nicht pro Benutzer.

Der zweite Account hat also einfach nie „Direct/Studio“ gewählt und sieht die Quick-Ansicht. Zusätzlich ist der Key nicht user-gescoped, d. h. Modus-Einstellungen wandern zwischen Accounts im selben Browser (gleiche Klasse wie der bereits gefixte Entwurfs-Scope).

**Lösung:**

- `motion-studio:prefs:v1` pro Benutzer scopen (analog `src/lib/local-draft-scope.ts`) und beim Logout aufräumen.
- Im Briefing sichtbar machen, dass Panels ausgeblendet sind: dauerhafter, dezenter Hinweis mit Ein-Klick-Umschalter „Alle Felder anzeigen“ — nicht nur dann, wenn versteckte Panels bereits Daten enthalten (`hiddenPanelsHaveData`).

Betroffene Dateien zusätzlich: `src/hooks/useStudioPreferences.ts`, `src/components/video-composer/BriefingTab.tsx`.
