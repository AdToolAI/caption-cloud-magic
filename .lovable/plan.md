## Status: Logik ist sauber, aber noch nicht "Kunden-Ready"

Nach der letzten Runde ist die **technische Kernlogik konsistent** (SafePlan-Gate, Canonical-Validation, Ensemble-Scrubbing, Voice-Binding, Regressionstests grün). Für einen echten Beta-Launch mit Endkunden fehlen aber noch **UX-Klarheit** und **Skalierungs-Sicherheit**. Hier die ehrliche Einschätzung + gezielte Verbesserungen.

---

### Was schon sauber ist
- **SafePlan-Gate**: UI und Apply-Hook können keinen inkonsistenten Plan mehr durchlassen (50s/10s-Bug gefixt).
- **Script-Wins-Prinzip**: Skript > Briefing-Board > Freetext ist durchgezogen.
- **ID-Verdrahtung**: Character/Location/Outfit-UUIDs werden validiert, Slugs verworfen.
- **Voice-Binding**: Nur aktive Speaker → keine "Roger AI"-Leaks mehr.
- **Ensemble-Scrubbing**: Solo-Shots werden von "share the scene"-Phrasen befreit.
- **Regressionstests**: 30s→15s und 50s/10s abgedeckt.

---

### Was für Kunden noch fehlt (5 Lücken)

**L1 — Fehlerkommunikation ist zu technisch**
Wenn der SafePlan-Gate blockt, sieht der Kunde "canonical mismatch"-artige Chips. Nötig: eine klare, deutsche Meldung wie *"Skript und Gesamtdauer passen nicht zusammen — wir haben auf 15s korrigiert"* mit einem **Undo-Button**.

**L2 — Kein "Vorher/Nachher"-Vergleich beim Auto-Repair**
Wenn die KI 50s→10s korrigiert oder Ensemble scrubbt, weiß der Kunde nicht *was* geändert wurde. Ein aufklappbares **Repair-Log** ("3 Änderungen: Dauer 50s→10s, 2 Solo-Shots bereinigt, 1 Voice ersetzt") schafft Vertrauen.

**L3 — Skript-zu-lang-Warnung greift zu spät**
Aktuell erscheint sie erst beim "Clip generieren"-Klick. Besser: **Live im Briefing-Tab** während des Tippens, damit der Kunde direkt nachjustieren kann.

**L4 — Manuelle Overrides fehlen an 2 Stellen**
- **Szenendauer**: Kunde kann eine einzelne Szene nicht manuell auf z.B. 7s setzen, wenn Auto-Extend zu knapp/großzügig ist.
- **Ensemble-Toggle pro Szene**: Kunde kann nicht sagen "Diese Szene soll bewusst alle 3 Charaktere zeigen", weil Script-Mode das global unterdrückt.

**L5 — Skalierung: Keine Telemetrie**
Wir sehen aktuell nicht, **wie oft** SafePlan repariert, welcher Fehlertyp am häufigsten ist, welche Briefing-Muster oft scheitern. Ohne Log-Aggregation können wir für 1000 Beta-User nicht datengetrieben nachbessern.

---

### Vorgeschlagener Plan (4 Phasen)

**Phase 1 — UX-Klartext (L1 + L2)**
- `SafePlanNotice.tsx`: Neue Komponente über dem Production-Plan mit deutscher Repair-Zusammenfassung, Icon, Undo-Button (setzt Plan auf Original-Response zurück).
- `finalizePlanCanonical.ts`: Rückgabe um `repairLog: RepairEntry[]` erweitern (typed events: `duration_normalized`, `ensemble_scrubbed`, `voice_purged`, `id_dropped`).

**Phase 2 — Live-Feedback im Briefing (L3)**
- `BriefingTab.tsx`: Debounced (400ms) Live-Anzeige *"Geschätzte Sprech-Dauer: 12.4s / Board: 15s ✓"* — grün/gelb/rot.
- Kein neuer Server-Call — nutzt bestehende Client-seitige Wort-Zähl-Heuristik.

**Phase 3 — Fein-Overrides (L4)**
- `ProductionPlanSheet.tsx`: Klick auf Szenendauer → Inline-Input (min = Sprech-Dauer+1s, max = 30s).
- Pro-Szene "Ensemble erzwingen"-Toggle, der `enforceSoloCast` für diese eine Szene überschreibt.

**Phase 4 — Telemetrie für Beta (L5)**
- Neue Tabelle `plan_repair_events` (user_id, plan_id, repair_type, before, after, timestamp) mit RLS + GRANTs.
- `finalizePlanCanonical` loggt jedes Repair anonymisiert.
- Admin-View später — jetzt erstmal nur sammeln.

---

### Technische Details
- Alle Änderungen sind **UI + Instrumentierung**, keine Änderungen an der Kern-Pipeline (die ist stabil).
- `repairLog` wird bereits implizit erzeugt — nur explizit exportieren.
- Neue Tabelle folgt Grant-Pattern: `authenticated INSERT/SELECT own`, `service_role ALL`.
- Keine Breaking Changes an bestehenden Tests.

---

### Ehrliche Antwort auf deine Frage
- **Sauber?** Ja, technisch. Die Pipeline hat keine Widersprüche mehr.
- **Skalierbar?** Ja, wenn Phase 4 (Telemetrie) drin ist — sonst debuggen wir bei 1000 Usern blind.
- **Benutzerfreundlich?** Aktuell **noch nicht ganz** — Kunde sieht Auto-Repairs ohne Kontext (L1/L2) und hat keine Overrides (L4).

Empfehlung: **Phase 1 + 2** sind Muss vor Beta-Launch. Phase 3 + 4 können in den ersten Beta-Wochen nachziehen.

Soll ich mit **Phase 1 + 2** starten, alle 4 Phasen umsetzen, oder eine andere Priorisierung?