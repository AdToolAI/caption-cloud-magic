## Problem

1. **Briefing-Intro spielt bei jedem Reload.** `StageWelcomeMoment` (`src/components/video-composer/stage/StageWelcomeMoment.tsx:33-39`) hat einen ausdrücklichen Kommentar *"intentionally NO sessionStorage gate — the cinematic welcome should replay every time"* — die ~3,8 s Cinematic-Sequenz läuft bei jedem Mount. Auch der Template-Picker (`VideoComposerDashboard.tsx:219`) öffnet sich, sobald weder ein `?projectId=` in der URL steht noch ein Draft im localStorage existiert.

2. **Seite lädt sich gelegentlich von selbst neu.** In unserem Code gibt es keinen automatischen Reload-Trigger im Motion-Studio-Pfad. Auto-Reloads kommen praktisch immer aus einer dieser Quellen:
   - Lovable Live-Preview HMR (passiert bei jedem File-Edit – nur in der Editor-Vorschau, nicht auf der Live-Domain).
   - Service-Worker-Umschaltungen (wir entregistrieren bereits alle SWs in `main.tsx:114`, also unwahrscheinlich).
   - `ChunkLoadError` nach Neudeploy → Browser muss ein altes Bundle nachladen und scheitert → ErrorBoundary zeigt manuellen Reload-Button.

## Ziel

- Intro & Template-Picker **erscheinen nur bei einer "echten" Navigation** auf das Motion Studio (Sidebar-Klick, Direkt-URL), **nicht bei Page-Reload (F5 / Cmd-R / Browser-Refresh)**.
- Auto-Reload-Quelle identifizieren bzw. eindämmen.

## Lösung Issue #1 — Intro & Template-Picker

**Verlässliche Reload-Erkennung** über die Navigation Timing API:

```ts
const isReload = performance.getEntriesByType('navigation')[0]?.type === 'reload';
```

`'reload'` deckt F5, Cmd-R, Browser-Refresh-Button und programmatic `location.reload()` ab. SPA-Navigation (Sidebar-Klick auf "Motion Studio") liefert `'navigate'` oder `'back_forward'` – Intro spielt also normal weiter.

**Änderungen:**

| Datei | Änderung |
|---|---|
| `src/components/video-composer/stage/StageWelcomeMoment.tsx` | Reload-Check: bei `isReload` direkt `setPhase('done')`, kein Intro |
| `src/components/video-composer/VideoComposerDashboard.tsx` | `showTemplatePicker`-Init: zusätzlich `&& !isReload` – nach F5 nicht erneut auto-öffnen (der "Vorlage öffnen"-Button in der Toolbar bleibt jederzeit verfügbar) |

Beide Stellen nutzen denselben kleinen Helper `src/lib/composer/isPageReload.ts` mit defensivem `try/catch` (Safari < 15 hat die API nicht).

## Lösung Issue #2 — Auto-Reload

Da der Code keinen unkontrollierten Reload triggert, ist die wahrscheinlichste reale Ursache ein **`ChunkLoadError`** nach Neudeployment, bei dem der Browser ein veraltetes Bundle nicht mehr findet und das ErrorBoundary den Nutzer mit *"Seite neu laden"* abfängt. Maßnahmen:

1. **Globaler Vite-Listener** in `src/main.tsx`: bei `event.error?.name === 'ChunkLoadError'` oder Message-Match `"Failed to fetch dynamically imported module"` einmalig `location.reload()` mit Guard (`sessionStorage` flag, damit kein Reload-Loop entsteht) — das ist die saubere, branchenübliche Behebung.
2. **Tracking-Log:** `console.warn('[chunk-reload]', …)` plus Sentry-Breadcrumb, damit wir reproduzierbare Vorfälle nachvollziehen können.
3. **Sidebar-Klick auf "Motion Studio" während man bereits dort ist** → soll keinen Re-Mount/Reload mehr triggern (heutiges Verhalten beibehalten, kein Eingriff nötig — React Router rendert dieselbe Route ohnehin nicht neu).

Falls der User berichtet, dass der Reload **ohne neue Deployments** passiert, gehen wir in einer Folge-Iteration mit einem Repro-Schritt nach (Browser-Tab, Aktion, Zeitpunkt) – dafür wäre die Konsole zum Zeitpunkt des Reloads aufschlussreich.

## Was NICHT angefasst wird

- Komplette Tab-Persistenz, Draft-Restore-Logik, Realtime-Subscriptions, Polling-Intervalle.
- Der manuelle Reload-Button im `ErrorBoundary` (nur Auto-Loop wird verhindert).
- Lipsync/Render/Stitch-Pipeline.
