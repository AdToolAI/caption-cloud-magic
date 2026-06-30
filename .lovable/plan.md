## Problem

Trotz v174 wird HappyHorse weiterhin still auf Hailuo umgeschrieben — der Trigger sitzt nicht in `compose-video-clips` (die ist sauber), sondern im **`compose-clip-webhook`**, also genau dann wenn der HappyHorse-Render *zurückkommt*. Zwei Stellen sind übrig:

### Trigger A — Erfolgs-Pfad (der jetzt sichtbare Fall)
`supabase/functions/compose-clip-webhook/index.ts`, Zeile 158-181:

```ts
const staleHappyHorseLabel =
  String(preUpdateScene?.clip_source ?? '') === 'ai-happyhorse';
...
if (isCinematicSync) {
  if (staleHappyHorseLabel) sceneUpdate.clip_source = 'ai-hailuo'; // ← Bug
  ...
}
```

Der Kommentar darüber sagt *"legacy / stale from before the Stage 2 hotfix"* — das stimmt seit v174 nicht mehr. HappyHorse **ist** jetzt eine legitime Cinematic-Sync-Master-Plate (Zeile 3092-3214 in `compose-video-clips`). Damit relabelt der Webhook bei **jedem** erfolgreichen HH-Cinematic-Sync-Render `clip_source` auf `ai-hailuo` — UI zeigt Hailuo, Lip-Sync läuft auf der HH-Plate.

Beweis aus DB: jüngste „ready"-Szene `7f04d44c…` zeigt `clip_source=ai-hailuo`, `engine_override=cinematic-sync`, `lip_sync_status=done` — exakt das Symptom, das du siehst.

### Trigger B — Fail-Pfad (Green-Net)
Zeile 498-510: wenn Alibaba die HH-Generierung mit `DataInspectionFailed` ablehnt, switched der Webhook `clip_source` automatisch auf `ai-hailuo`, damit der nächste „Neu rendern"-Klick HH umgeht. Auch das überschreibt deine Provider-Wahl ohne Rückfrage.

## v176 — Silent-Hailuo-Migration im Webhook entfernen

### 1. `compose-clip-webhook/index.ts` Zeile 165-177 (Trigger A)

```ts
// VORHER
const staleHappyHorseLabel =
  String((preUpdateScene as any)?.clip_source ?? '') === 'ai-happyhorse';
...
if (isCinematicSync) {
  if (staleHappyHorseLabel) sceneUpdate.clip_source = 'ai-hailuo';
  sceneUpdate.lip_sync_status = 'pending';
  sceneUpdate.twoshot_stage = 'master_clip';
}

// NACHHER (v176 — respect user provider, HH ist legitime Master-Plate)
if (isCinematicSync) {
  sceneUpdate.lip_sync_status = 'pending';
  sceneUpdate.twoshot_stage = 'master_clip';
  // clip_source bleibt unverändert — ai-happyhorse ist seit v174 valider Master.
}
```

### 2. `compose-clip-webhook/index.ts` Zeile 498-527 (Trigger B)

Green-Net-Rejection darf den Provider nicht still wechseln. Stattdessen:
- `clip_source` bleibt auf `ai-happyhorse`
- Fehlertext wird klar & aktionsorientiert: `"happyhorse_content_filter: Alibaba hat den Prompt blockiert. Schreibe ihn um oder wechsle den Provider manuell im Provider-Dropdown auf Hailuo. (HappyHorse wurde NICHT automatisch umgestellt — deine Auswahl bleibt erhalten.)"`
- Refund läuft wie bisher

```ts
// Entfernen: ...(isGreenNet ? { clip_source: 'ai-hailuo' } : {})
// Tagged-Error bleibt als [green_net_rejected]-Marker erhalten, damit die UI
// den Banner "Provider manuell wechseln?" anzeigen kann.
```

### 3. UI-Banner für `[green_net_rejected]` (optional, klein)

`src/components/video-composer/SceneCard.tsx` zeigt bereits `clip_error`. Erweitern um einen Hint-Button „Auf Hailuo wechseln" wenn der Error mit `[green_net_rejected]` beginnt — dann ist der Provider-Switch **explizit** vom Nutzer initiiert, nicht still vom System.

### 4. Memory aktualisieren

`mem/architecture/lipsync/` neue Notiz `v176-no-silent-hailuo-migration.md`:
> Silent `clip_source` rewrites von `ai-happyhorse` → `ai-hailuo` sind in **keiner** Edge Function mehr erlaubt (weder `compose-video-clips` v174 noch `compose-clip-webhook` v176). Green-Net-Rejections und stale-Label-Normalisierung müssen den Provider unverändert lassen; ein Wechsel braucht einen expliziten Nutzer-Klick.

## Was unverändert bleibt

- v174 Respect-User-Provider in `compose-video-clips` (kein Re-Map)
- v175 N=1 Tight-Slice + Overlay
- v168 Anti-Clone, v170 Cast-Integrity
- Refund-Logik (Green-Net-Refund läuft genauso)
- Sora→Veo und Pika→Hailuo Sunset/Maintenance-Migrationen (das sind echte EOL-Provider, kein User-Override-Konflikt)

## Verifikation

1. Neue HH-Cinematic-Sync-Szene rendern → DB-Row behält `clip_source='ai-happyhorse'` auch nach `clip_status='ready'`.
2. UI im Storyboard zeigt HappyHorse-Badge statt Hailuo.
3. Green-Net-Trigger (z.B. „3 AM Moment"-Prompt) → `clip_status='failed'`, `clip_source` bleibt `ai-happyhorse`, Banner verlinkt manuellen Wechsel.
