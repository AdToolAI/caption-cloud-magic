## Autopilot v297 — Belastbarkeit für lange Filme

Ziel: 180-Sekunden-Produktionen (18–30 Szenen) werden von einem Versprechen zu einer verlässlichen Zusage. Drei Lücken werden geschlossen: fehlende Wiederholung bei Szenen-Fehlschlägen, hängende Produktionen ohne Aufsicht, und die serielle Laufzeit von 40–70 Minuten.

Der Composer-/Motion-Studio-Code (`compose-dialog-segments`, alle geteilten Lip-Sync-Module) wird erneut **nicht angefasst**. Alle Änderungen bleiben im Autopilot-Kreis.

### Befund aus dem Code (geprüft)

- `runProduction` (autopilot-orchestrate) läuft strikt seriell über `for (const scene of scenes)`.
- Bei fehlendem Ankerbild: `continue`, kein Retry. Bei fehlgeschlagener Animation: Refund, `failed`, weiter. Beides ohne zweiten Anlauf.
- Es existiert kein Autopilot-Watchdog — `lipsync-watchdog` deckt ausschließlich `composer_scenes` ab.
- `autopilot_productions` hat weder `heartbeat_at` noch einen Versuchszähler; eine tote Background-Task bleibt dauerhaft auf `status='running'`.

---

### Block 1 — Szenen-Retry (keine Löcher mehr im Film)

1. Jede Szene bekommt bis zu **zwei Anläufe** statt einem. Der zweite Anlauf ist nicht identisch, sondern korrigiert:
   - **Anker gescheitert**: neuer Versuch mit vereinfachtem Prompt (weniger gleichzeitige Personen, entschärfte Bewegung) — die gleiche Logik, die `ideaFeasibility` schon zur Reparatur nutzt.
   - **Motion gescheitert / Face-Gate-Framing-Fehler**: erneutes Rendern mit gesichtsbetontem Framing-Suffix am Motion-Prompt.
2. Der Refund des ersten Versuchs erfolgt wie heute, bevor der zweite gebucht wird — keine Doppelbelastung.
3. Scheitert auch der zweite Anlauf: **Lückenfüller** statt Loch. Die Szene wird aus dem freigegebenen Anker als Standbild mit sanftem Ken-Burns-Move gefüllt (kein Motion-Credit), damit die Laufzeit und der Schnittrhythmus erhalten bleiben. Nur wenn auch der Anker fehlt, wird die Szene endgültig übersprungen.
4. Neue Spalten in `autopilot_production_scenes`: `attempt` (int, Default 1), `fallback_kind` (text, nullable) für die Anzeige in der Director's Table.

### Block 2 — Produktions-Watchdog & Resume

5. Neue Spalten in `autopilot_productions`: `heartbeat_at`, `resume_attempts`. Der Loop schreibt nach jeder Szene einen Heartbeat.
6. Neue Edge Function **`autopilot-watchdog`**, per pg_cron alle 3 Minuten:
   - Produktionen mit `status='running'` und Heartbeat älter als 12 Minuten gelten als tot.
   - Bis zu **zwei automatische Resumes**: der Watchdog startet `autopilot-orchestrate` im Resume-Modus neu.
   - Danach: Produktion `failed`, offene Stufen erstattet, Director-Log-Eintrag mit klarer Begründung.
7. **Resume-Modus** in `autopilot-orchestrate`: Bei `{ production_id, resume: true }` werden die Szenenzeilen *nicht* gelöscht; bereits `completed` Szenen werden übersprungen, nur `pending`/`failed`/hängende Szenen laufen erneut. Der heutige Frisch-Start bleibt unverändert der Default.
8. Wenn alle Szenen fertig sind, aber der Endschnitt nie ansprang, stößt der Watchdog `autopilot-finalize` erneut an.

### Block 3 — Parallelisierung (180 s von ~60 auf ~20 Minuten)

9. Der Szenen-Loop bekommt ein **Fenster von 3 gleichzeitigen Szenen** (Worker-Pool statt `for`-Schleife). Auswahl der Grenze: Replicate-Durchsatz und Sync.so-Concurrency vertragen das, mehr riskiert Rate-Limits.
10. Reihenfolge-kritische Dinge bleiben seriell:
    - Die **Guthabenprüfung** wird vor dem Fenster gebündelt, damit nicht drei Szenen gleichzeitig gegen ein leeres Konto buchen.
    - **Lip-Sync-Szenen** laufen weiterhin einzeln durch die Composer-Brücke (Sync.so-Slots sind knapp) — sie werden im Pool als Serialisierungspunkt behandelt.
11. Fortschrittsanzeige und Director-Log bleiben szenenindiziert, sodass die Reihenfolge in der UI unverändert wirkt.

### Block 4 — Sichtbarkeit

12. `DirectorsTable` zeigt pro Szene den Versuch (`2. Anlauf`) und ein Kennzeichen, wenn eine Szene als Standbild gefüllt wurde.
13. Nach der Produktion erscheint eine ehrliche Zusammenfassung: X Szenen bewegt, Y als Standbild gerettet, Z übersprungen — statt einer stillen Verkürzung.

---

### Technische Details

- Geänderte Dateien: `autopilot-orchestrate/index.ts` (Retry + Pool + Resume), neue `autopilot-watchdog/index.ts`, `_shared/autopilotRetry.ts` (Prompt-Reparatur, Fallback-Entscheidung), `DirectorsTable.tsx`, eine additive Migration.
- Migration ist rein additiv: neue nullable Spalten mit Defaults, keine Änderung an bestehenden Zeilen.
- Der Cron-Job wird über die Insert-Route angelegt (projektspezifische URL/Key), nicht als Migration.
- Nicht angefasst: `compose-dialog-segments`, `sync-so-webhook`, `lipsync-watchdog`, sämtliche geteilten Lip-Sync-Module.
- Verifikation zum Schluss: eine 180-s-Produktion mit absichtlich provoziertem Szenen-Fehlschlag (prüft Retry + Standbild-Füller) sowie eine normale Motion-Studio-Dialogszene als Regressionsnachweis.
