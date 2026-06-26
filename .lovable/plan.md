## Diagnose

Im Screenshot zeigt S02:
- ✓ Skript · ✓ Shot-Director · ✓ Cast · ✓ Anchor · ✓ Performance · ✓ Lip-Sync  
- **— Transition · — Overlay · — Tone · — Seed**

Das ist **kein Bug** — Pass-A-Schema, Apply-Mapping, Drift-Checks und Chips sind alle bereits korrekt verdrahtet (Lücken 1–6 sind technisch geschlossen). Die vier Chips bleiben grau, weil dein Briefing diese vier Felder nicht explizit nennt und das KI-Modell sie als `undefined` zurückgibt. Apply nimmt dann stille Defaults (crossfade/0.4s, kein Overlay, kein Seed, Briefing-Tone) — aus deiner Sicht wirkt das wie "nur teilweise übernommen".

Es gibt zwei echte Lücken:

1. **Pass-A inferiert die Felder nicht aktiv.** Das Modell hat keinen expliziten Auftrag, sie aus Beat/Mode/Tone abzuleiten, also lässt es sie leer.
2. **Chips kennen nur zwei Zustände** (✓ = vorhanden / — = fehlend). Es gibt keine Möglichkeit zu sehen "✨ KI hat ergänzt" oder "Default greift bewusst".

## Scope (was sich ändert)

| # | Datei | Änderung |
|---|-------|---|
| 1 | `supabase/functions/briefing-deep-parse/index.ts` | Pass-A-System-Prompt: expliziter Inference-Auftrag für Transition/Overlay/Tone/Seed mit Heuristiken pro Beat (Hook→cut, Reveal→crossfade, CTA→fade + Logo-Overlay …). `_meta.aiFilled` pro Szene markieren, wann ein Feld aus Inference statt aus Text kam. LANGUAGE LOCK unangetastet. |
| 2 | `src/lib/video-composer/briefing/productionPlan.ts` | `TPlanScene._meta.aiFilled?: string[]` ergänzen (Schema ist schon `.passthrough()` — nur Typ-Hinweis, keine Runtime-Change). |
| 3 | `src/components/video-composer/briefing/ProductionPlanSheet.tsx` | Chips bekommen **3 States**: ✓ grün (explizit im Briefing), ✨ amber (KI-inferiert), — grau (bewusster Composer-Default). Tooltip zeigt jeweils Quelle + finalen Wert ("Transition: cut · KI-inferiert aus Beat=Hook"). Gilt für Transition, Overlay, Tone, Seed, Cast-Shots. |
| 4 | `src/components/video-composer/briefing/ProductionPlanSheet.tsx` | Beim Review-Step zusätzlicher Hinweis-Banner wenn ≥1 Szene `aiFilled` enthält: "✨ X Felder wurden von der KI ergänzt — klick auf einen Chip um Quelle zu sehen." Verlinkt auf bestehende `BriefingPlanSummary`-HoverCard. |
| 5 | `src/hooks/useApplyProductionPlan.ts` | Beim Mapping `_meta.aiFilled` durchreichen in `scene._planMeta` (composer-side only, keine DB-Schreibung), damit der Drift-Detektor zwischen "User wollte explizit X" und "KI hat X vermutet" unterscheiden kann (KI-Fill → `severity: 'info'` statt `'warning'`). |
| 6 | `src/lib/video-composer/briefing/driftDetector.ts` | Severity-Downgrade für `*_not_applied`-Findings wenn das Plan-Feld in `aiFilled` steht — "Default ist OK, war eh nur ein KI-Vorschlag". |

## Heuristik-Tabelle für Pass-A Inference

```text
Transition:
  Hook/Cold-Open  → cut          (0.0s)
  Reveal/Twist    → crossfade    (0.5s)
  CTA/Endcard     → fade         (0.6s)
  Sonst           → crossfade    (0.4s)

Overlay:
  CTA-Szene       → text = brand.cta ?? "Jetzt testen", position=bottom
  Hook            → text = first 4 words of voiceover, position=top
  Sonst           → leer

Tone:
  Übernimmt briefing.tone wenn scene.tone leer

Seed:
  Wenn kein Seed im Briefing: bleibt undefined (Composer wählt random pro Render — das ist gewollt für A/B)
  Wird NICHT auto-gefüllt, sondern Chip zeigt "— · random per render" als gewollter Zustand
```

## Out of Scope (Lipsync-Safety bleibt unangetastet)

- Keine Änderung an `compose-dialog-segments`, `sync-so-webhook`, `dialog_shots`, `composer_scenes.dialog_*`, `dialogLockedAt`, `lockReferenceUrl`.
- Keine Änderung am Apply-Schutzfilter.
- Keine Migration. `_planMeta` lebt nur im Composer-State.
- Pass-B / Cast-/Voice-Resolver bleibt unverändert.

## Verification

1. Briefing ohne explizite Transition/Overlay/Tone/Seed analysieren → S02 zeigt ✨ Transition (cut/crossfade je Beat), ✨ Overlay bei CTA, ✓ Tone (von Briefing), — Seed mit Tooltip "random per render".
2. Briefing mit `TRANSITION: slide` analysieren → ✓ Transition (grün, Tooltip "explizit im Briefing").
3. Apply → Drift-Panel zeigt 0 Warnings, höchstens "info: 3 Felder per KI-Default belegt".
4. Lipsync-Regression: Bestehende v169 Szene mit `dialogLockedAt` bleibt protected, kein Eingriff in dialog_shots.