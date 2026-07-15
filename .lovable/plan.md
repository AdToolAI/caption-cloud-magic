## Post-Launch Backlog (nach 26.07.2026)

Beide Punkte werden **nicht** vor Launch angefasst. Sie sind nicht kritisch und das Risiko einer Regression überwiegt den Nutzen kurz vor Go-Live.

### Ticket 1 — Cron Heartbeat Watchdog

**Scope**
- In allen produktiv laufenden Cron-Functions am Anfang ein `upsert` auf `cron_heartbeats` schreiben (Job-Name, Timestamp, Status).
- Betroffene Functions: `render-queue-manager`, `refresh-voice-library`, `process-email-queue`, `autopilot-video-poll`, `autopilot-publish-due`, `qa-watchdog`, ggf. weitere.
- Neue Function `cron-heartbeat-watchdog` (Intervall 5 Min):
  - Prüft pro registriertem Job ob letzter Heartbeat älter als `2 × erwartetes Intervall`.
  - Schreibt bei Ausfall Zeile in `system_alerts` (severity=warning).
  - Optional Email an Admin über `send-transactional-email` (Template `cron-job-silent`).
- Admin-UI: neue Karte im **Render Load Tab** mit „Letzter Heartbeat pro Job" und rotem Punkt bei Overdue.

**Warum nicht jetzt**
Jobs laufen laut Edge-Function-Logs sauber. Nachrüsten ist reine Sichtbarkeit, kein Bugfix.

---

### Ticket 2 — Supabase Linter Warnings aufräumen

**Scope**
- `function_search_path_mutable` (~250): `ALTER FUNCTION <name>(<args>) SET search_path = public;` für jede betroffene Function. Mechanisch, low-risk.
- `authenticated_security_definer_function_executable` (~30):
  - Pro Function prüfen: Wird sie aus dem Client aufgerufen?
  - Falls **ja** → in `authenticated` GRANT lassen, dokumentieren.
  - Falls **nein** → `REVOKE EXECUTE ON FUNCTION ... FROM authenticated, anon; GRANT EXECUTE ... TO service_role;`
  - Testrunde pflicht: für jede geänderte Function 1× Client-Aufruf verifizieren.

**Warum nicht jetzt**
Keine aktive Ausnutzung möglich — nur `service_role`/`postgres` dürfen Schemas anlegen, `has_role` selbst ist bereits gehärtet. Fix ist Hygiene, nicht Security-Fix.

---

### Nach Launch — Reihenfolge

1. Woche 1 post-launch: Ticket 1 (Heartbeats + Watchdog).
2. Woche 2–3 post-launch: Ticket 2 (search_path Bulk-Fix, dann SECURITY DEFINER Audit).
3. Beide Tickets werden im internen Notion/Issue-Tracker angelegt — im Code kein TODO nötig.

**Jetzt zu tun: nichts.** Launch-Fokus bleibt.
