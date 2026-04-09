

## Plan: Localize Recommendations, Insights & PersonalizedDashboard

### Files to Change

| Action | File | Changes |
|--------|------|---------|
| Edit | `src/lib/translations.ts` | Add `reco` and `insights` keys (EN/DE/ES) — ~35 new keys |
| Edit | `src/features/recommendations/RecoCard.tsx` | Replace all hardcoded German with `t()` calls; make `BEGINNER_RECOMMENDATIONS` a function using `t()` |
| Edit | `src/components/recommendations/PersonalizedDashboard.tsx` | Add `useTranslation`, replace 6 hardcoded strings with `t()` |
| Edit | `src/lib/insightRules.ts` | Add `language` parameter to all functions; use internal i18n maps for weekday names, titles, action labels, evidence strings, bucket names |
| Edit | `src/components/performance/CaptionInsightsTab.tsx` | Pass `language` to `generateAllInsights()`, replace 4 hardcoded strings with `t()` |
| Edit | `src/components/performance/InsightCard.tsx` | Localize priority badges ("Wichtig"/"Mittel"/"Optional") via `t()` |

### Translation Keys to Add

**`reco` namespace:**
- `starterTips` / `aiRecommendations` — section headers
- `beginner1`, `beginner2`, `beginner3` — tip texts
- `impactFoundation`, `impactStrategy`, `impactReach` — impact labels
- `apply`, `applied` — button labels
- `beginnerFooter`, `dataFooter` — footer texts

**`insights` namespace:**
- `bestTimeTitle`, `postTypeTitle`, `hashtagTitle`, `captionTitle`, `trendTitle` — insight titles
- `addToCalendar`, `createMore`, `saveAsSet`, `openTemplate`, `testPostingTime`, `tryOtherFormats` — action labels
- `postsAnalyzed`, `last7vs14`, `topHashtags` — evidence strings
- `captionShort`, `captionMedium`, `captionLong` — bucket names
- `actionRecs`, `based28days`, `recalculate`, `notEnoughData` — CaptionInsightsTab strings
- `priorityHigh`, `priorityMedium`, `priorityLow` — InsightCard badges
- Weekday names (Sun–Sat)

### Key Technical Detail: insightRules.ts

The `generateAllInsights()` function and all sub-functions will accept an optional `language: 'en' | 'de' | 'es' = 'de'` parameter. An internal `i18n` object maps all strings by language, avoiding dependency on the React `useTranslation` hook (since this is a pure utility file).

```text
// Example
const weekdays = {
  en: ['Sunday','Monday',...],
  de: ['Sonntag','Montag',...],
  es: ['Domingo','Lunes',...]
};
```

### Result

All recommendation cards, insight cards, and the personalized dashboard display fully in the selected language.

