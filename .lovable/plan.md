# v430 Schritt 6.5 — Gemeinsame Statusdarstellung

Ziel: Eine einzige Wahrheit für "Wie heißt der Zustand dieser Szene für den Kunden?".
Reine Projektion, keine neue Zustandsableitung, keine Semantikänderung.

## Vorab dokumentiert (nicht Teil von 6.5)

Neuer offener Mini-Schritt wird im Plan-Archiv und als Contract-Kommentar festgehalten:

> **Lip-Sync-Intent-Gates vereinheitlichen** — `scene.dialogMode` / `engineOverride === "cinematic-sync"`
> als Sichtbarkeits-Gates in `SceneCard.tsx` durch `isLipSyncIntentional()` ersetzen.
> Voraussetzung: Paritätstest, der die heutige Sichtbarkeitsmenge einfriert.
> Nicht in 6.4, nicht in 6.5, nicht stillschweigend.

## Umfang 6.5

### 1. Presenter (pure)

Neu: `src/lib/composer/status/sceneStatusPresenter.ts`

- `sceneStatusLabel(state, substate)` → `{ headline, detail, tone, progressHint }`
  - `headline`: aus `SCENE_STATE_LABEL[state]` (bestehende Tabelle wandert hierher).
  - `detail`: lokalisierte, neutrale Projektion des Substates.
  - `tone`: `'idle' | 'running' | 'ready' | 'warn' | 'error'` — nur Darstellungs-Klasse,
    keine neue Zustandslogik.
- Strikt pure: keine React-, Supabase- oder DOM-Imports, keine Reads von `scene`,
  nur die beiden übergebenen Werte.
- Substate-Projektion: bekannte Präfixe (`syncso_*`, `twoshot_*`, `plate_*`,
  `awaiting_manual_face_map`, …) werden auf Kundentexte gemappt, z. B.
  „Lip-Sync wird verarbeitet“, „Durchgang 2 von 3“, „Zuordnung prüfen“.
  Zähler wie `pass_2_of_3` werden als neutraler Fortschritt ausgegeben, nie roh.
- **Unbekannter Substate → sicherer Fallback**: `detail = null`, `headline` bleibt der
  Hauptzustand. Nie den Rohwert anzeigen.
- 6.3-Vertrag gilt: keine sichtbaren `syncso_*`, `twoshot_*`, `plate`, `cinematic-sync`.

### 2. Gemeinsame Komponente

Neu: `src/components/video-composer/SceneStatusBadge.tsx`

- Props: `scene` (oder `state` + `substate`), `size`, `showDetail`, `debug`.
- Liest Hauptstatus ausschließlich über `sceneState()`, Detail über `sceneSubstate()`.
- Roh-`pipeline_state`, Roh-`pipeline_substate` und Fehlercode nur im `title`/Debug-Slot,
  nicht als sichtbarer Kundentext.

### 3. Konsumenten umstellen

- `SceneCard.tsx` — Statuszeile auf `SceneStatusBadge`.
- `SceneClipProgress.tsx` — die verstreuten Inline-Statustexte
  (Zeilen ~233–270, ~316, ~446, ~470, ~550) auf Badge bzw. Presenter delegieren.
- `ClipsTab.tsx` — Szenen-Statusanzeige auf Badge.
- `RenderPipelinePanel.tsx` — die **szenenbezogenen** Statuszeilen auf Badge.
  Die dortige `statusLabel`-Tabelle für `PipelineStatus` (Projekt-Aggregat aus
  `useMultiSceneRender`) bleibt, weil das ein anderer Zustandsraum ist; sie bekommt einen
  Contract-Kommentar, dass sie kein Szenen-Zustand ist.
- `src/components/render/*` (Remotion-Render-Jobs, `render_jobs.status`) bleibt unangetastet —
  anderer Zustandsraum, nicht Szenen-Pipeline. Wird im Bericht benannt.
- `SCENE_STATE_LABEL` in `sceneState.ts` wird zum Re-Export aus dem Presenter oder entfernt,
  damit keine parallele Wahrheit bleibt.

### 4. Guard und Tests

- `sceneStatusPresenter.test.ts`: Label für **alle** 12 `SCENE_STATES`, für die bekannten
  Substates und für unbekannte/leere Substates (Fallback), plus Kundensprach-Assertion
  (kein `syncso`, `twoshot`, `plate`, `cinematic-sync` im sichtbaren Text, alle drei Sprachen).
- Erweiterung des 6.3-Sprachscanners um `SceneStatusBadge.tsx`.
- Scanner-Test: keine zweite Status-Label-Tabelle mehr im Composer-UI.

## Harte Grenzen

- Keine Änderung an Button-Gates, Progress-Berechnung (`stateProgress`), Pipeline-Transitions,
  Retry- oder Reset-Semantik.
- Keine Lip-Sync-Writer, keine Backend-Änderung, keine Migration.
- Keine Intent-Gate-Umstellung.

## Abschluss

`tsgo` + alle Composer-Tests, UI-Smoke für: normale Generation, Lip-Sync laufend, failed,
complete, Continuity-stale. Danach STOP mit Abschlussbericht für v430 Schritt 6
(inkl. Liste der entfernten Label-Tabellen und der verbliebenen Fremd-Zustandsräume).
