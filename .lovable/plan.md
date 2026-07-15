
## Kontext & Realitäts-Check

Der `RenderQueueBadge` funktioniert nur, wenn ein echter `render_queue`-Job existiert. In den beiden Ziel-Studios entsteht der aber **nicht**:

- **AI Video Studio** (`ToolkitGenerator.tsx`) → invoked `generate-kling` / `generate-sora` / `generate-hailuo` etc. Diese laufen bei den Providern (Replicate/Kling API), **nicht** im Lambda-Slot-Budget. Ergebnisse landen in `ai_video_generations`.
- **Motion Studio** (`pages/MotionStudio/StudioMode.tsx`) → hat gar keinen eigenen Render-Endpoint. Der letzte Schritt „In Composer öffnen" reicht das Projekt an Director's Cut weiter — dort hängt der Badge bereits.

Ein 1:1-`RenderQueueBadge` an diesen Stellen wäre also toter Code. Was der Nutzer *tatsächlich* braucht: **Queue-Awareness** — sichtbare Signale, wenn die Plattform-Renderauslastung hoch ist oder die Founder-Reserve greift, damit später keine 429er überraschen.

## Ziel

Zwei sichtbare Queue-Signale in Motion Studio + AI Video Studio, ohne Fake-Job-IDs zu erfinden:

1. **`SystemLoadPill`** — kleines Live-Element im Studio-Header, das den globalen Render-Slot-Zustand zeigt (idle / busy / founder-reserve / saturated). Reagiert auf Realtime-Änderungen in `render_queue`.
2. **Founder-Priority-Hinweis** direkt am Generate-Button, wenn der User Founder ist ODER die Reserve gerade greift — damit Founder wissen, dass sie vorrücken, und Nicht-Founder Erwartungen kalibrieren können.

## Umsetzung

### 1. Hook `useRenderSystemLoad`
- Neu: `src/hooks/useRenderSystemLoad.ts`.
- Query zählt `render_queue` mit `status in ('queued','processing','rendering')`, summiert `estimated_workers`.
- Slot-Budget aus `system_config.render_queue_slot_budget` (Default 60), High-Water 50.
- Realtime-Subscription auf `render_queue`. Fallback: Polling alle 15s.
- Rückgabe: `{ slotsUsed, slotBudget, queuedCount, state: 'idle' | 'busy' | 'founder_reserve' | 'saturated', founderQueued }`.

### 2. Komponente `SystemLoadPill`
- Neu: `src/components/render/SystemLoadPill.tsx`.
- Kompakte Pille mit farbcodiertem Punkt (grün/amber/rot), Text „Queue frei" / „Queue belegt (32/60)" / „Founder-Reserve aktiv" / „Voll ausgelastet".
- Tooltip mit Details (queued, slotsUsed, budget, ggf. „Deine Founder-Prio zieht dich vor").
- Klick → öffnet Admin-Link nur für Admins (via `useAdmin`); für Nutzer nur Tooltip.

### 3. Wiring
- **AI Video Studio** (`src/pages/AIVideoToolkit.tsx`): Pille rechts neben Titel im Hero-Header.
- **Motion Studio** (`src/pages/MotionStudio/StudioMode.tsx`): Pille in der Top-Stepper-Zeile, neben Schritt-Anzeige.

### 4. Founder-Priority-Hinweis am Generate-Button
- **AI Video Studio** (`ToolkitGenerator.tsx`, Bereich Kosten/Generate): unter dem Kosten-Chip Zeile
  - Founder + `state !== 'idle'`: goldener Chip „Priority-Slot aktiv — du wirst bevorzugt gerendert".
  - Nicht-Founder + `state === 'founder_reserve' | 'saturated'`: dezenter Amber-Hinweis „System stark ausgelastet — Founders werden zuerst bedient. Retry-Automatik ist aktiv."
- **Motion Studio**: analoger Chip neben „In Composer öffnen"-Button.

Beide Studios nutzen den bestehenden `useIsFounder` (bzw. den Profile-Flag, den Founder-Status liest — Quelle vor Implementierung final klären).

### 5. Kein Change an bestehenden Badges
- `RenderQueueBadge` und `useEnqueuedRender` in Universal Creator + Director's Cut bleiben unverändert; hier existieren echte Job-IDs.

## Technische Details

- `system_config`-Lesung einmal beim Mount; Realtime nur auf `render_queue` (kein Polling der config).
- Realtime-Cleanup in `useEffect` return.
- Pille ist reaktiv, unterdrückt Blitzer via 500 ms Debounce beim State-Übergang.
- Kein neues Edge-Function — Zählung läuft clientseitig auf `render_queue` (bereits RLS-lesbar für admin & eigene Zeilen; für alle anderen fällt `count` auf 0/nur eigene zurück → deshalb via bestehendem RPC `render_queue_running_workers` und einem neuen leichten RPC `render_queue_stats()` als `security definer`).

```text
Motion Studio Header
┌────────────────────────────────────────────────────────┐
│ Schritt 3/4 · Storyboard        ● Queue frei (12/60)   │
└────────────────────────────────────────────────────────┘

AI Video Studio Generate-Panel
┌────────────────────────────────────────────────────────┐
│ Kosten: 0.42 €                                         │
│ 👑 Priority-Slot aktiv — du renderst bevorzugt         │
│  [ Generieren ]                                        │
└────────────────────────────────────────────────────────┘
```

## Was wir NICHT machen

- Keine künstliche `render_queue`-Zeile für AI-Video-Provider-Jobs (Kling/Sora/Hailuo laufen extern, gehören nicht ins Lambda-Budget).
- Keine Änderung an `useEnqueuedRender` — bleibt bei den echten Remotion-Renderpfaden.
- Kein Motion-Studio-eigener Render-Endpoint — Handoff an Composer bleibt so.

Nach der Umsetzung sehen Nutzer in Motion Studio + AI Video Studio jederzeit den globalen Render-Zustand und Founder wissen, wann ihre Priorität aktiv greift — ohne dass wir eine falsche Semantik einführen.
