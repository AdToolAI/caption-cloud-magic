

## Plan: Complete App Localization — Eliminate All Hardcoded German Strings

### Scope of the Problem

**329 files** across the entire app contain hardcoded German strings instead of using the `t()` translation system. This is too large for a single change. I propose a **phased approach**, starting with what's visible after login (dashboard), which is critical for the Meta App Review recordings.

### Phase 1 — Dashboard & Top-Level Components (Priority: Meta Review)

These are the components visible immediately after login:

| File | Hardcoded German Examples |
|------|--------------------------|
| `CreditBalance.tsx` | "Verfügbare Credits", "Unbegrenzte Credits", "Nutzen Sie alle Features ohne Limit", "Kostenloser Plan" |
| `DashboardVideoCarousel.tsx` | "Deine Videos", "Die Lösung", "Dein erstes Video könnte so aussehen", "Dein erstes Video erstellen", "Demnächst", "Video nicht verfügbar" |
| `SocialConnectionIcons.tsx` | "Verbunden", "Nicht verbunden", "X verbunden" |
| `WeekDayCard.tsx` | "Kein Post geplant", "Post hinzufügen" |
| `Home.tsx` | "Starte kostenlos. Upgrade jederzeit.", "Demo ansehen", "Nächster Post", "Dein nächster geplanter Beitrag", "Keine Beschreibung", pricing section strings |
| `Header.tsx` | Various navigation/UI strings |

### Phase 2 — Account & Settings Pages

~20 files in `src/components/account/` with strings like "Löschen", "Abbrechen", "Verbunden", "Speichern", etc.

### Phase 3 — Calendar, Analytics, and remaining pages

~50+ files across calendar, analytics, performance, video editor, and other feature areas.

### Technical Approach

For each phase:
1. Add all missing translation keys to `src/lib/translations.ts` (en, de, es)
2. Replace hardcoded strings with `t()` calls
3. Replace `language === "de" ? "..." : "..."` ternaries with proper `t()` keys

### Recommendation

**Start with Phase 1** — this covers everything visible in the Meta App Review screencasts. Phases 2 and 3 can follow in subsequent iterations.

### Files for Phase 1

| Action | File | Changes |
|--------|------|---------|
| Edit | `src/lib/translations.ts` | Add ~40 new keys for dashboard area |
| Edit | `src/components/credits/CreditBalance.tsx` | Replace 5 hardcoded strings with `t()` |
| Edit | `src/components/dashboard/DashboardVideoCarousel.tsx` | Replace 6 hardcoded strings with `t()` |
| Edit | `src/components/dashboard/SocialConnectionIcons.tsx` | Replace 3 hardcoded strings with `t()` |
| Edit | `src/components/dashboard/WeekDayCard.tsx` | Replace 2 hardcoded strings with `t()` |
| Edit | `src/pages/Home.tsx` | Replace ~15 ternary/hardcoded strings with `t()` |

### Result

After Phase 1, the entire dashboard experience will be fully in English when the language is set to English — ready for Meta App Review recordings.

