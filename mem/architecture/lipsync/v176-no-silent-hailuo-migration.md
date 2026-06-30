---
name: v176 — No Silent Hailuo Migration (Webhook respects user provider)
description: compose-clip-webhook darf clip_source nicht mehr still von ai-happyhorse auf ai-hailuo umschreiben — weder im Erfolgs-Pfad (Cinematic-Sync) noch im Green-Net-Fail-Pfad. Provider-Wahl ist Nutzer-Hoheit, jeder Wechsel braucht expliziten Klick.
type: architecture
---

## Symptom

Trotz v174 (compose-video-clips Respect-User-Provider) zeigte die UI nach
einem erfolgreichen HappyHorse-Cinematic-Sync-Render plötzlich „Hailuo".
DB-Beweis: `composer_scenes.clip_source` flippte von `ai-happyhorse`
auf `ai-hailuo` zwischen Dispatch und Fertigstellung.

## Root Cause

`compose-clip-webhook/index.ts` hatte zwei legacy Silent-Migrations:

1. **Erfolgs-Pfad (L165-177)** — `staleHappyHorseLabel`-Check normalisierte
   bei jedem Cinematic-Sync-Complete `clip_source` von `ai-happyhorse` auf
   `ai-hailuo`. Kommentar sagte „stale from before the Stage 2 hotfix",
   das galt aber nur, solange HH KEINE valide Master-Plate war. Seit v174
   IST HH eine (compose-video-clips L3092+) — die Normalisierung lügt also.
2. **Green-Net-Pfad (L498-527)** — bei `DataInspectionFailed` wurde
   `clip_source` auf `ai-hailuo` gesetzt, damit der nächste Render HH umgeht.
   Auch das überschreibt die Nutzer-Wahl ohne Rückfrage.

## v176 Fix

### A — `compose-clip-webhook/index.ts` Erfolgs-Pfad
`staleHappyHorseLabel`-Variable + ihre Anwendung entfernt. Cinematic-Sync
setzt nur noch `lip_sync_status='pending'` + `twoshot_stage='master_clip'`,
`clip_source` bleibt unangetastet.

### B — `compose-clip-webhook/index.ts` Green-Net-Pfad
`...(isGreenNet ? { clip_source: 'ai-hailuo' } : {})` entfernt. Tag
`[green_net_rejected]` im `clip_error` bleibt erhalten — die UI kann
darauf einen Banner mit manueller „Auf Hailuo wechseln"-Aktion bauen.
Refund läuft unverändert.

## Invariante (FROZEN)

> Keine Edge Function darf `composer_scenes.clip_source` von
> `ai-happyhorse` auf `ai-hailuo` umschreiben. Migrationen sind nur für
> echte EOL-Provider erlaubt (Sora→Veo Sunset, Pika→Hailuo Maintenance —
> dokumentiert in compose-video-clips). Jeder Provider-Wechsel zwischen
> aktiven Providern muss vom Nutzer explizit ausgelöst werden.

## Was unverändert bleibt

- v174 Respect-User-Provider (compose-video-clips)
- v175 N=1 Tight-Slice + Overlay
- v168 Anti-Clone, v170 Cast-Integrity
- Green-Net Refund-Logik
- Sora→Veo, Pika→Hailuo Sunset-Migrationen
