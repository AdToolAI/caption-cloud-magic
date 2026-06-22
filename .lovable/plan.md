## Ziel
Die Motion-Studio-Startsequenz soll wieder jedes Mal erscheinen, wenn Motion Studio bewusst über die App geöffnet wird, aber weiterhin nicht bei Browser-Reload/F5/Cmd-R.

## Plan
1. **Reload-Erkennung behalten**
   - `isPageReload()` bleibt als Schutz gegen F5/Cmd-R bestehen.
   - Bei Reload wird die Sequenz weiterhin sofort übersprungen.

2. **Session-Gate entfernen**
   - Die alte „nur einmal pro Browser-Session“-Logik darf nicht mehr wirken.
   - `StageWelcomeMoment` soll sich nur an `isPageReload()` orientieren: Reload = skip, normaler Mount durch Öffnen/Navigation = spielen.

3. **Motion-Studio-Neuöffnung zuverlässig auslösen**
   - Falls React die Route beim erneuten Öffnen nicht komplett neu mountet, bekommt `StageWelcomeMoment` einen `runKey`/Navigation-Key aus der Motion-Studio-Seite oder Stage-Hülle.
   - Dadurch startet die Sequenz wieder, wenn man aus Motion Studio rausgeht und später über „Erstellen → Motion Studio“ erneut rein geht.

4. **Template-Picker unverändert restriktiv lassen**
   - Der Template-Picker bleibt beim Reload geschlossen.
   - Der Fix betrifft primär die Cinematic-Welcome-Sequenz, nicht den Projekt-/Draft-Flow.

5. **Validierung**
   - Prüfen per Browser-Flow: Motion Studio öffnen → Intro sichtbar; Seite reloaden → kein Intro; raus navigieren → Motion Studio erneut öffnen → Intro wieder sichtbar.

## Technische Änderung
- Voraussichtlich in `StageWelcomeMoment.tsx`, ggf. minimal in `MotionStudioStage.tsx` oder `VideoComposer/index.tsx`.
- Keine Änderungen an Lipsync, Rendering, Szenenbudget, Persistenz oder Backend.