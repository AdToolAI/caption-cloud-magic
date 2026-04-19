

## Befund (korrigiert)

Du hast recht — die Taskleiste zeigt **19.04.2026, 21:04 Uhr** = **Sonntag**. Morgen früh ist Montag, also Start der **neuen Woche** (20.–26. April).

Der Fehler in der App: Die Wochenleiste sollte heute (Sonntag) bereits **die kommende Woche** anzeigen, da die aktuelle Woche faktisch vorbei ist. Stattdessen zeigt sie noch die abgelaufene Woche (13.–19.) — ohne Posts mehr → Pill „Nächster Post" leer.

## Plan: 2-Wochen-Vorausplanung + Auto-Forward am Sonntag

### 1) Backend — `generate-week-strategy` generiert 2 Wochen
- Neuer optionaler Parameter `weeks_ahead` (Default **2**).
- Loop generiert beide Wochen-Batches in einem Aufruf:
  - Woche 1 = Montag dieser ISO-Woche
  - Woche 2 = Montag der Folgewoche
- Skip pro Woche, wenn schon Posts für diesen `week_start` existieren (idempotent).

### 2) Backend — `tick-strategy-posts` Self-Healing
- Bei jedem Tick (stündlich) für jeden User mit `strategy_mode_enabled=true` prüfen:
  - Existieren Posts für (`currentMonday`) **und** (`nextMonday`)?
  - Wenn nein → `generate-week-strategy` mit `weeks_ahead=2` triggern.
- Sonntag-Logik bleibt zusätzlich (zur Sicherheit), aber der tägliche Self-Healing-Check stellt sicher, dass nie mehr eine Lücke entsteht.

### 3) Backend — `useStrategyMode.toggle` (initial activation)
- Beim ersten Aktivieren des Toggles: ebenfalls `weeks_ahead=2` mitgeben statt nur 1 Woche.

### 4) Frontend — Auto-Forward der angezeigten Woche
In `useStrategyMode`:
```text
const today = new Date();
const dow = today.getDay(); // 0=So
const currentMonday = startOfISOWeek(today);
const nextMonday = addDays(currentMonday, 7);

// Auto-Forward Bedingungen:
// - Heute ist Sonntag (dow === 0)
// - ODER: alle Posts der currentWeek liegen bereits in der Vergangenheit
const visibleWeekStart = (
  dow === 0 ||
  allCurrentWeekPostsArePast
) ? nextMonday : currentMonday;
```

- Posts-Query lädt **beide** Wochen (`week_start IN (currentMonday, nextMonday)`).
- Selector `getPostsForWeek(visibleWeekStart)` filtert die anzuzeigende Woche.
- `getNextStrategyPost` durchsucht **alle geladenen Posts** → findet sofort „Mo 20.04. Instagram", auch wenn das in der Folgewoche liegt.

### 5) Frontend — `WeekStrategyRingTimeline` zeigt korrekte Woche
- Akzeptiert `weekStart` Prop (vorgegeben von `useStrategyMode.visibleWeekStart`).
- Header zeigt z. B. „20.–26. April" statt „13.–19. April".
- Optional: kleine Pfeile ‹ › im Header, um manuell zwischen den 2 geladenen Wochen zu wechseln (Standard: Auto-gewählte Woche).

### 6) Pill „Nächster Post"
Funktioniert automatisch — `getNextStrategyPost` findet jetzt den nächsten anstehenden Vorschlag aus den 2 geladenen Wochen. Heute (So 21:04) → zeigt morgen früh „Mo 20.04. 21:00 · Instagram".

### Betroffene Dateien
- `supabase/functions/generate-week-strategy/index.ts` — `weeks_ahead` Loop
- `supabase/functions/tick-strategy-posts/index.ts` — täglicher Self-Healing-Check
- `src/hooks/useStrategyMode.ts` — 2-Wochen-Query, `visibleWeekStart`, `nextPost` über alle geladenen Posts, `toggle` mit `weeks_ahead=2`
- `src/components/dashboard/WeekStrategyRingTimeline.tsx` — `weekStart` Prop respektieren, optional Pfeil-Navigation

### Erwartetes Ergebnis
- Sonntag (heute) → Timeline zeigt automatisch die Folgewoche (20.–26. April) mit den neuen Vorschlägen.
- Pill „Nächster Post" zeigt sofort „Mo 20.04. 21:00 · Instagram" — keine Leere mehr am Wochenende.
- System hält dauerhaft 2 Wochen Vorschläge bereit, Self-Healing über Cron — kein Black-Out mehr möglich.

