

## Englische UI: Deutsche Wörter auf Dashboard/Home ersetzen

### Was du siehst (Screenshots)

Screenshot 1 (Status-Pills): `Unlimited` (ok), `NÄCHSTER VORSCHLAG` ← hardcoded DE
Screenshot 2 (This Week): `Strategie-Modus`, `Plan in Calendar →` (in EN ok, aber Toggle-Label DE), `Level: Anfänger · 3 Posts/Woche`, `3 KI-Vorschläge`, `Neu generieren`, „Dein KI-Co-Pilot — neue Vorschläge jede Woche, automatisch."
Screenshot 3 (Heatmap): `Best Posting Times` (Section-Title — eigentlich okay), Card-Title `Best-Time Heatmap`, `Details anzeigen`, Tooltip „Beste Zeit zum Posten / Gute Zeit / Weniger optimal", Tag-Spalte `So Mo Di Mi Do Fr Sa`, Stunden-Tooltip `… Uhr`, Legend `Beste Zeit (≥70) / Gute Zeit (50-70) / Heuristik (<50)`

### Ursache
Mehrere Komponenten haben Strings hardcoded statt über `t(...)` aus `src/lib/translations.ts` zu laden — das fällt erst auf, sobald die UI-Sprache nicht DE ist.

### Änderungen

**1. `src/lib/translations.ts`** — neue Keys in **EN, DE, ES** unter passenden Namespaces:

```
homePage.strategyModeToggle: "Strategy Mode" / "Strategie-Modus" / "Modo Estrategia"
homePage.aiCopilotTagline: "Your AI co-pilot — fresh suggestions every week, automatic." / DE / ES

dashboard.statusBar.nextSuggestion: "Next Suggestion" / "Nächster Vorschlag" / "Próxima Sugerencia"

heatmap.cardTitle: "Best-Time Heatmap"  (gleich in allen 3)
heatmap.viewDetails: "View Details" / "Details anzeigen" / "Ver detalles"
heatmap.live: "Live"
heatmap.tooltipBest: "Best time to post!" / "Beste Zeit zum Posten!" / "¡Mejor momento para publicar!"
heatmap.tooltipGood: "Good time" / "Gute Zeit" / "Buen momento"
heatmap.tooltipPoor: "Less optimal" / "Weniger optimal" / "Menos óptimo"
heatmap.tooltipHourSuffix: ":00" (kein "Uhr" in EN/ES)
heatmap.legendBest: "Best time (≥70)" / "Beste Zeit (≥70)" / "Mejor momento (≥70)"
heatmap.legendGood: "Good time (50-70)" / "Gute Zeit (50-70)" / "Buen momento (50-70)"
heatmap.legendHeuristic: "Heuristic (<50)" / "Heuristik (<50)" / "Heurística (<50)"
heatmap.dayShort: { sun, mon, tue, wed, thu, fri, sat } in EN/DE/ES

strategy.levelBeginner: "Beginner" / "Anfänger" / "Principiante"
strategy.levelIntermediate: "Intermediate" / "Fortgeschritten" / "Intermedio"
strategy.levelAdvanced: "Pro" / "Profi" / "Pro"
strategy.postsPerWeek: "{count} posts/week" / "{count} Posts/Woche" / "{count} posts/semana"
strategy.levelLine: "Level: {level} · {count} posts/week" (mit Plural je Sprache)
strategy.aiSuggestionsCount: "{count} AI suggestions" / "{count} KI-Vorschläge" / "{count} sugerencias IA"
strategy.regenerate: "Regenerate" / "Neu generieren" / "Regenerar"
strategy.creatorLevelTitle: "Your creator level" / "Dein Creator-Level" / "Tu nivel de creador"
strategy.progressTo: "Progress to {level}" / "Fortschritt zu {level}" / "Progreso a {level}"
strategy.publishedPosts28d: "Published posts (28d)"
strategy.engagementRate: "Avg engagement rate"
strategy.maxLevelReached: "You're at the highest level. 🚀"
strategy.adjustLevelManually: "Adjust level manually"
strategy.noSuggestions: "No suggestions yet. Generate your first weekly strategy."
strategy.generateWeeklyStrategy: "Generate weekly strategy"
strategy.toastEnabled / toastDisabled: "Strategy mode enabled/disabled"
```

**2. `src/pages/Home.tsx`**
- Zeile 596: `prefix = "Nächster Vorschlag"` → `t("dashboard.statusBar.nextSuggestion")`
- Zeile 647: deutsche Tagline → `t("homePage.aiCopilotTagline")`
- Zeile 652: `Strategie-Modus` → `t("homePage.strategyModeToggle")`

**3. `src/components/dashboard/BestTimeHeatmap.tsx`**
- `useTranslation()` einbinden
- Zeile 62: hardcoded Tooltip-Text → `t("heatmap.tooltipBest|Good|Poor")`
- Zeile 58: `{day} {hour}:00 Uhr` → in EN/ES ohne „Uhr", z. B. `${day} ${hour}:00` (sprachabhängig oder einfach „Uhr" entfernen)
- Zeilen 86 & 120: `Best-Time Heatmap` → `t("heatmap.cardTitle")`
- Zeile 71 `days = ["So", "Mo", …]` → aus `t("heatmap.dayShort.*")`
- Zeile 136: `Details anzeigen` → `t("heatmap.viewDetails")`
- Zeilen 239/243/247: Legend-Texte → `t("heatmap.legendBest|Good|Heuristic")`

**4. `src/components/dashboard/WeekStrategyRingTimeline.tsx`** und **`WeekStrategyTimeline.tsx`** (parallel, identische Fixes)
- `LEVEL_LABEL` auf `t("strategy.levelBeginner|Intermediate|Advanced")` umstellen (per Hook im Component-Body, nicht als Modul-Konstante)
- „Posts/Woche", „KI-Vorschläge", „Neu generieren", „Dein Creator-Level", „Fortschritt zu", „Veröffentlichte Posts (28d)", „Ø Engagement-Rate", „Du bist bereits auf höchstem Level", „Level manuell anpassen", `SelectItem`-Labels, „Noch keine Vorschläge…", „Wochen-Strategie generieren" → alle über `t(...)`

**5. `src/hooks/useStrategyMode.ts`**
- Zeile 189: `toast.success("Strategie-Modus aktiviert/deaktiviert")` → `t("strategy.toastEnabled|toastDisabled")` (Hook nutzt `useTranslation`)

### Was ich bewusst nicht ändere
- `Best Posting Times` als Section-Title ist bereits über `t("dashboard.sections.bestTimes")` lokalisiert — bleibt.
- `Plan in Calendar` & `Unlimited` sind bereits korrekt englisch.
- Wochentags-Format in der Strategy-Timeline (`format(date, "EEE", { locale: de })`) wird auf dynamisches Locale (date-fns) umgestellt entsprechend `useTranslation().language`.

### Risiko & Aufwand
- Risiko: gering. Reine String-/Lokalisierungs-Änderung, keine Logik.
- 6 Dateien, ~20–25 neue Translation-Keys × 3 Sprachen.
- Nach Deploy direkt prüfbar: UI auf EN umschalten → keine deutschen Wörter mehr auf `/home`.

