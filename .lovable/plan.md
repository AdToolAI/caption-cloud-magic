## Neue Bugs aus smoke-07-calendar-crud

Zwei Cluster, beide mit eindeutiger Root-Cause:

### Bug 1 — Echter Code-Bug: 406 auf `calendar_integrations`
`src/components/calendar/CalendarHeader.tsx` Zeile 63 nutzt `.single()` statt `.maybeSingle()`. Wenn ein Workspace noch keinen Calendar-Integration-Eintrag hat (Default-Zustand für neue User wie unseren QA-Bot), antwortet PostgREST mit **HTTP 406** ("0 rows when 1 expected"). Das ist genau das Pattern aus unserer eigenen `single-query-errors`-Regel.

Das ist **kein** false positive — wir haben es nur bei `companion_user_preferences` gemutet. Hier muss der Code richtig gefixt werden.

### Bug 2 — Mission-Sprach-Drift: `expect_visible "Calendar"`
Step 1 erwartet den englischen Text "Calendar", aber das UI rendert je nach `i18n`-Sprache "Kalender" (DE) oder "Calendario" (ES). Selbes Problem wie damals bei smoke-02 Picture Studio ("Generate" → "Picture").

## Änderungen

### 1. Code-Fix: `src/components/calendar/CalendarHeader.tsx`
- Zeile 63: `.single()` → `.maybeSingle()`
- Damit wird der 406 weg (sowohl Network als auch Console-Error), und Step 3 (`expect_no_console_error`) wird grün.

### 2. Mission-Update: `smoke-07-calendar-crud`
SQL-Migration, die den ersten Step robuster macht:
- `expect_visible "Calendar"` → sprachneutrales Selektor-Pattern, z.B. `wait_selector` auf `[data-testid="calendar-page"]` oder `expect_url_contains "/calendar"`.
- Falls kein Test-ID existiert, fügen wir in `src/pages/Calendar.tsx` ein `data-testid="calendar-page"` auf den Root-Container hinzu (1-Zeilen-Edit) und verwenden den Selektor in der Mission.

### 3. Inbox-Cleanup
- Bulk-resolve der 4 offenen Einträge (2 Action Required + 2 Warnings) für `smoke-07-calendar-crud` in `qa_bug_reports` via Migration.

### 4. Mini-Audit (nice-to-have, kurz)
`rg "\\.single\\(\\)" src/components/calendar` zeigt, ob noch andere Calendar-Stellen `.single()` ohne Treffer-Garantie nutzen — falls ja, gleich mitfixen, sonst kommen die in der nächsten Mission-Runde wieder.

## Erwartetes Ergebnis
- smoke-07-calendar-crud: 3/3 grün, ~15-20s Laufzeit
- Bug-Inbox: 0 offen
- Keine neuen Mute-Patterns nötig (echter Fix, keine Suppression)

## Was wir **nicht** tun
- Kein Mute auf `calendar_integrations` 406 — das wäre ein Feigling-Fix und würde echte zukünftige Bugs verstecken.
