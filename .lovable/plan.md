

## Plan: Posting Times Advisor — Localize all German strings

### Problem
The Posting Times page and its 5 sub-components contain ~25 hardcoded German strings and hardcoded `de` date-fns locale.

### Changes

**1. `src/lib/translations.ts` — Add `postingTimes` block (~20 keys × 3 languages)**

| Key | EN | DE | ES |
|---|---|---|---|
| `livePrognosis` | Live Forecast | Live-Prognose | Pronóstico en vivo |
| `title` | Posting Time Advisor | Posting-Zeit-Berater | Asesor de Horarios |
| `subtitle` | AI-optimized time recommendations based on your performance history and platform peaks | KI-optimierte Zeitempfehlungen... | Recomendaciones optimizadas por IA... |
| `updated` | Updated | Aktualisiert | Actualizado |
| `daysHistory` | days history | Tage Historie | días de historial |
| `sync` | Synchronize | Synchronisieren | Sincronizar |
| `syncSuccess` | Posts synchronized | Posts synchronisiert | Posts sincronizados |
| `syncError` | Error synchronizing | Fehler beim Synchronisieren | Error al sincronizar |
| `industryRecsActive` | Industry recommendations active | Branchen-Empfehlungen aktiv | Recomendaciones del sector activas |
| `industryRecsDesc` | These recommendations are based on industry averages and seasonal trends. Connect your accounts for personalized times. | Diese Empfehlungen basieren auf... | Estas recomendaciones se basan en... |
| `syncAccounts` | Sync accounts | Accounts synchronisieren | Sincronizar cuentas |
| `forecast14` | 14-Day Forecast | 14-Tage-Prognose | Pronóstico de 14 días |
| `clickToSchedule` | Click a time to schedule directly in the calendar | Klicke auf eine Zeit... | Haz clic en una hora... |
| `industryData` | Industry Data | Branchen-Daten | Datos del sector |
| `personalized` | Personalized | Personalisiert | Personalizado |
| `topTimesNext7` | Top times for the next 7 days | Top-Zeiten der nächsten 7 Tage | Mejores horarios de los próximos 7 días |
| `best3Slots` | Best 3 time slots per day | Die besten 3 Zeitfenster pro Tag | Los 3 mejores horarios por día |
| `aiOptimized` | AI-optimized | KI-optimiert | Optimizado por IA |
| `today` | Today | Heute | Hoy |
| `schedule` | Schedule | Planen | Planificar |
| `topN` | Top | Top | Top |
| `times` | times | Zeiten | horarios |

**2. `src/pages/PostingTimes.tsx` — Replace ~10 strings**
- Banner title, description, action label
- "14-Tage-Prognose", "Klicke auf eine Zeit...", "Branchen-Daten", "Personalisiert"
- "Top-Zeiten der nächsten 7 Tage", "Die besten 3 Zeitfenster pro Tag", "KI-optimiert"
- Toast messages

**3. `src/components/posting-times/PostingTimesHeroHeader.tsx` — Replace ~5 strings**
- "Live-Prognose", "Posting-Zeit-Berater", subtitle, "Aktualisiert:", "Tage Historie", "Synchronisieren"
- Dynamic date-fns locale

**4. `src/components/posting-times/HeatmapCalendarPremium.tsx` — Replace 1 string + locale**
- "Heute" → `t('postingTimes.today')`
- `{ locale: de }` → dynamic locale

**5. `src/components/posting-times/TopSlotsListPremium.tsx` — Replace 2 strings + locale**
- "Heute" → `t('postingTimes.today')`, "Planen" → `t('postingTimes.schedule')`
- `{ locale: de }` → dynamic locale

**6. `src/components/posting-times/TopSlotsList.tsx` — Replace 2 strings + locale**
- "Zeiten" → `t('postingTimes.times')`, "Planen" → `t('postingTimes.schedule')`
- `{ locale: de }` → dynamic locale

**7. `src/components/posting-times/HeatmapCalendar.tsx` — locale only**
- `{ locale: de }` → dynamic locale

### Files affected
- `src/lib/translations.ts`
- `src/pages/PostingTimes.tsx`
- `src/components/posting-times/PostingTimesHeroHeader.tsx`
- `src/components/posting-times/HeatmapCalendarPremium.tsx`
- `src/components/posting-times/TopSlotsListPremium.tsx`
- `src/components/posting-times/TopSlotsList.tsx`
- `src/components/posting-times/HeatmapCalendar.tsx`

