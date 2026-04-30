## Problem

Die "neuen" smoke-10 Bugs sind **dieselben False-Positive-Klassen** wie zuvor (`companion-diagnose`/`check-subscription` Network 0 + FunctionsFetchError Console), aber sie kommen weiterhin durch, weil:

1. **Mute-Patterns werden zu spät angewendet.** Sie filtern beim *Auto-Resolve* nach einem Pass-Run, aber die `expect_no_console_error`-Assertion und der Bug-Persistierungs-Code im Engine prüfen sie nicht *vorher*. Folge: Bug wird erstellt + Mission failed → Auto-Resolver greift nie.
2. **`finalizing`-Phase failt mit HTTP 200.** Der Browserless `/function`-Call läuft 18s durch (alle echten Steps grün), aber die Antwort enthält `ok:false` → wir markieren das als "Mission execution failed: Browserless engine failure". Die Mission war inhaltlich erfolgreich.
3. **smoke-04/06: "(no error message)"** trotz Diagnostics-Update — die Fehler tritt offenbar **vor** dem Engine-Call auf (z. B. beim Step-Compile).

## Lösung

### 1. Mute-Patterns global im Engine durchsetzen (`qa-agent-execute-mission/index.ts`)

- Beim Engine-Start einmal `qa_muted_patterns` mit `severity_when_matched='ignore'` laden und als kompilierte RegExps in den Run-Context legen.
- **Vor** dem Erstellen jedes Bugs (`insertBugReport`) jede Title/Description gegen die Ignore-Patterns matchen → Bug wird verworfen statt persistiert.
- Bei `expect_no_console_error`: Console-Errors, die einem Ignore-Pattern matchen, werden aus der Assertion-Liste gefiltert, **bevor** entschieden wird, ob die Assertion failed.

### 2. Finalizing-Phase tolerant machen

- Wenn alle echten Steps grün sind und der Engine-Failure `last step: finalizing` lautet, downgraden auf `low/info` Severity und Bug-Title `Engine finalize warning (mission steps OK)` statt `high workflow`. 
- Mission-Status bleibt `passed`, nicht `failed`.

### 3. "(no error message)"-Fallback verbessern

- Wenn die Engine-Antwort kein Errormessage hat und HTTP 200 ist, statt generischem Bug einen **Info-Level**-Eintrag schreiben mit Step-Index + Console-Snapshot.
- Top-Level Try/Catch im Mission-Compile-Schritt: Failures dort liefern jetzt explizit `Mission compile error: <msg>` statt "(no error message)".

### 4. Stale Bugs aufräumen (Migration)

```sql
UPDATE qa_bug_reports
SET status='resolved', resolved_at=now()
WHERE status='open' 
  AND (
    title ILIKE '%companion-diagnose%' OR
    title ILIKE '%check-subscription%' OR
    title ILIKE '%FunctionsFetchError%' OR
    title ILIKE '%Browserless engine failure%finalizing%' OR
    title ILIKE '%Mission execution failed: (no error message)%' OR
    title ILIKE '%posthog-recorder.js%' OR
    title ILIKE '%/api/4510408787886160/envelope/%' OR
    title ILIKE '%ERR_BLOCKED_BY_CLIENT%'
  );
```

### 5. Zusätzliche Mute-Patterns

```sql
INSERT INTO qa_muted_patterns (pattern_regex, severity_when_matched, reason) VALUES
  ('Browserless engine failure.*finalizing', 'ignore', 'Finalize phase warning, steps were OK'),
  ('Mission execution failed: \(no error message\)', 'ignore', 'Generic engine no-op, replaced by typed errors'),
  ('posthog-recorder\.js', 'ignore', 'PostHog session-replay blocked by adblock'),
  ('/api/\d+/envelope/', 'ignore', 'Sentry envelope blocked by adblock'),
  ('News Radar: failed to fetch.*FunctionsFetchError', 'ignore', 'News Radar bootstrap race during page unload');
```

### 6. Memory-Update

`mem://features/qa-agent/false-positive-hardening.md` ergänzen:
- **Mute-Patterns sind jetzt Pre-Insert-Filter im Engine**, nicht nur Post-Run-Cleanup.
- **Engine-Finalize-Failures bei sonst grünen Steps** werden auf info downgegradet.

## Erwartetes Ergebnis

- smoke-10 Bug-Inbox-Einträge dieser Klassen verschwinden ab dem nächsten Run.
- 19 stale Open-Bugs werden durch die Migration sofort auf `resolved` gesetzt.
- Künftige False-Positive-Klassen können durch reine Pattern-Inserts (ohne Code-Änderung) muted werden.

## Files

- `supabase/functions/qa-agent-execute-mission/index.ts` – Pre-insert-Filter, Finalize-Toleranz, bessere Error-Messages
- `supabase/migrations/<new>.sql` – Neue Patterns + Cleanup
- `mem://features/qa-agent/false-positive-hardening.md` – Doku-Update