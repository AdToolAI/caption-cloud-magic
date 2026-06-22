# Storyboard-Fehler-Sichtbarkeit + Retry-Panel

## Was tatsächlich passiert ist

Der Loader zeigte ~5s, dann switchte die UI zurück zum Briefing — **das ist kein UI-Bug, sondern unser aktueller Fehlerpfad**:

1. `BriefingTab` ruft `compose-video-storyboard` auf, schaltet sofort auf Storyboard-Tab und zeigt den `StageStoryboardLoader`.
2. Die Edge-Function antwortet mit einem Fehler (Gateway-Überlast / JSON-Parse / leere `scenes`) oder einer leeren Szenenliste.
3. `catch`-Block zeigt einen kurzen Toast **und** ruft `onGenerationFailed`, welches in `VideoComposerDashboard`:
   - `setIsGeneratingStoryboard(false)` (Loader weg)
   - `setActiveTab('briefing')` (Tab-Switch zurück)
4. Ergebnis aus User-Sicht: Loader → "leeres Briefing-Panel" → keine Szenen, kein klarer Fehler.

Die Edge-Logs um 17:12 zeigen einen erfolgreichen Lauf (4 Character-Floor-Repairs). Der gemeldete Fail war ein früherer Aufruf, dessen genauen Status wir ohne Korrelations-ID nicht eindeutig rekonstruieren können. Deshalb fokussieren wir auf **robuste Fehler-UX + Retry**, statt einer spekulativen Code-Änderung in `compose-video-storyboard`.

## Was sich ändert (rein UX/Frontend, keine Pipeline-Änderung)

### 1. `VideoComposerDashboard.tsx`
- Neuer State `storyboardError: { message: string; retryable: boolean } | null`.
- `onGenerationFailed(err)` erhält jetzt das Fehler-Objekt von `BriefingTab` und:
  - setzt `storyboardError` **statt** den Tab zurück auf Briefing zu switchen.
  - lässt `activeTab='storyboard'` stehen, damit der User Kontext behält.
- `onGenerationStart` cleart `storyboardError`.
- `onScenesGenerated` cleart `storyboardError`.
- Reicht `storyboardError` + `onRetryStoryboard` (re-invoke des letzten `generateStoryboard()` aus BriefingTab) an `StoryboardTab` weiter.

### 2. `BriefingTab.tsx`
- `onGenerationFailed?: (err: { message: string; retryable: boolean }) => void` Signatur erweitern.
- Im catch-Block: aktuelles `friendly`/`retryable`-Objekt zusätzlich an `onGenerationFailed` durchreichen (Toast bleibt erhalten).
- Exposed `generateStoryboard` über `useImperativeHandle` ODER via `onRetryRequested`-Callback prop, damit Dashboard einen Retry triggern kann ohne den User in den Briefing-Tab zu zwingen. Konkret: Wir lifteten **nur** den `briefing/category/language`-Snapshot in den Dashboard-State (existiert schon via `project`) und der Retry-Handler im Dashboard ruft eine kleine geteilte Helper-Funktion `invokeStoryboard(briefing, category, language)` auf, die identisch zu BriefingTab arbeitet.
- Sauberster Weg: Helper `src/lib/video-composer/invokeStoryboard.ts` extrahieren (genau die Logik aus BriefingTab Z. 296-419), beide Stellen rufen ihn auf.

### 3. `StoryboardTab.tsx`
- Neue optionale Props `storyboardError?: { message: string; retryable: boolean } | null` und `onRetryStoryboard?: () => void`.
- Render-Logik unter dem Tab-Header:
  - Wenn `isGeneratingStoryboard` → `StageStoryboardLoader` (wie heute).
  - Sonst wenn `storyboardError` und `scenes.length === 0` → **neues** `StageStoryboardError`-Panel (siehe unten).
  - Sonst → bisheriges Storyboard-UI.

### 4. Neu: `src/components/video-composer/stage/StageStoryboardError.tsx`
Bond-Aesthetic-Panel im selben `StagePanel`-Stil wie der Loader:
- `slateIndex="02"`, `eyebrow="REEL · GENERATION FAILED"`, Titel z. B. "Storyboard konnte nicht erstellt werden" (DE/EN/ES via `useTranslation`).
- Body: zeigt `error.message`, plus Hinweis-Liste (3 Punkte: Briefing prüfen, KI-Gateway evtl. überlastet, Retry in ~30s).
- Zwei Buttons:
  - **Primary** "Erneut versuchen" → ruft `onRetryStoryboard()`. Disabled wenn `!retryable` UND letzter Fehler eindeutig user-input-fail war (heuristisch via Substring "Briefing"/"Beschreibung").
  - **Secondary** "Zurück zum Briefing" → `setActiveTab('briefing')` (bisheriges Verhalten als Opt-in).
- `prefers-reduced-motion`-safe wie der Loader.

## Was NICHT angefasst wird

- `compose-video-storyboard` Edge-Function (kein bestätigter Bug, Logs zeigen success).
- `StageStoryboardLoader`, `useGenerateAllClips`, `useSceneGenerate`, `setScenes`-Pipeline.
- Persistierung, Realtime-Subscriptions, DB-Schema.
- Bestehende Toast-Logik (bleibt zusätzlich als ephemeres Signal).

## Risiko

Niedrig. Drei TSX-Files + ein neues Bond-Panel + ein extrahierter Helper. Keine Schema-/Edge-Function-Änderung. Bestehender Erfolgspfad unverändert (`isGeneratingStoryboard` → `onScenesGenerated` → Storyboard rendert wie heute).

## Verifikation

1. Build muss grün durchlaufen.
2. Playwright-Smoke: Storyboard-Tab öffnen mit künstlich gesetztem `storyboardError` (DevTools) → Error-Panel sichtbar, Retry-Button klickbar.
3. Bestehender Happy-Path manuell: Briefing ausfüllen → Generate → Loader → Szenen erscheinen (kein Tab-Bounce).
