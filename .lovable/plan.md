

## Plan — Persistenz-Verbesserung & Reset im Motion Studio

### Problem
Aktuell wird zwar ein localStorage-Draft beim Verlassen gespeichert, aber:
1. **Clip-Status drift**: Wenn Clips bei Verlassen noch `generating` waren, sind sie in der DB längst `ready` — der localStorage zeigt aber den alten Stand. → User denkt, er muss neu generieren.
2. **Kein Reset-Button**: User können kein neues Projekt starten ohne den Browser-Cache zu leeren.
3. **Kein Hinweis auf geladenen Draft**: User wissen nicht, ob sie weiterarbeiten oder neu starten.

### Fix

**1. DB-Sync beim Mount (`VideoComposerDashboard.tsx`)**
- Wenn der geladene Draft eine `project.id` (UUID) hat → `composer_scenes` aus der DB nachladen und mit localStorage mergen
- DB ist Source of Truth für `clip_status`, `clip_url`, `cost_euros`
- localStorage-Reste werden mit den frischen DB-Werten überschrieben

**2. Reset-Button im Header**
- Neuer Button "Neues Projekt" (Icon: `RotateCcw` oder `Plus`) rechts neben dem Kosten-Indikator
- Bei Klick: Bestätigungs-Dialog *"Aktuelles Projekt verwerfen und neu starten?"*
- Bei Bestätigung: localStorage löschen, `setProject(defaultProject)`, zurück zum Briefing-Tab
- Wichtig: **DB-Projekt bleibt erhalten** (nicht löschen) — User können später über die Mediathek darauf zugreifen

**3. "Draft geladen" Toast beim Mount**
- Wenn ein Draft mit `project.id` geladen wird: dezenter Toast *"Letztes Projekt fortgesetzt — X Szenen, Y bereit"* mit Action-Button "Neu starten"
- Wenn nur localStorage ohne DB-ID existiert: stiller Load (wie bisher)

**4. Auto-Refresh-Pull alle 5s im Clips-Tab** (bereits teilweise vorhanden via Realtime)
- Sicherstellen, dass beim Tab-Wechsel zurück zu Clips ein einmaliger Re-Fetch passiert

### Geänderte Dateien
- `src/components/video-composer/VideoComposerDashboard.tsx` — Reset-Button, Confirm-Dialog, DB-Mount-Sync, Draft-Toast
- Keine neuen Dateien, keine DB-Änderungen, keine Edge-Function-Änderungen

### Lokalisierung (EN/DE/ES)
- `videoComposer.newProject` ("Neues Projekt" / "New Project" / "Nuevo Proyecto")
- `videoComposer.confirmReset` ("Aktuelles Projekt verwerfen?" …)
- `videoComposer.draftRestored` ("Letztes Projekt fortgesetzt")

### Verify
- Seite verlassen → zurückkehren → Briefing, Storyboard, Clips inkl. aktuellem `ready` Status erscheinen
- "Neues Projekt" → Confirm → komplett leer, Briefing-Tab aktiv
- Alter DB-Eintrag bleibt erhalten (über Mediathek prüfbar)

### Was unverändert bleibt
- DB-Schema, RLS, Edge Functions, Pricing, Quality-Tier
- Alle anderen Tabs UI

