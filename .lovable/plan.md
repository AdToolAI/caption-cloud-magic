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

### 1. Presenter (pure, locale-unabhängig — Variante A)

Neu: `src/lib/composer/status/sceneStatusPresenter.ts`

- `sceneStatusPresentation(state, substate)` →
  `{ headlineKey, detailKey, detailParams, tone, progressHint }`
  - Gibt **nur Translation-Keys plus Parameter** zurück, nie fertigen Text.
    Kein `tx`, kein Locale-Read, keine globale Sprache — damit strikt deterministisch.
  - `detailParams` trägt Zähler wie `{ pass: 2, total: 3 }`, nie den Rohstring.
  - `tone`: `'idle' | 'running' | 'ready' | 'warn' | 'error'` — nur Darstellungs-Klasse,
    keine neue Zustandslogik.
- Strikt pure: keine React-, Supabase- oder DOM-Imports, keine Reads von `scene`,
  nur die beiden übergebenen Werte.
- Import-Richtung (kein Zyklus): Der Presenter importiert aus `sceneState.ts`
  **ausschließlich Typen** (`import type { SceneState, SceneSubstate }`), niemals
  Runtime-Werte. Die Label-Wahrheit (`SCENE_STATE_LABEL` bzw. deren Key-Tabelle) lebt im
  Presenter; `sceneState.ts` re-exportiert sie höchstens für Bestandsimporte.
  Falls der Typ-Import zyklisch würde, wandern die State-Typen in ein neutrales
  Definitionsmodul `src/lib/composer/status/sceneStateTypes.ts`, aus dem beide lesen.
- Substate-Projektion: bekannte Präfixe (`syncso_*`, `twoshot_*`, `plate_*`,
  `awaiting_manual_face_map`, …) werden auf neutrale Keys gemappt, z. B.
  `status.lipsync.processing`, `status.lipsync.pass`, `status.facemap.review`.
- **Unbekannter Substate → sicherer Fallback**: `detailKey = null`, Headline bleibt der
  Hauptzustand. Nie den Rohwert anzeigen.
- 6.3-Vertrag gilt für die Texte, die das Badge aus den Keys erzeugt: keine sichtbaren
  `syncso_*`, `twoshot_*`, `plate`, `cinematic-sync`.

### 2. Gemeinsame Komponente

Neu: `src/components/video-composer/SceneStatusBadge.tsx`

- Übersetzt die Keys des Presenters mit `tx`/`i18nText` in DE/EN/ES — der Badge ist der
  einzige Ort, an dem aus Projektion sichtbarer Text wird.
- Eindeutiger Props-Vertrag (Discriminated Union, gleiche Debug-Fähigkeit in beiden Formen):
  - `{ scene: ComposerScene }` — Badge liest selbst `sceneState()` / `sceneSubstate()`
    und den Fehlercode.
  - `{ state, substate, errorCode }` — `errorCode` ist bei dieser Form **verpflichtend**
    (darf `null` sein), damit Debug in beiden Varianten identisch funktioniert.
  - gemeinsam: `size`, `showDetail`, `debug`.
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
- `SCENE_STATE_LABEL` in `sceneState.ts` wird zum reinen Re-Export aus dem Presenter
  (oder entfernt), damit keine parallele Wahrheit bleibt — kein Runtime-Import zurück
  in den Presenter.

### 4. Guard und Tests

- `sceneStatusPresenter.test.ts`: Keys/Params für **alle** 12 `SCENE_STATES`, für die
  bekannten Substates und für unbekannte/leere Substates (Fallback `detailKey === null`).
  Zusätzlich: Presenter-Output ist locale-frei (enthält keinen fertigen Text).
- Rendering-Test für `SceneStatusBadge`: Keys ergeben in DE/EN/ES vollständige Texte
  (kein fehlender Key) und verletzen den 6.3-Vertrag nicht (kein `syncso`, `twoshot`,
  `plate`, `cinematic-sync` sichtbar).
- Zyklus-Test: `sceneStatusPresenter.ts` enthält keinen Runtime-Import aus `sceneState.ts`.
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
