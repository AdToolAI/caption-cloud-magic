## Diagnose

Die Auto-Analyse ist beim "3 Uhr nachts"-Briefing in den **Local-Fallback-Plan** gekippt (Toast: „Analyse offline"). Belege:

- Letzter DB-Eintrag in `composer_production_plans` ist vom **23.06.** (founder-avatar), kein neuer für „3 Uhr nachts" → das deep-parse Ergebnis ist nie persistiert worden → Fallback wurde benutzt.
- Der Local-Fallback (`buildLocalFallbackPlan` in `src/hooks/useStoryboardTransition.ts`) erzeugt zwar `shotDirector` + `performance` + `musicCue` korrekt, **lässt aber `voiceover.text` und `dialogTurns` komplett leer** und setzt `anchorPromptEN` auf generisches `"Hook beat for AdTool AI: …"`.
- In `useApplyProductionPlan.planSceneToComposerScene` wird `dialogScript` nur befüllt wenn `dialogTurns` ODER `voiceover.text` existiert → bei Fallback bleibt `dialogScript = undefined` → das Studio zeigt seine Default-Zeile **„Samuel Dusatko: Hi, willkommen!"**.
- Shot-Director-Felder (Framing/Angle/Movement/Lighting) **werden** an die Szene geschrieben — sind aber in der ProductionPlanSheet-/SceneCard-Übersicht aktuell schwer zu verifizieren ohne jede Szene einzeln zu öffnen.

Also zwei reale Probleme:
1. **Drehbuch fehlt** → Fallback überträgt das im Briefing **explizit ausgeschriebene** Skript nicht.
2. **Sichtbarkeit** → Du musst jede Szene aufklappen um zu sehen ob Kamera/Licht/Performance wirklich angekommen sind.

## Plan

### 1. Fallback-Plan: Dialog aus dem Briefing extrahieren
`src/hooks/useStoryboardTransition.ts → buildLocalFallbackPlan`:
- Vor der Beat-Verteilung das Briefing nach **expliziten Dialog-Markern** scannen:
  - Pattern A: `DIALOG (…): "…"` oder `DIALOG (DE, …): "…"`
  - Pattern B: `SPRECHER: <Name>` gefolgt von `DIALOG …: "…"`
  - Pattern C: `SZENE 1 … DIALOG … "…"` Block-Aware (eine Quote pro `SZENE n`)
- Pro gefundener Szene `voiceover.text` setzen UND `lipSync: true` wenn ein Cast-Mention existiert.
- Pro Szene zusätzlich aus dem Briefing-Block die **Shot-Hints** ziehen (`SHOT:`, `KAMERA:`, `EMOTION:`) und in `shotDirector` / `performance` / `anchorPromptEN` einfließen lassen statt generischer Beats.
- Wenn weniger Dialog-Blöcke als Beats → bestehende generische Beats nur für ungedeckte Indexe nutzen.

### 2. Fallback transparent machen
- Toast-Text: „Analyse offline — **Briefing-Dialog wurde extrahiert** und in den Plan übernommen. Vor Render prüfen." (statt „Basis-Plan")
- Im `ProductionPlanSheet` Badge **„Local Fallback Plan"** rechts oben (gelb), wenn `plan._meta.source === 'local-fallback'`. Quelle in `buildLocalFallbackPlan` setzen.

### 3. UI-Verifizierung pro Szene (in ProductionPlanSheet)
Neue kompakte Status-Zeile pro Szene im Sheet:
```
S01  ✓ Skript  ✓ Cast  ✓ Voice  ✓ Shot-Director  ✓ Performance  ⚠ Music
```
- Grün ✓ wenn Feld gesetzt, gelb ⚠ wenn leer/Default, rot ✗ wenn als Pflicht für gewählte Engine nötig aber leer (z. B. `voice` bei `lipSync: true`).
- Tooltip pro Chip mit dem Wert (z. B. „medium-close-up · eye-level · slow-push-in · soft-window").
- Liest direkt aus `TPlanScene` — kein neuer Edge-Call.

### 4. Drift-Detection erweitern (sichtbar nach Apply)
`src/lib/video-composer/briefing/driftDetector.ts`:
- Zusätzlicher Check **`script_not_applied`**: wenn `plan.scene.voiceover.text` oder `dialogTurns` gesetzt war aber `composerScene.dialogScript` leer ist nach Apply.
- Zusätzlicher Check **`shot_director_not_applied`**: wenn `plan.scene.shotDirector.*` gesetzt war aber `composerScene.shotDirector` leer.
- Im `DriftReportPanel` ein Quick-Fix-Button „Felder erneut übernehmen" pro Szene (re-mapper auf Einzelszene).

### 5. Watchdog für Late-Arrival
Aktuell läuft das Late-Arrival-Refetch **nur bei AbortError**. Erweitern auf:
- 504 Gateway Timeout
- 502/503 (Edge cold start)
So dass auch in diesen Fällen der echte Plan im Hintergrund nachgeladen wird und den Fallback ersetzt.

## Out of scope (Lipsync-Safety)
- Keine Änderungen an `compose-dialog-segments`, `sync-so-webhook`, `dialog_shots`, `composer_scenes.dialog_*`.
- Keine Änderung am Apply-Guard für protected scenes.
- Keine Änderung am Voice-Resolver / Cast-Resolver in `briefing-deep-parse`.

## Verification
1. Briefing „3 Uhr nachts" erneut ausführen mit getrenntem Netz → Fallback greift → Sheet zeigt:
   - Badge „Local Fallback Plan"
   - S01 mit Skript-Chip ✓, Tooltip enthält „Es ist 3 Uhr nachts. Und ich bearbeite… schon wieder… ein Reel."
   - shotDirector-Chip ✓ („extreme-close-up · eye-level · static · laptop-glow")
2. Apply → SceneCard S01 hat `dialogScript` korrekt vorbelegt, Shot-Director-Felder gesetzt.
3. Drift-Panel zeigt 0 neue Findings.
4. Mit funktionierender Analyse: Sheet-Badge zeigt **nicht** „Local Fallback".
