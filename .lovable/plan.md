

## Befund

In `generate-week-strategy/index.ts` (Zeile 196 / 209) wird die KI lediglich angewiesen, *„nutze die besten Posting-Zeiten pro Plattform"*. Die KI bekommt zwar `platformStats` mit `bestHour` aus User-Historie — aber kein Beginner ohne Posts hat Daten, also wird `bestHour=19` Default verwendet. Die KI wählt dann einfach 21:00 als „runde Prime-Time" — weil sie keine konkreten Slots vor sich hat.

Gleichzeitig existiert eine vollständige, deterministische **Posting-Times-Engine** (`posting-times-api` + Heuristiken in `PLATFORM_PEAKS`), die **pro Plattform und Wochentag** den optimalen Slot liefert — die wird vom Strategy-Generator komplett ignoriert.

Außerdem: Die Wochenleiste / Strategie-Tab zeigt nicht, *warum* genau diese Uhrzeit gewählt wurde — keine Verbindung zur Heatmap.

## Plan: Posting-Times-Engine als Source of Truth für Strategy-Slots

### 1) Backend — `generate-week-strategy` ruft Posting-Times-Engine auf
Vor der KI-Generierung: Pro Woche & pro Plattform den `posting-times-api` aufrufen (intern, mit Service Role Key) und die **Top-Slots** pro Tag holen. Daraus eine deterministische **Slot-Zuteilung** bauen:

```text
Für Woche W:
  Für jede Plattform P in user.platforms:
    slots = posting-times-api(platform=P, days=7, lang)
    bestSlots[P] = Top-5 nach Score, gefiltert auf Tagesoptimum
```

### 2) Slot-Picker (deterministisch, vor dem AI-Call)
Statt der KI freie Hand zu lassen, generiert der Picker für jeden gewünschten Post einen festen `(date, time, platform)`-Slot **basierend auf der Heatmap**:
- Verteilt N Posts gleichmäßig über die 7 Tage.
- Für jeden Tag/Plattform den **höchstbewerteten** Slot aus der Engine wählen.
- Dabei das User-Niveau berücksichtigen (Beginner=3 Slots, Intermediate=5, Advanced=7).
- Mehrere Plattformen → rotieren (Mo=IG-Best, Mi=TikTok-Best, Fr=YouTube-Best …).

### 3) AI bekommt nur noch Content-Aufgabe
Der KI-Prompt wird umgebaut: Statt „wähle Datum+Zeit+Plattform" bekommt sie eine **vorgegebene Liste**:
```text
Erstelle Inhalte für folgende vorbereitete Slots:
1. 2026-04-20 21:00 · Instagram · (Score 90, Reason: Prime time evening)
2. 2026-04-22 17:00 · LinkedIn · (Score 87, Reason: End of work)
3. 2026-04-24 18:00 · TikTok · (Score 88, Reason: After work/school)
```
Die KI füllt nur noch `content_idea`, `caption_draft`, `hashtags`, `reasoning`, `tips`, `phase`. Datum/Zeit/Plattform werden NICHT mehr von der KI gewählt.

### 4) Slot-Score & Reason werden mitgespeichert
Migration: `strategy_posts` bekommt zwei neue Felder:
- `slot_score INTEGER` — z. B. 90
- `slot_reason TEXT[]` — z. B. ["Prime time evening", "Personalized + industry trend"]

Damit kann der Strategie-Tab des Dialogs zeigen: *„Diese Zeit (21:00 Mo) wurde gewählt, weil Score 90 — Prime-Time deiner Zielgruppe."*

### 5) Frontend — Verbindung Posting-Times ↔ Strategie
- **`StrategyContextPanel`** zeigt neuen Block **„Warum diese Uhrzeit?"** mit `slot_score` + `slot_reason` aus DB.
- **`PostingTimesHeatmap`** (Best-Time Heatmap) bekommt visuelle Hervorhebung: Slots, die in `strategy_posts` der nächsten 14 Tage genutzt werden, bekommen einen **goldenen Ring** → User sieht direkt: „Hier hat die KI für mich Posts geplant."
- **`PlatformRingDialog` Zeitplan-Tab**: Beim Ändern der Uhrzeit ein **Hinweis-Badge** anzeigen, falls die neue Zeit nicht im optimalen Slot liegt: *„⚠ 14:00 hat Score 45 — empfohlen 19:00 (Score 90)."*

### 6) Re-Generation bei manuellen Änderungen
Wenn User per `submitToCalendar` oder `update` die Uhrzeit ändert → keine automatische Korrektur, aber im Dialog Score-Hinweis anzeigen.

### Betroffene Dateien
- `supabase/functions/generate-week-strategy/index.ts` — Slot-Picker + AI-Prompt-Umbau
- `supabase/functions/_shared/posting-times-fetcher.ts` *(neu)* — interner Aufruf der `posting-times-api` Logik (oder direkt PLATFORM_PEAKS-Auswertung wiederverwenden)
- *(Migration)* `strategy_posts.slot_score INT`, `strategy_posts.slot_reason TEXT[]`
- `src/components/dashboard/StrategyContextPanel.tsx` — Block "Warum diese Uhrzeit?"
- `src/components/dashboard/PlatformRingDialog.tsx` (Zeitplan-Tab) — Score-Hinweis bei manueller Änderung
- `src/components/posting-times/HeatmapCalendar.tsx` + `HeatmapCalendarPremium.tsx` — Goldener Ring für genutzte Strategy-Slots

### Erwartetes Ergebnis
- Strategy-Posts haben **echte** beste Posting-Zeiten aus der Heatmap-Engine — nicht mehr stumpf 21:00.
- Beispiel: Instagram Mo → 19:00 (Prime), LinkedIn Di → 8:00 (Early business), TikTok Fr → 18:00 (After work).
- Heatmap und Strategie-Modus sind sichtbar verbunden: optimale Slots in der Heatmap sind golden markiert, wenn die KI dort einen Post plant.
- Im Strategie-Tab erklärt das System dem User, *warum* diese exakte Uhrzeit gewählt wurde (Score + Reason).
- Wenn der User die Zeit manuell ändert, warnt der Dialog bei suboptimaler Wahl.

