

## Plan: Usage Reports — Hardcoded German Strings lokalisieren

### Problem
Die Seite "Usage Reports" und alle zugehörigen Komponenten enthalten ~25 hardcodierte deutsche Strings, die auch im englischen/spanischen UI angezeigt werden.

### Änderungen

**1. `src/lib/translations.ts` — Neue Übersetzungsschlüssel hinzufügen**

Neuer Block `usageReports` unter allen 3 Sprachen:

| Key | DE | EN | ES |
|---|---|---|---|
| `usageReports.title` | Usage Reports | Usage Reports | Informes de Uso |
| `usageReports.subtitle` | Credit-Verbrauch und Kosten-Optimierung | Credit usage and cost optimization | Consumo de créditos y optimización de costes |
| `usageReports.creditsUsed` | Credits Verbraucht | Credits Used | Créditos Usados |
| `usageReports.last30Days` | Letzte 30 Tage | Last 30 days | Últimos 30 días |
| `usageReports.savingsPotential` | Spar-Potenzial | Savings Potential | Potencial de Ahorro |
| `usageReports.creditsSavable` | Credits sparen möglich | Credits savable | Créditos ahorrables |
| `usageReports.remotionUsage` | Remotion Nutzung | Remotion Usage | Uso de Remotion |
| `usageReports.ofRenders` | der Renders | of renders | de renders |
| `usageReports.tabSavings` | Spar-Potenzial | Savings Potential | Potencial de Ahorro |
| `usageReports.tabBreakdown` | Breakdown | Breakdown | Desglose |
| `usageReports.tabEngines` | Engine-Vergleich | Engine Comparison | Comparación de Engines |
| `usageReports.savingsRecommendations` | Spar-Empfehlungen | Savings Recommendations | Recomendaciones de Ahorro |
| `usageReports.optimizationTips` | Optimierungs-Tipps für geringere Kosten | Optimization tips for lower costs | Consejos de optimización para menores costes |
| `usageReports.noRecommendations` | Keine Empfehlungen verfügbar | No recommendations available | Sin recomendaciones disponibles |
| `usageReports.totalSavingsPotential` | Gesamt-Spar-Potenzial | Total Savings Potential | Potencial de Ahorro Total |
| `usageReports.potentialSave` | Potenzial: {count} Credits sparen | Potential: save {count} credits | Potencial: ahorrar {count} créditos |
| `usageReports.engineComparison` | Engine-Vergleich | Engine Comparison | Comparación de Engines |
| `usageReports.engineUsage` | Remotion vs. Shotstack Nutzung | Remotion vs. Shotstack usage | Uso de Remotion vs. Shotstack |
| `usageReports.ofCredits` | der Credits | of credits | de créditos |
| `usageReports.creditsPerRender` | Credits/Render | credits/render | créditos/render |
| `usageReports.totalRenders` | Gesamt Renders | Total Renders | Renders Totales |
| `usageReports.totalCredits` | Gesamt Credits | Total Credits | Créditos Totales |
| `usageReports.breakdownByFeature` | Breakdown nach Feature | Breakdown by Feature | Desglose por Función |
| `usageReports.creditDistFeature` | Credit-Verteilung nach Funktionen | Credit distribution by feature | Distribución de créditos por función |
| `usageReports.breakdownByEngine` | Breakdown nach Engine | Breakdown by Engine | Desglose por Engine |
| `usageReports.creditDistEngine` | Credit-Verteilung nach Render-Engine | Credit distribution by render engine | Distribución de créditos por engine |
| `usageReports.noData` | Keine Daten verfügbar | No data available | Sin datos disponibles |

**2. `src/pages/Analytics/UsageReports.tsx` — `useTranslation` einbinden**
- Import `useTranslation`, alle Strings durch `t('usageReports.xxx')` ersetzen

**3. `src/components/analytics/CreditUsageDashboard.tsx` — lokalisieren**
- Import `useTranslation`, alle 6 hardcoded Strings ersetzen

**4. `src/components/analytics/SavingsRecommendations.tsx` — lokalisieren**
- Import `useTranslation`, alle 5 hardcoded Strings ersetzen

**5. `src/components/analytics/RenderEngineComparison.tsx` — lokalisieren**
- Import `useTranslation`, alle 6 hardcoded Strings ersetzen

**6. `src/components/analytics/CostBreakdownPie.tsx` — lokalisieren**
- Import `useTranslation`, "Keine Daten verfügbar" ersetzen

### Betroffene Dateien
- `src/lib/translations.ts`
- `src/pages/Analytics/UsageReports.tsx`
- `src/components/analytics/CreditUsageDashboard.tsx`
- `src/components/analytics/SavingsRecommendations.tsx`
- `src/components/analytics/RenderEngineComparison.tsx`
- `src/components/analytics/CostBreakdownPie.tsx`

