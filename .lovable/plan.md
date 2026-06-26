## Was die DB sagt (Szene 1, ID `e0094775…`)

```
clip_source : ai-hailuo        ← UI zeigt "KI (Hailuo)"
clip_status : failed
clip_error  : [green_net_rejected] Happy Horse I2V failed:
              DataInspectionFailed - Green net check failed for text (input)
ai_prompt   : [SceneAction] Extreme close-up on Samuel Dusatko's face,
              illuminated only by the glow of a laptop screen in a
              dark bedroom at night … [/SceneAction]
              [Dialog] … [/Dialog]
              Extreme close-up on Samuel Dusatko's face, illuminated
              only by the glow of a laptop screen in a dark bedroom
              at night …
```

Zwei Befunde, beide gleichzeitig wahr:

### 1. Der „bereinigte" Prompt aus dem letzten Briefing wurde nie geschrieben

Die DB-Zeile enthält **immer noch** exakt die Green-Net-Trigger, die wir letztes Mal isoliert haben:
- `dark bedroom`
- `at night` (statt `late at night` ist hier zusätzlich auch das Wort allein drin)
- `laptop screen`
- `extreme close-up on a man's face`
- `[SceneAction]…[/SceneAction]` Tags
- Prompt **duplikat** (1× in Tags, 1× plain darunter)

D.h. der Briefing-Re-Run hat das alte Storyboard nicht überschrieben — `useApplyProductionPlan` lässt nicht-pending Szenen mit `clip_error` bewusst in Ruhe (Lipsync-Schutzgarantie aus `mem://features/video-composer/production-plan-pipeline`). „Neu rendern" feuert nur den Render, nicht den Prompt-Rewrite.

### 2. `clip_source = ai-hailuo`, aber der Fehler kommt von HappyHorse

Das ist kein Widerspruch sondern unsere **Lipsync-Allowlist-Policy** (Memory: HappyHorse = primary, Hailuo = fallback, sobald Lipsync EIN ist). `compose-dialog-scene` ignoriert beim Lipsync-Pfad das in der UI gewählte `ai-hailuo`, baut die Master-Plate über HappyHorse, und stirbt am Green-Net.

Dein letzter Auto-Fallback hat `clip_source` zwar auf `ai-hailuo` umgeschaltet — der Lipsync-Pfad respektiert das aber nicht, weil HappyHorse als Primary fest verdrahtet ist.

## Warum es „vorher mal lief"

Frühere Hailuo-Renders ohne Lipsync (Mai) liefen sauber durch — die kamen nie an HappyHorse vorbei. Hier ist es die Kombination **Lipsync ON + Bedroom/3-AM-Wording im persistierten Prompt**, die jeden Re-Try wieder vor dieselbe Wand fährt.

## Fix-Plan

### A. Prompt-Sanitizer im Render-Pfad (nicht nur im Briefing)

Neue Datei `supabase/functions/_shared/happyhorse-green-net.ts`:
- Strippt `[SceneAction]…[/SceneAction]` und `[Dialog]…[/Dialog]` Tags.
- Ersetzt Green-Net-Hot-Words **nur im Visual-Prompt** (Dialog-Skript bleibt unangetastet, geht nicht an HappyHorse):
  - `dark bedroom` → `home workspace`
  - `at 3 AM` / `at night` (allein stehend) → `late at night`
  - `lit only by … laptop screen` / `glow of a laptop screen` → `cool blue ambient light from a glowing monitor`
- Entfernt Prompt-Duplikate (gleicher Satz ≥2×).
- Setzt Flag `sanitized: true` auf Metadata.

Aufruf in `generate-happyhorse-video` und `compose-dialog-scene` direkt vor dem Replicate-Submit. **Kein** Aufruf in Hailuo/anderen Providern (die brauchen das nicht).

### B. Allowlist respektiert „Green-Net-Burn"

In `compose-dialog-scene`: wenn `clip_error LIKE '%green_net_rejected%'` für diese Szene existiert → master-plate über **Hailuo** statt HappyHorse rendern (Hailuo bleibt im Allowlist erlaubt, nur die Primary-Wahl ändert sich pro Szene). State landet in `composer_scenes.metadata.lipsync_master_provider = 'ai-hailuo'`. Beim nächsten manuellen „Neu rendern" wird das gelesen.

### C. „Neu rendern" rewritet den Prompt

In `SceneCard.tsx` Handler für Retry-Button: vor dem Re-Trigger den Sanitizer **clientseitig spiegeln** und `ai_prompt` aktualisieren, damit auch die UI den bereinigten Text zeigt (nicht nur die Edge Function). Sanitizer-Logik liegt einmal in `src/lib/video-composer/happyhorseGreenNet.ts`, von Edge & Client importiert.

### D. Briefing-Apply darf Visual-Prompts ÜBERSCHREIBEN, wenn nur clip_error existiert

`useApplyProductionPlan`: aktuelle Schutzgarantie bleibt voll für `lipSyncStatus`, `dialog_locked_at`, `dialog_shots`. **Erweiterung:** Wenn Szene `clip_status='failed'` UND nichts in `dialog_shots` UND `lipSyncStatus IS NULL` → `ai_prompt` darf überschrieben werden. Das ist genau dein Fall hier und löst das Re-Briefing-Problem strukturell.

## Was ich NICHT anfasse

- Sync.so / Lipsync v169 Pipeline.
- Hailuo Duration-Lock (6s/10s Invariant).
- Allowlist global (HappyHorse bleibt überall sonst Primary).
- Dialog-Skripte (gehen nie an HappyHorse).

## Testpfad nach Build

1. Briefing erneut „Storyboard generieren" → Szene 1 `ai_prompt` enthält kein `bedroom/3 AM/[SceneAction]` mehr (Check via DB).
2. „Neu rendern" auf Szene 1 → `compose-dialog-scene` nutzt Hailuo-Master (wegen B), Sync.so läuft drüber.
3. Erwartung: `clip_status = completed`, kein Green-Net.

Wenn du grün gibst, baue ich A→D in der Reihenfolge.