# Fix-Bundle I — Briefing wird noch nicht korrekt umgesetzt

## Was in den Screenshots vom aktuellen Plan-Sheet noch falsch ist

Briefing sagt: **15s gesamt, 3 Szenen mit je 2 Sub-Shots (4 Sprecher-Turns à ~2,5s + Showcase + Endcard)**.
Plan-Sheet zeigt aber:

1. **Gesamtdauer 30s** statt 15s ("Gesamtdauer 30s · Summe Szenen 30s (3 Szenen)").
2. **Nur 3 Szenen mit je 10s** — die Sub-Shots (1A/1B, 2A/2B, 3A/3B) aus dem Briefing sind **nicht als eigene Szenen** übernommen worden, obwohl der Badge "Skript-Timing verwendet · 7 Shots" behauptet, das Skript hätte gewonnen.
3. **Ensemble-Leak in Shot-Action** — jede Solo-Szene enthält weiterhin den Satz *"Samuel Dusatko, Matthew Dusatko, Sarah Dusatko and Kailee share the scene together, each visible to camera with their own action"*, obwohl `Cast` unten nur einen Sprecher zeigt. G-Bundle-Solo-Scrubber greift also nicht in die Haupt-Action-Beschreibung.
4. **Voice-Binding weiterhin kaputt** — Sprecher 1 zeigt Voice `AdTool AI Speaker`, Sprecher 2 zeigt Chip `Roger · AI`, Sprecher 3 zeigt `Auto-Voice beim Anwenden`. Keine ElevenLabs-Voice ist stabil an den jeweiligen Charakter gebunden.
5. **Location "— nicht zugeordnet —"** in allen Szenen, obwohl das Briefing pro Sprecher eine konkrete Umgebung nennt (Stadtstraße, Büro, Café, Studio). Der Freetext-Location-Pfad aus dem letzten Bundle wird nicht befüllt.
6. **AI-Fill 75% / 27 Felder ergänzt** ist zu hoch — Briefing liefert für fast alle diese Felder explizite Vorgaben (Kamera, Licht, Performance, B-Roll). Der Counter zählt weiterhin Enrichments als "AI-ergänzt", die tatsächlich 1:1 aus dem Briefing stammen.
7. **Engine `cinematic-sync` mit 10s** ist für 2,5-Sekunden-Turns zu lang und triggert unnötig teure Renders.

Kurz: G-Bundle hat die Detektions-Logik verbessert, aber der Pass-A-Merge, die Solo-Scrubber, das Voice-Mapping und die Location/Duration-Reducer greifen noch nicht im finalen Sheet.

---

## Ziel

Für dieses konkrete 15s / 4-Sprecher-Briefing muss das Sheet zeigen:

```
Gesamtdauer  15s
Summe Szenen 15s (6 Szenen)

S01  Shot 1A — Sprecher 1  2.5s  Stadtstraße
S02  Shot 1B — Sprecher 2  2.5s  Büro
S03  Shot 2A — Sprecher 3  2.5s  Café/Fußgängerzone
S04  Shot 2B — Sprecher 4  2.5s  Creator-Studio
S05  Shot 3A — Split-Screen (4 Sprecher)  2.5s
S06  Shot 3B — Endcard "AdTool AI …"  2.5s
```

Jede Sprecher-Szene solo, jede mit eigener ElevenLabs-Voice, jede mit Setting-Freetext.

---

## Fix-Plan (Fix-Bundle I)

### I1 — Detector: Sub-Shot-Ebene priorisieren

`supabase/functions/briefing-deep-parse/detectScriptTimingMode.ts`

- Wenn top-level "Szene N" Blöcke Sub-Marker `Shot NA/NB` **mit eigenen Zeitfenstern** enthalten, dann sind **die Sub-Shots** die kanonischen Szenen, nicht die Parent-Szenen.
- Zusätzliche Non-Dialog-Shots (Split-Screen / Endcard) werden als eigene Szenen mit `dialog: false` erkannt, damit sie nicht ans Sprach-Timing gebunden werden.
- Gesamtdauer = Summe aller Sub-Shot-Dauern (hier 6 × 2,5s = 15s).

### I2 — Pass-A darf Sub-Shots nicht wieder zu Parent-Szenen mergen

`briefing-deep-parse/index.ts` System-Prompt + Post-Process:
- Neuer harter Guard: `scriptTiming.shots.length` MUSS `scenes.length` sein, wenn `scriptTiming.tier === 'sub_shot_markers'`.
- Wenn LLM weniger Szenen liefert → deterministischer Split aus `scriptTiming.shots` (kein Re-Prompt, kein Merge).

### I3 — Solo-Scrubber auch für `visual` / `sceneAction` / `prompt`

`briefing-deep-parse/enforceSoloCast.ts`:
- Regex-Set erweitern: `"X, Y, Z and W share the scene"`, `"each visible to camera"`, `"group scene with"`, `"every face"` — Trigger auf Haupt-Beschreibungstext, nicht nur auf `castActions`.
- Läuft für **jede** Szene mit exakt 1 Sprecher-Turn, unabhängig von `cast.length` (weil Ensemble-Leak zurzeit auch bei `cast=[1]` durchrutscht).

### I4 — Voice-Binding fixen

`useApplyProductionPlan.ts` + `briefing-deep-parse` voice-pool:
- Pro Sprecher-Turn: `voice_id` = Character-eigene `voice_id` aus Cast&World. Nur wenn leer → nächster freier Slot aus `voice_pool`.
- Keine Reuse quer über Charaktere (aktuell landet `Roger` auf Matthew, weil Pool-Reuse Character-ID ignoriert).
- UI-Chip nur `Auto-Voice beim Anwenden` zeigen, wenn wirklich noch keine Voice gebunden ist.

### I5 — Location-Freetext befüllen

`briefing-deep-parse` Pass A Prompt:
- Für jede Solo-Szene aus dem Briefing-Setting-Absatz einen 1-Satz Freetext extrahieren (`"Modern city street with traffic and pedestrians"` etc.) und in `resolvedLocation.description` schreiben, auch wenn kein Library-Match existiert.
- `ProductionPlanSheet` zeigt den Freetext statt "— nicht zugeordnet —".

### I6 — Duration & Engine korrigieren

- Szenen-Duration = Sub-Shot-Dauer aus I1, danach G3 Auto-Extend (max(target, speech + 1s)).
- Wenn `duration ≤ 3.5s` und Szene hat Dialog → Engine-Default `hailuo-lipsync` (billiger + auf Kurz-Turns optimiert) statt `cinematic-sync`. Keine harte Regel für Non-Dialog-Szenen.

### I7 — AI-Fill Counter fair zählen

`BriefingPlanSummary`:
- Nur Felder zählen, die im Original-Briefing weder wörtlich noch als Synonym vorkommen. Camera-Move / Licht / Performance, die 1:1 im Briefing stehen, zählen als "aus Briefing" statt "AI-ergänzt".
- Erwartung für dieses Briefing: AI-Fill ~15–25%, nicht 75%.

### I8 — Repair-Counter sanieren

`briefing-deep-parse`:
- `repaired` zählt nur echte Delta-Änderungen (Text-Diff > 0 oder Speaker-ID-Wechsel). Kein Zählen von Re-Serialisierungen.

---

## Nicht betroffen / bleibt unangetastet

- Cast&World-IDs, Character-Locks, Outfit-Presets, Anchor-Pipeline.
- Lip-Sync-Pipeline (v153+), Storyboard-Transition und die "Bereits gerenderte Szenen werden nie überschrieben"-Garantie.
- Preisberechnung / Founders-Slots / Beta-Badges.

## Technische Datei-Karte

- `supabase/functions/briefing-deep-parse/detectScriptTimingMode.ts` — I1
- `supabase/functions/briefing-deep-parse/index.ts` — I2, I5, I6, I8
- `supabase/functions/briefing-deep-parse/enforceSoloCast.ts` — I3
- `src/hooks/useApplyProductionPlan.ts` — I4, I6
- `src/lib/video-composer/briefing/ensurePlanEnsemble.ts` — I3 (Client-Safety-Net)
- `src/components/video-composer/briefing/BriefingPlanSummary.tsx` — I7
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — I5 (Freetext-Anzeige)

## Verifikation nach Implementierung

Denselben 15s/4-Sprecher-Briefing-Text im Composer einfügen → "Briefing analysieren" → Plan-Sheet muss zeigen:
- 6 Szenen à 2,5s, Summe 15s.
- Jede Sprecher-Szene mit genau 1 Cast-Chip, ohne "share the scene"-Zeile.
- Voice-Chip pro Sprecher stabil und unterschiedlich.
- Location-Freetext pro Szene aus dem Briefing.
- AI-Fill-Badge zeigt eher ~20% statt 75%.
- "Skript-Timing verwendet · 6 Shots" (nicht 7).
