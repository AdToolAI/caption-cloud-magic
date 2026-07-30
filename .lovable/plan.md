## Autopilot v298 — Pipeline-Prüfung und drei Korrekturen

### Was geprüft wurde (Befunde aus Code und Datenbank)

Verdrahtet und stimmig:
- Kette **Ideen → Treatment → Orchestrierung → Endschnitt** hängt zusammen: `AutopilotStudio` → `DirectorsTable` ruft `autopilot-treatment` und `autopilot-orchestrate`, der Orchestrator übergibt am Ende per Service-Key an `autopilot-finalize`.
- Die v297-Spalten existieren in der Datenbank: `heartbeat_at`, `resume_attempts` (Produktionen) sowie `attempt`, `fallback_kind` (Szenen).
- Der Cron-Job `autopilot-watchdog` läuft aktiv alle 3 Minuten (neben den übrigen 6 Autopilot-Jobs).
- Retry (2 Anläufe), Standbild-Rettung, Worker-Pool (3 Szenen), Lip-Sync-Serialisierung und Kredit-Stopp (`outOfCredits`) sind im Loop vorhanden; `autopilot-finalize` akzeptiert `fallback_kind='still'` und rendert den Anker mit Ken-Burns.

Nicht in Ordnung — drei Defekte:

1. **Resume antwortet mit 500.** Am Ende des Orchestrator-Handlers steht `scenes: body.scenes.length`. Im Resume-Modus schickt der Watchdog kein `scenes`-Feld, das wirft eine TypeError und der Aufruf endet im 500-Zweig. Die Hintergrundarbeit läuft zwar an, aber der Watchdog sieht jeden Resume als Fehlschlag und kann nicht sauber protokollieren.

2. **Doppelter Endschnitt bei langen Filmen — der teuerste Punkt.** Während `autopilot-finalize` läuft (Voiceover, Musik, SFX, Lambda-Render — bei 180 s deutlich über 12 Minuten) schreibt niemand einen Heartbeat. Der Watchdog sieht `status='running'`, keine offenen Szenen, fertige Szenen vorhanden — und stößt `autopilot-finalize` ein zweites Mal an. Ergebnis: doppelter Lambda-Render und doppelt abgebuchte Ton-Credits.

3. **Watchdog wiederholt sich alle 3 Minuten.** In den Fällen „Endschnitt neu anstoßen" und „aufgeben mit Teilmaterial" wird weder ein Heartbeat noch eine Sperre gesetzt. Solange `finalize` nicht terminal wird, feuert derselbe Zweig im nächsten Zyklus erneut.

Zusätzlich kosmetisch: Der Orchestrator setzt `completed_at`, obwohl die Produktion erst bei `scenes_ready` steht.

---

### Block 1 — Resume-Antwort reparieren
- Rückgabe auf `scenes: scenes.length` umstellen (die tatsächlich verarbeitete Liste, in beiden Modi korrekt).

### Block 2 — Endschnitt gegen Doppelläufe absichern
- `autopilot-finalize` schreibt bei jedem Stufenwechsel (Voice, Musik, SFX, Render-Poll) `heartbeat_at` — der Watchdog sieht damit ein lebendes Finale.
- Der Watchdog behandelt die Endschnitt-Stufen (`audio`, `voice`, `music`, `sfx`, `finalizing`) gesondert: erneut anstoßen erst, wenn der Heartbeat **30 Minuten** alt ist (Render-Laufzeit), nicht nach 12.
- `autopilot-finalize` erhält einen Anspruchs-Claim: läuft die Produktion bereits in einer Endschnitt-Stufe mit frischem Heartbeat, bricht der zweite Aufruf mit `already_finalizing` ab, bevor Credits fließen.

### Block 3 — Watchdog-Wiederholungen begrenzen
- In allen drei Zweigen (Resume, Endschnitt-Neustart, Aufgeben) wird `heartbeat_at` gesetzt, damit ein Zyklus nicht sofort wieder greift.
- Der Zweig „Aufgeben mit Teilmaterial" zählt ebenfalls auf `resume_attempts` und wird bei erneutem Zugriff endgültig auf `failed` gesetzt statt wieder zu finalisieren.
- `completed_at` im Orchestrator nur noch beim echten Abschluss bzw. Abbruch setzen.

---

### Technische Details
- Geänderte Dateien: `supabase/functions/autopilot-orchestrate/index.ts` (Rückgabewert, `completed_at`), `supabase/functions/autopilot-finalize/index.ts` (Heartbeat je Stufe, Finalize-Claim), `supabase/functions/autopilot-watchdog/index.ts` (stufenabhängige Fristen, Heartbeat je Zweig).
- Keine Migration nötig — alle Spalten existieren.
- Nicht angefasst: `compose-dialog-segments`, `sync-so-webhook`, `lipsync-watchdog`, sämtliche geteilten Lip-Sync-Module, Motion Studio.
- Verifikation: Ein Resume wird direkt gegen `autopilot-orchestrate` mit `{production_id, resume:true}` getestet (erwartet 200 statt 500), und der Watchdog wird gegen eine laufende Endschnitt-Produktion aufgerufen (erwartet: kein zweiter Finalize).
