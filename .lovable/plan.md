## Kurzantwort
Ja — dieser Plan behebt die strukturelle Ursache, nicht nur die Symptome. Es sind aktuell mehrere kleine Fixes an vielen Stellen, die sich gegenseitig überstimmen. Mit einem einzigen kanonischen Normalisierungs-Gate + harten Blockern verhindern wir künftig, dass widersprüchliche Zustände (`50s Gesamt / 10s Szenen`) überhaupt noch angezeigt oder gespeichert werden können.

## Warum das diesmal endgültig hält
1. **Ein einziger Wahrheitsort für Dauer & Szenenzahl** — statt 3 Fallback-Pfaden (Backend, Local Fallback, UI-Sync) rechnet nur noch eine Funktion `finalizePlanCanonical()` direkt vor Anzeige und Apply.
2. **Hard-Gate statt Silent-Fix** — ist der Plan inkonsistent, wird der Apply-Button rot blockiert. Kein stiller Fehldurchlauf mehr möglich.
3. **Script-Wins mit klarer Interpretation** — Top-Level `SZENE` vs. Sub-Shots werden explizit unterschieden und sichtbar dokumentiert.
4. **Ensemble-Injection wird bei Literal/Script-Briefings deaktiviert** — Solo-Szenen bleiben Solo.
5. **Cast/Voice/Location-ID-Gates** — Voice-Namen wie "Roger/George" können nicht mehr als Charakter durchrutschen.
6. **Tests decken exakt die Fehlerfälle** aus deinen Screenshots ab (15s vs 30s, 3 vs 6 Shots, Solo-Leaks, Voice-Leaks).

## Was der Plan NICHT löst
- LLM-Halluzinationen bei extrem freiem Briefing (dafür bleibt der Manual Speaker Mapper).
- Wenn du Board-Dauer und Script-Dauer bewusst gemischt willst — dann brauchen wir eine explizite UI-Toggle-Auswahl.

## Der Plan im Detail

### Phase 1 — Zentrale finale Normalisierung
Neue Funktion `finalizePlanCanonical(plan, briefing)`, aufgerufen an **genau zwei** Punkten:
- direkt vor `setPlan(...)` im `ProductionPlanSheet`
- direkt vor `applyPlan(...)` in `useApplyProductionPlan`

Sie erzwingt:
- `project.totalDurationSec === sum(scenes.durationSec)`
- Kanonische Briefing-Dauer > Board-Dauer > Szenensumme
- Script-Shots gewinnen vor Board-Szenenzahl
- Jede Korrektur landet in `_meta.debug.normalization`

### Phase 2 — Script-First Timing durchgängig
Erweitertes Erkennen von `Gesamtdauer`, `N Szenen à Xs`, Zeitfenstern `0–5s`, Sub-Shots `1A/1B`. UI zeigt aktive Interpretation.

### Phase 3 — Local Fallback ehrlich labeln
Fallback muss kanonisch konsistent sein oder Apply wird blockiert und "Vollanalyse erneut versuchen" angeboten. Keine irreführenden Script-Timing-Chips mehr.

### Phase 4 — Ensemble-Garantie bei Literal/Script hart aus
Sobald `_meta.fidelity.mode === literal` oder Script-Timing aktiv: keine Ensemble-Injektion, kein "share the scene", Cast strikt = Sprecher der Szene.

### Phase 5 — Cast/Voice/Location-ID-Gate
- `cast[].characterId` muss echte gewählte UUID oder null sein
- `voiceId` darf nie eine Charakter-UUID sein
- Voice-Namen (George/Roger) werden nur als Voice-Label gezeigt, nie als Sprecher
- Nicht zuordenbare Sprecher-Labels bleiben leer → Manual Mapper

### Phase 6 — Location-Freetext schützen
Freie Location-Beschreibungen bleiben bis in den finalen `aiPrompt` erhalten (`Setting: ...`). Auto-Resolve darf sie nicht überschreiben.

### Phase 7 — UI-Diagnose & Blocker
Im Sheet sichtbar:
- Quelle (Backend / Local Fallback / Late Arrival)
- Final normalisierte Dauer & Szenenzahl
- Script-Interpretation (Top-Level vs Sub-Shots)
- Roter Blocker bei Inkonsistenz, Apply deaktiviert

### Phase 8 — Regressions-Tests
- 15s Briefing + Board 30s → 15s, 3×5s
- 6 Sub-Shots à 2.5s → 6×2.5s = 15s
- 50s Fehldetektion → Blocker oder Szenensumme gewinnt
- Solo-Literal → kein Ensemble-Prompt
- Voice- vs Charakter-ID Trennung
- Location-Freetext bleibt in `aiPrompt`

## Erwartetes Ergebnis
`50s / 10s`-Zustand ist strukturell unmöglich. Script-Briefings gewinnen zuverlässig. Cast/Voice/Location sind vor Apply validiert. Wenn etwas nicht sauber ist, siehst du es sofort statt es später im Storyboard zu entdecken.